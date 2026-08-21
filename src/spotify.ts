const KEY = 'scatto-forza-30-spotify-link';
const DEFAULT_LINK = 'https://open.spotify.com/playlist/4wySTd186vkj4KLnOqYU4d?si=8j3evL5YTRmRESb6MAsLng';

export function getSpotifyLink(): string {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;
    localStorage.setItem(KEY, DEFAULT_LINK);
    return DEFAULT_LINK;
  } catch { return DEFAULT_LINK; }
}

export function setSpotifyLink(url: string): void {
  try { localStorage.setItem(KEY, url.trim()); } catch { /* storage optional */ }
}

export function openSpotify(): void {
  const link = getSpotifyLink();
  if (!link) return;
  window.open(link, '_blank', 'noopener');
}
