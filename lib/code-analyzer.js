// ─── Code Analyzer ──────────────────────────────────────
// Uses Claude to understand the ARCHITECTURAL ROLE of each file.
// Not parsing syntax — understanding PURPOSE.
//
// For each file, Claude produces:
// - summary: what this file IS in the system
// - responsibility: its role (data-layer, routing, ui, config, etc.)
// - patterns: design patterns it uses
// - exports: public interface
// - imports: what it depends on
// - data_entities: what data it touches

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_PROMPT = `You are a code architecture analyzer. Given a source file, extract its architectural role in the system.

Respond in EXACTLY this JSON format, nothing else:
{
  "summary": "2-3 sentences: What this file does in the system, what its responsibility is, how it connects to other parts. Write this as if explaining the file's role to a new team member.",
  "responsibility": "ONE of: data-layer | api-route | ui-component | ui-page | layout | config | utility | middleware | service | model | hook | context | auth | style | test | build | other",
  "patterns": ["array of design pattern names used, e.g. repository, singleton, observer, factory, middleware, HOC, custom-hook, etc. Empty array if none obvious"],
  "exports": ["array of exported function/class/variable names — the public interface"],
  "imports": ["array of LOCAL file paths this imports (not npm packages). e.g. './supabase', '@/lib/storage'"],
  "data_entities": ["array of data entities this file touches — e.g. 'projects', 'users', 'messages', 'sessions'. Empty if none"]
}

Rules:
- summary must be ARCHITECTURAL, not a line-by-line description
- Focus on WHY this file exists and HOW it connects to the system
- imports should only list local project files, skip node_modules
- Be precise with responsibility classification
- Return valid JSON only, no markdown, no explanation`;

// Files to skip during analysis
const SKIP_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /package-lock\.json/,
  /yarn\.lock/,
  /\.next\//,
  /\.DS_Store/,
  /\.env/,
  /\.ico$/,
  /\.svg$/,
  /\.png$/,
  /\.jpg$/,
  /\.woff/,
  /\.ttf$/,
  /\.map$/,
  /\.min\.(js|css)$/,
];

const CODE_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.vue', '.svelte', '.astro',
  '.css', '.scss', '.sql',
  '.json', '.yaml', '.yml', '.toml',
  '.md', '.mdx',
];

/**
 * Check if a file should be analyzed architecturally.
 */
export function shouldAnalyzeFile(filePath) {
  // Skip known junk
  if (SKIP_PATTERNS.some((p) => p.test(filePath))) return false;

  // Must have a code-like extension
  const ext = '.' + filePath.split('.').pop().toLowerCase();
  return CODE_EXTENSIONS.includes(ext);
}

/**
 * Analyze a single file and extract its architectural role.
 * Uses Claude to understand the file — this is the real AI work.
 */
export async function analyzeFile(filePath, content) {
  // Very small or empty files — create a minimal summary
  if (!content || content.trim().length < 20) {
    return {
      summary: `Empty or minimal file at ${filePath}`,
      responsibility: 'other',
      patterns: [],
      exports: [],
      imports: [],
      data_entities: [],
    };
  }

  // Truncate very large files for analysis (Claude doesn't need every line)
  const truncated = content.length > 6000
    ? content.slice(0, 5500) + '\n// ... [truncated for analysis]'
    : content;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `File: ${filePath}\n\n\`\`\`\n${truncated}\n\`\`\``,
        },
      ],
      system: ANALYSIS_PROMPT,
    });

    const text = response.content[0].text.trim();

    // Parse JSON — handle cases where Claude wraps in markdown
    const jsonStr = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(jsonStr);

    return {
      summary: parsed.summary || `File at ${filePath}`,
      responsibility: parsed.responsibility || 'other',
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
      exports: Array.isArray(parsed.exports) ? parsed.exports : [],
      imports: Array.isArray(parsed.imports) ? parsed.imports : [],
      data_entities: Array.isArray(parsed.data_entities) ? parsed.data_entities : [],
    };
  } catch (err) {
    console.error(`Analysis failed for ${filePath}:`, err.message);
    // Fallback: extract basic info with regex
    return extractBasicInfo(filePath, content);
  }
}

/**
 * Fallback: extract basic structural info without AI.
 * Used when Claude call fails or for cost savings on trivial files.
 */
function extractBasicInfo(filePath, content) {
  const exports = [];
  const imports = [];

  // Extract exports
  const exportMatches = content.matchAll(
    /export\s+(default\s+)?(?:function|class|const|let|var|async\s+function)\s+(\w+)/g
  );
  for (const m of exportMatches) exports.push(m[2]);

  // Extract local imports
  const importMatches = content.matchAll(
    /import\s+.*?from\s+['"]([.@/][^'"]+)['"]/g
  );
  for (const m of importMatches) imports.push(m[1]);

  // Guess responsibility from path
  let responsibility = 'other';
  if (/route\.(js|ts)/.test(filePath)) responsibility = 'api-route';
  else if (/page\.(js|ts|jsx|tsx)/.test(filePath)) responsibility = 'ui-page';
  else if (/layout\.(js|ts|jsx|tsx)/.test(filePath)) responsibility = 'layout';
  else if (/components?\//.test(filePath)) responsibility = 'ui-component';
  else if (/lib\/|utils?\/|helpers?\//.test(filePath)) responsibility = 'utility';
  else if (/middleware/.test(filePath)) responsibility = 'middleware';
  else if (/\.css|\.scss/.test(filePath)) responsibility = 'style';
  else if (/\.test\.|\.spec\./.test(filePath)) responsibility = 'test';
  else if (/config|\.json|\.yaml/.test(filePath)) responsibility = 'config';

  return {
    summary: `File at ${filePath} with ${exports.length} exports and ${imports.length} local imports.`,
    responsibility,
    patterns: [],
    exports,
    imports,
    data_entities: [],
  };
}

/**
 * Analyze multiple files in parallel with concurrency control.
 * @param {Array<{path: string, content: string}>} files
 * @param {function} onProgress - called with (completed, total)
 * @param {number} concurrency - max parallel Claude calls
 */
export async function analyzeFiles(files, onProgress, concurrency = 3) {
  const results = [];
  let completed = 0;

  // Process in batches of `concurrency`
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        const analysis = await analyzeFile(file.path, file.content);
        completed++;
        if (onProgress) onProgress(completed, files.length);
        return { ...file, ...analysis };
      })
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * After all files are analyzed, compute imported_by for each file.
 * This creates the reverse dependency graph.
 */
export function computeReverseDependencies(analyzedFiles) {
  const importedByMap = {};

  for (const file of analyzedFiles) {
    for (const imp of file.imports || []) {
      // Normalize import paths to match file paths
      const normalized = normalizeImportPath(imp);
      if (!importedByMap[normalized]) importedByMap[normalized] = [];
      importedByMap[normalized].push(file.path);
    }
  }

  // Attach imported_by to each file
  return analyzedFiles.map((file) => ({
    ...file,
    imported_by: importedByMap[file.path] || [],
  }));
}

function normalizeImportPath(importPath) {
  // @/lib/storage → lib/storage.js (approximate)
  let p = importPath.replace(/^@\//, '').replace(/^\.\//, '');
  // Add .js if no extension
  if (!p.match(/\.\w+$/)) p += '.js';
  return p;
}
