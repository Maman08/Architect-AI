export async function getRepoTree(repoUrl, pat) {
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) throw new Error('Invalid GitHub URL');
  const [, owner, repo] = match;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo.replace('.git', '')}/git/trees/HEAD?recursive=1`,
    { headers: { Authorization: `Bearer ${pat}` } }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to fetch repo tree');
  }

  const data = await res.json();
  return (data.tree || []).filter((f) => f.type === 'blob');
}

export async function getFileContents(repoUrl, pat, filePaths) {
  const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) throw new Error('Invalid GitHub URL');
  const [, owner, repo] = match;
  const cleanRepo = repo.replace('.git', '');

  const results = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${cleanRepo}/contents/${filePath}`,
          { headers: { Authorization: `Bearer ${pat}` } }
        );
        if (!res.ok) return { path: filePath, content: '[Failed to fetch]' };
        const data = await res.json();
        const content = atob(data.content);
        return { path: filePath, content };
      } catch {
        return { path: filePath, content: '[Failed to fetch]' };
      }
    })
  );

  return results;
}
