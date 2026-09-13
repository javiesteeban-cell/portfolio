// Test Node puro (sin dependencias) del motor fiscal de inmuebles de app/index.html.
// Carga el <script> inline del HTML en un contexto vm con un stub mínimo de DOM.
// Ejecutar: node tests/fiscal.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, '..', 'app', 'index.html');

/* ============================================================
   ARNÉS: extraer el JS del HTML y ejecutarlo en un vm
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
const TOL = 0.01;
let asserts = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function fail(msg) { throw new Error(msg); }
function near(actual, expected, msg, tol) {
  asserts++;
  const t = tol === undefined ? TOL : tol;
  if (!isFinite(actual)) fail(msg + ': valor no finito (' + actual + ')');
  if (Math.abs(actual - expected) > t + 1e-9) {
    fail(msg + ': esperado ' + expected + ', obtenido ' + actual + ' (dif ' + (actual - expected).toFixed(6) + ')');
  }
}
function eq(actual, expected, msg) {
  asserts++;
  if (actual !== expected) fail(msg + ': esperado ' + JSON.stringify(expected) + ', obtenido ' + JSON.stringify(actual));
}
function ok(cond, msg) {
  asserts++;
  if (!cond) fail(msg);
}

function resetState(baseIRPF, modo) {
  ctx.S = {
    inversiones: [], propiedades: [], snaps: [], liquido: [],
    config: { baseIRPF: baseIRPF || 0, cfInmoModo: modo || 'anio' },
    objetivo: { partidas: [] },
    _savedAt: 0,
  };
}

/* --- constructores de datos de prueba --- */
function tablaBanco(anioIni, meses, interes, cuota) {
  const rows = [];
  let saldo = 100000;
  for (let i = 0; i < meses; i++) {
    const mes = (i % 12) + 1;
    const anio = anioIni + Math.floor(i / 12);
    const amorti = cuota - interes;
    saldo -= amorti;
    rows.push({
      n: i + 1,
      fecha: '01/' + String(mes).padStart(2, '0') + '/' + anio,
      base: saldo + amorti,
      amorti, interes, cuota,
      saldo,
    });
  }
  return rows;
}
function tablaSimple(meses, interes, cuota) {
  const rows = [];
  let saldo = 100000;
  for (let i = 0; i < meses; i++) {
    const amorti = cuota - interes;
    saldo -= amorti;
    rows.push({ n: i + 1, cuota, interes, amorti, saldo });
  }
  return rows;
}
function factura(fecha, importe, cat, concepto) {
  return { id: Math.round(Math.random() * 1e9), fecha, concepto: concepto || cat, importe, cat, notas: '', fotoId: null, fotoBytes: 0 };
}

const ANIO_A = 2025;

// Ejemplo A del documento fiscal (§12).
function propEjemploA() {
  return {
    id: 1, uso: 'alquiler', nombre: 'Piso ejemplo',
    valor: 170000, entrada: 28000, gastos: 15400, comisionInmo: 0, reforma: 0,
    alquiler: 850, ibi: 350, seguro: 180, comunidad: 720, otrosGastos: 0,
    precioCompra: 140000, pctEntrada: 20, tin: 0, plazoAnios: 0, cuotaNum: 1,
    modoHipoteca: 'tabla', fechaPrimeraCuota: ANIO_A + '-01-01', cuotasPagadas: 0,
    amortiTable: tablaBanco(ANIO_A, 12, 3100 / 12, 600),
    facturas: [factura(ANIO_A + '-06-10', 2400, 'reparacion', 'Pintura')],
    tipoAlquiler: 'vivienda', fechaContrato: '2022-03-01', reduccionPct: null,
    valorCatastral: 90000, pctSuelo: 40, pctImputacion: 2, vacio: {},
  };
}

// Ejemplo B: misma finca, reparación 9.000, contrato 2024, 3 meses vacía.
function propEjemploB() {
  const p = propEjemploA();
  p.facturas = [factura(ANIO_A + '-06-10', 9000, 'reparacion', 'Reforma baño')];
  p.fechaContrato = '2024-02-01';
  p.vacio = {}; p.vacio[String(ANIO_A)] = 3;
  p.pctImputacion = 2;
  return p;
}

// Inmueble "antiguo": solo las 22 claves que escribe saveProp, sin campos fiscales.
function propLegacy(extra) {
  const p = {
    id: 7, uso: 'alquiler', nombre: 'Legacy',
    valor: 200000, entrada: 40000, gastos: 10000, comisionInmo: 0, reforma: 0,
    alquiler: 1000, ibi: 400, seguro: 200, comunidad: 600, otrosGastos: 0,
    precioCompra: 180000, pctEntrada: 20, tin: 2.5, plazoAnios: 25, cuotaNum: 12,
    modoHipoteca: 'auto', fechaPrimeraCuota: '', cuotasPagadas: 0, amortiTable: null,
  };
  return Object.assign(p, extra || {});
}

