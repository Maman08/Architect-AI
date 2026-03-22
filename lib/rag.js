// ─── RAG: Architecture-Aware Retrieval ──────────────────
// Queries pgvector for architecturally relevant code chunks.
// Returns files by their ROLE in the system, not keyword matching.

import { getSupabase } from './supabase';
import { embed } from './embeddings';

/**
 * Find code architecture chunks relevant to a query.
 * Uses vector similarity search on ARCHITECTURAL SUMMARIES.
 *
 * @param {string} projectId - UUID of the project
 * @param {string} query - user's question (natural language)
 * @param {object} options
 * @param {number} options.limit - max results (default 10)
 * @param {number} options.threshold - min similarity 0-1 (default 0.3)
 * @param {string[]} options.responsibilities - filter by type (e.g. ['api-route', 'data-layer'])
 * @returns {Array} - ranked code chunks with similarity scores
 */
export async function findRelevantCode(projectId, query, options = {}) {
  const { limit = 10, threshold = 0.3, responsibilities = null } = options;

  const supabase = getSupabase();

  // Generate embedding for the user's question
  const queryEmbedding = await embed(query);

  // Use the match_code_architecture RPC function
  const { data, error } = await supabase.rpc('match_code_architecture', {
    query_embedding: queryEmbedding,
    match_project_id: projectId,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error('RAG search error:', error);
    return [];
  }

  let results = data || [];

  // Optional: filter by responsibility type
  if (responsibilities && responsibilities.length > 0) {
    results = results.filter((r) => responsibilities.includes(r.responsibility));
  }

  return results;
}

/**
 * Get the full dependency graph for a project.
 * Returns all files with their imports and imported_by.
 */
export async function getDependencyGraph(projectId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('code_architecture')
    .select('file_path, responsibility, imports, imported_by, exports, summary')
    .eq('project_id', projectId)
    .order('file_path');

  if (error) {
    console.error('Dependency graph error:', error);
    return [];
  }

  return data || [];
}

/**
 * Trace data flow from one concept to another.
 * Finds the chain of files that connect two parts of the system.
 * E.g. "user click" → "database" would trace: page → api route → storage → supabase
 */
export async function traceDataFlow(projectId, fromConcept, toConcept) {
  // Find files related to the 'from' concept
  const fromFiles = await findRelevantCode(projectId, fromConcept, { limit: 5 });
  // Find files related to the 'to' concept
  const toFiles = await findRelevantCode(projectId, toConcept, { limit: 5 });

  // Get the full dependency graph
  const graph = await getDependencyGraph(projectId);

  // Build adjacency list
  const adjacency = {};
  for (const node of graph) {
    adjacency[node.file_path] = {
      ...node,
      outgoing: node.imports || [],
      incoming: node.imported_by || [],
    };
  }

  // BFS from each 'from' file to each 'to' file
  const paths = [];
  for (const from of fromFiles) {
    for (const to of toFiles) {
      const path = bfs(adjacency, from.file_path, to.file_path);
      if (path) {
        paths.push({
          from: from.file_path,
          to: to.file_path,
          chain: path.map((p) => ({
            file: p,
            role: adjacency[p]?.responsibility || 'unknown',
            summary: adjacency[p]?.summary || '',
          })),
        });
      }
    }
  }

  return paths;
}

/**
 * Get a structural overview of the project.
 * Groups files by responsibility, shows how layers connect.
 */
export async function getProjectStructure(projectId) {
  const graph = await getDependencyGraph(projectId);

  if (graph.length === 0) return null;

  // Group by responsibility
  const layers = {};
  for (const file of graph) {
    const resp = file.responsibility || 'other';
    if (!layers[resp]) layers[resp] = [];
    layers[resp].push({
      path: file.file_path,
      exports: file.exports || [],
      summary: file.summary,
    });
  }

  // Compute cross-layer connections
  const connections = [];
  for (const file of graph) {
    for (const imp of file.imports || []) {
      const target = graph.find((f) => f.file_path === imp || f.file_path.endsWith(imp));
      if (target && target.responsibility !== file.responsibility) {
        connections.push({
          from: `${file.responsibility}:${file.file_path}`,
          to: `${target.responsibility}:${target.file_path}`,
        });
      }
    }
  }

  return { layers, connections, totalFiles: graph.length };
}

/**
 * Check if a project has been indexed.
 */
export async function isProjectIndexed(projectId) {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from('code_architecture')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);

  if (error) return false;
  return (count || 0) > 0;
}

// ── BFS pathfinding in dependency graph ─────────────────
function bfs(adjacency, start, end) {
  if (start === end) return [start];

  const visited = new Set();
  const queue = [[start]];
  visited.add(start);

  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];
    const node = adjacency[current];
    if (!node) continue;

    // Follow both import directions
    const neighbors = [...(node.outgoing || []), ...(node.incoming || [])];

    for (const neighbor of neighbors) {
      // Normalize — adjacency keys might not perfectly match imports
      const resolved = Object.keys(adjacency).find(
        (k) => k === neighbor || k.endsWith(neighbor) || neighbor.endsWith(k.replace(/\.\w+$/, ''))
      );

      if (!resolved || visited.has(resolved)) continue;

      const newPath = [...path, resolved];

      if (resolved === end) return newPath;

      visited.add(resolved);
      queue.push(newPath);
    }
  }

  return null; // No path found
}

/**
 * Format RAG results into context for Claude.
 * Architecture-focused: shows roles, patterns, connections — not raw code dumps.
 */
export function formatRAGResultsForPrompt(results) {
  if (!results || results.length === 0) return '';

  const parts = ['## CODEBASE ANALYSIS (from architectural index)\n'];

  for (const r of results) {
    const section = [
      `### ${r.file_path} (${r.responsibility})`,
      `**Role:** ${r.summary}`,
    ];

    if (r.patterns?.length) {
      section.push(`**Patterns:** ${r.patterns.join(', ')}`);
    }
    if (r.exports?.length) {
      section.push(`**Public interface:** ${r.exports.join(', ')}`);
    }
    if (r.imports?.length) {
      section.push(`**Depends on:** ${r.imports.join(', ')}`);
    }
    if (r.imported_by?.length) {
      section.push(`**Used by:** ${r.imported_by.join(', ')}`);
    }
    if (r.data_entities?.length) {
      section.push(`**Data entities:** ${r.data_entities.join(', ')}`);
    }

    // Include raw code for the agent to inspect if needed
    if (r.raw_code) {
      const code = r.raw_code.length > 4000
        ? r.raw_code.slice(0, 3800) + '\n// ... [truncated]'
        : r.raw_code;
      section.push(`\`\`\`\n${code}\n\`\`\``);
    }

    parts.push(section.join('\n'));
  }

  return parts.join('\n\n');
}
