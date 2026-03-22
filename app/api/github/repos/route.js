// Fetch authenticated user's repositories
// POST /api/github/repos — { token, page?, search? }

export async function POST(request) {
  try {
    const { token, page = 1, search = '' } = await request.json();

    if (!token) {
      return Response.json({ error: 'No GitHub token provided' }, { status: 401 });
    }

    let url;
    if (search.trim()) {
      // Search user's repos
      const q = encodeURIComponent(`${search} in:name user:@me fork:true`);
      url = `https://api.github.com/search/repositories?q=${q}&per_page=30&page=${page}&sort=updated`;
    } else {
      // List user's repos sorted by recently pushed
      url = `https://api.github.com/user/repos?per_page=30&page=${page}&sort=pushed&direction=desc&type=all`;
    }

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!res.ok) {
      const err = await res.json();
      return Response.json(
        { error: err.message || 'Failed to fetch repos' },
        { status: res.status }
      );
    }

    const data = await res.json();
    const repos = search.trim() ? data.items : data;

    const formatted = (repos || []).map((r) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      private: r.private,
      html_url: r.html_url,
      language: r.language,
      stargazers_count: r.stargazers_count,
      pushed_at: r.pushed_at,
      default_branch: r.default_branch,
    }));

    return Response.json({ repos: formatted });
  } catch (error) {
    console.error('GitHub repos error:', error);
    return Response.json(
      { error: error.message || 'Failed to fetch repos' },
      { status: 500 }
    );
  }
}