// Réplica literal del calcProp anterior a la fase A (con la escala ya corregida).
function calcPropLegacyEsperado(p, BASE) {
  const nv = (v) => parseFloat(v) || 0;
  const irpf = ctx.irpf;
  const alqAnual = nv(p.alquiler) * 12;
  const gastosDed = (p.ibi !== undefined)
    ? nv(p.ibi) + nv(p.seguro) + nv(p.comunidad) + nv(p.otrosGastos)
    : nv(p.gastosDed);
  const hm = ctx.calcHipotecaMensual(p);
  const cuotaAnual = hm.cuotaMensual * 12;
  const interesesAnual = hm.interesesMensual * 12;
  const amortiAnual = hm.amortiMensual * 12;
  const rendBruto = alqAnual - gastosDed - interesesAnual;
  const reduccion = rendBruto > 0 ? rendBruto * 0.6 : 0;
  const rendNeto = rendBruto - reduccion;
  const impuesto = irpf(BASE + Math.max(0, rendNeto)) - irpf(BASE);
  const cfNetoAnual = alqAnual - gastosDed - cuotaAnual - impuesto;
  const capPropio = nv(p.entrada) + nv(p.gastos) + nv(p.reforma);
  return {
    cfNetoAnual, cfNetoMensual: cfNetoAnual / 12, impuesto, capPropio, amortiAnual,
    roce: capPropio > 0 ? (cfNetoAnual + amortiAnual) / capPropio : 0,
    yieldCF: capPropio > 0 ? cfNetoAnual / capPropio : 0,
    yieldBruto: nv(p.valor) > 0 ? alqAnual / nv(p.valor) : 0,
    yieldNeto: nv(p.valor) > 0 ? (alqAnual - gastosDed - impuesto) / nv(p.valor) : 0,
  };
}

/* ============================================================
   1. ESCALAS
   ============================================================ */
test('Escala general irpf(): umbrales 12.450 / 20.200 / 35.200 / 60.000 / 300.000', () => {
  near(ctx.irpf(30000), 7165.50, 'irpf(30000)');
  near(ctx.irpf(30261.12), 7243.84, 'irpf(30261.12)');
  near(ctx.irpf(27394.57), 6383.87, 'irpf(27394.57)');
  near(ctx.irpf(20200), 4225.50, 'irpf(20200)');
  near(ctx.irpf(400000), ctx.irpf(300000) + 47000, 'irpf(400000) = irpf(300000) + 47.000');
  near(ctx.irpf(0), 0, 'irpf(0)');
  near(ctx.irpf(-500), 0, 'irpf(negativo)');
});

test('Escala del ahorro irpfAhorro(): último tramo al 30 %', () => {
  near(ctx.irpfAhorro(350000), ctx.irpfAhorro(300000) + 15000, 'irpfAhorro(350000)');
  near(ctx.irpfAhorro(6000), 1140, 'irpfAhorro(6000)');
  near(ctx.irpfAhorro(50000), 10380, 'irpfAhorro(50000)');
});

test('tramoMarginal(): umbral 20.200 y tramo del 47 %', () => {
  eq(ctx.tramoMarginal(20100).pct, 24, 'base 20.100 -> 24 %');
  eq(ctx.tramoMarginal(20250).pct, 30, 'base 20.250 -> 30 %');
  eq(ctx.tramoMarginal(20100).label, '12.450 – 20.200 €', 'etiqueta segundo tramo');
  eq(ctx.tramoMarginal(20250).label, '20.200 – 35.200 €', 'etiqueta tercer tramo');
  eq(ctx.tramoMarginal(350000).pct, 47, 'base 350.000 -> 47 %');
  eq(ctx.tramoMarginal(100000).pct, 45, 'base 100.000 -> 45 %');
});

/* ============================================================
   2. EJEMPLOS A Y B DEL DOCUMENTO FISCAL
   ============================================================ */
test('Ejemplo A: piso alquilado todo el año, contrato de 2022', () => {
  resetState(30000);
  const p = propEjemploA();
  ctx.S.propiedades = [p];
  const f = ctx.calcFiscalProp(p, ANIO_A);

  eq(f.dias, 365, 'días del año');
  eq(f.mesesVacio, 0, 'meses vacío');
  eq(f.dAlq, 365, 'días arrendado');
  near(f.factor, 1, 'factor de prorrateo');
  near(f.RI, 10200.00, 'rendimiento íntegro');
  near(f.baseCatastral, 54000.00, 'base catastral');
  near(f.baseCoste, 93240.00, 'base de coste');
  near(f.baseAmort, 93240.00, 'base de amortización');
  near(f.amortInmueble, 2797.20, 'amortización del inmueble');
  near(f.interesesProrrateados, 3100.00, 'intereses del ejercicio');
  near(f.gTopeBruto, 5500.00, 'gastos con tope (bruto)');
  near(f.gTopeDeduc, 5500.00, 'gastos con tope deducidos');
  near(f.exceso, 0, 'exceso a arrastrar');
  near(f.gOtros, 4047.20, 'otros gastos');
  near(f.RN, 652.80, 'rendimiento neto');
  eq(f.reduccionPct, 60, 'porcentaje de reducción');
  near(f.reduccion, 391.68, 'reducción');
  near(f.RNR, 261.12, 'rendimiento neto reducido');
  near(f.imputacion, 0, 'imputación de renta');
  near(f.aportacion, 261.12, 'aportación a la base general');
  near(f.impuestoMarginal, 78.34, 'cuota IRPF atribuible');
  eq(f.interesesAprox, false, 'intereses no aproximados');
});

