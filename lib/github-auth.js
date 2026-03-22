// ─── GitHub OAuth — Client-Side Token Management ────────
// Token lives only in localStorage, never stored in DB

const STORAGE_KEY = 'architect_github_token';
const USER_KEY = 'architect_github_user';

export function getGitHubToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setGitHubToken(token) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, token);
}

export function getGitHubUser() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setGitHubUser(user) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearGitHubAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isGitHubConnected() {
  return !!getGitHubToken();
}

// Kick off the GitHub OAuth flow
export function startGitHubOAuth() {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
  if (!clientId) {
    alert('GitHub OAuth not configured. Set NEXT_PUBLIC_GITHUB_CLIENT_ID in .env.local');
    return;
  }

  // Store current page URL so we can redirect back after auth
  sessionStorage.setItem('architect_github_redirect', window.location.href);

  const redirectUri = `${window.location.origin}/api/github/callback`;
  const scope = 'repo read:user';
  const state = crypto.randomUUID();
  sessionStorage.setItem('architect_github_state', state);

  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;

  window.location.href = url;
}
