# Portfolio de Inversiones — Design System (MASTER)

> Source of truth para todas las decisiones visuales y de UX del proyecto.
> Estilo: **Dark Layered Bento** — fintech personal con profundidad real, sin caer en cyberpunk ni en glassmorphism gratuito.

---

## 1. Principios

1. **Profesional, no juguetón.** Sin emojis, sin gradientes pastel, sin efectos decorativos. Cada efecto debe expresar jerarquía o estado.
2. **Profundidad por capas, no por sombras grandes.** 5 niveles de superficie + hairline highlights superiores + sombras suaves. Evitar sombras "hinchadas" estilo Material.
3. **Mobile-first siempre.** Cualquier componente nuevo se diseña primero a 375px, luego se escala.
4. **Tabular numbers** en todo número financiero (sin saltos al recalcular).
5. **Respeto a la marca.** Mantener `--ac` purple, `--g` verde, `--am` ámbar, `--r` rojo. La paleta funciona, lo que faltaba era profundidad.
6. **Sin frameworks.** Vanilla JS + CSS puro. Performance > novedad.

---

## 2. Tokens

### 2.1 Superficies (escala de profundidad)

| Token | Valor | Uso |
|-------|-------|-----|
| `--bg` | `#0a0a0f` | Página (más profundo que antes para más contraste contra superficies) |
| `--s1` | `#14141c` | Topbar, tabs, login-box (sticky overlay) |
| `--s2` | `#1a1a24` | Cards, kpi, inv-card, prop-card (superficie principal) |
| `--s3` | `#22222e` | Sub-cards (inv-kpi, roce-kpi, gastos-section, inputs) |
| `--s4` | `#2a2a38` | Hover states, elementos elevados sobre s3 |

### 2.2 Bordes (hairline real, no gris plano)

| Token | Valor | Uso |
|-------|-------|-----|
| `--bd` | `rgba(255,255,255,.06)` | Hairline general |
| `--bd-strong` | `rgba(255,255,255,.10)` | Hover, focus visible |
| `--bd-ac` | `rgba(124,111,255,.30)` | Borde activo/seleccionado |

### 2.3 Texto

| Token | Valor | Uso |
|-------|-------|-----|
| `--tx` | `#e8e8f0` | Primario |
| `--tx2` | `#b8b8c8` | Secundario |
| `--mu` | `#7a7a8a` | Muted (labels) |
| `--mu2` | `#4a4a58` | Muy muted (separadores, dots) |

### 2.4 Brand & Status

| Token | Valor | Glow |
|-------|-------|------|
| `--ac` | `#7c6fff` | `--ac-glow: rgba(124,111,255,.18)` |
| `--ac-hi` | `#9485ff` | (hover lighter) |
| `--g` | `#4ecb9e` | `--g-glow: rgba(78,203,158,.16)` |
| `--am` | `#f7a440` | `--am-glow: rgba(247,164,64,.16)` |
| `--r` | `#e05c5c` | `--r-glow: rgba(224,92,92,.16)` |

### 2.5 Radios

`--rs:8px` `--rr:10px` `--rl:14px` `--rxl:18px`

### 2.6 Elevación (shadow + inner top highlight)

| Token | Valor | Uso |
|-------|-------|-----|
| `--e1` | `0 1px 0 rgba(255,255,255,.04) inset, 0 1px 2px rgba(0,0,0,.4)` | Inputs, tags |
| `--e2` | `0 1px 0 rgba(255,255,255,.05) inset, 0 4px 14px rgba(0,0,0,.35)` | Cards normales |
| `--e3` | `0 1px 0 rgba(255,255,255,.06) inset, 0 12px 32px rgba(0,0,0,.5)` | Hover, KPI hero |
| `--e4` | `0 1px 0 rgba(255,255,255,.08) inset, 0 24px 64px rgba(0,0,0,.6)` | Modal, confirm |

### 2.7 Easing & duración

```css
--tx-fast: 150ms cubic-bezier(.4,0,.2,1);
--tx-base: 220ms cubic-bezier(.4,0,.2,1);
--tx-slow: 320ms cubic-bezier(.16,1,.3,1);
```