test('Ejemplo B: reparación 9.000, contrato de 2024, 3 meses vacía', () => {
  resetState(30000);
  const p = propEjemploB();
  ctx.S.propiedades = [p];
  const f = ctx.calcFiscalProp(p, ANIO_A);

  eq(f.mesesVacio, 3, 'meses vacío');
  eq(f.dAlq, 275, 'días arrendado');
  eq(f.dVacio, 90, 'días vacío');
  near(f.RI, 7650.00, 'rendimiento íntegro');
  near(f.interesesProrrateados, 2335.62, 'intereses prorrateados');
  near(f.facturasTope, 6780.82, 'reparación prorrateada');
  near(f.gTopeBruto, 9116.44, 'gastos con tope (bruto)');
  near(f.gTopeDeduc, 7650.00, 'gastos con tope deducidos');
  near(f.exceso, 1466.44, 'exceso a arrastrar');
  near(f.gOtros, 3049.27, 'otros gastos prorrateados');
  near(f.RN, -3049.27, 'rendimiento neto');
  near(f.reduccion, 0, 'reducción (RN negativo)');
  eq(f.reduccionPct, 50, 'porcentaje de reducción del contrato de 2024');
  near(f.RNR, -3049.27, 'rendimiento neto reducido');
  near(f.imputacion, 443.84, 'imputación de renta por 90 días');
  near(f.aportacion, -2605.43, 'aportación a la base general');
  near(f.impuestoMarginal, -781.63, 'cuota IRPF atribuible (ahorro)');
  ok(f.avisos.some((a) => a.indexOf('Tope aplicado') === 0), 'aviso de tope aplicado');
});

test('Ejemplo B con imputación al 1,1 %', () => {
  resetState(30000);
  const p = propEjemploB();
  p.pctImputacion = 1.1;
  near(ctx.calcFiscalProp(p, ANIO_A).imputacion, 244.11, 'imputación al 1,1 %');
});

/* ============================================================
   3. ARRASTRE DE EXCESOS
   ============================================================ */
function propArrastre() {
  const p = propEjemploB();
  p.amortiTable = tablaBanco(ANIO_A, 60, 3100 / 12, 600);  // 2025..2029
  p.vacio = {};
  p.vacio[String(ANIO_A)] = 3;
  p.vacio[String(ANIO_A + 1)] = 12;
  p.vacio[String(ANIO_A + 2)] = 12;
  p.vacio[String(ANIO_A + 3)] = 12;
  return p;
}

test('Arrastre: el exceso se consume en el ejercicio siguiente', () => {
  resetState(30000);
  const p = propEjemploB();
  p.amortiTable = tablaBanco(ANIO_A, 24, 3100 / 12, 600);  // 2025 y 2026
  const f1 = ctx.calcFiscalProp(p, ANIO_A);
  near(f1.exceso, 1466.44, 'exceso generado en el año base');

  const f2 = ctx.calcFiscalProp(p, ANIO_A + 1);
  near(f2.RI, 10200.00, 'rendimiento íntegro del año siguiente');
  near(f2.pendientesDisponibles, 1466.44, 'pendientes disponibles');
  near(f2.pendientesAplicados, 1466.44, 'pendientes aplicados');
  near(f2.gTopeDeduc, 4566.44, 'intereses del año + pendientes');
  near(f2.exceso, 0, 'sin exceso nuevo');
  ok(f2.avisos.some((a) => a.indexOf('Se han aplicado') === 0), 'aviso de excesos aplicados');
});

test('Arrastre: consumo parcial hasta el tope de los rendimientos íntegros', () => {
  resetState(30000);
  const p = propEjemploA();
  p.alquiler = 4000 / 12;           // RI = 4.000 €
  p.facturas = [];
  const f = ctx._fiscalEjercicio(p, ANIO_A, [{ anio: ANIO_A - 1, importe: 1466.44 }], {});
  near(f.RI, 4000, 'rendimiento íntegro');
  near(f.gastosTopeAnio, 3100, 'gastos del ejercicio con tope');
  near(f.pendientesAplicados, 900, 'pendientes aplicados (solo el margen)');
  near(f.gTopeDeduc, 4000, 'tope = rendimientos íntegros');
  near(f.exceso, 566.44, 'exceso resultante');
  eq(f.pendientesSalida.length, 1, 'un pendiente a arrastrar');
  near(f.pendientesSalida[0].importe, 566.44, 'importe arrastrado');
  eq(f.pendientesSalida[0].anio, ANIO_A - 1, 'el pendiente conserva su año de origen');
});

test('Arrastre: sigue vigente al cuarto ejercicio y caduca al quinto', () => {
  resetState(30000);
  const p = propArrastre();

  const f4 = ctx.calcFiscalProp(p, ANIO_A + 4);
  near(f4.pendientesDisponibles, 1466.44, 'vigente en el cuarto ejercicio siguiente');
  near(f4.pendientesAplicados, 1466.44, 'aplicado en el cuarto ejercicio siguiente');

  const vivo = ctx._fiscalEjercicio(p, ANIO_A + 4, [{ anio: ANIO_A, importe: 1466.44 }], {});
  near(vivo.pendientesDisponibles, 1466.44, 'año+4: el exceso todavía cuenta');
  const caduco = ctx._fiscalEjercicio(p, ANIO_A + 5, [{ anio: ANIO_A, importe: 1466.44 }], {});
  near(caduco.pendientesDisponibles, 0, 'año+5: el exceso ha caducado');
  near(ctx.calcFiscalProp(p, ANIO_A + 5).pendientesAplicados, 0, 'nada que aplicar en el quinto ejercicio');
});

/* ============================================================
   4. REDUCCIÓN POR ARRENDAMIENTO DE VIVIENDA
   ============================================================ */
