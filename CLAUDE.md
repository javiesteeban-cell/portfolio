# Portfolio de Inversiones — CLAUDE.md
Dev senior, app web gestión patrimonio/cashflow. Código de producción siempre.

## Stack
SPA HTML único · Vanilla JS (ES5/ES6) · Chart.js 4.4 · Supabase (auth+BBDD) · Sin frameworks/bundler/TS · Backend: tabla `portfolio`, columna `data` (JSON), auth email/password

## CSS Variables (NUNCA hardcodear colores)
`--bg:#0f0f13` `--s1:#1a1a22` `--s2:#22222e` `--s3:#1e1e28` `--bd:#2e2e3e` `--ac:#7c6fff` `--g:#4ecb9e` `--am:#f7a440` `--r:#e05c5c` `--tx:#e8e8f0` `--mu:#888899` `--rr:10px` `--rl:14px`

## Clases existentes (úsalas)
Tarjetas: `.card .inv-card .prop-card` · Botones: `.btn .bp .br2 .bg2 .ba .bsm` · KPIs: `.kpi .kpi-l .kpi-v .kpi-s .kpi-yield` · Tags: `.tag .tf .tfd .tc .tp` · Forms: `.fr .ef .mf .mrow` · Barras: `.brow .blbl .btrk .bfll .bval` · Tablas: `.ht` · Filas: `.frow .fl .fv` · ROCE: `.roce-grid .roce-kpi` · Boxes: `.hbox .wbox` · `.sep .lnote`

## Paleta Chart.js
fondo:`#7c6fff` fondo-dist:`#a78bfa` crypto:`#f7a440` p2p/liquido:`#4ecb9e` inmo:`#a0a8ff`

## Arquitectura
- Estado global `S`: `inversiones[] propiedades[] snaps[] liquido[]`
- Tras cualquier mutación de `S`: llamar `trySave()` y re-renderizar
- `trySave()` → localStorage + Supabase debounced 800ms
- `tryLoad()` → localStorage primero, cloud si más reciente (`_savedAt`)
- Renders: `renderAll() renderResumen() renderInvList() renderPropList() renderLiqList() renderHistorico()`
- IDs: `Date.now()` · Tabs: `showTab(name)` + clase `.active`

## JS Helpers
`gv(id)`→float input · `nv(v)`→parseFloat · `eur(v)`→EUR · `pct2(v)`→% 2dec · `hoy()`→fecha ES · `findInv(id)` `findProp(id)` · `flash(id,txt)`→toast 2.5s

## Fiscal española (CRÍTICO — no modificar sin validar)
**IRPF general (alquiler):** 19%≤12450 · 24%≤20050 · 30%≤35200 · 37%≤60000 · 45%+ · Reducción 60% art.23.2 si rendimiento neto positivo · `irpf(base)` · Usar `BASE_IRPF` del usuario como base previa
**IRPF ahorro (P2P/dividendos/ganancias/crypto/fondos):** 19%≤6000 · 21%≤50000 · 23%≤200000 · 27%≤300000 · 28%+ · `irpfAhorro(base)`
**Helpers CF:** `cfNetP2P(capital,tirBruta)` · `cfNetAcum(valor,pctMensual)` · `cfNetAhorro(saldo,tae)` · `tirNetaP2P(capital,tirBruta)`
**ROCE:** CapPropio=entrada+gastos · ROCE=(CFnetoAnual+amortiAnual)/capPropio · YieldCF=CFneto/capPropio · YieldBruto=alqAnual/valorMercado · YieldNeto=(alq-gastos-IRPF)/valorMercado

## UX obligatorio
1. **Mobile-first**: `@media(max-width:640px)` en todo componente nuevo · inputs≥16px · grids→1col · labels encima · padding touch generoso
2. **Feedback inmediato**: `flash()`, animaciones CSS, cambios color
3. **Dark theme**: nunca fondos claros/blancos
4. **Sin recargas**: todo dinámico, sin `window.location.reload()`
5. **Números**: `eur()` para EUR, `pct2()` para % · nunca decimales crudos
6. **UI en español**

## Auth (Supabase)
Login/register en `#login-screen` → `showApp()` → guarda `pf_session` en localStorage · Key datos: `pf_v7_{user_id}` · `syncToCloud()` debounced: PATCH `/rest/v1/portfolio?user_id=eq.{id}` · `setSyncStatus(idle|saving|saved|error)`

## Chart.js
Destruir siempre antes de recrear: `if(mainChart){try{mainChart.destroy();}catch(e){}}` · Globals: `mainChart cfChart donutChart activoChart` · Tooltips: fondo`#22222e` borde`#2e2e3e` · Grid:`rgba(46,46,62,.4)` · Ticks:`#888899` · `responsive:true maintainAspectRatio:false` · Contenedor `.chart-wrap` altura fija (280px desktop / 210px mobile)

## Snapshots
`S.snaps[]` → `{fecha,ts,totalPat,cfReal,cfPot,activos[]}` · activos: `{id,nombre,tipo,valor}` · IDs inmuebles: `prop_` · líquido: `liq_` · `saveSnap()` calcula y añade

## Estilo UI
- **Sin emojis en la interfaz.** Ni en botones, títulos, labels ni mensajes. Aspecto profesional siempre.

## NO hacer
- Frameworks · `innerHTML` con datos usuario sin escapar · deps externas sin justificación · romper estructura `S` · modificar fiscal sin validar · texto en inglés en UI · `alert()` para errores recurrentes · mutar `S` sin `trySave()`
