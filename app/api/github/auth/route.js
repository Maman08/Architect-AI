// GitHub OAuth — Step 1: Redirect to GitHub authorization page
// This is a GET endpoint: /api/github/auth

export async function GET() {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;

  if (!clientId) {
    return Response.json(
      { error: 'GitHub OAuth not configured. Set NEXT_PUBLIC_GITHUB_CLIENT_ID.' },
      { status: 500 }
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/github/callback`;
  const scope = 'repo read:user';

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;

  return Response.redirect(url);
}
