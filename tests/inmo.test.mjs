// Test Node puro (sin dependencias) de la interfaz de Inmobiliario de app/index.html:
// subpestañas, facturas, datos fiscales y bloque de la declaración de la renta.
// Mismo arnés que tests/fiscal.test.mjs: el <script> inline se ejecuta en un vm
// con un stub mínimo de DOM.
// Ejecutar: node tests/inmo.test.mjs

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
    location: { origin: 'http://localhost', protocol: 'http:', href: 'http://localhost/' },
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    cancelAnimationFrame: (h) => clearTimeout(h),
    TextEncoder,
    fetch: async () => ({ ok: false, status: 0, json: async () => null }),
    crypto: { subtle: { digest: async () => new ArrayBuffer(32) } },
    Chart: function Chart() { return { destroy() {}, update() {} }; },
    Blob: function Blob() {},
    FileReader: function FileReader() {},
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
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
function near(actual, expected, msg, tol) {
  asserts++;
  const t = tol === undefined ? 0.01 : tol;
  if (!isFinite(actual)) fail(msg + ': valor no finito (' + actual + ')');
  if (Math.abs(actual - expected) > t + 1e-9) fail(msg + ': esperado ' + expected + ', obtenido ' + actual);
}
function incluye(hay, needle, msg) {
  asserts++;
  if (String(hay).indexOf(needle) < 0) fail(msg + ': no se encontró ' + JSON.stringify(needle));
}

const ANIO = new Date().getFullYear();
const PID = 5;

function el(id) { return ctx.document.getElementById(id); }
function set(id, v) { el(id).value = v; }
function htmlLista() { return el('prop-list').innerHTML; }
function htmlRenta() { return el('renta-block').innerHTML; }

// Neutraliza los efectos colaterales y cuenta las llamadas a trySave.
let saves = 0;
const flashes = [];
const originales = {};
function stubEfectos() {
  ['trySave', 'toast', 'flash'].forEach((fn) => { if (!originales[fn]) originales[fn] = ctx[fn]; });
  saves = 0;
  flashes.length = 0;
  ctx.trySave = function () { saves++; ctx.invalidateCalcProp(); };
  ctx.toast = function () {};
  ctx.flash = function (id, txt, level) { flashes.push({ id, txt, level: level || '' }); };
}

function factura(id, fecha, importe, cat, concepto, notas) {
  return { id, fecha, concepto, importe, cat, notas: notas || '', fotoId: null, fotoBytes: 0 };
}

function propAlquiler() {
  return {
    id: PID, uso: 'alquiler', nombre: 'Piso Vallecas',
    valor: 160000, precioCompra: 140000, pctEntrada: 20, entrada: 28000, gastos: 15400,
    reforma: 0, comisionInmo: 0, alquiler: 850, ibi: 350, seguro: 180, comunidad: 720, otrosGastos: 0,
    tin: 2.8, plazoAnios: 25, cuotaNum: 24, modoHipoteca: 'auto',
    fechaPrimeraCuota: (ANIO - 2) + '-03-01', cuotasPagadas: 0, amortiTable: null,
    tipoAlquiler: 'vivienda', fechaContrato: '2022-03-01', reduccionPct: null,
    valorCatastral: 90000, pctSuelo: 40, pctImputacion: 2, vacio: {},
    facturas: [
      factura(901, ANIO + '-02-14', 180, 'reparacion', 'Fontanero: fuga en el baño'),
      factura(902, ANIO + '-05-10', 2400, 'reparacion', 'Sustitución de caldera', 'Garantía 2 años'),
      factura(903, ANIO + '-06-01', 600, 'derrama', 'Derrama ascensor'),
      factura(904, (ANIO - 1) + '-11-20', 950, 'reparacion', 'Pintura piso completo'),
    ],
  };
}

