import { getValidSpotifyToken } from './spotifyAuth';

// Tipi minimi per l'SDK Spotify caricato via script esterno (non forniamo @types).
type SpotifyPlayerInstance = {
  connect: () => Promise<boolean>;
  activateElement?: () => Promise<void>;
  addListener: (event: string, cb: (data: unknown) => void) => void;
};
declare global {
  interface Window {
    Spotify?: { Player: new (options: unknown) => SpotifyPlayerInstance };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

let player: SpotifyPlayerInstance | null = null;
let deviceId: string | null = null;
let readyPromise: Promise<string | null> | null = null;

function loadSdkScript(): Promise<void> {
  return new Promise(resolve => {
    if (window.Spotify) { resolve(); return; }
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    if (document.getElementById('spotify-player-sdk')) return;
    const script = document.createElement('script');
    script.id = 'spotify-player-sdk';
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);
  });
}

async function ensurePlayerReady(): Promise<string | null> {
  const token = await getValidSpotifyToken();
  if (!token) return null;
  if (deviceId) return deviceId;
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    await loadSdkScript();
    if (!window.Spotify) return null;
    player = new window.Spotify.Player({
      name: 'Scatto Forza 30',
      getOAuthToken: (cb: (t: string) => void) => { getValidSpotifyToken().then(t => cb(t ?? '')); },
      volume: 0.6,
    });
    return new Promise<string | null>(resolve => {
      player?.addListener('ready', (data: unknown) => { const id = (data as { device_id: string }).device_id; deviceId = id; resolve(id); });
      player?.addListener('not_ready', () => { deviceId = null; });
      player?.addListener('initialization_error', () => resolve(null));
      player?.addListener('authentication_error', () => resolve(null));
      player?.connect();
    });
  })();
  return readyPromise;
}

/** Da chiamare sincronicamente dentro il gesto dell'utente (es. onClick) per sbloccare l'audio sui browser più restrittivi. */
export function activateSpotifyElement(): void {
  player?.activateElement?.();
}

export async function isSpotifyPlayerAvailable(): Promise<boolean> {
  const token = await getValidSpotifyToken();
  return !!token;
}

function playlistToUri(link: string): string | null {
  const m = link.match(/(playlist|album|track)\/([a-zA-Z0-9]+)/);
  if (!m) return null;
  return `spotify:${m[1]}:${m[2]}`;
}

export async function playSpotifyLink(link: string): Promise<boolean> {
  const uri = playlistToUri(link);
  if (!uri) return false;
  const token = await getValidSpotifyToken();
  const device = await ensurePlayerReady();
  if (!token || !device) return false;
  try {
    const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_uri: uri }),
    });
    return res.ok || res.status === 204;
  } catch { return false; }
}

export async function pauseSpotifyPlayback(): Promise<void> {
  const token = await getValidSpotifyToken();
  if (!token || !deviceId) return;
  try { await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } }); } catch { /* best effort */ }
}

export async function resumeSpotifyPlayback(): Promise<void> {
  const token = await getValidSpotifyToken();
  if (!token || !deviceId) return;
  try { await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } }); } catch { /* best effort */ }
}
