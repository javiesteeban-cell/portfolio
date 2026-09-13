// Test Node puro (sin dependencias) para functions/api/foto/[id].js
// Ejecutar: node tests/foto.test.mjs

import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moduleUrl = pathToFileURL(path.join(__dirname, '..', 'functions', 'api', 'foto', '[id].js'));
const { onRequest } = await import(moduleUrl.href);

const PIN_HASH = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567';
const BASE_URL = 'http://localhost/api/foto/';

function makeKV() {
  const store = new Map();
  return {
    async put(key, value, opts) {
      // Normaliza a ArrayBuffer para simular el comportamiento real de KV
      let buf = value;
      if (value instanceof Uint8Array) buf = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      store.set(key, { value: buf, metadata: (opts && opts.metadata) || null });
    },
    async getWithMetadata(key) {
      const entry = store.get(key);
      if (!entry) return { value: null, metadata: null };
      return { value: entry.value, metadata: entry.metadata };
    },
    async delete(key) {
      store.delete(key);
    },
    _store: store,
  };
}

function makeEnv(overrides) {
  return Object.assign(
    { PORTFOLIO_KV: makeKV(), AUTH_PIN_HASH: PIN_HASH },
    overrides || {}
  );
}

function authHeaders(token) {
  return { Authorization: 'Bearer ' + (token !== undefined ? token : PIN_HASH) };
}