test('Reducción automática según la fecha del contrato', () => {
  resetState(30000);
  const base = propEjemploA();
  base.facturas = [];

  const antes = Object.assign({}, base, { fechaContrato: '2023-05-25' });
  eq(ctx.calcFiscalProp(antes, ANIO_A).reduccionPct, 60, 'contrato anterior al 26-05-2023');

  const despues = Object.assign({}, base, { fechaContrato: '2023-05-26' });
  eq(ctx.calcFiscalProp(despues, ANIO_A).reduccionPct, 50, 'contrato del 26-05-2023');

  const sinFecha = Object.assign({}, base, { fechaContrato: '' });
  eq(ctx.calcFiscalProp(sinFecha, ANIO_A).reduccionPct, 60, 'sin fecha de contrato');

  const manual = Object.assign({}, base, { fechaContrato: '2024-01-01', reduccionPct: 70 });
  const fm = ctx.calcFiscalProp(manual, ANIO_A);
  eq(fm.reduccionPct, 70, 'porcentaje manual prevalece');
  near(fm.reduccion, fm.RN * 0.7, 'reducción con el porcentaje manual');

  const otro = Object.assign({}, base, { tipoAlquiler: 'otro', reduccionPct: 70 });
  const fo = ctx.calcFiscalProp(otro, ANIO_A);
  eq(fo.reduccionPct, 0, 'alquiler distinto de vivienda');
  near(fo.reduccion, 0, 'sin reducción en alquiler que no es de vivienda');
  near(fo.RNR, fo.RN, 'RNR = RN sin reducción');
});

/* ============================================================
   5. CATEGORÍAS ESPECIALES DE FACTURA
   ============================================================ */
test('Mobiliario: 10 % anual durante 10 ejercicios', () => {
  resetState(30000);
  const p = propEjemploA();
  p.facturas = [factura(ANIO_A + '-03-01', 1200, 'mobiliario', 'Electrodomésticos')];
  for (let k = 0; k < 10; k++) {
    near(ctx.calcFiscalProp(p, ANIO_A + k).amortMuebles, 120, 'amortización de muebles en el año +' + k);
  }
  near(ctx.calcFiscalProp(p, ANIO_A + 10).amortMuebles, 0, 'sin amortización en el undécimo año');
  const f0 = ctx.calcFiscalProp(p, ANIO_A);
  near(f0.facturasTope, 0, 'el mobiliario no es gasto con tope');
  near(f0.facturasOtros, 0, 'el mobiliario no es gasto corriente');
  near(f0.facturasCash, 1200, 'el mobiliario sí sale del cashflow');
});

test('Mejora: suma a capPropio y a la base de amortización, no es gasto', () => {
  resetState(30000);
  const p = propEjemploA();
  p.facturas = [factura(ANIO_A + '-04-01', 5000, 'mejora', 'Cerramiento terraza')];
  ctx.S.propiedades = [p];

  const f = ctx.calcFiscalProp(p, ANIO_A);
  near(f.mejorasAcum, 5000, 'mejoras acumuladas');
  near(f.baseCoste, (140000 + 15400 + 5000) * 0.6, 'base de coste con la mejora');
  near(f.amortInmueble, 0.03 * (140000 + 15400 + 5000) * 0.6, 'amortización con la mejora');
  near(f.facturasTope, 0, 'la mejora no es gasto con tope');
  near(f.facturasOtros, 0, 'la mejora no es gasto corriente');
  near(f.facturasCash, 5000, 'la mejora sale del cashflow');

  const c = ctx.calcProp(p);
  near(c.capPropio, 28000 + 15400 + 0 + 5000, 'capPropio incluye la mejora');

  // La mejora no cuenta en la base de amortización de ejercicios anteriores.
  near(ctx.calcFiscalProp(p, ANIO_A - 1).mejorasAcum, 0, 'la mejora no retroactúa');
});

test('No deducible: solo afecta al cashflow', () => {
  resetState(30000);
  const p = propEjemploA();
  p.facturas = [factura(ANIO_A + '-05-01', 300, 'nodeducible', 'Multa')];
  const f = ctx.calcFiscalProp(p, ANIO_A);
  near(f.facturasCash, 300, 'suma al cashflow');
  near(f.facturasTope, 0, 'no es gasto con tope');
  near(f.facturasOtros, 0, 'no es gasto deducible');
  near(f.gOtros, 4047.20, 'otros gastos sin cambios');
});

test('Categoría sin prorrateo: los gastos del contrato se deducen al 100 %', () => {
  resetState(30000);
  const p = propEjemploB();      // factor 275/365
  p.facturas = [factura(ANIO_A + '-04-01', 1000, 'contrato', 'Agencia')];
  const f = ctx.calcFiscalProp(p, ANIO_A);
  near(f.facturasOtros, 1000, 'gasto de contrato al 100 %');
  near(f.facturasTope, 0, 'el gasto de contrato no va al tope');

  const p2 = propEjemploB();
  p2.facturas = [factura(ANIO_A + '-04-01', 1000, 'suministros', 'Agua')];
  near(ctx.calcFiscalProp(p2, ANIO_A).facturasOtros, 1000 * 275 / 365, 'suministros prorrateados');
});

test('FACT_CATS: 10 categorías con las propiedades fiscales declaradas', () => {
  eq(ctx.FACT_CATS.length, 10, 'número de categorías');
  eq(ctx.FACT_CATS.map((c) => c.key).join(','),
    'reparacion,derrama,financiacion,suministros,tributos,servicios,contrato,mobiliario,mejora,nodeducible',
    'orden de presentación');
  eq(ctx.partidaCat('reparacion').tope, true, 'reparación sujeta a tope');
  eq(ctx.partidaCat('contrato').prorrateo, false, 'contrato sin prorrateo');
  eq(ctx.partidaCat('mobiliario').amortiza, 'muebles', 'mobiliario se amortiza al 10 %');
  eq(ctx.partidaCat('mejora').amortiza, 'inmueble', 'mejora se amortiza al 3 %');
  eq(ctx.partidaCat('inventada'), null, 'categoría desconocida');
});

/* ============================================================
   6. INTERESES Y CUOTAS DEL EJERCICIO
   ============================================================ */