function propHabitual() {
  return {
    id: 6, uso: 'habitual', nombre: 'Casa familiar',
    valor: 250000, precioCompra: 230000, pctEntrada: 20, entrada: 46000, gastos: 25000,
    reforma: 0, comisionInmo: 0, alquiler: 0, ibi: 500, seguro: 300, comunidad: 900, otrosGastos: 0,
    tin: 3, plazoAnios: 30, cuotaNum: 40, modoHipoteca: 'auto',
    fechaPrimeraCuota: '', cuotasPagadas: 0, amortiTable: null,
    facturas: [], tipoAlquiler: 'vivienda', fechaContrato: '', reduccionPct: null,
    valorCatastral: null, pctSuelo: null, pctImputacion: 2, vacio: {},
  };
}

function resetEstado(props) {
  ctx.S = {
    inversiones: [
      { id: 101, nombre: 'Fondo global', tipo: 'fondo', valor: 20000, tir: 6 },
      { id: 102, nombre: 'P2P', tipo: 'p2p', valor: 5000, tir: 9 },
    ],
    propiedades: props,
    snaps: [],
    liquido: [{ id: 103, nombre: 'Ahorro', tipo: 'ahorro', saldo: 10000, tae: 2 }],
    config: { baseIRPF: 30000, cfInmoModo: 'anio' },
    objetivo: { partidas: [{ id: 301, nombre: 'Vivienda', importe: 900, periodicidad: 'mensual', orden: 0 }] },
    _savedAt: 0,
  };
  ctx._propExpanded = {};
  ctx._propSubtab = {};
  ctx._propYear = {};
  ctx._rentaYear = null;
  ctx._factEdit = null;
  ctx.invalidateCalcProp();
}

/* ============================================================
   1. HUMO
   ============================================================ */
test('renderAll y renderPropList no lanzan con una cartera mixta', () => {
  stubEfectos();
  resetEstado([propAlquiler(), propHabitual()]);
  ctx.renderAll();
  ok(htmlLista().indexOf('prop-row') >= 0, 'la lista pinta tarjetas');
  ctx._propExpanded[PID] = true;
  ['resumen', 'hipoteca', 'facturas', 'fiscal'].forEach((t) => {
    ctx._propSubtab[PID] = t;
    ctx.renderPropList();
    incluye(htmlLista(), 'data-id="' + PID + '"', 'tarjeta ' + t);
  });
  // La vivienda habitual solo tiene Resumen e Hipoteca.
  ctx._propSubtab[6] = 'facturas';
  eq(ctx.propSubtab(ctx.findPropById(6)), 'resumen', 'la vivienda habitual no admite la subpestaña Facturas');
  ctx.renderPropList();
  ok(htmlLista().length > 0, 'renderPropList con vivienda habitual no lanza');
});

test('Estado vacío: sin propiedades la lista y la renta muestran su mensaje', () => {
  stubEfectos();
  resetEstado([]);
  ctx.renderPropList();
  incluye(htmlLista(), 'No hay propiedades', 'estado vacío de la lista');
  incluye(htmlRenta(), 'Todavía no hay inmuebles en alquiler', 'estado vacío de la renta');
});

/* ============================================================
   2. SUBPESTAÑAS Y EJERCICIO
   ============================================================ */
test('setPropSubtab y setPropYear conservan el estado de la tarjeta', () => {
  stubEfectos();
  resetEstado([propAlquiler()]);
  ctx.renderPropList();
  ctx.toggleProp(PID);
  eq(ctx._propExpanded[PID], true, 'la tarjeta queda expandida');

  ctx.setPropSubtab(PID, 'facturas');
  eq(ctx._propSubtab[PID], 'facturas', 'subpestaña guardada');
  eq(ctx._propExpanded[PID], true, 'la expansión sobrevive al re-render');
  incluye(htmlLista(), 'class="prop-row expanded"', 'el HTML re-aplica la expansión');

  ctx.setPropYear(PID, ANIO - 1);
  eq(ctx._propYear[PID], ANIO - 1, 'ejercicio guardado');
  eq(ctx._propSubtab[PID], 'facturas', 'la subpestaña sobrevive al cambio de ejercicio');
  incluye(htmlLista(), 'Facturas ' + (ANIO - 1), 'la cabecera muestra el ejercicio elegido');
  incluye(htmlLista(), 'Pintura piso completo', 'lista la factura del ejercicio anterior');
  ok(htmlLista().indexOf('Sustitución de caldera') < 0, 'no lista las facturas de otros ejercicios');

  eq(ctx.aniosProp(ctx.findPropById(PID))[0], ANIO, 'los ejercicios van en orden descendente');
});

