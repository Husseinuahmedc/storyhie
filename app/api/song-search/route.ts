import { NextResponse } from 'next/server';

type CatalogTrack = {
  id?: number;
  title?: string;
  artist?: { name?: string };
  album?: { cover_medium?: string };
};

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2 || query.length > 100) {
    return NextResponse.json({ error: 'Enter at least two characters.' }, { status: 400 });
  }

  const endpoint = new URL('https://api.deezer.com/search');
  endpoint.searchParams.set('q', query);
  endpoint.searchParams.set('limit', '10');

  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(6500), redirect: 'error' });
    if (!response.ok) throw new Error('Catalog unavailable');
    const data: { data?: CatalogTrack[] } = await response.json();
    if (!Array.isArray(data.data)) throw new Error('Unexpected catalog response');
    const seen = new Set<string>();
    const tracks = [];
    for (const track of data.data.slice(0, 10)) {
      if (!Number.isSafeInteger(track?.id) || typeof track.title !== 'string' || typeof track.artist?.name !== 'string') continue;
      const title = track.title.trim().slice(0, 100);
      const artist = track.artist.name.trim().slice(0, 80);
      if (!title || !artist) continue;
      const key = (title + '|' + artist).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const cover = track.album?.cover_medium;
      const thumbnail = typeof cover === 'string' && /^https:\/\/(?:[a-z0-9-]+\.)?dzcdn\.net\//i.test(cover) ? cover : null;
      tracks.push({ id: track.id, title, artist, thumbnail, url: 'https://www.deezer.com/track/' + track.id });
    }
    return NextResponse.json({ tracks }, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60' } });
  } catch {
    return NextResponse.json({ error: 'Could not reach the music catalog. Try again or enter the song manually.' }, { status: 502 });
  }
}