test('Intereses: tabla de banco con dos ejercicios', () => {
  resetState(30000);
  const p = propEjemploA();
  p.amortiTable = tablaBanco(ANIO_A, 24, 100, 500);
  const a = ctx.interesesYCuotaAnio(p, ANIO_A);
  const b = ctx.interesesYCuotaAnio(p, ANIO_A + 1);
  near(a.intereses, 1200, 'intereses del primer año');
  near(a.cuotas, 6000, 'cuotas del primer año');
  eq(a.cuotasAnio, 12, 'cuotas contadas');
  eq(a.aprox, false, 'no aproximado');
  near(b.intereses, 1200, 'intereses del segundo año');
  near(ctx.interesesYCuotaAnio(p, ANIO_A + 2).intereses, 0, 'sin cuotas fuera de la tabla');
});

test('Intereses: tabla simple sin fechas, derivadas de la primera cuota', () => {
  resetState(30000);
  const p = propEjemploA();
  p.amortiTable = tablaSimple(12, 100, 500);
  p.fechaPrimeraCuota = ANIO_A + '-04-01';
  const a = ctx.interesesYCuotaAnio(p, ANIO_A);
  const b = ctx.interesesYCuotaAnio(p, ANIO_A + 1);
  // Hipoteca iniciada en abril: el primer ejercicio usa la cuota estructural x12 para no mezclar
  // 12 meses de alquiler con cuotas parciales (decisión de producto, revisión 13-09-2026).
  eq(a.cuotasAnio, 12, 'primer año: doce cuotas estructurales');
  eq(a.fuente, 'inicio-anio', 'primer año marcado como inicio de hipoteca');
  eq(a.aprox, true, 'primer año aproximado');
  eq(b.cuotasAnio, 3, 'tres cuotas en el segundo año');
  near(b.intereses, 300, 'intereses del segundo año');
  eq(b.aprox, false, 'segundo año no aproximado');
});

test('Intereses: modo auto con fecha de primera cuota (12 cuotas francesas)', () => {
  resetState(30000);
  const p = propLegacy({ amortiTable: null, fechaPrimeraCuota: ANIO_A + '-01-01', cuotasPagadas: 0 });
  const r = ctx.interesesYCuotaAnio(p, ANIO_A);
  eq(r.aprox, false, 'no aproximado');
  eq(r.cuotasAnio, 12, 'doce cuotas');
  eq(r.fuente, 'frances', 'fuente: fórmula francesa');

  let esperadoInt = 0, esperadoCuota = 0;
  for (let n = 1; n <= 12; n++) {
    const rf = ctx.calcAmortiFrances(180000 * 0.8, 2.5, 25, n);
    esperadoInt += rf.interesMes;
    esperadoCuota += rf.cuota;
  }
  near(r.intereses, esperadoInt, 'intereses de las 12 cuotas');
  near(r.cuotas, esperadoCuota, 'cuotas del ejercicio');

  // Con cuotas ya pagadas, el ejercicio arranca más adelante en el cuadro.
  const p2 = propLegacy({ amortiTable: null, fechaPrimeraCuota: ANIO_A + '-01-01', cuotasPagadas: 24 });
  const r2 = ctx.interesesYCuotaAnio(p2, ANIO_A);
  ok(r2.intereses < r.intereses, 'con 24 cuotas pagadas los intereses del año son menores');
});

test('Intereses: sin ancla temporal, estimación marcada como aproximada', () => {
  resetState(30000);
  const p = propLegacy();
  const r = ctx.interesesYCuotaAnio(p, ANIO_A);
  eq(r.aprox, true, 'marcado como aproximado');
  const hm = ctx.calcHipotecaMensual(p);
  near(r.intereses, hm.interesesMensual * 12, 'intereses = mes actual x 12');
  near(r.cuotas, hm.cuotaMensual * 12, 'cuotas = mes actual x 12');
  ok(ctx.calcFiscalProp(p, ANIO_A).avisos.some((a) => a.indexOf('Intereses estimados') === 0), 'aviso de intereses estimados');
});

/* ============================================================
   7. REGLA DE ORO: los datos antiguos no cambian de resultado
   ============================================================ */
test('Regla de oro: modo estructural reproduce el cálculo anterior', () => {
  resetState(28000, 'estructural');
  const p = propLegacy();
  ctx.S.propiedades = [p];
  const esperado = calcPropLegacyEsperado(p, 28000);
  const c = ctx.calcProp(p);

  near(c.est.impuesto, esperado.impuesto, 'impuesto estructural');
  near(c.est.cfNetoAnual, esperado.cfNetoAnual, 'cashflow anual estructural');
  near(c.est.cfNetoMensual, esperado.cfNetoMensual, 'cashflow mensual estructural');
  near(c.est.roce, esperado.roce, 'ROCE estructural', 1e-9);
  near(c.est.yieldCF, esperado.yieldCF, 'yield CF estructural', 1e-9);
  near(c.est.yieldNeto, esperado.yieldNeto, 'yield neto estructural', 1e-9);
  near(c.capPropio, esperado.capPropio, 'capital propio');
  near(c.yieldBruto, esperado.yieldBruto, 'yield bruto', 1e-9);
  near(c.amortiAnual, esperado.amortiAnual, 'amortización anual de la hipoteca');

  eq(c.modo, 'estructural', 'modo activo');
  near(c.cfNetoAnual, c.est.cfNetoAnual, 'la vista activa es la estructural');
  near(c.impuesto, c.est.impuesto, 'impuesto expuesto = estructural');
  near(c.rendBruto, c.est.fiscal.RN, 'rendBruto = RN de la vista activa');
  near(c.reduccion, c.est.fiscal.reduccion, 'reducción de la vista activa');
  near(c.rendNeto, c.est.fiscal.RNR, 'rendNeto = RNR de la vista activa');
});