test('El select de categorías expone los 10 label de FACT_CATS', () => {
  stubEfectos();
  resetEstado([propAlquiler()]);
  ctx._propExpanded[PID] = true;
  ctx._propSubtab[PID] = 'facturas';
  ctx.renderPropList();
  const h = htmlLista();
  eq(ctx.FACT_CATS.length, 10, 'siguen siendo 10 categorías');
  ctx.FACT_CATS.forEach((c) => incluye(h, c.label, 'label de la categoría ' + c.key));
  incluye(h, 'fact-foto-slot-' + PID, 'ancla del formulario para la foto (fase C)');
  incluye(h, 'class="fact-foto" data-fid="901"', 'hueco de la foto en la fila de factura');
});

// El comportamiento completo se prueba en tests/foto-client.test.mjs.
test('factFotoHTML solo pinta con un fotoId válido', () => {
  eq(typeof ctx.factFotoHTML, 'function', 'factFotoHTML definida');
  eq(ctx.factFotoHTML({ id: 1, fotoId: 'abc' }), '', 'un fotoId fuera de patrón no pinta nada');
  eq(ctx.factFotoHTML({ id: 1, fotoId: null }), '', 'sin foto no pinta nada');
  incluye(ctx.factFotoHTML({ id: 1, fotoId: 'fabc123-xyz01', fotoBytes: 2048 }), 'Ver foto', 'con foto pinta el acceso');
});

/* ============================================================
   3. FACTURAS
   ============================================================ */
test('addFactura añade la factura, guarda y re-renderiza', () => {
  stubEfectos();
  resetEstado([propAlquiler()]);
  ctx._propExpanded[PID] = true;
  ctx._propSubtab[PID] = 'facturas';
  ctx._propYear[PID] = ANIO;
  ctx.renderPropList();

  const pf = 'fa' + PID + '-';
  set(pf + 'fecha', ANIO + '-07-15');
  set(pf + 'concepto', 'Cambio de cerradura');
  set(pf + 'importe', '145.5');
  set(pf + 'cat', 'servicios');
  set(pf + 'notas', 'Cerrajero 24 h');
  ctx.addFactura(PID);

  const p = ctx.findPropById(PID);
  eq(p.facturas.length, 5, 'se ha añadido una factura');
  const nueva = p.facturas[p.facturas.length - 1];
  eq(nueva.concepto, 'Cambio de cerradura', 'concepto guardado');
  near(nueva.importe, 145.5, 'importe guardado');
  eq(nueva.cat, 'servicios', 'categoría guardada');
  eq(nueva.notas, 'Cerrajero 24 h', 'notas guardadas');
  eq(nueva.fotoId, null, 'sin foto en la fase B');
  ok(nueva.id > 0, 'id generado con Date.now()');
  eq(saves, 1, 'trySave llamado una vez');
  eq(ctx._propExpanded[PID], true, 'la tarjeta sigue expandida');
  eq(ctx._propSubtab[PID], 'facturas', 'la subpestaña se conserva');
  eq(ctx._propYear[PID], ANIO, 'el ejercicio se conserva');
  incluye(htmlLista(), 'Cambio de cerradura', 'la fila nueva aparece en el HTML');
});

