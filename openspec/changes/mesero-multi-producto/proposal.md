# Proposal: Mesero — Agregar múltiples productos en un solo flujo

## Intent

Hoy el modal "Agregar producto" del mesero permite añadir UN solo producto por interacción: seleccionar producto → configurar cantidad/notas/extras → confirmar → cerrar modal. Para agregar 4 productos, el mesero repite el flujo 4 veces (4 aperturas de modal, 4 round-trips HTTP, 4 `recalcularTotal()`, 4 broadcasts Supabase). Esto es lento en piso, genera fricción en horas pico y desperdicia recursos de DB.

Esta propuesta introduce un flujo de carrito dentro del mismo modal: el mesero acumula N productos configurados y confirma todos juntos en una sola operación transaccional.

## Scope

### In Scope
- Refactor de `AddItemModal` a flujo de dos fases: staging (configurando producto actual) + cart (productos listos para enviar)
- Nuevo endpoint `POST /api/ordenes/{id}/items/batch` que inserta N items en una transacción única
- Nuevo servicio `addItems()` que ejecuta N inserts + 1 `recalcularTotal()` + 1 `buildOrden()` + 1 broadcast
- Nuevo `AddItemsBatchSchema` (Zod) y client helper `addItems()`
- Preservación del comportamiento existente: `POST /api/ordenes/{id}/items` (single item) sigue vivo sin cambios

### Out of Scope
- Rediseño visual de dos paneles (catálogo izquierda / carrito derecha) — la UI mobile-first actual queda intacta
- Edición de items ya insertados en la orden desde el modal — sigue haciéndose vía el flujo actual
- Reordenamiento o mover items entre órdenes
- Tests automatizados nuevos — el proyecto aún no tiene runner configurado; verificación es manual

## Capabilities

### New Capabilities
- `mesero-multi-item-cart`: flujo de carrito dentro de `AddItemModal` para acumular varios productos y confirmarlos en batch, más el endpoint transaccional que lo soporta

### Modified Capabilities
- None (no existen specs previas en `openspec/specs/` para el flujo del mesero)

## Approach

Frontend (dos fases dentro del mismo modal):
1. Usuario selecciona producto del grid → entra en fase **staging** (`staging: CartEntry | null`)
2. Configura cantidad, notas, extras → click "Agregar al carrito" → entrada empujada a `cart[]`, staging se limpia
3. Cart list visible debajo con delete por entrada
4. "Confirmar (N productos)" dispara UN solo `POST /api/ordenes/{id}/items/batch` con `{ items: AddItemData[] }`

Backend:
- `addItems(sql, ordenId, items[])` ejecuta BEGIN → N inserts en `orden_items` + N×M inserts en `orden_item_ingredientes` → `recalcularTotal()` una vez → COMMIT → `buildOrden()` → broadcast Supabase una vez
- Validación con `AddItemsBatchSchema = z.object({ items: z.array(AddItemSchema).min(1) })`
- Falla en cualquier item → rollback total, error `{ message }` claro al cliente

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/mesero/ordenes/page.tsx` | Modified | Refactor `AddItemModal` (líneas 726–900): staging + cart state |
| `src/app/api/ordenes/[id]/items/batch/route.ts` | New | POST handler batch (tenant-scoped, JWT-guarded) |
| `src/lib/services/ordenes.ts` | Modified | Nuevo `addItems()` batch fn; `addItem()` existente sin tocar |
| `src/lib/schemas/index.ts` | Modified | Nuevo `AddItemsBatchSchema` |
| `src/lib/api/ordenes.ts` | Modified | Nuevo client helper `addItems()` |
| `src/types/index.ts` | Modified | `AddItemsData` alias (array de `AddItemData`) si hace falta |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Modal se vuelve muy alto en mobile (catálogo + carrito apilados) | Med | `max-h-[85dvh]` en body del modal + secciones con scroll independiente (patrón `max-h-64 overflow-y-auto` ya en uso) |
| Reset incompleto al cerrar modal deja staging o cart contaminados | Med | Extender el `useEffect(() => { if (!open) reset }, [open])` para limpiar AMBOS: `staging` y `cart` |
| `addItems()` sin tests: bug en la transacción puede corromper items o total | High | Verificación manual paso a paso; log claro del `recalcularTotal()`; rollback verificado con item inválido intencional antes de mergear |
| Falla parcial (item 3 inválido de 5) rollea toda la transacción — UX confusa | Low | Error `{ message }` explícito indicando índice del item que falló |
| Broadcast único cambia timing esperado por otros clientes (kitchen display) | Low | Multi-tenant impact: NINGUNO cross-tenant; realtime channel es por-tenant. Kitchen ya reacciona a `orden.updated` — recibirá 1 evento con N items en vez de N eventos |

## Rollback Plan

Sin migraciones SQL — rollback es puramente código:
1. Revert del commit que agrega `route.ts` batch, `addItems()` service, schema, client helper
2. Revert del commit que refactoriza `AddItemModal` (vuelve a estado single-product)
3. `POST /api/ordenes/{id}/items` (single) nunca se tocó — sigue funcionando durante y después del rollback
4. Ningún dato en DB queda inconsistente: el endpoint batch usa las mismas tablas y `recalcularTotal()` que el single

## Dependencies

- Ninguna dependencia externa. Usa `withTenant()`, `masterDb()`, patrones existentes de `src/lib/services/ordenes.ts`

## Multi-tenant Impact

- Endpoint batch se resuelve por tenant vía middleware existente (subdomain → `tenant_{slug}` schema)
- `withTenant(slug, fn)` envuelve `addItems()` igual que `addItem()` — misma reserva de conexión, mismo `SET search_path`
- Cero riesgo de fuga cross-tenant: no hay JOINs a `master.*` desde el flujo de items

## Success Criteria

- [ ] Mesero puede agregar N productos configurados individualmente y confirmar UN solo POST
- [ ] Backend inserta todos los items en una transacción única (verificado por logs SQL)
- [ ] `recalcularTotal()` se ejecuta exactamente 1 vez por batch
- [ ] Broadcast Supabase se emite exactamente 1 vez por batch
- [ ] Endpoint `POST /api/ordenes/{id}/items` (single) sigue funcional sin cambios
- [ ] Error en 1 item → rollback total + mensaje `{ message: string }` claro identificando el item fallido
- [ ] `next lint` y `tsc --noEmit` pasan
- [ ] Verificación manual: agregar 5 productos con extras variados desde mobile viewport sin overflow visual
