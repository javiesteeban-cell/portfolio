// Cloudflare Pages Function — sincronización de estado del portfolio.
// GET  /api/state  → devuelve el JSON guardado (o {} si vacío).
// PUT  /api/state  → guarda el body JSON como nuevo estado.
// Auth: header  Authorization: Bearer <env.AUTH_TOKEN>
// Storage:      KV binding  env.PORTFOLIO_KV

const STATE_KEY = 'state';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
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
  if (!env.AUTH_TOKEN) return { ok: false, code: 500, msg: 'AUTH_TOKEN not configured' };
  const hdr = request.headers.get('Authorization') || '';
  const token = hdr.replace(/^Bearer\s+/i, '').trim();
  if (!token || token !== env.AUTH_TOKEN) return { ok: false, code: 401, msg: 'Unauthorized' };
  return { ok: true };
}

export async function onRequest({ request, env }) {
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const auth = checkAuth(request, env);
  if (!auth.ok) return json({ error: auth.msg }, auth.code);

  if (!env.PORTFOLIO_KV) return json({ error: 'PORTFOLIO_KV binding not configured' }, 500);

  if (method === 'GET') {
    const data = await env.PORTFOLIO_KV.get(STATE_KEY, { type: 'json' });
    return json(data || {});
  }

  if (method === 'PUT') {
    let body;
    try { body = await request.json(); }
    catch (e) { return json({ error: 'Invalid JSON' }, 400); }
    await env.PORTFOLIO_KV.put(STATE_KEY, JSON.stringify(body));
    return json({ ok: true, savedAt: Date.now() });
  }

  return json({ error: 'Method not allowed' }, 405);
}
