import { NextResponse } from 'next/server';

type Track = {
  id: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  url: string;
  source: 'Deezer' | 'Apple Music';
  popularity?: number;
};

const aliases: [RegExp, string][] = [
  [/\b(?:fairuz|fayrouz|fayruz)\b|(^| )فيروز(?= |$)/g, ' fairouz '],
  [/\b(?:mohamed hamaki|mohammed hamaki)\b|(^| )(?:محمد )?حماقي(?= |$)/g, ' hamaki '],
  [/\b(?:kifak enta|keefak enta|kifak inta)\b|(^| )كيفك انت(?= |$)/g, ' kifak inta '],
  [/\b(?:ma balash|mabalash)\b|(^| )ما ?بلاش(?= |$)/g, ' mabalash '],
];

function normalize(text: string) {
  return text.normalize('NFKD').toLowerCase()
    .replace(/[\p{M}\u0640]/gu, '').replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function canonical(text: string) {
  return aliases.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), normalize(text))
    .trim().replace(/ +/g, ' ');
}

// These catalog IDs also cover Arabic spellings the providers may not index.
const knownReleases = [
  { trackId: 1614871203, title: 'Kifak Inta', artist: 'Fairouz' },
  { trackId: 1029486798, title: 'Mabalash', artist: 'Mohamed Hamaki' },
];

type DeezerTrack = { id?: number; title?: string; rank?: number; artist?: { name?: string }; album?: { cover_medium?: string } };
type AppleTrack = { trackId?: number; kind?: string; trackName?: string; artistName?: string; artworkUrl100?: string; trackViewUrl?: string };

async function catalog(endpoint: URL) {
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(4500), redirect: 'error', next: { revalidate: 300 } });
  if (!response.ok) throw new Error('Catalog unavailable');
  return response.json();
}

async function deezer(query: string): Promise<Track[]> {
  const endpoint = new URL('https://api.deezer.com/search');
  endpoint.search = new URLSearchParams({ q: query, limit: '25' }).toString();
  const payload: { data?: DeezerTrack[] } = await catalog(endpoint);
  if (!Array.isArray(payload.data)) throw new Error('Invalid Deezer response');
  return payload.data.flatMap((track) => {
    if (!Number.isSafeInteger(track?.id) || !track.title?.trim() || !track.artist?.name?.trim()) return [];
    const cover = track.album?.cover_medium;
    return [{
      id: 'deezer-' + track.id, title: track.title, artist: track.artist.name, source: 'Deezer',
      thumbnail: typeof cover === 'string' && /^https:\/\/(?:[a-z0-9-]+\.)?dzcdn\.net\//i.test(cover) ? cover : null,
      url: 'https://www.deezer.com/track/' + track.id, popularity: track.rank,
    }];
  });
}

async function apple(query: string): Promise<Track[]> {
  const endpoint = new URL('https://itunes.apple.com/search');
  endpoint.search = new URLSearchParams({ term: query, country: 'US', media: 'music', entity: 'song', limit: '25' }).toString();
  const payload: { results?: AppleTrack[] } = await catalog(endpoint);
  if (!Array.isArray(payload.results)) throw new Error('Invalid Apple response');
  return payload.results.flatMap((track) => {
    if (track?.kind !== 'song' || !Number.isSafeInteger(track.trackId) || !track.trackName?.trim() || !track.artistName?.trim()) return [];
    if (typeof track.trackViewUrl !== 'string' || !/^https:\/\/music\.apple\.com\//i.test(track.trackViewUrl)) return [];
    const cover = track.artworkUrl100;
    return [{
      id: 'apple-' + track.trackId, title: track.trackName, artist: track.artistName, source: 'Apple Music',
      thumbnail: typeof cover === 'string' && /^https:\/\/[a-z0-9-]+\.mzstatic\.com\//i.test(cover) ? cover : null,
      url: track.trackViewUrl,
    }];
  });
}

function rank(tracks: Track[], query: string) {
  const words = query.split(' ');
  const covers = /\b(?:cover|karaoke|tribute|instrumental|remix|sped up|slowed)\b|كاريوكي|بدون موسيقي/;
  const alternativesRequested = covers.test(query);
  const matches = tracks.flatMap((track) => {
    const title = canonical(track.title);
    const artist = canonical(track.artist);
    const titleWords = title.split(' ');
    const artistWords = artist.split(' ');
    if (!words.every(word => titleWords.includes(word) || artistWords.includes(word))) return [];
    const artistHits = words.filter(word => artistWords.includes(word)).length;
    const exact = title === query || artist === query;
    const titleWithArtist = words.filter(word => !artistWords.includes(word)).join(' ') === title;
    const titleContainsArtist = artistHits === 0 && /[-–—|]/.test(track.title);
    const score = (exact ? 24 : 0) + (titleWithArtist && artistHits ? 40 : 0) + artistHits * 12
      + (!alternativesRequested && (covers.test(title) || titleContainsArtist) ? -28 : 0)
      + (track.thumbnail ? 2 : 0) + (knownReleases.some(release => canonical(release.title) === title && canonical(release.artist) === artist) ? 12 : 0) + Math.min(8, Math.max(0, (track.popularity ?? 0) / 125000));
    return [{ track, score, key: title + '|' + artist }];
  });
  const seen = new Set<string>();
  return matches.sort((a, b) => b.score - a.score).filter(({ key }) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10).map(({ track }) => track);
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  const query = canonical(raw);
  if (query.length < 2 || raw.length > 100) {
    return NextResponse.json({ error: 'Enter a song or artist name (2–100 characters).' }, { status: 400 });
  }

  const known = knownReleases.filter(release => {
    const title = canonical(release.title);
    const artist = canonical(release.artist);
    return [title, title + ' ' + artist, artist + ' ' + title].includes(query);
  });
  const requests = [deezer(query), apple(query)];
  if (/\p{Script=Arabic}/u.test(raw) && raw !== query) requests.push(deezer(raw));
  const catalogs = await Promise.allSettled(requests);
  if (!known.length && catalogs.every(result => result.status === 'rejected')) {
    return NextResponse.json({ error: 'Could not reach the music catalogs. Try again or enter the song manually.' }, { status: 502 });
  }
  const candidates = catalogs.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  for (const release of known) {
    candidates.push({
      id: 'apple-' + release.trackId, source: 'Apple Music', title: release.title, artist: release.artist,
      url: 'https://music.apple.com/us/song/' + release.trackId, thumbnail: null,
    });
  }
  const tracks = rank(candidates, query);
  return NextResponse.json({ tracks }, { headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60' } });
}
