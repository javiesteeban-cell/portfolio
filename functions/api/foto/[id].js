// Cloudflare Pages Function — almacenamiento de fotos de facturas.
// GET    /api/foto/:id  → devuelve el binario de la foto guardada (404 si no existe).
// PUT    /api/foto/:id  → guarda el body binario (JPEG/PNG/WEBP) como nueva foto.
// DELETE /api/foto/:id  → elimina la foto (idempotente).
// Auth: header  Authorization: Bearer <sha256(PIN)>
// Server compara con env.AUTH_PIN_HASH (hex SHA-256 del PIN, configurado en Cloudflare).
// Storage: KV binding env.PORTFOLIO_KV, clave 'foto:' + id

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data, status, extra) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign(
      { 'Content-Type': 'application/json; charset=utf-8' },
      CORS,
      extra || {}
    ),
  });
}

function checkAuth(request, env) {
  if (!env.AUTH_PIN_HASH) return { ok: false, code: 500, msg: 'AUTH_PIN_HASH not configured' };
  const hdr = request.headers.get('Authorization') || '';
  const token = hdr.replace(/^Bearer\s+/i, '').trim().toLowerCase();
  const expected = env.AUTH_PIN_HASH.trim().toLowerCase();
  if (!token || token !== expected) return { ok: false, code: 401, msg: 'Unauthorized' };
  return { ok: true };
}

export async function onRequest({ request, env, params }) {
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const auth = checkAuth(request, env);
  if (!auth.ok) return json({ error: auth.msg }, auth.code);

  if (!env.PORTFOLIO_KV) return json({ error: 'PORTFOLIO_KV binding not configured' }, 500);

  const id = params && params.id;
  if (!id || !ID_RE.test(id)) return json({ error: 'Invalid id' }, 400);

  const key = 'foto:' + id;

  if (method === 'GET') {
    const res = await env.PORTFOLIO_KV.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!res || !res.value) return json({ error: 'Not found' }, 404);
    const meta = res.metadata || {};
    const type = meta.type || 'image/jpeg';
    return new Response(res.value, {
      status: 200,
      headers: Object.assign(
        {
          'Content-Type': type,
          'Content-Length': String(res.value.byteLength),
          'Cache-Control': 'private, max-age=31536000, immutable',
        },
        CORS
      ),
    });
  }

  if (method === 'PUT') {
    const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.includes(type)) return json({ error: 'Unsupported media type' }, 415);

    const buffer = await request.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) return json({ error: 'Empty body' }, 400);
    if (buffer.byteLength > MAX_BYTES) return json({ error: 'File too large' }, 413);

    const meta = { type: type, size: buffer.byteLength, ts: Date.now() };
    await env.PORTFOLIO_KV.put(key, buffer, { metadata: meta });
    return json({ ok: true, id: id, size: buffer.byteLength });
  }

  if (method === 'DELETE') {
    await env.PORTFOLIO_KV.delete(key);
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