test('Regla de oro: sin tabla, el modo año coincide con el estructural', () => {
  resetState(28000, 'anio');
  const p = propLegacy();
  ctx.S.propiedades = [p];
  const esperado = calcPropLegacyEsperado(p, 28000);
  const c = ctx.calcProp(p);

  eq(c.modo, 'anio', 'modo activo');
  near(c.anio.cfNetoAnual, esperado.cfNetoAnual, 'cashflow anual del año en curso');
  near(c.anio.impuesto, esperado.impuesto, 'impuesto del año en curso');
  near(c.cfNetoMensual, esperado.cfNetoMensual, 'cashflow mensual expuesto');
  near(c.anio.cfNetoAnual, c.est.cfNetoAnual, 'ambas vistas coinciden sin facturas ni vacío');
  eq(c.fiscalAnio.facturasCount, 0, 'sin facturas en el ejercicio');
  near(c.fiscalAnio.amortInmueble, 0, 'sin amortización sin % de suelo');
  near(c.fiscalAnio.imputacion, 0, 'sin imputación de renta');
  eq(c.fiscalAnio.reduccionPct, 60, 'reducción por defecto del 60 %');
});

test('Regla de oro: con tabla, el modo año solo difiere por los intereses reales', () => {
  const anio = new Date().getFullYear();
  resetState(28000, 'anio');
  const p = propLegacy({
    tin: 0, plazoAnios: 0,
    amortiTable: tablaBanco(anio, 12, 250, 700),
    fechaPrimeraCuota: anio + '-01-01',
  });
  ctx.S.propiedades = [p];
  const esperado = calcPropLegacyEsperado(p, 28000);
  const c = ctx.calcProp(p);

  near(c.est.cfNetoAnual, esperado.cfNetoAnual, 'la vista estructural no cambia');
  near(c.est.impuesto, esperado.impuesto, 'el impuesto estructural no cambia');
  near(c.fiscalAnio.interesesAnio, 3000, 'intereses reales del ejercicio según la tabla');
  near(c.fiscalAnio.cuotasAnio, 8400, 'cuotas reales del ejercicio');

  const gastosRec = 400 + 200 + 600 + 0;
  const impEsperado = c.fiscalAnio.impuestoMarginal;
  near(c.anio.cfNetoAnual, 12000 - gastosRec - 0 - 8400 - impEsperado, 'cashflow del año en curso');
});

/* ============================================================
   8. DECLARACIÓN CONJUNTA
   ============================================================ */
test('calcRenta: la cuota conjunta captura el salto de tramo', () => {
  resetState(35000, 'anio');
  const mk = (id, nombre) => ({
    id, uso: 'alquiler', nombre,
    valor: 120000, entrada: 24000, gastos: 8000, comisionInmo: 0, reforma: 0,
    alquiler: 500, ibi: 0, seguro: 0, comunidad: 0, otrosGastos: 0,
    precioCompra: 100000, pctEntrada: 20, tin: 0, plazoAnios: 0, cuotaNum: 1,
    modoHipoteca: 'auto', fechaPrimeraCuota: '', cuotasPagadas: 0, amortiTable: null,
    facturas: [], tipoAlquiler: 'vivienda', fechaContrato: '2020-01-01', reduccionPct: null,
    valorCatastral: null, pctSuelo: null, pctImputacion: 2, vacio: {},
  });
  const p1 = mk(11, 'Piso 1'), p2 = mk(12, 'Piso 2');
  const habitual = mk(13, 'Vivienda habitual');
  habitual.uso = 'habitual';
  habitual.alquiler = 0;
  ctx.S.propiedades = [p1, p2, habitual];

  const r = ctx.calcRenta(new Date().getFullYear());
  eq(r.inmuebles.length, 2, 'la vivienda habitual queda fuera');
  near(r.sumRI, 12000, 'suma de rendimientos íntegros');
  near(r.sumRNR, 4800, 'suma de rendimientos netos reducidos');
  near(r.sumImputacion, 0, 'sin imputación');
  near(r.aportacion, 4800, 'aportación a la base general');

  const conjunta = ctx.irpf(35000 + 4800) - ctx.irpf(35000);
  near(r.cuota, conjunta, 'cuota conjunta');
  near(r.cuota, 1762, 'cuota conjunta (valor esperado)');

  const individual = ctx.irpf(35000 + 2400) - ctx.irpf(35000);
  near(individual * 2, 1748, 'suma de cuotas marginales individuales');
  ok(Math.abs(r.cuota - individual * 2) > 1, 'la cuota conjunta difiere de la suma de marginales');

  near(r.tipoEfectivo, 1762 / 12000, 'tipo efectivo sobre la renta bruta', 1e-6);
  eq(r.tramoBase.pct, 30, 'tramo marginal de la base previa');
  eq(r.tramoFinal.pct, 37, 'tramo marginal tras el alquiler');
  eq(r.base, 35000, 'base previa');
});

test('calcRenta: sin inmuebles de alquiler, tipoEfectivo nulo', () => {
  resetState(30000);
  ctx.S.propiedades = [];
  const r = ctx.calcRenta(ANIO_A);
  eq(r.inmuebles.length, 0, 'sin inmuebles');
  near(r.cuota, 0, 'cuota cero');
  eq(r.tipoEfectivo, null, 'tipo efectivo nulo');
});

/* ============================================================
   9. VIVIENDA HABITUAL
   ============================================================ */
