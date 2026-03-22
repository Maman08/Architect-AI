// ─── Smart Code Context Builder ─────────────────────────
// Instead of dumbly slicing at a character limit, this module:
// 1. Parses individual files from the code context
// 2. Extracts structural metadata (imports, exports, functions)
// 3. Scores each file based on relevance to the user's question
// 4. Builds a prioritized context that fits within limits
// 5. Adds a file map summary so the AI knows the full picture

const MAX_CODE_CHARS = 30000;        // ~7.5k tokens — generous for code
const MAX_PER_FILE_CHARS = 8000;     // No single file eats the whole budget
const SUMMARY_FILE_THRESHOLD = 15;   // If > 15 files, add a file map

export function buildSmartCodeContext(rawContext, userMessage = '') {
  if (!rawContext || rawContext.trim().length === 0) return '';

  // ── Parse files from the blob ─────────────────────────
  const files = parseFilesFromContext(rawContext);

  if (files.length === 0) {
    // Not structured as files — return as-is, truncated
    return rawContext.slice(0, MAX_CODE_CHARS);
  }

  // ── Score each file by relevance ──────────────────────
  const scoredFiles = files.map((file) => ({
    ...file,
    score: scoreFile(file, userMessage),
  }));

  // Sort by score descending
  scoredFiles.sort((a, b) => b.score - a.score);

  // ── Build prioritized output ──────────────────────────
  const parts = [];
  let totalChars = 0;

  // If there are many files, add a file map first
  if (files.length >= SUMMARY_FILE_THRESHOLD) {
    const fileMap = buildFileMap(scoredFiles);
    parts.push(fileMap);
    totalChars += fileMap.length;
  }

  // Add files in priority order
  for (const file of scoredFiles) {
    const truncatedContent =
      file.content.length > MAX_PER_FILE_CHARS
        ? file.content.slice(0, MAX_PER_FILE_CHARS) +
          '\n// ... [rest of file truncated]'
        : file.content;

    const block = `### File: ${file.path}\n\`\`\`\n${truncatedContent}\n\`\`\``;

    if (totalChars + block.length > MAX_CODE_CHARS) {
      // Budget exhausted — add a note about remaining files
      const remaining = scoredFiles
        .slice(scoredFiles.indexOf(file))
        .map((f) => f.path);
      if (remaining.length > 0) {
        parts.push(
          `\n### Other files in context (not shown to save space):\n${remaining.map((p) => `- ${p}`).join('\n')}`
        );
      }
      break;
    }

    parts.push(block);
    totalChars += block.length;
  }

  return parts.join('\n\n');
}

// ── Parse "### File: path" blocks ───────────────────────
function parseFilesFromContext(raw) {
  const files = [];
  const regex = /### File:\s*(.+?)\n```[\w]*\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(raw)) !== null) {
    files.push({
      path: match[1].trim(),
      content: match[2].trim(),
    });
  }

  return files;
}

// ── Score a file by relevance to the question ───────────
function scoreFile(file, userMessage) {
  let score = 0;
  const query = userMessage.toLowerCase();
  const pathLower = file.path.toLowerCase();
  const contentLower = file.content.toLowerCase();

  // ── Path-based scoring ────────────────────────────────

  // Structural files (entry points, configs, schemas)
  if (/route\.(js|ts)/.test(pathLower)) score += 3;
  if (/page\.(js|ts|jsx|tsx)/.test(pathLower)) score += 3;
  if (/layout\.(js|ts|jsx|tsx)/.test(pathLower)) score += 2;
  if (/schema|model|migration/i.test(pathLower)) score += 4;
  if (/config|\.env/i.test(pathLower)) score += 2;
  if (/index\.(js|ts)/i.test(pathLower)) score += 2;

  // Library / core files
  if (/^(lib|src|core|utils|helpers)\//i.test(pathLower)) score += 2;

  // Test files are less important for architecture
  if (/\.(test|spec)\./i.test(pathLower)) score -= 3;
  if (/__(test|mock|fixture)__/i.test(pathLower)) score -= 3;

  // Lock files, generated code
  if (/package-lock|yarn\.lock|\.min\./i.test(pathLower)) score -= 10;

  // ── Content-based scoring ─────────────────────────────

  // File mentions something from the user's question
  const queryWords = query
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .map((w) => w.replace(/[^a-z0-9]/g, ''));

  for (const word of queryWords) {
    if (word && pathLower.includes(word)) score += 5;
    if (word && contentLower.includes(word)) score += 2;
  }

  // Rich files with more exports / functions are more informative
  const exportCount = (file.content.match(/export\s+(default\s+)?/g) || []).length;
  const functionCount = (file.content.match(/function\s+\w+|=>\s*{|async\s+function/g) || []).length;
  score += Math.min(exportCount, 3);      // cap at 3
  score += Math.min(functionCount, 3);    // cap at 3

  // Files that import many things are likely orchestrators
  const importCount = (file.content.match(/import\s+/g) || []).length;
  if (importCount >= 5) score += 2;

  // ── Size penalty for very large files ─────────────────
  if (file.content.length > 5000) score -= 1;
  if (file.content.length > 10000) score -= 2;

  return score;
}

// ── Build a file map overview ───────────────────────────
function buildFileMap(files) {
  const lines = ['### 📁 File Map (all files in context):\n'];
  lines.push('| File | Size | Key Exports |');
  lines.push('|------|------|-------------|');

  for (const file of files) {
    const size = file.content.length > 5000
      ? `${(file.content.length / 1000).toFixed(0)}kb`
      : `${file.content.length} chars`;

    // Extract exports
    const exports = [];
    const exportMatches = file.content.matchAll(
      /export\s+(default\s+)?(?:function|class|const|let|var|async\s+function)\s+(\w+)/g
    );
    for (const m of exportMatches) {
      exports.push(m[2]);
    }

    lines.push(
      `| \`${file.path}\` | ${size} | ${exports.slice(0, 4).join(', ') || '—'} |`
    );
  }

  return lines.join('\n');
}
