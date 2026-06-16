# REVIEW.md — Portfolio de Inversiones

## Checklist obligatorio

**Estado `S`**
- [ ] Toda mutación de `S` → `trySave()` inmediato
- [ ] IDs nuevos: `Date.now()` (o `+offset` si mismo tick)
- [ ] No resetear `S` parcialmente sin `sanitizeState()`

**Fiscal (máxima atención)**
- [ ] Alquiler → `irpf()` escala general + `BASE_IRPF` como base previa
- [ ] P2P/dividendos/ganancias/crypto/fondos → `irpfAhorro()` escala ahorro
- [ ] Reducción 60% alquiler solo si rendimiento neto positivo
- [ ] Ningún tipo fijo hardcodeado (`* 0.19` etc.) sin pasar por funciones de escala

**Responsive/Mobile**
- [ ] Nuevo componente → bloque `@media(max-width:640px)`
- [ ] Inputs móvil: `font-size≥16px` (evita zoom iOS)
- [ ] Grids 3-4 col → colapsan a 1-2 en móvil
- [ ] Botones: padding mínimo `9px 14px`
- [ ] Labels encima del input en móvil
- [ ] Tablas `.ht`: font-size reducido + padding ajustado en móvil
- [ ] Sin overflow horizontal no intencionado

**Diseño**
- [ ] Sin colores hardcodeados — solo CSS variables
- [ ] Inputs: fondo `var(--s1)` o `var(--s2)`
- [ ] Bordes: `var(--bd)`
- [ ] Focus inputs: `border-color:var(--ac); outline:none`
- [ ] Positivo→`var(--g)` · Negativo→`var(--r)` · Neutro→`var(--am)`
- [ ] Reusar clases existentes antes de crear CSS nuevo

**Chart.js**
- [ ] `chart.destroy()` antes de recrear (memory leaks)
- [ ] Contenedor `.chart-wrap` con altura fija
- [ ] Tooltips: fondo`#22222e` borde`#2e2e3e`
- [ ] `responsive:true maintainAspectRatio:false`

**Auth/Sync**
- [ ] Operaciones bajo `currentSession` válido
- [ ] Headers Supabase via `authHeaders()` — nunca manual
- [ ] `setSyncStatus()` refleja estado real tras operación cloud
- [ ] Key localStorage: `pf_v7_{user_id}`
- [ ] No acceder a `S` antes de que `tryLoad()` termine

**Seguridad**
- [ ] Sin `innerHTML` con datos de usuario sin escapar
- [ ] Acciones destructivas con doble confirmación
- [ ] Todas las queries Supabase filtran por `user_id`

**Rendimiento**
- [ ] Sin cálculos redundantes en render (vars locales)
- [ ] `syncToCloud()` siempre debounced — nunca fetch directo desde input
- [ ] `setInterval`/`setTimeout` se limpian

## Banderas rojas (bloquear integración)
- Fiscal ignora `BASE_IRPF` en alquiler
- Mutación `S` sin `trySave()`
- Componente nuevo sin media query móvil
- Colores hardcodeados en nuevo CSS
- Chart sin `destroy()` previo
- Query Supabase sin filtro `user_id`
- Input numérico móvil sin `font-size:16px`

## NO marcar
Estilo legacy · comentarios en inglés en código existente · ausencia TS · uso de `var` · clave pública Supabase visible (es `anon key`, las RLS son la protección real)