test('Vivienda habitual: el cálculo no cambia', () => {
  resetState(30000, 'anio');
  const p = propLegacy({ id: 20, uso: 'habitual', alquiler: 0 });
  ctx.S.propiedades = [p];
  const esperado = calcPropLegacyEsperado(p, 30000);
  const c = ctx.calcProp(p);
  const hm = ctx.calcHipotecaMensual(p);
  eq(c.modo, 'habitual', 'modo habitual');
  near(c.impuesto, 0, 'sin impuesto');
  near(c.cfNetoAnual, esperado.cfNetoAnual, 'cashflow anual');
  near(c.equityProp, 200000 - hm.saldoPendiente, 'equity = valor - saldo pendiente');
  near(c.roce, esperado.roce, 'ROCE', 1e-9);
  eq(c.fiscalAnio, null, 'sin liquidación fiscal');
});

/* ============================================================
   9b. HUMO: los 9 consumidores de calcProp siguen funcionando
   ============================================================ */
test('Humo: renderAll, saveSnap y calcObjetivo con una cartera mixta', () => {
  resetState(30000, 'anio');
  ctx.S.inversiones = [
    { id: 101, nombre: 'Fondo global', tipo: 'fondo', valor: 20000, tir: 6 },
    { id: 102, nombre: 'P2P', tipo: 'p2p', valor: 5000, tir: 9 },
  ];
  ctx.S.liquido = [{ id: 103, nombre: 'Ahorro', tipo: 'ahorro', saldo: 10000, tae: 2 }];
  const habitual = propLegacy({ id: 201, uso: 'habitual', nombre: 'Casa', alquiler: 0 });
  ctx.S.propiedades = [propEjemploA(), propEjemploB(), habitual, propLegacy()];
  ctx.S.objetivo = { partidas: [{ id: 301, nombre: 'Vivienda', importe: 900, periodicidad: 'mensual', orden: 0 }] };

  const orig = ctx.trySave;
  ctx.trySave = function () {};
  ctx.sessionStorage.setItem('pf_v8_session', 'sesion-de-prueba');
  ctx.renderAll();
  ctx.saveSnap();
  ctx.renderGraficas();   // renderActivoChart también consume calcProp
  ctx.sessionStorage.removeItem('pf_v8_session');
  ctx.trySave = orig;

  eq(ctx.S.snaps.length, 1, 'se ha creado un snapshot');
  ok(isFinite(ctx.S.snaps[0].totalPat), 'patrimonio total finito');
  ok(isFinite(ctx.S.snaps[0].cfReal), 'cashflow real finito');
  eq(ctx.S.snaps[0].activos.length, 7, 'activos registrados en el snapshot');

  const tot = ctx.calcResumenTotales();
  ok(isFinite(tot.cfReal) && isFinite(tot.totalProp), 'totales del resumen finitos');
  const obj = ctx.calcObjetivo();
  ok(isFinite(obj.cobReal) && isFinite(obj.gastosMes), 'cobertura del objetivo finita');
  ok(obj.fuentes.some((f) => f.id === 'prop_1'), 'los inmuebles aparecen como fuente de cashflow');
});

/* ============================================================
   10. PERSISTENCIA Y SANEADO
   ============================================================ */
test('mergeState: aplica defaults a inmuebles sin campos nuevos', () => {
  resetState(0);
  const legacy = propLegacy();
  ctx.mergeState({ propiedades: [legacy], config: { baseIRPF: 12000 }, _savedAt: 5 });

  const p = ctx.S.propiedades[0];
  eq(Array.isArray(p.facturas), true, 'facturas es un array');
  eq(p.facturas.length, 0, 'facturas vacío');
  eq(p.tipoAlquiler, 'vivienda', 'tipoAlquiler por defecto');
  eq(p.fechaContrato, '', 'fechaContrato por defecto');
  eq(p.reduccionPct, null, 'reduccionPct por defecto');
  eq(p.valorCatastral, null, 'valorCatastral por defecto');
  eq(p.pctSuelo, null, 'pctSuelo por defecto');
  eq(p.pctImputacion, 2, 'pctImputacion por defecto');
  eq(JSON.stringify(p.vacio), '{}', 'vacio por defecto');

  // Las 22 claves originales se conservan intactas.
  Object.keys(legacy).forEach((k) => {
    eq(JSON.stringify(p[k]), JSON.stringify(legacy[k]), 'clave conservada: ' + k);
  });

  eq(ctx.S.config.cfInmoModo, 'anio', 'modo de cashflow por defecto');
  eq(ctx.S.config.baseIRPF, 12000, 'base IRPF conservada');
});

test('mergeState: sanea facturas, vacío y configuración corruptos', () => {
  resetState(0);
  ctx.mergeState({
    propiedades: [{
      id: 3, nombre: 'Raro', alquiler: '800',
      facturas: [
        { id: 1, fecha: '2025-01-05', concepto: 'ok', importe: '150,5', cat: 'reparacion' },
        { id: 2, fecha: 'no-es-fecha', importe: -10, cat: 'inventada' },
        null,
      ],
      vacio: { '2025': '2.5', 'xx': 4, '2026': -1 },
      pctSuelo: '150', pctImputacion: 1.1, reduccionPct: '', tipoAlquiler: 'otro',
      fechaContrato: '05/2023', valorCatastral: '80000',
    }],
    config: { cfInmoModo: 'estructural' },
  });
  const p = ctx.S.propiedades[0];
  eq(p.facturas.length, 2, 'se descartan las entradas nulas');
  eq(p.facturas[0].importe, 150, 'importe numérico');
  eq(p.facturas[1].fecha, '', 'fecha inválida vaciada');
  eq(p.facturas[1].cat, 'nodeducible', 'categoría desconocida saneada');
  eq(p.facturas[1].importe, 0, 'importe negativo a cero');
  eq(p.facturas[0].fotoId, null, 'fotoId por defecto');
  eq(JSON.stringify(p.vacio), '{"2025":2.5}', 'vacío saneado');
  eq(p.pctSuelo, 100, 'pctSuelo acotado al 100');
  eq(p.pctImputacion, 1.1, 'pctImputacion admitido');
  eq(p.reduccionPct, null, 'cadena vacía -> null');
  eq(p.tipoAlquiler, 'otro', 'tipoAlquiler conservado');
  eq(p.fechaContrato, '', 'fecha de contrato no ISO descartada');
  eq(p.valorCatastral, 80000, 'valor catastral numérico');
  eq(ctx.S.config.cfInmoModo, 'estructural', 'modo de cashflow conservado');
  eq(ctx.S.config.baseIRPF, 0, 'base IRPF por defecto');
});

