// Test Node puro (sin dependencias) del cliente de fotos de factura de
// app/index.html: módulo Foto (id, subida, caché, borrado), el acceso desde
// la fila de la factura y el saneado del modelo.
// Mismo arnés que tests/inmo.test.mjs: el <script> inline se ejecuta en un vm
// con un stub mínimo de DOM y un fetch simulado.
// Ejecutar: node tests/foto-client.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, '..', 'app', 'index.html');

/* ============================================================
   ARNÉS
   ============================================================ */
function extraerJS(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const m = html.match(/<script>\n([\s\S]*?)\n<\/script>/);
  if (!m) throw new Error('No se encontró el <script> inline en ' + htmlPath);
  return m[1];
}

function makeEl(id) {
  return {
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    outerHTML: '',
    className: '',
    checked: false,
    disabled: false,
    hidden: false,
    style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
    dataset: {},
    files: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    remove() {},
    focus() {},
    blur() {},
    click() {},
    select() {},
    setAttribute() {},
    getAttribute() { return null; },
    removeAttribute() {},
    insertAdjacentHTML() {},
    scrollIntoView() {},
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getContext() { return {}; },
  };
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
}

// Registro de llamadas al fetch simulado + respuesta programable por test.
const red = {
  calls: [],
  responder: null,          // (url, opts) => respuesta | Error lanzado
  reset(responder) { red.calls.length = 0; red.responder = responder || null; },
};

function respOK(extra) {
  return Object.assign({
    ok: true,
    status: 200,
    json: async () => ({ ok: true }),
    blob: async () => ({ size: 1234, type: 'image/jpeg' }),
  }, extra || {});
}

let objUrlSeq = 0;

