// ─── Agent Tools ────────────────────────────────────────
// Architecture-focused tools that Claude can call via tool_use.
// These are NOT code-editing tools — they help Claude UNDERSTAND
// the system before giving architecture advice.

import {
  findRelevantCode,
  getDependencyGraph,
  traceDataFlow,
  getProjectStructure,
  formatRAGResultsForPrompt,
} from '@/lib/rag';
import { searchWeb, formatSearchResultsForPrompt } from '@/lib/search';
import { getDecisions } from '@/lib/storage';

// ── Tool Definitions (sent to Claude) ───────────────────

export const TOOL_DEFINITIONS = [
  {
    name: 'find_related_components',
    description:
      'Search the codebase for files architecturally related to a concept. ' +
      'Returns files ranked by their structural relevance — their ROLE in the system, ' +
      'not just keyword matching. Use this to understand what parts of the codebase ' +
      'are involved in a particular feature or concern.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'What architectural concept to search for. E.g. "authentication", ' +
            '"data persistence", "user-facing pages", "API endpoints"',
        },
        responsibilities: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional: filter by file type. Values: data-layer, api-route, ' +
            'ui-component, ui-page, layout, config, utility, middleware, service, ' +
            'model, hook, context, auth, style',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'understand_structure',
    description:
      'Get a high-level overview of the entire project structure. ' +
      'Shows how files are organized by responsibility (data layer, API routes, ' +
      'UI components, etc.) and how layers connect to each other. ' +
      'Use this FIRST for any new question to understand the system.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'analyze_data_flow',
    description:
      'Trace how data flows between two concepts in the system. ' +
      'E.g. from "user click" to "database" or from "API request" to "UI render". ' +
      'Returns the chain of files involved and each files role.',
    input_schema: {
      type: 'object',
      properties: {
        from_concept: {
          type: 'string',
          description: 'Where the data flow starts. E.g. "user action", "API request", "form submission"',
        },
        to_concept: {
          type: 'string',
          description: 'Where the data flow ends. E.g. "database", "UI render", "external API"',
        },
      },
      required: ['from_concept', 'to_concept'],
    },
  },
  {
    name: 'detect_patterns',
    description:
      'Analyze specific files or an area of the codebase for design patterns. ' +
      'Shows what patterns are being used (repository, singleton, factory, etc.) ' +
      'and whether they are implemented well.',
    input_schema: {
      type: 'object',
      properties: {
        area: {
          type: 'string',
          description: 'What area to analyze. E.g. "data access layer", "API routes", "state management"',
        },
      },
      required: ['area'],
    },
  },
  {
    name: 'search_community',
    description:
      'Search the web for community opinions and best practices on a topic. ' +
      'Returns results from Stack Overflow, engineering blogs, Martin Fowler, Reddit, etc. ' +
      'Use this when you need industry perspective to strengthen your recommendation.',
    input_schema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The architecture topic to search. Be specific — include tech stack names.',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'recall_past_decisions',
    description:
      'Retrieve all past architectural decisions made for this project. ' +
      'Each decision has the WHAT and the WHY. ' +
      'Use this to ensure your recommendation is consistent with past choices ' +
      'or to explicitly explain why you are recommending something different.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ── Tool Execution ──────────────────────────────────────

/**
 * Execute a tool call from Claude and return the result as a string.
 * @param {string} toolName
 * @param {object} toolInput
 * @param {object} context - { projectId }
 */
export async function executeTool(toolName, toolInput, context) {
  const { projectId } = context;

  switch (toolName) {
    case 'find_related_components': {
      const results = await findRelevantCode(projectId, toolInput.query, {
        limit: 8,
        responsibilities: toolInput.responsibilities,
      });

      if (results.length === 0) {
        return `No architecturally related files found for "${toolInput.query}". The project may not be indexed yet, or this concept doesn't exist in the codebase.`;
      }

      return formatRAGResultsForPrompt(results);
    }

    case 'understand_structure': {
      const structure = await getProjectStructure(projectId);

      if (!structure) {
        return 'Project has not been indexed yet. No structural information available.';
      }

      const parts = [`## Project Structure (${structure.totalFiles} files indexed)\n`];

      for (const [layer, files] of Object.entries(structure.layers)) {
        parts.push(`### ${layer} (${files.length} files)`);
        for (const f of files) {
          parts.push(`- **${f.path}**: ${f.summary}`);
          if (f.exports.length) parts.push(`  Exports: ${f.exports.join(', ')}`);
        }
      }

      if (structure.connections.length) {
        parts.push('\n### Cross-layer connections:');
        // Deduplicate
        const seen = new Set();
        for (const c of structure.connections) {
          const key = `${c.from} → ${c.to}`;
          if (!seen.has(key)) {
            parts.push(`- ${key}`);
            seen.add(key);
          }
        }
      }

      return parts.join('\n');
    }

    case 'analyze_data_flow': {
      const paths = await traceDataFlow(
        projectId,
        toolInput.from_concept,
        toolInput.to_concept
      );

      if (paths.length === 0) {
        return `Could not trace data flow from "${toolInput.from_concept}" to "${toolInput.to_concept}". Files may not be connected in the dependency graph.`;
      }

      const parts = [`## Data Flow: ${toolInput.from_concept} → ${toolInput.to_concept}\n`];
      for (const p of paths.slice(0, 3)) {
        parts.push(`### Path: ${p.from} → ${p.to}`);
        for (let i = 0; i < p.chain.length; i++) {
          const node = p.chain[i];
          const arrow = i < p.chain.length - 1 ? ' →' : '';
          parts.push(`${i + 1}. **${node.file}** (${node.role})${arrow}`);
          parts.push(`   ${node.summary}`);
        }
      }

      return parts.join('\n');
    }

    case 'detect_patterns': {
      const results = await findRelevantCode(projectId, toolInput.area, {
        limit: 6,
      });

      if (results.length === 0) {
        return `No files found related to "${toolInput.area}".`;
      }

      const parts = [`## Pattern Analysis: ${toolInput.area}\n`];
      for (const r of results) {
        parts.push(`### ${r.file_path}`);
        parts.push(`**Role:** ${r.summary}`);
        if (r.patterns?.length) {
          parts.push(`**Patterns detected:** ${r.patterns.join(', ')}`);
        } else {
          parts.push('**Patterns detected:** None explicitly recognized');
        }
        if (r.exports?.length) {
          parts.push(`**Public interface:** ${r.exports.join(', ')}`);
        }
        if (r.raw_code) {
          const snippet = r.raw_code.length > 2000
            ? r.raw_code.slice(0, 1800) + '\n// ...'
            : r.raw_code;
          parts.push(`\`\`\`\n${snippet}\n\`\`\``);
        }
      }

      return parts.join('\n');
    }

    case 'search_community': {
      const results = await searchWeb(toolInput.topic);
      const formatted = formatSearchResultsForPrompt(results);
      return formatted || `No community results found for "${toolInput.topic}".`;
    }

    case 'recall_past_decisions': {
      const decisions = await getDecisions(projectId);

      if (!decisions || decisions.length === 0) {
        return 'No past architectural decisions recorded for this project.';
      }

      const parts = ['## Past Architectural Decisions\n'];
      for (const d of decisions) {
        parts.push(`- **${d.decision}** — Reason: ${d.reason}`);
      }

      return parts.join('\n');
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}
