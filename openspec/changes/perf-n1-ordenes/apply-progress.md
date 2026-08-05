# Apply Progress — `perf-n1-ordenes`

**Status**: complete
**Mode**: Standard (no TDD)
**Delivery**: Single PR — all tasks implemented in one batch
**File changed**: `src/lib/services/ordenes.ts`

---

## Task Completion

- [x] TASK-01 — Rename `IngredienteRow` → `ItemIngredienteRow` (5 refs)
- [x] TASK-02 — Add `ProductoRow`, `CatalogIngredienteRow` types + `fetchCatalog()` helper
- [x] TASK-03 — Refactor `addItem()` to use `fetchCatalog()`
- [x] TASK-04 — Refactor `addItems()` to use `fetchCatalog()` + sequential INSERTs
- [x] TASK-05 — Refactor `updateItem()` to use `fetchCatalog()` (validation moved before DELETE)
- [x] TASK-06 — TypeScript gate passed (zero errors in `ordenes.ts`)

---

## Implementation Notes

### TASK-01
Renamed all 5 occurrences of `IngredienteRow` → `ItemIngredienteRow`: interface definition, `toIngrediente()` parameter, `buildOrden()` query, `getOrdenes()` query, `getHistorial()` query.

### TASK-02
Added `ProductoRow { id: bigint; precio: string }` and `CatalogIngredienteRow { id: bigint; precio: string }` as local interfaces. Added private `fetchCatalog(sql, productoIds, ingredienteIds)` helper with:
- Empty-array guard on both queries (skips query entirely when array is empty)
- `sql.array(ids, 20)` — OID 20 = int8/bigint. Design spec said `'int8'` string but postgres.js `sql.array` second param is typed as `number | undefined`, so numeric OID 20 used instead.
- `Promise.all` for parallel execution
- `bigint→number` Map key conversion

### TASK-03
`addItem()` refactored: single `fetchCatalog([data.productoId], ingredienteIds)` call replaces prior per-producto SELECT and all per-ingrediente SELECTs. Error messages preserved: `"Producto no encontrado"` and `"Ingrediente ${id} no encontrado"` (no `(item #N)` suffix).

### TASK-04
`addItems()` refactored:
- Added `new Set()` dedup on both `productoIds` and `ingredienteIds`
- `fetchCatalog()` replaces both batch SELECTs (previously `sql.array(ids)` without type hint)
- Removed `sql(rows, ...cols)` batch INSERT helper and `insertedItems[idx]` FK coupling
- Replaced with sequential INSERT loop → `insertedItemIds[]` array
- Removed `eslint-disable @typescript-eslint/no-explicit-any` block
- Error messages preserved with 1-based index: `"Producto no encontrado (item #N)"`, `"Ingrediente ${id} no encontrado (item #N)"`

### TASK-05
`updateItem()` refactored: `fetchCatalog([data.productoId], ingredienteIds)` replaces `SELECT id, precio FROM productos LIMIT 1` and per-ingrediente SELECT loop. All ingrediente validation now happens BEFORE `DELETE FROM orden_item_ingredientes` — validation-before-delete ordering preserved. Error messages preserved: no `(item #N)` suffix.

### TASK-06
`npx tsc --noEmit` — zero errors in `src/lib/services/ordenes.ts`. Pre-existing `Cannot find module 'next/server'` errors are project-wide framework type resolution issues (present before and after this change).

---

## Deviations from Design

1. **`sql.array(ids, 20)` instead of `sql.array(ids, 'int8')`** — postgres.js `sql.array` signature is `(value: T[], type?: number)`, not `(value: T[], type?: string)`. OID 20 is the PostgreSQL OID for int8/bigint. Semantically equivalent to what the design intended. Verified via `node_modules/postgres/types/index.d.ts`.

No other deviations.

---

## Files Changed

| File | Action | Summary |
|---|---|---|
| `src/lib/services/ordenes.ts` | Modified | All 5 tasks: rename + add types + helper + refactor 3 functions |

---

## PR Boundary

- Mode: single PR
- Scope: `src/lib/services/ordenes.ts` only
- Estimated diff: ~100 lines changed, ~30 net added
- Ready for: `sdd-verify`
