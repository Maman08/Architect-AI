'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import FileTree from './FileTree';
import { estimateTokens } from '@/lib/utils';
import {
  getGitHubToken,
  getGitHubUser,
  clearGitHubAuth,
  isGitHubConnected,
  startGitHubOAuth,
} from '@/lib/github-auth';

export default function CodePanel({ codeContext, onCodeContextChange, project, onIndexRepo, indexingStatus }) {
  const [activeTab, setActiveTab] = useState('github');

  // ─── GitHub OAuth state ────────────────────────────────
  const [ghConnected, setGhConnected] = useState(false);
  const [ghUser, setGhUser] = useState(null);
  const [ghToken, setGhToken] = useState(null);

  // ─── Repo selection state ──────────────────────────────
  const [repos, setRepos] = useState([]);
  const [repoSearch, setRepoSearch] = useState('');
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const repoDropdownRef = useRef(null);
  const searchDebounceRef = useRef(null);

  // ─── File tree state ──────────────────────────────────
  const [treeFiles, setTreeFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [fetchedFiles, setFetchedFiles] = useState({});
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [githubError, setGithubError] = useState('');

  // Upload state
  const [uploadedFiles, setUploadedFiles] = useState([]);

  // Paste state
  const [pastedCode, setPastedCode] = useState('');

  // ─── Check GitHub connection on mount ─────────────────
  useEffect(() => {
    const connected = isGitHubConnected();
    setGhConnected(connected);
    if (connected) {
      setGhToken(getGitHubToken());
      setGhUser(getGitHubUser());
    }
  }, []);

  // ─── Fetch repos when connected ───────────────────────
  useEffect(() => {
    if (ghConnected && ghToken) {
      fetchRepos();
    }
  }, [ghConnected, ghToken]);

  // ─── Close dropdown on outside click ──────────────────
  useEffect(() => {
    function handleClick(e) {
      if (repoDropdownRef.current && !repoDropdownRef.current.contains(e.target)) {
        setShowRepoDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ─── Fetch repos (with optional search) ───────────────
  const fetchRepos = useCallback(
    async (search = '') => {
      if (!ghToken) return;
      setLoadingRepos(true);
      try {
        const res = await fetch('/api/github/repos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: ghToken, search }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setRepos(data.repos || []);
      } catch (err) {
        setGithubError(err.message);
      } finally {
        setLoadingRepos(false);
      }
    },
    [ghToken]
  );

  // ─── Search repos with debounce ───────────────────────
  const handleRepoSearch = useCallback(
    (value) => {
      setRepoSearch(value);
      setShowRepoDropdown(true);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        fetchRepos(value);
      }, 300);
    },
    [fetchRepos]
  );

  // ─── Select a repo → load file tree ──────────────────
  const handleSelectRepo = useCallback(
    async (repo) => {
      setSelectedRepo(repo);
      setShowRepoDropdown(false);
      setRepoSearch('');
      setTreeFiles([]);
      setSelectedFiles(new Set());
      setFetchedFiles({});
      setGithubError('');
      setLoadingTree(true);

      try {
        const [owner, repoName] = repo.full_name.split('/');
        const res = await fetch('/api/github/tree', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: ghToken,
            owner,
            repo: repoName,
            branch: repo.default_branch,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setTreeFiles(data.files || []);
      } catch (err) {
        setGithubError(err.message);
      } finally {
        setLoadingTree(false);
      }
    },
    [ghToken]
  );

  // ─── Fetch selected file contents ────────────────────
  const fetchSelectedFiles = useCallback(async () => {
    if (selectedFiles.size === 0 || !selectedRepo) return;
    setLoadingFiles(true);
    try {
      const [owner, repoName] = selectedRepo.full_name.split('/');
      const res = await fetch('/api/github/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: ghToken,
          owner,
          repo: repoName,
          filePaths: Array.from(selectedFiles),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const newFetched = { ...fetchedFiles };
      (data.files || []).forEach((f) => {
        newFetched[f.path] = f.content;
      });
      setFetchedFiles(newFetched);
      rebuildContext(newFetched, uploadedFiles, pastedCode);
    } catch (err) {
      setGithubError(err.message);
    } finally {
      setLoadingFiles(false);
    }
  }, [selectedFiles, selectedRepo, ghToken, fetchedFiles, uploadedFiles, pastedCode]);

  const toggleFile = useCallback((path) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // ─── Disconnect GitHub ────────────────────────────────
  const handleDisconnect = useCallback(() => {
    clearGitHubAuth();
    setGhConnected(false);
    setGhUser(null);
    setGhToken(null);
    setSelectedRepo(null);
    setRepos([]);
    setTreeFiles([]);
    setSelectedFiles(new Set());
    setFetchedFiles({});
  }, []);

  // ─── Upload handlers ─────────────────────────────────
  const handleFileUpload = useCallback(
    (e) => {
      const files = Array.from(e.target.files || []);
      files.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          setUploadedFiles((prev) => {
            const updated = [...prev, { name: file.name, content: reader.result }];
            rebuildContext(fetchedFiles, updated, pastedCode);
            return updated;
          });
        };
        reader.readAsText(file);
      });
    },
    [fetchedFiles, pastedCode]
  );

  const removeUploadedFile = useCallback(
    (index) => {
      setUploadedFiles((prev) => {
        const updated = prev.filter((_, i) => i !== index);
        rebuildContext(fetchedFiles, updated, pastedCode);
        return updated;
      });
    },
    [fetchedFiles, pastedCode]
  );

  // ─── Paste handler ────────────────────────────────────

  const handlePasteChange = useCallback(
    (value) => {
      setPastedCode(value);
      rebuildContext(fetchedFiles, uploadedFiles, value);
    },
    [fetchedFiles, uploadedFiles]
  );

  // ─── Build combined code context ──────────────────────

  const rebuildContext = (github, uploads, paste) => {
    const parts = [];

    // GitHub files
    Object.entries(github).forEach(([path, content]) => {
      parts.push(`### File: ${path}\n\`\`\`\n${content}\n\`\`\``);
    });

    // Uploaded files
    uploads.forEach((f) => {
      parts.push(`### File: ${f.name}\n\`\`\`\n${f.content}\n\`\`\``);
    });

    // Pasted code
    if (paste.trim()) {
      parts.push(`### Pasted Code\n\`\`\`\n${paste}\n\`\`\``);
    }

    onCodeContextChange(parts.join('\n\n'));
  };

  const tokenEstimate = estimateTokens(codeContext);

  const tabs = [
    { key: 'github', label: '🔗 GitHub' },
    { key: 'upload', label: '📤 Upload' },
    { key: 'paste', label: '📋 Paste' },
  ];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'text-white bg-zinc-800 border-b-2 border-blue-500'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* ─── GitHub Tab ───────────────────────────────── */}
        {activeTab === 'github' && (
          <div className="space-y-4">
            {!ghConnected ? (
              /* ─── Not connected: show Connect button ─── */
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-zinc-800 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-zinc-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-zinc-200 mb-2">
                  Connect your GitHub
                </h3>
                <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
                  One click to connect. Browse your repos, select files, and give the Architect
                  full context about your codebase.
                </p>
                <button
                  onClick={startGitHubOAuth}
                  className="inline-flex items-center gap-2 bg-zinc-100 text-zinc-900 px-5 py-2.5
                             rounded-lg font-medium text-sm hover:bg-white transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  Connect GitHub
                </button>
                <p className="text-xs text-zinc-600 mt-4">
                  Uses OAuth — your token stays in your browser only
                </p>
              </div>
            ) : (
              /* ─── Connected: show user + repo picker ─── */
              <div className="space-y-4">
                {/* Connected user bar */}
                <div className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    {ghUser?.avatar_url && (
                      <img
                        src={ghUser.avatar_url}
                        alt={ghUser.login}
                        className="w-6 h-6 rounded-full"
                      />
                    )}
                    <span className="text-sm text-zinc-300 font-medium">
                      {ghUser?.name || ghUser?.login || 'Connected'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                      Connected
                    </span>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>

                {/* Repo picker */}
                <div ref={repoDropdownRef} className="relative">
                  <label className="block text-xs text-zinc-500 mb-1.5">Repository</label>

                  {selectedRepo ? (
                    /* Selected repo chip */
                    <div className="flex items-center justify-between bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base">
                          {selectedRepo.private ? '🔒' : '📦'}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-zinc-200 truncate">
                            {selectedRepo.full_name}
                          </div>
                          {selectedRepo.description && (
                            <div className="text-xs text-zinc-500 truncate">
                              {selectedRepo.description}
                            </div>
                          )}
                        </div>
                        {selectedRepo.language && (
                          <span className="text-xs text-zinc-500 bg-zinc-700/50 px-1.5 py-0.5 rounded shrink-0">
                            {selectedRepo.language}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setSelectedRepo(null);
                          setTreeFiles([]);
                          setSelectedFiles(new Set());
                          setFetchedFiles({});
                          rebuildContext({}, uploadedFiles, pastedCode);
                        }}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors ml-2 shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    /* Search input */
                    <div className="relative">
                      <input
                        type="text"
                        value={repoSearch}
                        onChange={(e) => handleRepoSearch(e.target.value)}
                        onFocus={() => setShowRepoDropdown(true)}
                        placeholder="Search your repositories..."
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm
                                   text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50
                                   transition-colors"
                      />

                      {/* Dropdown */}
                      {showRepoDropdown && (
                        <div className="absolute z-50 left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700
                                        rounded-lg shadow-xl max-h-72 overflow-y-auto custom-scrollbar">
                          {loadingRepos ? (
                            <div className="px-4 py-6 text-center">
                              <div className="w-5 h-5 border-2 border-zinc-600 border-t-blue-500
                                              rounded-full animate-spin mx-auto mb-2"></div>
                              <p className="text-xs text-zinc-500">Loading repos...</p>
                            </div>
                          ) : repos.length === 0 ? (
                            <div className="px-4 py-6 text-center text-sm text-zinc-500">
                              {repoSearch ? 'No repos found' : 'No repositories'}
                            </div>
                          ) : (
                            repos.map((repo) => (
                              <button
                                key={repo.id}
                                onClick={() => handleSelectRepo(repo)}
                                className="w-full text-left px-3 py-2.5 hover:bg-zinc-700/50 transition-colors
                                           border-b border-zinc-700/50 last:border-0"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm shrink-0">
                                    {repo.private ? '🔒' : '📦'}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm text-zinc-200 font-medium truncate">
                                      {repo.full_name}
                                    </div>
                                    {repo.description && (
                                      <div className="text-xs text-zinc-500 truncate mt-0.5">
                                        {repo.description}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {repo.language && (
                                      <span className="text-xs text-zinc-500">
                                        {repo.language}
                                      </span>
                                    )}
                                    {repo.stargazers_count > 0 && (
                                      <span className="text-xs text-zinc-600">
                                        ⭐ {repo.stargazers_count}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* File tree (after repo is selected) */}
                {selectedRepo && (
                  <div className="space-y-3">
                    {loadingTree ? (
                      <div className="py-8 text-center">
                        <div className="w-5 h-5 border-2 border-zinc-600 border-t-blue-500
                                        rounded-full animate-spin mx-auto mb-2"></div>
                        <p className="text-xs text-zinc-500">Loading file tree...</p>
                      </div>
                    ) : treeFiles.length > 0 ? (
                      <>
                        <div className="bg-zinc-800/30 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-zinc-500">
                              Select files to add as context
                            </span>
                            <span className="text-xs text-zinc-600">
                              {treeFiles.length} files in repo
                            </span>
                          </div>
                          <FileTree
                            files={treeFiles}
                            selectedFiles={selectedFiles}
                            onToggle={toggleFile}
                            isIndexed={indexingStatus?.status === 'done'}
                          />
                        </div>
                        <button
                          onClick={fetchSelectedFiles}
                          disabled={loadingFiles || selectedFiles.size === 0}
                          className="w-full bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm
                                     font-medium hover:bg-blue-500 disabled:opacity-40
                                     disabled:cursor-not-allowed transition-colors"
                        >
                          {loadingFiles
                            ? 'Fetching files...'
                            : selectedFiles.size === 0
                              ? 'Select files above'
                              : `Load ${selectedFiles.size} file${selectedFiles.size !== 1 ? 's' : ''} as context`}
                        </button>
                      </>
                    ) : null}
                  </div>
                )}

                {/* Fetched files summary */}
                {Object.keys(fetchedFiles).length > 0 && (
                  <div className="bg-green-400/5 border border-green-400/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                      <span className="text-xs font-medium text-green-400">
                        {Object.keys(fetchedFiles).length} files loaded as context
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {Object.keys(fetchedFiles).map((path) => (
                        <div key={path} className="text-xs text-zinc-500 truncate pl-4">
                          {path}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {githubError && (
                  <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
                    {githubError}
                  </p>
                )}

                {/* ── Deep Index (RAG) ───────────────────── */}
                {selectedRepo && onIndexRepo && (
                  <div className="border border-zinc-700/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🧠</span>
                        <span className="text-xs font-medium text-zinc-300">Deep Architectural Index</span>
                      </div>
                      {indexingStatus?.status === 'done' && (
                        <span className="text-xs text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-full">
                          {indexingStatus.indexedFiles || indexingStatus.processed} files indexed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500">
                      AI analyzes every file&apos;s architectural role, patterns, and dependencies.
                      Enables the agent to investigate your codebase intelligently.
                    </p>
                    {indexingStatus?.status === 'processing' ? (
                      <div className="space-y-1.5">
                        <div className="w-full bg-zinc-800 rounded-full h-1.5">
                          <div
                            className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
                            style={{
                              width: `${indexingStatus.total ? (indexingStatus.processed / indexingStatus.total) * 100 : 10}%`,
                            }}
                          />
                        </div>
                        <p className="text-xs text-zinc-500">
                          Analyzing {indexingStatus.processed || 0} / {indexingStatus.total || '...'} files...
                        </p>
                      </div>
                    ) : indexingStatus?.status === 'failed' ? (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-red-400">Indexing failed. </p>
                        <button
                          onClick={() => { const [owner, repo] = selectedRepo.full_name.split('/'); onIndexRepo(owner, repo, ghToken); }}
                          className="text-xs text-purple-400 hover:text-purple-300 underline"
                        >
                          Retry
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { const [owner, repo] = selectedRepo.full_name.split('/'); onIndexRepo(owner, repo, ghToken); }}
                        className="w-full bg-purple-600/20 text-purple-300 border border-purple-500/30
                                   px-3 py-2 rounded-lg text-xs font-medium hover:bg-purple-600/30 transition-colors"
                      >
                        {indexingStatus?.status === 'done' ? '🔄 Re-index Repository' : '🧠 Index Repository for AI Agent'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Upload Tab ───────────────────────────────── */}
        {activeTab === 'upload' && (
          <div className="space-y-3">
            <label className="flex flex-col items-center justify-center border-2 border-dashed
                              border-zinc-700 rounded-lg p-6 cursor-pointer hover:border-zinc-500
                              transition-colors">
              <svg className="w-8 h-8 text-zinc-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-sm text-zinc-400">Drop files here or click to browse</span>
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {uploadedFiles.length > 0 && (
              <div className="space-y-1">
                {uploadedFiles.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2"
                  >
                    <span className="text-sm text-zinc-300 truncate">{file.name}</span>
                    <button
                      onClick={() => removeUploadedFile(i)}
                      className="text-zinc-500 hover:text-red-400 transition-colors ml-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Paste Tab ────────────────────────────────── */}
        {activeTab === 'paste' && (
          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              Paste any code — a file, a function, anything relevant
            </label>
            <textarea
              value={pastedCode}
              onChange={(e) => handlePasteChange(e.target.value)}
              rows={12}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm
                         text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none
                         focus:border-zinc-500 resize-y"
              placeholder="// Paste your code here..."
            />
          </div>
        )}

        {/* Token estimate */}
        {codeContext && (
          <div className="mt-3 text-xs text-zinc-500 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500/50"></span>
            Code context loaded — ~{tokenEstimate.toLocaleString()} tokens estimated
          </div>
        )}
      </div>
    </div>
  );
}
