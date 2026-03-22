export async function POST(request) {
  try {
    const { repoUrl, pat, token, filePaths, owner: directOwner, repo: directRepo } = await request.json();

    const authToken = token || pat;
    if (!authToken) {
      return Response.json({ error: 'No authentication token provided' }, { status: 401 });
    }

    let owner, cleanRepo;

    if (directOwner && directRepo) {
      owner = directOwner;
      cleanRepo = directRepo;
    } else if (repoUrl) {
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        return Response.json({ error: 'Invalid GitHub URL' }, { status: 400 });
      }
      owner = match[1];
      cleanRepo = match[2].replace('.git', '');
    } else {
      return Response.json({ error: 'No repo specified' }, { status: 400 });
    }

    const results = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const res = await fetch(
            `https://api.github.com/repos/${owner}/${cleanRepo}/contents/${filePath}`,
            {
              headers: {
                Authorization: `Bearer ${authToken}`,
                Accept: 'application/vnd.github+json',
              },
            }
          );
          if (!res.ok) return { path: filePath, content: '[Failed to fetch]' };
          const data = await res.json();
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          return { path: filePath, content };
        } catch {
          return { path: filePath, content: '[Failed to fetch]' };
        }
      })
    );

    return Response.json({ files: results });
  } catch (error) {
    console.error('GitHub files error:', error);
    return Response.json(
      { error: error.message || 'Failed to fetch files' },
      { status: 500 }
    );
  }
}
