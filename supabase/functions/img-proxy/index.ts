// Image proxy for the share card: outlets don't send CORS headers, so a canvas can't read their photos.
// GET /img-proxy?url=<https image url> → the image with Access-Control-Allow-Origin: *.
// Only images, only http(s), max 6 MB, cached for a day.

const MAX_BYTES = 6 * 1024 * 1024;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const target = new URL(req.url).searchParams.get('url');
  let url: URL;
  try {
    url = new URL(target ?? '');
  } catch {
    return new Response('bad url', { status: 400, headers: CORS });
  }
  if (!/^https?:$/.test(url.protocol) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname)) {
    return new Response('forbidden', { status: 403, headers: CORS });
  }

  const res = await fetch(url, { headers: { 'user-agent': 'AugeBot/0.2 (+https://github.com/powfuu/Auge-)' }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const type = res?.headers.get('content-type') ?? '';
  if (!res?.ok || !type.startsWith('image/')) return new Response('not an image', { status: 502, headers: CORS });
  const body = await res.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new Response('too large', { status: 413, headers: CORS });

  return new Response(body, { headers: { ...CORS, 'content-type': type, 'cache-control': 'public, max-age=86400' } });
});
