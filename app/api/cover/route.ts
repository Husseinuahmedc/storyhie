const artworkHosts: Record<string, RegExp> = {
  'i.scdn.co': /^\/image\/[a-z0-9]+$/i,
  'cdn-images.dzcdn.net': /^\/images\/cover\/[a-z0-9]+\/[a-z0-9_.-]+$/i,
  'e-cdns-images.dzcdn.net': /^\/images\/cover\/[a-z0-9]+\/[a-z0-9_.-]+$/i,
  'is1-ssl.mzstatic.com': /^\/image\/thumb\//,
  'is2-ssl.mzstatic.com': /^\/image\/thumb\//,
  'is3-ssl.mzstatic.com': /^\/image\/thumb\//,
  'is4-ssl.mzstatic.com': /^\/image\/thumb\//,
  'is5-ssl.mzstatic.com': /^\/image\/thumb\//,
};

export async function GET(request: Request) {
  const source = new URL(request.url).searchParams.get('url') ?? '';
  let url: URL;
  try { url = new URL(source); }
  catch { return new Response(null, { status: 400 }); }
  if (source.length > 1024 || url.protocol !== 'https:' || url.port || url.username || url.password ||
    url.search || url.hash || !Object.hasOwn(artworkHosts, url.hostname) || !artworkHosts[url.hostname].test(url.pathname)) {
    return new Response(null, { status: 400 });
  }

  try {
    const image = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    const type = image.headers.get('content-type')?.split(';')[0] ?? '';
    const maxSize = 2_000_000;
    if (!image.ok || !image.body || !/^image\/(jpeg|png|webp|avif)$/.test(type) ||
      Number(image.headers.get('content-length')) > maxSize) {
      await image.body?.cancel();
      return new Response(null, { status: 502 });
    }
    const reader = image.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxSize) {
        await reader.cancel();
        return new Response(null, { status: 502 });
      }
      chunks.push(new Uint8Array(chunk.value));
    }
    return new Response(new Blob(chunks, { type }), {
      headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600, s-maxage=86400', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
