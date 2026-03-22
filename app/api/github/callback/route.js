// GitHub OAuth — Step 2: Exchange code for access token
// GET /api/github/callback?code=xxx&state=xxx

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code) {
    return new Response(renderHTML('Error', 'No authorization code received from GitHub.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return new Response(
        renderHTML('Error', `GitHub OAuth error: ${tokenData.error_description || tokenData.error}`),
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    const accessToken = tokenData.access_token;

    // Fetch user info
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userData = await userRes.json();

    // Return an HTML page that stores the token in localStorage and redirects back
    const html = renderSuccessHTML(accessToken, {
      login: userData.login,
      avatar_url: userData.avatar_url,
      name: userData.name,
    });

    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    return new Response(
      renderHTML('Error', 'Failed to complete GitHub authentication. Please try again.'),
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

function renderSuccessHTML(token, user) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Connecting GitHub...</title>
  <style>
    body {
      background: #09090b;
      color: #a1a1aa;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #27272a;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <p>Connected to GitHub! Redirecting...</p>
  </div>
  <script>
    localStorage.setItem('architect_github_token', ${JSON.stringify(token)});
    localStorage.setItem('architect_github_user', ${JSON.stringify(JSON.stringify(user))});
    
    // Redirect back to where the user was
    const redirect = sessionStorage.getItem('architect_github_redirect') || '/';
    sessionStorage.removeItem('architect_github_redirect');
    sessionStorage.removeItem('architect_github_state');
    window.location.href = redirect;
  </script>
</body>
</html>`;
}

function renderHTML(title, message) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>${title}</title>
  <style>
    body {
      background: #09090b;
      color: #a1a1aa;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .container { text-align: center; max-width: 400px; }
    h1 { color: #ef4444; font-size: 18px; }
    p { font-size: 14px; line-height: 1.6; }
    a { color: #3b82f6; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p>${message}</p>
    <p><a href="/">← Back to Architect</a></p>
  </div>
</body>
</html>`;
}
