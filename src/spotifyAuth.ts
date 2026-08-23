// Autenticazione Spotify con Authorization Code + PKCE (nessun client secret necessario lato client).
const CLIENT_ID = 'a474dca83b034d6ba49115d232f03f65';
const REDIRECT_URI = 'https://maurizio-7887.github.io/Pliometric-Training/';
const SCOPES = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';

const VERIFIER_KEY = 'sf30_spotify_verifier';
const ACCESS_KEY = 'sf30_spotify_access_token';
const REFRESH_KEY = 'sf30_spotify_refresh_token';
const EXPIRES_KEY = 'sf30_spotify_expires_at';

function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  let text = '';
  values.forEach(v => { text += possible[v % possible.length]; });
  return text;
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const data = new TextEncoder().encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  let str = '';
  new Uint8Array(buffer).forEach(b => { str += String.fromCharCode(b); });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function saveTokens(data: { access_token: string; refresh_token?: string; expires_in: number }, fallbackRefresh?: string): void {
  localStorage.setItem(ACCESS_KEY, data.access_token);
  localStorage.setItem(EXPIRES_KEY, String(Date.now() + data.expires_in * 1000));
  const refresh = data.refresh_token ?? fallbackRefresh;
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

export function isSpotifyLoggedIn(): boolean {
  return !!localStorage.getItem(REFRESH_KEY);
}

export function spotifyLogout(): void {
  [VERIFIER_KEY, ACCESS_KEY, REFRESH_KEY, EXPIRES_KEY].forEach(k => localStorage.removeItem(k));
}

export async function loginWithSpotify(): Promise<void> {
  const verifier = generateRandomString(64);
  localStorage.setItem(VERIFIER_KEY, verifier);
  const challenge = base64UrlEncode(await sha256(verifier));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;
  try {
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLIENT_ID });
    const res = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    // Non cancellare la sessione per errori temporanei di rete, server o limite richieste:
    // altrimenti Spotify torna inutilmente a chiedere le credenziali.
    if (!res.ok) {
      if (res.status === 400 || res.status === 401) spotifyLogout();
      return null;
    }
    const data = await res.json();
    saveTokens(data, refreshToken);
    return data.access_token as string;
  } catch { return null; }
}

export async function getValidSpotifyToken(): Promise<string | null> {
  const access = localStorage.getItem(ACCESS_KEY);
  const expiresAt = Number(localStorage.getItem(EXPIRES_KEY) ?? 0);
  if (access && Date.now() < expiresAt - 10000) return access;
  return refreshAccessToken();
}

/** Da chiamare una volta all'avvio dell'app: gestisce il ritorno da Spotify dopo il login. */
export async function handleSpotifyRedirect(): Promise<boolean> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code) return false;
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!verifier) return false;
  try {
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, code_verifier: verifier });
    const res = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!res.ok) return false;
    const data = await res.json();
    saveTokens(data);
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url.pathname + url.search);
    return true;
  } catch { return false; }
}
