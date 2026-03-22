// ─── Repo Ingestion API ─────────────────────────────────
// POST /api/ingest
// Fetches all code files from a GitHub repo, analyzes each
// architecturally with Claude, embeds the summaries, and stores
// in pgvector for RAG retrieval.
//
// This is the "indexing" step — happens once per repo.

import { getSupabase } from '@/lib/supabase';
import { embed, embedBatch } from '@/lib/embeddings';
import { analyzeFile, shouldAnalyzeFile, computeReverseDependencies } from '@/lib/code-analyzer';

// Max files to index (to control cost)
const MAX_FILES_TO_INDEX = 80;
// Max file size to fetch (skip huge generated files)
const MAX_FILE_SIZE_BYTES = 50000;

export async function POST(request) {
  try {
    const { projectId, owner, repo, token } = await request.json();

    if (!projectId || !owner || !repo || !token) {
      return Response.json(
        { error: 'Missing required fields: projectId, owner, repo, token' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // ── Create ingestion job ────────────────────────────
    const { data: job, error: jobErr } = await supabase
      .from('ingestion_jobs')
      .insert({
        project_id: projectId,
        repo_owner: owner,
        repo_name: repo,
        status: 'processing',
      })
      .select()
      .single();

    if (jobErr) throw jobErr;

    // Return immediately with job ID — process in background
    // (We don't await the indexing — it runs fire-and-forget)
    indexRepo({ projectId, owner, repo, token, jobId: job.id }).catch((err) => {
      console.error('Indexing failed:', err.message);
      supabase
        .from('ingestion_jobs')
        .update({ status: 'failed', error_message: err.message })
        .eq('id', job.id)
        .then();
    });

    return Response.json({
      jobId: job.id,
      status: 'processing',
      message: 'Indexing started. Poll /api/ingest/status for progress.',
    });
  } catch (error) {
    console.error('Ingest API error:', error);
    return Response.json(
      { error: error.message || 'Failed to start indexing' },
      { status: 500 }
    );
  }
}

// ── Background indexing function ────────────────────────
async function indexRepo({ projectId, owner, repo, token, jobId }) {
  const supabase = getSupabase();

  // 1. Fetch repo tree
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    }
  );

  if (!treeRes.ok) {
    throw new Error(`GitHub tree fetch failed: ${treeRes.status}`);
  }

  const treeData = await treeRes.json();
  const allFiles = (treeData.tree || []).filter(
    (f) => f.type === 'blob' && f.size < MAX_FILE_SIZE_BYTES && shouldAnalyzeFile(f.path)
  );

  // Limit to prevent cost explosion
  const filesToIndex = allFiles.slice(0, MAX_FILES_TO_INDEX);

  await supabase
    .from('ingestion_jobs')
    .update({ total_files: filesToIndex.length })
    .eq('id', jobId);

  // 2. Clear old data for this project
  await supabase.from('code_architecture').delete().eq('project_id', projectId);

  // 3. Fetch file contents in parallel (batches of 5)
  const fileContents = [];
  for (let i = 0; i < filesToIndex.length; i += 5) {
    const batch = filesToIndex.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const res = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
              },
            }
          );
          if (!res.ok) return null;
          const data = await res.json();
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          return { path: file.path, content, size: file.size };
        } catch {
          return null;
        }
      })
    );
    fileContents.push(...results.filter(Boolean));
  }

  // 4. Analyze each file with Claude (batches of 3 for rate limiting)
  const analyzed = [];
  for (let i = 0; i < fileContents.length; i += 3) {
    const batch = fileContents.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(async (file) => {
        const analysis = await analyzeFile(file.path, file.content);
        return { ...file, ...analysis };
      })
    );
    analyzed.push(...results);

    // Update progress
    await supabase
      .from('ingestion_jobs')
      .update({ processed_files: analyzed.length })
      .eq('id', jobId);
  }

  // 5. Compute reverse dependencies
  const withReverseDeps = computeReverseDependencies(analyzed);

  // 6. Generate embeddings for all summaries
  const summaries = withReverseDeps.map(
    (f) =>
      `File: ${f.path}\nRole: ${f.responsibility}\n${f.summary}\n` +
      `Exports: ${f.exports.join(', ')}\nPatterns: ${f.patterns.join(', ')}\n` +
      `Data: ${f.data_entities.join(', ')}`
  );
  const embeddings = await embedBatch(summaries);

  // 7. Store in Supabase
  const rows = withReverseDeps.map((file, i) => ({
    project_id: projectId,
    file_path: file.path,
    summary: file.summary,
    responsibility: file.responsibility,
    patterns: file.patterns,
    exports: file.exports,
    imports: file.imports,
    imported_by: file.imported_by,
    data_entities: file.data_entities,
    embedding: embeddings[i].embedding,
    raw_code: file.content.slice(0, 10000), // Keep reasonable amount
    file_size: file.size || file.content.length,
    language: guessLanguage(file.path),
  }));

  // Insert in batches of 20
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20);
    const { error: insertErr } = await supabase.from('code_architecture').insert(batch);
    if (insertErr) {
      console.error('Insert error:', insertErr.message);
    }
  }

  // 8. Mark job as done
  await supabase
    .from('ingestion_jobs')
    .update({
      status: 'done',
      processed_files: withReverseDeps.length,
    })
    .eq('id', jobId);

  console.log(`✅ Indexed ${withReverseDeps.length} files for project ${projectId}`);
}

function guessLanguage(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
    java: 'java', kt: 'kotlin',
    vue: 'vue', svelte: 'svelte',
    css: 'css', scss: 'scss', sql: 'sql',
    json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', mdx: 'markdown',
  };
  return map[ext] || ext;
}