test('addFactura valida concepto, importe y fecha', () => {
  stubEfectos();
  resetEstado([propAlquiler()]);
  ctx._propExpanded[PID] = true;
  ctx._propSubtab[PID] = 'facturas';
  ctx.renderPropList();
  const pf = 'fa' + PID + '-';

  set(pf + 'fecha', ANIO + '-07-15');
  set(pf + 'concepto', '   ');
  set(pf + 'importe', '100');
  ctx.addFactura(PID);
  eq(ctx.findPropById(PID).facturas.length, 4, 'sin concepto no añade');
  eq(flashes[flashes.length - 1].level, 'r', 'avisa en rojo');

  set(pf + 'concepto', 'Algo');
  set(pf + 'importe', '0');
  ctx.addFactura(PID);
  eq(ctx.findPropById(PID).facturas.length, 4, 'con importe 0 no añade');

  set(pf + 'importe', '50');
  set(pf + 'fecha', '');
  ctx.addFactura(PID);
  eq(ctx.findPropById(PID).facturas.length, 4, 'sin fecha válida no añade');
  eq(saves, 0, 'ninguna validación fallida ha guardado');
});

test('editFactura / saveEditFactura / cancelEditFactura', () => {
  stubEfectos();
  resetEstado([propAlquiler()]);
  ctx._propExpanded[PID] = true;
  ctx._propSubtab[PID] = 'facturas';
  ctx._propYear[PID] = ANIO;
  ctx.renderPropList();

  ctx.editFactura(PID, 902);
  ok(ctx._factEdit && ctx._factEdit.fid === 902, 'factura en edición');
  incluye(htmlLista(), 'fe902-concepto', 'el formulario en línea se ha pintado');

  const pf = 'fe902-';
  set(pf + 'fecha', ANIO + '-05-11');
  set(pf + 'concepto', 'Caldera nueva');
  set(pf + 'importe', '2500');
  set(pf + 'cat', 'mejora');
  set(pf + 'notas', 'Factura revisada');
  ctx.saveEditFactura(PID, 902);

  const f = ctx.findFactura(ctx.findPropById(PID), 902);
  eq(f.concepto, 'Caldera nueva', 'concepto actualizado');
  near(f.importe, 2500, 'importe actualizado');
  eq(f.cat, 'mejora', 'categoría actualizada');
  eq(f.fecha, ANIO + '-05-11', 'fecha actualizada');
  eq(f.notas, 'Factura revisada', 'notas actualizadas');
  eq(ctx._factEdit, null, 'se cierra la edición');
  eq(saves, 1, 'trySave llamado');
  eq(ctx._propExpanded[PID], true, 'expansión conservada');
  eq(ctx._propSubtab[PID], 'facturas', 'subpestaña conservada');
  eq(ctx._propYear[PID], ANIO, 'ejercicio conservado');

  ctx.editFactura(PID, 901);
  ctx.cancelEditFactura();
  eq(ctx._factEdit, null, 'cancelar cierra la edición');
  eq(saves, 1, 'cancelar no guarda');
});

test('delFactura elimina tras confirmar y conserva el estado de la tarjeta', () => {
  stubEfectos();
  resetEstado([propAlquiler()]);
  ctx._propExpanded[PID] = true;
  ctx._propSubtab[PID] = 'facturas';
  ctx._propYear[PID] = ANIO;
  ctx.renderPropList();

  const origConfirm = ctx.confirmAction;
  ctx.confirmAction = function (msg, sub, cb) { cb(); };
  ctx.delFactura(PID, 903);
  ctx.confirmAction = origConfirm;

  const p = ctx.findPropById(PID);
  eq(p.facturas.length, 3, 'la factura se ha borrado');
  eq(ctx.findFactura(p, 903), null, 'ya no se encuentra por id');
  eq(saves, 1, 'trySave llamado');
  eq(ctx._propExpanded[PID], true, 'expansión conservada');
  eq(ctx._propSubtab[PID], 'facturas', 'subpestaña conservada');
  eq(ctx._propYear[PID], ANIO, 'ejercicio conservado');
});

