# Portfolio de Inversiones — CLAUDE.md
Dev senior, app web gestión patrimonio/cashflow. Código de producción siempre.

## Stack
SPA HTML único `app/index.html` · Vanilla JS (ES5/ES6, `async/await` permitido) · Chart.js 4.4 · Sin frameworks/bundler/TS
Backend: Cloudflare Pages Functions en `functions/api/` con KV (`env.PORTFOLIO_KV`) y PIN único (`env.AUTH_PIN_HASH`, SHA-256): `state.js` (GET/PUT estado JSON completo) y `foto/[id].js` (GET/PUT/DELETE fotos de facturas, clave `foto:<id>`)
Deploy: push a `main` en GitHub → Cloudflare Pages (https://portfolio-ag7.pages.dev/app/). Landing en `index.html` raíz. `WEB/` y `app/index.backup.html` son versiones antiguas: no editar.
Cada cambio verificado se sube a `main` sin pedir confirmación (norma del usuario).

## CSS Variables (NUNCA hardcodear colores)
`--bg --s1 --s2 --s3 --bd --ac(#ff6b35) --g(#4ecb9e) --am(#f7c648) --r(#e05c5c) --bl(#4fa6f7) --tx --tx2 --mu --mu2 --mu3` · radios `--rr --rl` · easings `--tf --tb --tl`
Positivo→`--g` · Negativo→`--r` · Aviso/potencial→`--am` · Marca/equity→`--ac`

## Clases existentes (úsalas)
Layout: `.bento` (12 col) + `.tile .tile-hero .tile-hd .tile-l .tile-aside .tile-v .tile-s .tile-foot` + spans `.c-2…c-12` · Chips: `.chip .chip.g/.am/.r/.ac/.mu` · Pills tipo: `.pill.<tipo>`
Barras: `.bars .bar .bar-n .bar-trk .bar-fll .bar-v` (`barRow()`) · Anillo: `.ring` (`--p`, `--ring-col`, `--ring-size`) · Mini KPIs: `.kpis-grid(.k3/.k6) .minikpi .mini-l .mini-v`
Forms: `.fgrid > .ef.span3|4|6|12` con `<label>` + `.hint` · `.subbox .subbox-hd .subbox-l` · `.btn-row` · `.flash` · edición en línea `.qedit-input`
Filas: `.frow .fl .fv` · Subpestañas/filtros: `.ftabs .ftab(.active)` (acotar `querySelectorAll` al contenedor) · Inmuebles: `.prop-row(.expanded) .prop-sum .prop-kpis .prop-acts .prop-det .inmo-tabs .yr-tabs .fact-* .amort-* .renta-*` · Objetivo: `.ob-* .ring-obj`
Sidebar: `.sb .sb-link[data-tab] .sb-section` · Paneles: `#tab-<name>.tab-panel` · No existen `.kpi .brow .fr .mf .ht .card` (docs antiguas).

## Arquitectura
- Estado global `S`: `inversiones[] propiedades[] snaps[] liquido[] objetivo{partidas[]} config{baseIRPF, cfInmoModo} _savedAt`
- Tras cualquier mutación de `S`: `trySave()` (localStorage `pf_v8_data` + PUT `/api/state` debounced 800ms, invalida caché de `calcProp`) y re-render
- `tryLoad()` → local primero, nube si `_savedAt` más reciente · `mergeState()` copia claves enumeradas y sanea (`sanitizePropiedades sanitizeFacturas sanitizeObjetivo sanitizeConfig`): **toda clave nueva de primer nivel debe añadirse a `mergeState` y a `borrarTodo()`**
- `saveProp()` fusiona con `mergePropEdit(prev, prop)`: las claves que no gestiona el formulario (facturas, fiscales) se conservan
- Renders: `renderAll() renderResumen() renderInvList() renderPropList() renderRenta() renderLiqList() renderHistorico() renderObjetivo()` · `showTab(name)` re-renderiza Resumen y Objetivo al entrar
- Estado de UI de inmuebles en variables de módulo (`_propExpanded _propSubtab _propYear _rentaYear _factEdit`); `rerenderProp(pid)` repinta una tarjeta conservándolo
- IDs: `Date.now()` (`+i` en bucles) · Fechas de usuario en ISO `yyyy-mm-dd` (`<input type=date>`), año con `.slice(0,4)`; mostrar con `fechaES()`

## JS Helpers
`gv(id)`→float input · `nv(v)`→parseFloat · `eur(v)`→EUR 0 dec · `eur2(v)`→2 dec · `pct1(v)/pct2(v)`→esperan el número YA en porcentaje · `hoy()` `hoyISO()` `anioHoy()` · `esc(s)` obligatorio para texto de usuario en innerHTML · `findInv findProp findPropById findFactura` · `flash(id,txt,level)` `toast(txt)` `confirmAction(msg,sub,cb,okLabel)` (nunca `confirm()`/`alert()`)

## Fiscal española (CRÍTICO — validar con `node tests/fiscal.test.mjs` antes de tocar)
Referencia validada con BOE/AEAT: `docs/fiscal_alquiler.md` (fórmulas, tabla deducible/no deducible, ejemplos A y B al céntimo).
**Escala general agregada de referencia (2026):** 19%≤12.450 · 24%≤20.200 · 30%≤35.200 · 37%≤60.000 · 45%≤300.000 · 47%+ → `irpf(base)`, `tramoMarginal(base)`. Base previa del usuario: `S.config.baseIRPF`; método diferencial `irpf(BASE+aportación)−irpf(BASE)` (puede ser negativo).
**Escala del ahorro (2025+):** 19%≤6.000 · 21%≤50.000 · 23%≤200.000 · 27%≤300.000 · 30%+ → `irpfAhorro(base)` · Helpers CF: `cfNetP2P cfNetAcum cfNetAhorro`
**Alquiler por ejercicio:** `calcFiscalProp(p, year)` (RI = alquiler×(12−mesesVacío); tope intereses+financiación+reparación ≤ RI con arrastre FIFO 4 años; otros gastos prorrateados por días alquilados; amortización 3% sobre max(coste sin suelo, catastral sin suelo) si hay `pctSuelo`; mobiliario 10% 10 años; mejoras no deducibles, se amortizan y suman a capPropio; reducción solo si RN>0 y vivienda: 60% contrato <26-05-2023 o sin fecha, 50% después, o manual 50/60/70/90; imputación 2%/1,1% del valor catastral por días vacíos) · `calcRenta(year)` estimación conjunta · `FACT_CATS` categorías de factura con tratamiento fiscal · `interesesYCuotaAnio(p, year)`
**`calcProp(p)`** (memoizado): vistas `est` (estructural) y `anio` (año en curso con facturas); la activa según `S.config.cfInmoModo` ('anio' por defecto) · ROCE=(CFneto+amorti)/capPropio · CapPropio=entrada+gastos+reforma+mejoras · Cashflow resta la cuota hipotecaria completa; fiscalmente solo intereses.

## UX obligatorio
1. **Mobile-first**: breakpoints del fichero 1100/880/520 · inputs≥16px en móvil (ojo: `input[type=number]` tiene regla propia a 13px, sobreescribir por pestaña) · grids→1-2 col · sin desbordamiento horizontal
2. **Feedback inmediato**: `flash()`, `toast()`, transiciones CSS; respetar `prefers-reduced-motion`
3. **Dark theme**: nunca fondos claros
4. **Sin recargas**: todo dinámico
5. **Números**: `eur()/eur2()` para EUR, `pct1()/pct2()` para % · nunca decimales crudos
6. **UI en español** · **Sin emojis** en la interfaz

## Auth (PIN)
`#pin-screen` → `Auth.verify(pin)` contra el servidor → `enterApp()` (oculta PIN, `tryLoad()`) · token = sha256(PIN) en `sessionStorage` (`Auth.getToken()`) · cabecera `Authorization: Bearer <token>` en `/api/state` y `/api/foto/:id` · `setSyncStatus(idle|saving|saved|error)` · En local no hay servidor: probar con `enterApp()` desde consola o con el arnés de capturas.

## Chart.js
Destruir antes de recrear: `if(mainChart){try{mainChart.destroy();}catch(e){}}` · Globals: `mainChart donutChart2 activoChart` · Tooltips fondo `#22222e` borde `#2e2e3e` · `responsive:true maintainAspectRatio:false` · `.chart-wrap` altura fija

## Snapshots
`S.snaps[]` → `{fecha,ts,totalPat,cfReal,cfPot,activos[]}` (CF mensuales) · activos `{id,nombre,tipo,valor}` · IDs inmuebles `prop_` · líquido `liq_` · `saveSnap()`

## Tests (Node 24, sin dependencias)
`node tests/fiscal.test.mjs` · `node tests/inmo.test.mjs` · `node tests/foto.test.mjs` · `node tests/foto-client.test.mjs` — arnés `vm` que carga el JS del HTML con un DOM simulado. Añadir casos al tocar fiscal, persistencia o Inmobiliario.

## NO hacer
- Frameworks · `innerHTML` con datos de usuario sin `esc()` · deps externas sin justificación · romper estructura `S` · modificar fiscal sin tests · texto en inglés en UI · `alert()`/`confirm()` · mutar `S` sin `trySave()` · convertir el fichero a CRLF (es LF)
