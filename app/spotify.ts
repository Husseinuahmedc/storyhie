export function canonicalTrack(value: unknown) {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.port || url.username || url.password) return null;
    const match = /^\/track\/([A-Za-z0-9]{22})\/?$/.exec(url.pathname);
    return match ? 'https://open.spotify.com/track/' + match[1] : null;
  } catch {
    return null;
  }
}