test('factCatHint describe el tratamiento de cada categoría', () => {
  incluye(ctx.factCatHint('mobiliario'), '10 % anual', 'mobiliario se amortiza');
  incluye(ctx.factCatHint('mejora'), 'capitaliza', 'la mejora se capitaliza');
  incluye(ctx.factCatHint('nodeducible'), 'No deducible', 'no deducible');
  incluye(ctx.factCatHint('reparacion'), 'tope', 'reparación va con tope');
  incluye(ctx.factCatHint('contrato'), '100 %', 'el contrato no se prorratea');
});

/* ============================================================
   4. DATOS FISCALES
   ============================================================ */
test('saveFiscalProp muta el inmueble y conserva el estado de la tarjeta', () => {
  stubEfectos();
  resetEstado([propAlquiler()]);
  ctx._propExpanded[PID] = true;
  ctx._propSubtab[PID] = 'fiscal';
  ctx._propYear[PID] = ANIO;
  ctx.renderPropList();

  const pf = 'fi' + PID + '-';
  set(pf + 'tipo', 'otro');
  set(pf + 'contrato', '2024-01-15');
  set(pf + 'red', '50');
  set(pf + 'catastral', '120000');
  set(pf + 'suelo', '35');
  set(pf + 'imput', '1.1');
  set(pf + 'vacio', '2.5');
  ctx.saveFiscalProp(PID);

  const p = ctx.findPropById(PID);
  eq(p.tipoAlquiler, 'otro', 'tipo de alquiler');
  eq(p.fechaContrato, '2024-01-15', 'fecha de contrato');
  eq(p.reduccionPct, 50, 'reducción manual');
  eq(p.valorCatastral, 120000, 'valor catastral');
  eq(p.pctSuelo, 35, 'porcentaje de suelo');
  eq(p.pctImputacion, 1.1, 'porcentaje de imputación');
  eq(p.vacio[String(ANIO)], 2.5, 'meses sin alquilar del ejercicio');
  eq(saves, 1, 'trySave llamado');
  eq(ctx._propExpanded[PID], true, 'expansión conservada');
  eq(ctx._propSubtab[PID], 'fiscal', 'subpestaña conservada');
  eq(ctx._propYear[PID], ANIO, 'ejercicio conservado');

  // Reducción automática y borrado del vacío.
  set(pf + 'red', '');
  set(pf + 'vacio', '0');
  ctx.saveFiscalProp(PID);
  eq(p.reduccionPct, null, 'reducción automática');
  eq(p.vacio[String(ANIO)], undefined, 'el vacío a 0 se elimina del mapa');
});

test('saveFiscalProp rechaza valores fuera de rango', () => {
  stubEfectos();
  resetEstado([propAlquiler()]);
  ctx._propExpanded[PID] = true;
  ctx._propSubtab[PID] = 'fiscal';
  ctx.renderPropList();
  const pf = 'fi' + PID + '-';
  set(pf + 'tipo', 'vivienda');
  set(pf + 'contrato', '');
  set(pf + 'red', '');
  set(pf + 'catastral', '90000');
  set(pf + 'imput', '2');
  set(pf + 'vacio', '0');

  set(pf + 'suelo', '140');
  ctx.saveFiscalProp(PID);
  eq(saves, 0, 'no guarda con un % de suelo inválido');
  eq(flashes[flashes.length - 1].level, 'r', 'avisa en rojo');

  set(pf + 'suelo', '40');
  set(pf + 'vacio', '15');
  ctx.saveFiscalProp(PID);
  eq(saves, 0, 'no guarda con meses sin alquilar fuera de rango');

  set(pf + 'vacio', '3');
  ctx.saveFiscalProp(PID);
  eq(saves, 1, 'con valores válidos sí guarda');
  eq(ctx.findPropById(PID).vacio[String(ANIO)], 3, 'meses sin alquilar guardados');
});