test('mergePropEdit: la edición conserva facturas y campos fiscales', () => {
  const prev = propEjemploA();
  const form = {
    id: 1, uso: 'alquiler', nombre: 'Piso renombrado', valor: 180000, entrada: 30000,
    gastos: 15400, comisionInmo: 0, reforma: 0, alquiler: 900, ibi: 360, seguro: 180,
    comunidad: 720, otrosGastos: 0, precioCompra: 140000, pctEntrada: 20, tin: 0,
    plazoAnios: 0, cuotaNum: 1, modoHipoteca: 'auto', fechaPrimeraCuota: '', cuotasPagadas: 0,
    amortiTable: null,
  };
  const out = ctx.mergePropEdit(prev, form);
  eq(out.nombre, 'Piso renombrado', 'el formulario gana en sus claves');
  eq(out.alquiler, 900, 'alquiler actualizado');
  eq(out.facturas.length, 1, 'facturas conservadas');
  eq(out.valorCatastral, 90000, 'valor catastral conservado');
  eq(out.pctSuelo, 40, 'porcentaje de suelo conservado');
  eq(out.fechaContrato, '2022-03-01', 'fecha de contrato conservada');
  eq(out.pctImputacion, 2, 'porcentaje de imputación conservado');
});

test('saveProp: al editar conserva las claves que el formulario no gestiona', () => {
  resetState(30000);
  const prev = propEjemploA();
  ctx.S.propiedades = [prev];

  // Neutralizamos los efectos colaterales del guardado.
  const orig = {};
  ['trySave', 'renderAll', 'cancelEditProp', 'toast', 'flash'].forEach((fn) => { orig[fn] = ctx[fn]; ctx[fn] = function () {}; });

  const set = (id, v) => { ctx.document.getElementById(id).value = v; };
  set('prop-nombre', 'Piso editado');
  set('prop-tiene-hipoteca', 'no');
  set('prop-precioCompra', '140000');
  set('prop-pctEntrada', '20');
  set('prop-hip-modo', 'auto');
  set('prop-uso', 'alquiler');
  set('prop-valor', '175000');
  set('prop-gastos', '15400');
  set('prop-tiene-comision', 'no');
  set('prop-tiene-reforma', 'no');
  set('prop-alquiler', '880');
  set('prop-ibi', '360');
  set('prop-seguro', '180');
  set('prop-comunidad', '60');
  set('prop-otrosGastos', '0');
  ctx.editPropId = 1;
  ctx._tempAmortiTable = null;
  ctx.saveProp();

  ['trySave', 'renderAll', 'cancelEditProp', 'toast', 'flash'].forEach((fn) => { ctx[fn] = orig[fn]; });

  const p = ctx.S.propiedades[0];
  eq(ctx.S.propiedades.length, 1, 'no se duplica el inmueble');
  eq(p.nombre, 'Piso editado', 'nombre actualizado por el formulario');
  eq(p.alquiler, 880, 'alquiler actualizado');
  eq(p.comunidad, 720, 'comunidad anualizada por el formulario');
  eq(p.facturas.length, 1, 'facturas conservadas tras editar');
  eq(p.facturas[0].importe, 2400, 'importe de la factura conservado');
  eq(p.valorCatastral, 90000, 'valor catastral conservado tras editar');
  eq(p.pctSuelo, 40, 'porcentaje de suelo conservado tras editar');
  eq(p.fechaContrato, '2022-03-01', 'fecha de contrato conservada tras editar');
  eq(p.tipoAlquiler, 'vivienda', 'tipo de alquiler conservado tras editar');
});

test('Configuración: el modo de cashflow cambia la vista expuesta por calcProp', () => {
  resetState(30000, 'anio');
  const p = propEjemploB();
  ctx.S.propiedades = [p];
  const cAnio = ctx.calcProp(p);
  eq(cAnio.modo, 'anio', 'modo año');
  near(cAnio.cfNetoAnual, cAnio.anio.cfNetoAnual, 'expone la vista anual');

  ctx.S.config.cfInmoModo = 'estructural';
  const cEst = ctx.calcProp(p);
  eq(cEst.modo, 'estructural', 'modo estructural');
  near(cEst.cfNetoAnual, cEst.est.cfNetoAnual, 'expone la vista estructural');
  ok(Math.abs(cEst.cfNetoAnual - cAnio.cfNetoAnual) > 1, 'las dos vistas difieren con facturas y vacío');
  near(cEst.est.fiscal.facturasCash, 0, 'la vista estructural ignora las facturas');
  eq(cEst.est.fiscal.mesesVacio, 0, 'la vista estructural ignora el vacío');
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

console.log('');
console.log('Resumen: ' + passed + ' OK, ' + failed + ' FALLO (total ' + tests.length + ' tests, ' + asserts + ' aserciones)');
if (failed > 0) process.exit(1);