function req(id, method, opts) {
  opts = opts || {};
  const url = BASE_URL + id;
  const init = { method: method };
  if (opts.headers) init.headers = opts.headers;
  if (opts.body !== undefined) init.body = opts.body;
  return new Request(url, init);
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('GET sin Authorization → 401', async () => {
  const env = makeEnv();
  const res = await onRequest({ request: req('validid123', 'GET'), env, params: { id: 'validid123' } });
  assert.equal(res.status, 401);
});

test('GET con token incorrecto → 401', async () => {
  const env = makeEnv();
  const res = await onRequest({
    request: req('validid123', 'GET', { headers: authHeaders('token-erroneo') }),
    env,
    params: { id: 'validid123' },
  });
  assert.equal(res.status, 401);
});

test('id inválido → 400', async () => {
  const env = makeEnv();
  const res = await onRequest({
    request: req('ab', 'GET', { headers: authHeaders() }),
    env,
    params: { id: 'ab' },
  });
  assert.equal(res.status, 400);
});

test('PUT con content-type no permitido → 415', async () => {
  const env = makeEnv();
  const res = await onRequest({
    request: req('validid123', 'PUT', {
      headers: Object.assign({ 'Content-Type': 'text/plain' }, authHeaders()),
      body: 'hola',
    }),
    env,
    params: { id: 'validid123' },
  });
  assert.equal(res.status, 415);
});

test('PUT vacío → 400', async () => {
  const env = makeEnv();
  const res = await onRequest({
    request: req('validid123', 'PUT', {
      headers: Object.assign({ 'Content-Type': 'image/jpeg' }, authHeaders()),
    }),
    env,
    params: { id: 'validid123' },
  });
  assert.equal(res.status, 400);
});

test('PUT > 6 MB → 413', async () => {
  const env = makeEnv();
  const big = new Uint8Array(6 * 1024 * 1024 + 1);
  const res = await onRequest({
    request: req('validid123', 'PUT', {
      headers: Object.assign({ 'Content-Type': 'image/jpeg' }, authHeaders()),
      body: big,
    }),
    env,
    params: { id: 'validid123' },
  });
  assert.equal(res.status, 413);
});

test('PUT jpeg válido → 200, luego GET devuelve los mismos bytes y content-type', async () => {
  const env = makeEnv();
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const putRes = await onRequest({
    request: req('validid123', 'PUT', {
      headers: Object.assign({ 'Content-Type': 'image/jpeg' }, authHeaders()),
      body: bytes,
    }),
    env,
    params: { id: 'validid123' },
  });
  assert.equal(putRes.status, 200);
  const putBody = await putRes.json();
  assert.equal(putBody.ok, true);
  assert.equal(putBody.id, 'validid123');
  assert.equal(putBody.size, bytes.byteLength);

  const getRes = await onRequest({
    request: req('validid123', 'GET', { headers: authHeaders() }),
    env,
    params: { id: 'validid123' },
  });
  assert.equal(getRes.status, 200);
  assert.equal(getRes.headers.get('content-type'), 'image/jpeg');
  const gotBuf = new Uint8Array(await getRes.arrayBuffer());
  assert.deepEqual(Array.from(gotBuf), Array.from(bytes));
});

test('GET de id inexistente (formato válido) → 404', async () => {
  const env = makeEnv();
  const res = await onRequest({
    request: req('noexisteid1', 'GET', { headers: authHeaders() }),
    env,
    params: { id: 'noexisteid1' },
  });
  assert.equal(res.status, 404);
});

test('DELETE → 200 y GET posterior → 404', async () => {
  const env = makeEnv();
  const bytes = new Uint8Array([1, 2, 3, 4]);
  await onRequest({
    request: req('deleteid123', 'PUT', {
      headers: Object.assign({ 'Content-Type': 'image/png' }, authHeaders()),
      body: bytes,
    }),
    env,
    params: { id: 'deleteid123' },
  });

  const delRes = await onRequest({
    request: req('deleteid123', 'DELETE', { headers: authHeaders() }),
    env,
    params: { id: 'deleteid123' },
  });
  assert.equal(delRes.status, 200);
  const delBody = await delRes.json();
  assert.equal(delBody.ok, true);

  const getRes = await onRequest({
    request: req('deleteid123', 'GET', { headers: authHeaders() }),
    env,
    params: { id: 'deleteid123' },
  });
  assert.equal(getRes.status, 404);
});

test('DELETE de id que no existía → 200 igualmente (idempotente)', async () => {
  const env = makeEnv();
  const res = await onRequest({
    request: req('nuncaexistio1', 'DELETE', { headers: authHeaders() }),
    env,
    params: { id: 'nuncaexistio1' },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test('OPTIONS → 204 con Access-Control-Allow-Methods', async () => {
  const env = makeEnv();
  const res = await onRequest({
    request: req('validid123', 'OPTIONS'),
    env,
    params: { id: 'validid123' },
  });
  assert.equal(res.status, 204);
  const methods = res.headers.get('access-control-allow-methods') || '';
  assert.ok(methods.includes('GET'));
  assert.ok(methods.includes('PUT'));
  assert.ok(methods.includes('DELETE'));
  assert.ok(methods.includes('OPTIONS'));
});

test('AUTH_PIN_HASH no configurado → 500', async () => {
  const env = makeEnv({ AUTH_PIN_HASH: undefined });
  const res = await onRequest({
    request: req('validid123', 'GET', { headers: authHeaders() }),
    env,
    params: { id: 'validid123' },
  });
  assert.equal(res.status, 500);
});

test('Método no permitido → 405', async () => {
  const env = makeEnv();
  const res = await onRequest({
    request: req('validid123', 'PATCH', { headers: authHeaders() }),
    env,
    params: { id: 'validid123' },
  });
  assert.equal(res.status, 405);
});

let passed = 0;
let failed = 0;
const failures = [];

for (const t of tests) {
  try {
    await t.fn();
    passed++;
    console.log('  OK  ' + t.name);
  } catch (err) {
    failed++;
    failures.push({ name: t.name, err });
    console.log('  FAIL ' + t.name);
    console.log('       ' + (err && err.message ? err.message : err));
  }
}

console.log('');
console.log('Resumen: ' + passed + ' OK, ' + failed + ' FAIL (total ' + tests.length + ')');

if (failed > 0) {
  process.exit(1);
}