test('La subpestaña Fiscal pinta la liquidación del ejercicio', () => {
  stubEfectos();
  resetEstado([propAlquiler()]);
  ctx._propExpanded[PID] = true;
  ctx._propSubtab[PID] = 'fiscal';
  ctx._propYear[PID] = ANIO;
  ctx.renderPropList();
  const h = htmlLista();
  const f = ctx.calcFiscalProp(ctx.findPropById(PID), ANIO);
  incluye(h, 'Liquidación estimada ' + ANIO, 'cabecera de la liquidación');
  incluye(h, 'Rendimiento neto reducido', 'fila de RNR');
  incluye(h, ctx.eur2(f.RNR), 'importe del RNR formateado');
  incluye(h, 'Cashflow ' + ANIO, 'minibloque de cashflow');
  incluye(h, 'vs estructural', 'ficha de diferencia contra la vista estructural');
});

/* ============================================================
   5. HIPOTECA
   ============================================================ */
test('La subpestaña Hipoteca muestra intereses y cuotas del ejercicio', () => {
  stubEfectos();
  resetEstado([propAlquiler()]);
  ctx._propExpanded[PID] = true;
  ctx._propSubtab[PID] = 'hipoteca';
  ctx._propYear[PID] = ANIO;
  ctx.renderPropList();
  const hip = ctx.interesesYCuotaAnio(ctx.findPropById(PID), ANIO);
  eq(hip.fuente, 'frances', 'con fecha de primera cuota usa el modelo francés');
  incluye(htmlLista(), 'Intereses ' + ANIO, 'fila de intereses del ejercicio');
  incluye(htmlLista(), ctx.eur2(hip.intereses), 'importe de los intereses del ejercicio');

  // Sin ancla temporal el cálculo es aproximado y aparece el aviso.
  const p2 = propAlquiler();
  p2.fechaPrimeraCuota = '';
  resetEstado([p2]);
  ctx._propExpanded[PID] = true;
  ctx._propSubtab[PID] = 'hipoteca';
  ctx.renderPropList();
  incluye(htmlLista(), 'aprox.', 'ficha de intereses aproximados');
  incluye(htmlLista(), 'fecha de la primera cuota', 'aviso para añadir la fecha');
});

test('filasAmortiAnio filtra las cuotas de la tabla por ejercicio', () => {
  stubEfectos();
  const p = propAlquiler();
  p.tin = 0; p.plazoAnios = 0; p.modoHipoteca = 'tabla';
  p.fechaPrimeraCuota = ANIO + '-01-01';
  p.amortiTable = [];
  for (let i = 0; i < 24; i++) {
    const mes = (i % 12) + 1;
    const anio = ANIO + Math.floor(i / 12);
    p.amortiTable.push({ n: i + 1, fecha: '01/' + String(mes).padStart(2, '0') + '/' + anio, cuota: 600, interes: 250, amorti: 350, saldo: 100000 - 350 * (i + 1) });
  }
  resetEstado([p]);
  eq(ctx.filasAmortiAnio(p, ANIO).length, 12, 'doce cuotas en el ejercicio actual');
  eq(ctx.filasAmortiAnio(p, ANIO + 1).length, 12, 'doce cuotas en el siguiente');
  eq(ctx.filasAmortiAnio(p, ANIO - 1).length, 0, 'ninguna antes de la primera cuota');

  ctx._propExpanded[PID] = true;
  ctx._propSubtab[PID] = 'hipoteca';
  ctx._propYear[PID] = ANIO;
  ctx.renderPropList();
  incluye(htmlLista(), 'amort-row', 'la tabla del ejercicio se pinta en filas');
});

/* ============================================================
   6. BLOQUE DE LA DECLARACIÓN
   ============================================================ */
