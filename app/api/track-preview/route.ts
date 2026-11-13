import { NextResponse } from 'next/server';
import { canonicalTrack } from '../../spotify';

export async function POST(request: Request) {
  let url: string | null;
  try { url = canonicalTrack((await request.json())?.url); }
  catch { url = null; }
  if (!url) return NextResponse.json({ error: 'Paste a direct Spotify track link.' }, { status: 400 });

  const endpoint = new URL('https://open.spotify.com/oembed');
  endpoint.searchParams.set('url', url);
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    const title = typeof data.title === 'string' ? data.title.trim().slice(0, 160) : '';
    const artist = typeof data.author_name === 'string' ? data.author_name.trim().slice(0, 100) : '';
    const thumbnail = typeof data.thumbnail_url === 'string' && /^https:\/\/i\.scdn\.co\/image\/[a-zA-Z0-9]+$/.test(data.thumbnail_url)
      ? data.thumbnail_url : null;
    return NextResponse.json({ url, title, artist, thumbnail });
  } catch {
    return NextResponse.json({ error: 'Could not reach the music catalog. Try again or enter the song manually.' }, { status: 502 });
  }
}
