export async function POST(request) {
  try {
    const { repoUrl, pat, token, owner: directOwner, repo: directRepo, branch } = await request.json();

    const authToken = token || pat;
    if (!authToken) {
      return Response.json({ error: 'No authentication token provided' }, { status: 401 });
    }

    let owner, cleanRepo;

    if (directOwner && directRepo) {
      // Direct owner/repo (from OAuth flow)
      owner = directOwner;
      cleanRepo = directRepo;
    } else if (repoUrl) {
      // Parse from URL (legacy PAT flow)
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        return Response.json({ error: 'Invalid GitHub URL' }, { status: 400 });
      }
      owner = match[1];
      cleanRepo = match[2].replace('.git', '');
    } else {
      return Response.json({ error: 'No repo specified' }, { status: 400 });
    }

    const ref = branch || 'HEAD';
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${cleanRepo}/git/trees/${ref}?recursive=1`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );

    if (!res.ok) {
      const err = await res.json();
      return Response.json(
        { error: err.message || 'Failed to fetch repo tree' },
        { status: res.status }
      );
    }

    const data = await res.json();
    const files = (data.tree || []).filter((f) => f.type === 'blob');

    return Response.json({ files });
  } catch (error) {
    console.error('GitHub tree error:', error);
    return Response.json(
      { error: error.message || 'Failed to fetch repo tree' },
      { status: 500 }
    );
  }
}