test('renderRenta refleja la cuota calculada por calcRenta', () => {
  stubEfectos();
  resetEstado([propAlquiler(), propHabitual()]);
  ctx.renderPropList();
  const r = ctx.calcRenta(ANIO);
  const h = htmlRenta();
  incluye(h, 'Declaración de la renta', 'título del bloque');
  incluye(h, ctx.eur(Math.abs(r.cuota)), 'la cuota formateada aparece en el HTML');
  incluye(h, ctx.eur(r.sumRI), 'los ingresos íntegros aparecen en el HTML');
  incluye(h, ctx.pct1(r.tipoEfectivo * 100), 'el tipo efectivo aparece en el HTML');
  incluye(h, r.tramoFinal.pct + '%', 'el tramo marginal final aparece en el HTML');
  incluye(h, 'Piso Vallecas', 'el desglose incluye el inmueble de alquiler');
  ok(h.indexOf('Casa familiar') < 0, 'la vivienda habitual no entra en la declaración');
  eq(r.inmuebles.length, 1, 'calcRenta solo considera los inmuebles de alquiler');
});

test('setRentaYear cambia el ejercicio del bloque', () => {
  stubEfectos();
  resetEstado([propAlquiler()]);
  ctx.renderPropList();
  ctx.setRentaYear(ANIO - 1);
  eq(ctx.rentaYear(), ANIO - 1, 'ejercicio anterior seleccionado');
  const r = ctx.calcRenta(ANIO - 1);
  incluye(htmlRenta(), ctx.eur(Math.abs(r.cuota)), 'la cuota del ejercicio anterior aparece en el HTML');
  // Un ejercicio fuera del par permitido vuelve al año actual.
  ctx.setRentaYear(2010);
  ctx.renderRenta();
  eq(ctx.rentaYear(), ANIO, 'un ejercicio no soportado vuelve al año actual');
});

test('Sin base de IRPF configurada se avisa en el bloque de la renta', () => {
  stubEfectos();
  resetEstado([propAlquiler()]);
  ctx.S.config.baseIRPF = 0;
  ctx.invalidateCalcProp();
  ctx.renderPropList();
  incluye(htmlRenta(), 'Configura tu base en Configuración', 'ficha de aviso de base sin configurar');
});

/* ============================================================
   7. MEMOIZACIÓN
   ============================================================ */
test('calcProp cachea por inmueble y se invalida con trySave y renderAll', () => {
  stubEfectos();
  resetEstado([propAlquiler()]);
  const p = ctx.findPropById(PID);
  const a = ctx.calcProp(p);
  const b = ctx.calcProp(p);
  ok(a === b, 'la segunda llamada devuelve el objeto cacheado');

  ctx.invalidateCalcProp();
  ok(ctx.calcProp(p) !== a, 'invalidateCalcProp fuerza el recálculo');

  // El modo de cashflow forma parte de la clave.
  const c1 = ctx.calcProp(p);
  ctx.S.config.cfInmoModo = 'estructural';
  const c2 = ctx.calcProp(p);
  ok(c1 !== c2, 'cambiar el modo no devuelve la entrada cacheada');
  eq(c2.modo, 'estructural', 'modo estructural aplicado');
  ctx.S.config.cfInmoModo = 'anio';

  // Un cambio de datos seguido de trySave se refleja.
  const antes = ctx.calcProp(p).cfNetoAnual;
  p.alquiler = 1200;
  ctx.trySave();
  const despues = ctx.calcProp(p).cfNetoAnual;
  ok(Math.abs(despues - antes) > 1, 'tras trySave el cálculo usa los datos nuevos');
});

/* ============================================================
   EJECUCIÓN
   ============================================================ */
let passed = 0, failed = 0;
for (const t of tests) {
  const antes = asserts;
  try {
    t.fn();
    passed++;
    console.log('  OK    ' + t.name + '  (' + (asserts - antes) + ' asserts)');
  } catch (err) {
    failed++;
    console.log('  FALLO ' + t.name);
    console.log('        ' + (err && err.message ? err.message : err));
  }
}

// Restaura los originales por higiene.
Object.keys(originales).forEach((k) => { ctx[k] = originales[k]; });

console.log('');
console.log('Resumen: ' + passed + ' OK, ' + failed + ' FALLO (total ' + tests.length + ' tests, ' + asserts + ' aserciones)');
if (failed > 0) process.exit(1);