function crearContexto() {
  const els = new Map();
  const document = {
    getElementById(id) {
      if (!els.has(id)) els.set(id, makeEl(id));
      return els.get(id);
    },
    createElement(tag) { return makeEl(tag); },
    // Sin DOM real: rerenderProp cae al repintado completo de la lista.
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
    body: makeEl('body'),
  };

  const sandbox = {
    console,
    document,
    location: { origin: 'https://portfolio.test', protocol: 'https:', href: 'https://portfolio.test/' },
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (h) => clearTimeout(h),
    TextEncoder,
    fetch: async (url, opts) => {
      red.calls.push({ url: String(url), method: (opts && opts.method) || 'GET', opts: opts || {} });
      if (red.responder) {
        const r = red.responder(String(url), opts || {});
        if (r instanceof Error) throw r;
        return r;
      }
      return respOK();
    },
    crypto: { subtle: { digest: async () => new ArrayBuffer(32) } },
    Chart: function Chart() { return { destroy() {}, update() {} }; },
    Blob: function Blob() {},
    FileReader: function FileReader() {},
    URL: {
      createObjectURL: () => 'blob:test/' + (++objUrlSeq),
      revokeObjectURL: () => {},
    },
    navigator: { userAgent: 'node' },
    alert() {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox._els = els;
  vm.createContext(sandbox);
  vm.runInContext(extraerJS(HTML), sandbox, { filename: 'app/index.html#script' });
  return sandbox;
}

const ctx = crearContexto();
// Sesión abierta: Auth.getToken() devuelve el hash del PIN.
ctx.sessionStorage.setItem('pf_v8_session', 'tok-abc123');

/* ============================================================
   UTILIDADES DE TEST
   ============================================================ */
let asserts = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function fail(msg) { throw new Error(msg); }
function eq(actual, expected, msg) {
  asserts++;
  if (actual !== expected) fail(msg + ': esperado ' + JSON.stringify(expected) + ', obtenido ' + JSON.stringify(actual));
}
function ok(cond, msg) {
  asserts++;
  if (!cond) fail(msg);
}
function incluye(hay, needle, msg) {
  asserts++;
  if (String(hay).indexOf(needle) < 0) fail(msg + ': no se encontró ' + JSON.stringify(needle));
}
function noIncluye(hay, needle, msg) {
  asserts++;
  if (String(hay).indexOf(needle) >= 0) fail(msg + ': no debería aparecer ' + JSON.stringify(needle));
}

const ANIO = new Date().getFullYear();
const PID = 5;
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

let saves = 0;
const flashes = [];
function stubEfectos() {
  saves = 0;
  flashes.length = 0;
  ctx.trySave = function () { saves++; ctx.invalidateCalcProp(); };
  ctx.toast = function () {};
  ctx.flash = function (id, txt, level) { flashes.push({ id, txt, level: level || '' }); };
}

function factura(id, extra) {
  return Object.assign({
    id, fecha: ANIO + '-03-01', concepto: 'Fontanero', importe: 120,
    cat: 'reparacion', notas: '', fotoId: null, fotoBytes: 0,
  }, extra || {});
}

function propAlquiler(facturas) {
  return {
    id: PID, uso: 'alquiler', nombre: 'Piso Vallecas',
    valor: 160000, precioCompra: 140000, pctEntrada: 20, entrada: 28000, gastos: 15400,
    reforma: 0, comisionInmo: 0, alquiler: 850, ibi: 350, seguro: 180, comunidad: 720, otrosGastos: 0,
    tin: 2.8, plazoAnios: 25, cuotaNum: 24, modoHipoteca: 'auto',
    fechaPrimeraCuota: (ANIO - 2) + '-03-01', cuotasPagadas: 0, amortiTable: null,
    tipoAlquiler: 'vivienda', fechaContrato: '2022-03-01', reduccionPct: null,
    valorCatastral: 90000, pctSuelo: 40, pctImputacion: 2, vacio: {},
    facturas: facturas || [factura(901)],
  };
}

function resetEstado(props) {
  ctx.S = {
    inversiones: [],
    propiedades: props,
    snaps: [],
    liquido: [],
    config: { baseIRPF: 30000, cfInmoModo: 'anio' },
    objetivo: { partidas: [] },
    _savedAt: 0,
  };
  ctx._propExpanded = {};
  ctx._propSubtab = {};
  ctx._propYear = {};
  ctx._rentaYear = null;
  ctx._factEdit = null;
  ctx._fotoPendiente = {};
  ctx._fotoQuitar = {};
  ctx._fotoCtl = {};
  ctx.invalidateCalcProp();
}

/* ============================================================
   1. IDENTIFICADORES
   ============================================================ */
test('Foto.nuevoId cumple el patrón del servidor en 200 iteraciones', () => {
  const vistos = new Set();
  for (let i = 0; i < 200; i++) {
    const id = ctx.Foto.nuevoId();
    asserts++;
    if (!ID_RE.test(id)) fail('id fuera de patrón: ' + JSON.stringify(id));
    vistos.add(id);
  }
  ok(vistos.size >= 190, 'los ids generados son prácticamente únicos (' + vistos.size + '/200)');
  ok(ctx.Foto.validId('abc123'), 'validId acepta el mínimo de 6 caracteres');
  ok(!ctx.Foto.validId('abc12'), 'validId rechaza 5 caracteres');
  ok(!ctx.Foto.validId('con espacio!'), 'validId rechaza caracteres no permitidos');
  ok(!ctx.Foto.validId(null), 'validId rechaza null');
});

/* ============================================================
   2. ACCESO A LA FOTO DESDE LA FILA
   ============================================================ */
test('factFotoHTML solo pinta el acceso cuando el id es válido', () => {
  eq(ctx.factFotoHTML(factura(1)), '', 'sin foto no pinta nada');
  eq(ctx.factFotoHTML({ id: 2, fotoId: 'abc' }), '', 'un fotoId que no cumple el patrón no pinta nada');
  eq(ctx.factFotoHTML(null), '', 'sin factura no pinta nada');

  const h = ctx.factFotoHTML(factura(3, { fotoId: 'fabc123-xyz01', fotoBytes: 204800 }));
  incluye(h, 'Ver foto', 'con foto pinta el botón');
  incluye(h, "verFoto('fabc123-xyz01')", 'el botón abre el visor con el id de la foto');
  incluye(h, '200 KB', 'muestra el tamaño en KB');
  noIncluye(h, 'undefined', 'sin fragmentos sin definir');

  const sinBytes = ctx.factFotoHTML(factura(4, { fotoId: 'fabc123-xyz02' }));
  incluye(sinBytes, 'Ver foto', 'con foto pero sin tamaño sigue pintando el botón');
  noIncluye(sinBytes, 'KB', 'sin bytes no inventa un tamaño');
});

test('La fila de la factura inserta el acceso dentro de .fact-foto', () => {
  stubEfectos();
  resetEstado([propAlquiler([factura(901, { fotoId: 'ffila001-aaa', fotoBytes: 51200 })])]);
  const p = ctx.findPropById(PID);
  const h = ctx.renderFacturaRow(p, p.facturas[0]);
  incluye(h, '<span class="fact-foto" data-fid="901">', 'el hueco conserva su marcado');
  incluye(h, 'Ver foto', 'el acceso a la foto viaja dentro de la fila');
  incluye(h, '50 KB', 'el tamaño se muestra junto al botón');
});

/* ============================================================
   3. SUBIDA
   ============================================================ */
test('Foto.subir envía PUT con Authorization y Content-Type', async () => {
  red.reset(() => respOK());
  const r = await ctx.Foto.subir('fsubir01-aaa', { size: 90000, type: 'image/jpeg' });
  eq(red.calls.length, 1, 'una sola llamada de red');
  const c = red.calls[0];
  eq(c.method, 'PUT', 'método PUT');
  eq(c.url, 'https://portfolio.test/api/foto/fsubir01-aaa', 'URL construida con location.origin');
  eq(c.opts.headers.Authorization, 'Bearer tok-abc123', 'Bearer con el token de Auth');
  eq(c.opts.headers['Content-Type'], 'image/jpeg', 'Content-Type del blob');
  eq(c.opts.body.size, 90000, 'el cuerpo es el propio blob');
  eq(r.size, 90000, 'devuelve el tamaño subido');
});

test('Foto.subir traduce los errores del servidor al español', async () => {
  red.reset(() => respOK({ ok: false, status: 401 }));
  let msg = '';
  try { await ctx.Foto.subir('fsubir02-aaa', { size: 10, type: 'image/jpeg' }); }
  catch (e) { msg = e.message; }
  eq(msg, 'Sesión no válida', '401 → sesión no válida');

  red.reset(() => respOK({ ok: false, status: 413 }));
  msg = '';
  try { await ctx.Foto.subir('fsubir03-aaa', { size: 10, type: 'image/jpeg' }); }
  catch (e) { msg = e.message; }
  eq(msg, 'La foto supera el tamaño permitido', '413 → tamaño');

  red.reset(() => respOK({ ok: false, status: 500 }));
  msg = '';
  try { await ctx.Foto.subir('fsubir04-aaa', { size: 10, type: 'image/jpeg' }); }
  catch (e) { msg = e.message; }
  eq(msg, 'No se pudo subir la foto', 'otros códigos → mensaje genérico');

  msg = '';
  try { await ctx.Foto.subir('corto', { size: 10, type: 'image/jpeg' }); }
  catch (e) { msg = e.message; }
  eq(msg, 'Identificador de foto no válido', 'id fuera de patrón no llega a la red');
});

/* ============================================================
   4. DESCARGA Y CACHÉ
   ============================================================ */
test('Foto.cargar devuelve un blob: URL y cachea por id', async () => {
  red.reset(() => respOK());
  const url1 = await ctx.Foto.cargar('fcache01-aaa');
  eq(red.calls.length, 1, 'la primera carga va a la red');
  ok(String(url1).indexOf('blob:') === 0, 'devuelve un blob: URL');

  const url2 = await ctx.Foto.cargar('fcache01-aaa');
  eq(red.calls.length, 1, 'la segunda carga no vuelve a llamar a fetch');
  eq(url2, url1, 'devuelve la misma URL cacheada');

  await ctx.Foto.cargar('fcache02-aaa');
  eq(red.calls.length, 2, 'otro id sí baja de la red');

  // Olvidar invalida la caché.
  ctx.Foto.olvidar('fcache01-aaa');
  await ctx.Foto.cargar('fcache01-aaa');
  eq(red.calls.length, 3, 'tras olvidar se vuelve a descargar');
});

test('Foto.cargar traduce 404 y los errores de red', async () => {
  red.reset(() => respOK({ ok: false, status: 404 }));
  let msg = '';
  try { await ctx.Foto.cargar('fnf00001-aaa'); } catch (e) { msg = e.message; }
  eq(msg, 'La foto ya no está disponible', '404 → mensaje legible');

  red.reset(() => new Error('offline'));
  msg = '';
  try { await ctx.Foto.cargar('fnf00002-aaa'); } catch (e) { msg = e.message; }
  eq(msg, 'Sin conexión: no se pudo cargar la foto', 'error de red → mensaje legible');
});

/* ============================================================
   5. BORRADO
   ============================================================ */
test('Foto.borrar es best-effort: no lanza y devuelve booleano', async () => {
  red.reset(() => respOK());
  eq(await ctx.Foto.borrar('fdel0001-aaa'), true, 'borrado correcto → true');
  eq(red.calls[0].method, 'DELETE', 'método DELETE');
  eq(red.calls[0].opts.headers.Authorization, 'Bearer tok-abc123', 'DELETE autenticado');

  red.reset(() => new Error('offline'));
  eq(await ctx.Foto.borrar('fdel0002-aaa'), false, 'error de red → false sin lanzar');

  red.reset(() => respOK({ ok: false, status: 500 }));
  eq(await ctx.Foto.borrar('fdel0003-aaa'), false, 'error del servidor → false');

  red.reset(() => respOK());
  eq(await ctx.Foto.borrar('corto'), false, 'id inválido → false');
  eq(red.calls.length, 0, 'un id inválido no llega a la red');
});

test('delFactura borra también la foto en el servidor', async () => {
  stubEfectos();
  resetEstado([propAlquiler([factura(901, { fotoId: 'fborra01-aaa', fotoBytes: 40960 })])]);
  red.reset(() => respOK());

  ctx.delFactura(PID, 901);
  ctx.confirmOk();                       // confirma el diálogo

  eq(ctx.findPropById(PID).facturas.length, 0, 'la factura desaparece');
  ok(saves > 0, 'la mutación llama a trySave');
  const del = red.calls.filter((c) => c.method === 'DELETE');
  eq(del.length, 1, 'se pide el borrado de la foto');
  eq(del[0].url, 'https://portfolio.test/api/foto/fborra01-aaa', 'con el id de la foto');
});

test('delFactura sin foto no llama a la red', () => {
  stubEfectos();
  resetEstado([propAlquiler([factura(902)])]);
  red.reset(() => respOK());
  ctx.delFactura(PID, 902);
  ctx.confirmOk();
  eq(ctx.findPropById(PID).facturas.length, 0, 'la factura desaparece');
  eq(red.calls.length, 0, 'sin foto no hay llamadas');
});

/* ============================================================
   6. MODELO
   ============================================================ */
test('sanitizeFacturas conserva fotoId y fotoBytes', () => {
  const out = ctx.sanitizeFacturas([
    { id: 1, fecha: ANIO + '-01-10', concepto: 'A', importe: 10, cat: 'reparacion', fotoId: 'fok00001-aaa', fotoBytes: 51200 },
    { id: 2, fecha: ANIO + '-01-11', concepto: 'B', importe: 20, cat: 'reparacion' },
    { id: 3, fecha: ANIO + '-01-12', concepto: 'C', importe: 30, cat: 'reparacion', fotoId: 123, fotoBytes: 'x' },
    { id: 4, fecha: ANIO + '-01-13', concepto: 'D', importe: 40, cat: 'reparacion', fotoId: '', fotoBytes: -5 },
  ]);
  eq(out.length, 4, 'no pierde facturas');
  eq(out[0].fotoId, 'fok00001-aaa', 'conserva el fotoId');
  eq(out[0].fotoBytes, 51200, 'conserva fotoBytes');
  eq(out[1].fotoId, null, 'sin foto → null');
  eq(out[1].fotoBytes, 0, 'sin foto → 0 bytes');
  eq(out[2].fotoId, null, 'un fotoId no textual se descarta');
  eq(out[2].fotoBytes, 0, 'un fotoBytes no numérico se normaliza a 0');
  eq(out[3].fotoId, null, 'cadena vacía → null');
  eq(out[3].fotoBytes, 0, 'bytes negativos → 0');
  eq(typeof out[0].fotoBytes, 'number', 'fotoBytes siempre numérico');
});

test('El formulario de alta y la edición pintan el control de foto', () => {
  stubEfectos();
  resetEstado([propAlquiler([factura(901, { fotoId: 'fctl0001-aaa', fotoBytes: 30720 })])]);
  const p = ctx.findPropById(PID);

  const alta = ctx.renderFacturaForm(p);
  incluye(alta, 'id="fact-foto-slot-' + PID + '"', 'el hueco del alta conserva su id');
  incluye(alta, 'type="file"', 'hay un input de fichero');
  incluye(alta, 'accept="image/*"', 'solo imágenes');
  incluye(alta, 'capture="environment"', 'la cámara trasera en móvil');
  incluye(alta, 'Hacer foto o adjuntar', 'botón de alta en español');

  ctx._factEdit = { pid: PID, fid: 901 };
  const edic = ctx.renderFacturaRow(p, p.facturas[0]);
  incluye(edic, 'Sustituir', 'con foto se ofrece sustituir');
  incluye(edic, 'Quitar foto', 'con foto se ofrece quitarla');

  // Marcada para quitar: el control cambia de estado.
  ctx._fotoQuitar[901] = true;
  const quitada = ctx.renderFacturaRow(p, p.facturas[0]);
  incluye(quitada, 'La foto se quitará al guardar', 'estado de foto marcada para quitar');
  incluye(quitada, 'Deshacer', 'se puede deshacer');
  delete ctx._fotoQuitar[901];

  // Sin foto: el botón es "Añadir foto".
  p.facturas[0].fotoId = null;
  const sinFoto = ctx.renderFacturaRow(p, p.facturas[0]);
  incluye(sinFoto, 'Añadir foto', 'sin foto se ofrece añadirla');
  noIncluye(sinFoto, 'Quitar foto', 'sin foto no se ofrece quitarla');
  ctx._factEdit = null;
});

/* ============================================================
   7. ALTA CON FOTO
   ============================================================ */
test('addFactura sube la foto pendiente y la asocia a la factura', async () => {
  stubEfectos();
  resetEstado([propAlquiler([])]);
  red.reset(() => respOK());
  ctx.document.getElementById('fa' + PID + '-concepto').value = 'Caldera';
  ctx.document.getElementById('fa' + PID + '-importe').value = '250';
  ctx.document.getElementById('fa' + PID + '-fecha').value = ANIO + '-04-02';
  ctx.document.getElementById('fa' + PID + '-cat').value = 'reparacion';
  ctx._fotoPendiente['a' + PID] = { blob: { size: 123456, type: 'image/jpeg' }, nombre: 'caldera.jpg', url: 'blob:x' };

  await ctx.addFactura(PID);

  const facts = ctx.findPropById(PID).facturas;
  eq(facts.length, 1, 'la factura se crea');
  ok(ID_RE.test(facts[0].fotoId), 'la factura queda con un fotoId válido');
  eq(facts[0].fotoBytes, 123456, 'guarda el tamaño subido');
  eq(red.calls.filter((c) => c.method === 'PUT').length, 1, 'una única subida');
  ok(saves >= 2, 'guarda al crear y al asociar la foto');
  eq(ctx._fotoPendiente['a' + PID], undefined, 'la foto pendiente se libera');
});

test('Si la subida falla, la factura se guarda sin foto y la pendiente se conserva', async () => {
  stubEfectos();
  resetEstado([propAlquiler([])]);
  red.reset(() => respOK({ ok: false, status: 401 }));
  ctx.document.getElementById('fa' + PID + '-concepto').value = 'Pintura';
  ctx.document.getElementById('fa' + PID + '-importe').value = '400';
  ctx.document.getElementById('fa' + PID + '-fecha').value = ANIO + '-05-02';
  ctx.document.getElementById('fa' + PID + '-cat').value = 'reparacion';
  ctx._fotoPendiente['a' + PID] = { blob: { size: 9000, type: 'image/jpeg' }, nombre: 'p.jpg', url: 'blob:y' };

  await ctx.addFactura(PID);

  const facts = ctx.findPropById(PID).facturas;
  eq(facts.length, 1, 'la factura se guarda igualmente');
  eq(facts[0].fotoId, null, 'sin foto asociada');
  eq(facts[0].fotoBytes, 0, 'sin bytes');
  eq(flashes.length, 1, 'se avisa del fallo');
  eq(flashes[0].level, 'r', 'el aviso es de error');
  eq(flashes[0].txt, 'Sesión no válida', 'con el mensaje del error');
  eq(ctx._fotoPendiente['a' + PID], undefined, 'ya no cuelga del formulario de alta');
  ok(!!ctx._fotoPendiente['e' + facts[0].id], 'la foto queda pendiente en la edición de la factura');
});

/* ============================================================
   8. EDICIÓN: SUSTITUIR Y QUITAR
   ============================================================ */
test('saveEditFactura sustituye la foto y borra la anterior', async () => {
  stubEfectos();
  resetEstado([propAlquiler([factura(901, { fotoId: 'fvieja01-aaa', fotoBytes: 1000 })])]);
  red.reset(() => respOK());
  ctx._factEdit = { pid: PID, fid: 901 };
  ctx.document.getElementById('fe901-concepto').value = 'Fontanero';
  ctx.document.getElementById('fe901-importe').value = '120';
  ctx.document.getElementById('fe901-fecha').value = ANIO + '-03-01';
  ctx.document.getElementById('fe901-cat').value = 'reparacion';
  ctx._fotoPendiente['e901'] = { blob: { size: 7777, type: 'image/jpeg' }, nombre: 'n.jpg', url: 'blob:z' };

  await ctx.saveEditFactura(PID, 901);

  const f = ctx.findPropById(PID).facturas[0];
  ok(ID_RE.test(f.fotoId), 'queda un fotoId nuevo');
  ok(f.fotoId !== 'fvieja01-aaa', 'el id cambia');
  eq(f.fotoBytes, 7777, 'tamaño actualizado');
  eq(red.calls.filter((c) => c.method === 'PUT').length, 1, 'sube la nueva');
  const del = red.calls.filter((c) => c.method === 'DELETE');
  eq(del.length, 1, 'borra la anterior en el servidor');
  incluye(del[0].url, 'fvieja01-aaa', 'borra exactamente la anterior');
  eq(ctx._factEdit, null, 'la edición se cierra');
});

test('saveEditFactura quita la foto marcada y la borra en el servidor', async () => {
  stubEfectos();
  resetEstado([propAlquiler([factura(901, { fotoId: 'fquita01-aaa', fotoBytes: 1000 })])]);
  red.reset(() => respOK());
  ctx._factEdit = { pid: PID, fid: 901 };
  ctx.document.getElementById('fe901-concepto').value = 'Fontanero';
  ctx.document.getElementById('fe901-importe').value = '120';
  ctx.document.getElementById('fe901-fecha').value = ANIO + '-03-01';
  ctx.document.getElementById('fe901-cat').value = 'reparacion';
  ctx._fotoQuitar[901] = true;

  await ctx.saveEditFactura(PID, 901);

  const f = ctx.findPropById(PID).facturas[0];
  eq(f.fotoId, null, 'la factura se queda sin foto');
  eq(f.fotoBytes, 0, 'sin bytes');
  eq(red.calls.filter((c) => c.method === 'PUT').length, 0, 'no sube nada');
  eq(red.calls.filter((c) => c.method === 'DELETE').length, 1, 'borra la foto en el servidor');
  eq(ctx._fotoQuitar[901], undefined, 'la marca se limpia');
  ok(saves > 0, 'la mutación guarda');
});

test('cancelEditFactura descarta la foto pendiente y la marca de quitar', () => {
  stubEfectos();
  resetEstado([propAlquiler([factura(901, { fotoId: 'fcanc001-aaa', fotoBytes: 1000 })])]);
  ctx._factEdit = { pid: PID, fid: 901 };
  ctx._fotoPendiente['e901'] = { blob: { size: 10, type: 'image/jpeg' }, nombre: 'c.jpg', url: 'blob:c' };
  ctx._fotoQuitar[901] = true;

  ctx.cancelEditFactura();

  eq(ctx._fotoPendiente['e901'], undefined, 'la pendiente se descarta');
  eq(ctx._fotoQuitar[901], undefined, 'la marca se descarta');
  eq(ctx.findPropById(PID).facturas[0].fotoId, 'fcanc001-aaa', 'la foto guardada no se toca');
});

/* ============================================================
   EJECUCIÓN
   ============================================================ */
let passed = 0, failed = 0;
for (const t of tests) {
  const antes = asserts;
  try {
    await t.fn();
    passed++;
    console.log('  OK    ' + t.name + '  (' + (asserts - antes) + ' asserts)');
  } catch (err) {
    failed++;
    console.log('  FALLO ' + t.name);
    console.log('        ' + (err && err.message ? err.message : err));
  }
}

console.log('');
console.log('Resumen: ' + passed + ' OK, ' + failed + ' FALLO (total ' + tests.length + ' tests, ' + asserts + ' aserciones)');
if (failed > 0) process.exit(1);
