const KEY = 'scatto-forza-30-spotify-link';

export function getSpotifyLink(): string {
  try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; }
}

export function setSpotifyLink(url: string): void {
  try { localStorage.setItem(KEY, url.trim()); } catch { /* storage optional */ }
}

export function openSpotify(): void {
  const link = getSpotifyLink();
  if (!link) return;
  window.open(link, '_blank', 'noopener');
}
