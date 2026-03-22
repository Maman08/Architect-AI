'use client';

import { useState, useMemo, useCallback } from 'react';

// Build a nested tree structure from flat file paths
function buildTree(files) {
  const root = { name: '', children: {}, files: [] };
  files.forEach((file) => {
    const parts = file.path.split('/');
    let current = root;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        current.files.push({ name: part, path: file.path, size: file.size });
      } else {
        if (!current.children[part]) {
          current.children[part] = { name: part, children: {}, files: [] };
        }
        current = current.children[part];
      }
    });
  });
  return root;
}

// Collect all file paths recursively under a node
function getAllFilePaths(node) {
  const paths = [];
  node.files.forEach((f) => paths.push(f.path));
  Object.values(node.children).forEach((child) => {
    paths.push(...getAllFilePaths(child));
  });
  return paths;
}

function TreeNode({ node, selectedFiles, onToggle, onToggleFolder, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const childDirs = Object.values(node.children);
  const hasChildren = childDirs.length > 0 || node.files.length > 0;

  // Folder selection state
  const folderPaths = useMemo(() => getAllFilePaths(node), [node]);
  const selectedCount = folderPaths.filter((p) => selectedFiles.has(p)).length;
  const allSelected = folderPaths.length > 0 && selectedCount === folderPaths.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <div>
      {node.name && (
        <div
          className="flex items-center gap-1.5 py-0.5 px-1 hover:bg-zinc-800 rounded text-sm group"
          style={{ paddingLeft: `${depth * 16}px` }}
        >
          {/* Folder checkbox */}
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected; }}
            onChange={() => onToggleFolder(folderPaths, allSelected)}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-0 focus:ring-offset-0 shrink-0"
          />
          {/* Expand/collapse */}
          <div
            className="flex items-center gap-1.5 cursor-pointer flex-1 min-w-0"
            onClick={() => setExpanded(!expanded)}
          >
            <span className="text-zinc-500 w-4 text-center text-xs shrink-0">
              {hasChildren ? (expanded ? '▾' : '▸') : ''}
            </span>
            <span className="text-amber-400/70 shrink-0">📁</span>
            <span className="text-zinc-300 truncate">{node.name}</span>
            {someSelected || allSelected ? (
              <span className="text-xs text-blue-400 ml-1 shrink-0">
                {selectedCount}/{folderPaths.length}
              </span>
            ) : (
              <span className="text-xs text-zinc-600 ml-1 shrink-0 opacity-0 group-hover:opacity-100">
                {folderPaths.length} files
              </span>
            )}
          </div>
        </div>
      )}

      {(expanded || !node.name) && (
        <>
          {childDirs.map((child) => (
            <TreeNode
              key={child.name}
              node={child}
              selectedFiles={selectedFiles}
              onToggle={onToggle}
              onToggleFolder={onToggleFolder}
              depth={node.name ? depth + 1 : depth}
            />
          ))}
          {node.files.map((file) => (
            <label
              key={file.path}
              className="flex items-center gap-1.5 py-0.5 px-1 hover:bg-zinc-800 rounded cursor-pointer text-sm"
              style={{ paddingLeft: `${(node.name ? depth + 1 : depth) * 16 + 20}px` }}
            >
              <input
                type="checkbox"
                checked={selectedFiles.has(file.path)}
                onChange={() => onToggle(file.path)}
                className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-zinc-400 truncate">{file.name}</span>
              {file.size && (
                <span className="text-zinc-600 text-xs ml-auto shrink-0">
                  {(file.size / 1024).toFixed(1)}kb
                </span>
              )}
            </label>
          ))}
        </>
      )}
    </div>
  );
}

export default function FileTree({ files, selectedFiles, onToggle, onToggleAll, isIndexed }) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [filter, setFilter] = useState('');

  const filteredFiles = useMemo(() => {
    if (!filter) return files;
    return files.filter((f) => f.path.toLowerCase().includes(filter.toLowerCase()));
  }, [files, filter]);

  const filteredTree = useMemo(
    () => (filter ? buildTree(filteredFiles) : tree),
    [filter, filteredFiles, tree]
  );

  // Toggle all files in a folder on/off
  const handleToggleFolder = useCallback((paths, allSelected) => {
    paths.forEach((path) => {
      const isSelected = selectedFiles.has(path);
      if (allSelected && isSelected) onToggle(path);       // deselect all
      else if (!allSelected && !isSelected) onToggle(path); // select all
    });
  }, [selectedFiles, onToggle]);

  const allPaths = useMemo(() => files.map((f) => f.path), [files]);
  const allSelected = allPaths.length > 0 && allPaths.every((p) => selectedFiles.has(p));

  return (
    <div className="flex flex-col gap-2">
      {/* RAG hint */}
      {isIndexed && (
        <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
          <span className="text-sm">🧠</span>
          <p className="text-xs text-purple-300">
            Repo is indexed — the AI agent finds relevant files automatically. Manual selection is optional.
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter files..."
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-300
                     placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
        />
        {/* Select all / none */}
        <button
          onClick={() => handleToggleFolder(allPaths, allSelected)}
          className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded-lg px-2 py-1.5
                     hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
        >
          {allSelected ? 'None' : 'All'}
        </button>
      </div>

      <div className="max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
        <TreeNode
          node={filteredTree}
          selectedFiles={selectedFiles}
          onToggle={onToggle}
          onToggleFolder={handleToggleFolder}
        />
      </div>
      <div className="text-xs text-zinc-500 pt-1">
        {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
        {selectedFiles.size > 0 && (
          <button
            onClick={() => handleToggleFolder(allPaths, true)}
            className="ml-2 text-zinc-600 hover:text-zinc-400 underline"
          >
            clear
          </button>
        )}
      </div>
    </div>
  );
}