### 2.8 Tipografía

- **Familia:** Inter (peso 400/500/600/700/800), `system-ui` fallback.
- **Imports:** `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`
- **Features:** `font-feature-settings: "cv11", "ss01"; font-variant-numeric: tabular-nums;` en números financieros.
- **Escala:**

| Tamaño | Uso |
|--------|-----|
| 11px (`.69rem`) | Micro-labels (KPI label, tags) |
| 13px (`.82rem`) | Body secundario, helper text |
| 15px | Body principal |
| 18px (`1.13rem`) | Subtítulos card |
| 22px (`1.4rem`) | KPI value normal |
| 32px (`2rem`) | KPI hero value |

---

## 3. Componentes clave

### 3.1 Card base

- Background `--s2`, border hairline, padding 22px, box-shadow `--e2`.
- `::before` 1px highlight gradient en el borde superior (clave del efecto profundidad).

### 3.2 KPI Bento (Resumen)

- Grid: `1.5fr 1fr 1fr 1fr` desktop, `1fr 1fr` mobile con primer KPI `grid-column:1/-1`.
- Primer KPI = **hero**: padding mayor, radial glow purple, valor en text-clip gradient `#fff` → `#c0bff5`, tamaño `2rem`.
- KPIs secundarios: glow del color correspondiente (verde/ámbar/purple).

### 3.3 inv-card (mobile crítico)

- Desktop: summary inline (nombre + tag + cap a la izquierda, métricas a la derecha).
- Mobile (≤680px): stack vertical — fila 1 nombre+tag, fila 2 capital prominente, fila 3 métricas en grid 3-col con border-top hairline.

### 3.4 prop-card

- Desktop: `grid-template-columns: minmax(160px,1fr) 2fr auto`.
- Mobile (≤680px): stack vertical con border-top entre secciones.

### 3.5 Topbar & Tabs

- Glass effect: `backdrop-filter: blur(20px) saturate(180%)` + `background: rgba(20,20,28,.85)`.
- Logo en gradient text purple.
- Tab activa con underline 2px + glow sutil.

---

## 4. Charts (Chart.js)

- Grid lines: `rgba(255,255,255,.04)` (más sutil)
- Tooltips: `backgroundColor: '#1a1a24', borderColor: 'rgba(255,255,255,.10)', borderWidth: 1`
- Tick color: `#7a7a8a`
- Donut `borderWidth: 2, borderColor: '#0a0a0f'` para separar slices

---

## 5. Mobile breakpoints

| Breakpoint | Comportamiento |
|------------|----------------|
| `≤480px` | Padding reducido, fonts mínimo 16px en inputs (anti-zoom iOS) |
| `≤680px` | inv-card y prop-card stack vertical, KPI grid 1fr 1fr con hero full-width, fr→1col, kpi-hero font 1.7rem |
| `≤900px` | resumen-panels apilan |
| `≥1024px` | Container max-width 1100px |

---

## 6. Anti-patterns (NO hacer)

- Sombras grandes `0 20px 50px` (parece Material genérico)
- Border-radius >18px en cards (aspecto juguetón)
- Gradientes vibrantes purple→pink (estilo IA cursi)
- Backgrounds totalmente negros `#000` (provoca smearing en OLED)
- Texto gris sobre gris (`#888` sobre `#1a1a22`) — usar `--tx2` para secundario
- Animaciones >400ms
- Emojis en UI

---

## 7. Pre-delivery checklist

- [ ] Todos los KPIs con `font-variant-numeric: tabular-nums`
- [ ] Mobile 375px sin scroll horizontal
- [ ] Tap targets ≥44px (botones, tabs, .qedit)
- [ ] inputs con `font-size:16px` mínimo
- [ ] Cada card tiene `::before` highlight superior
- [ ] Hover states en cards: border + shadow change (no solo background)
- [ ] Charts redibujados con tokens nuevos
- [ ] `prefers-reduced-motion` respetado
