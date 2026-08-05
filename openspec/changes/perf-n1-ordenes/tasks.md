# Tasks — `perf-n1-ordenes`

**Status**: complete — all tasks implemented
**Change**: perf-n1-ordenes
**File scope**: `src/lib/services/ordenes.ts` only
**Delivery**: Single PR — estimated ~100 lines touched, ~30 net added. No `size:exception` required.

---

## Review Workload Forecast

| Metric | Value |
|---|---|
| Total tasks | 6 |
| Parallel tasks | 0 (all sequential — one-file dependency chain) |
| Sequential tasks | 6 |
| Estimated lines changed | ~100 |
| Estimated net lines added | ~30 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Single PR | Yes |
| Decision needed before apply | No |

---

## Execution order

All tasks are **sequential**. Each task must compile (`npx tsc --noEmit`) before the next begins.
Rationale: all work is in one file; TASK-01 frees the `IngredienteRow` name required by TASK-02;
TASK-02 produces `fetchCatalog` required by TASK-03–05.

```
TASK-01 → TASK-02 → TASK-03 → TASK-04 → TASK-05 → TASK-06
```

---

## TASK-01 — Rename `IngredienteRow` → `ItemIngredienteRow`

**Status**: [x] complete
**Priority**: CRITICAL (prerequisite for TASK-02)
**File**: `src/lib/services/ordenes.ts`
**Estimated lines changed**: ~10 (5 rename sites + surrounding context)

### What to do

Rename all 5 occurrences of `IngredienteRow` to `ItemIngredienteRow` in the file.
Do NOT change anything else in this commit.

Exact sites (line numbers are pre-refactor; search by text):
1. `interface IngredienteRow {` (L122) — the interface declaration
2. `function toIngrediente(row: IngredienteRow)` (L174) — helper parameter type
3. `sql<IngredienteRow[]>` inside `buildOrden` (L217) — generic type argument
4. `sql<IngredienteRow[]>` inside first query block (L338) — generic type argument
5. `sql<IngredienteRow[]>` inside second query block (L422) — generic type argument

These are `orden_item_ingredientes` rows (already-stored item-ingredient join rows).
The rename clarifies they are NOT the catalog `ingredientes` table rows.

### Acceptance criteria

- `grep -n "IngredienteRow" src/lib/services/ordenes.ts` returns 0 matches
- `grep -n "ItemIngredienteRow" src/lib/services/ordenes.ts` returns exactly 5 matches
- `npx tsc --noEmit` passes
- No behavioral change — pure rename

---

## TASK-02 — Add `CatalogIngredienteRow` type + `ProductoRow` type + `fetchCatalog()` helper

**Status**: [x] complete
**Priority**: CRITICAL (prerequisite for TASK-03, TASK-04, TASK-05)
**File**: `src/lib/services/ordenes.ts`
**Estimated lines changed**: ~25 (new helper + 2 new local interfaces)

### What to do

After the `ItemIngredienteRow` interface block and before the `// ─── Helpers ───` section,
add two new local interfaces and one private async helper function.

**New interfaces** (local, not exported):

```ts
interface ProductoRow { id: bigint; precio: string }
interface CatalogIngredienteRow { id: bigint; precio: string }
```

Note: `ProductoRow` may already exist inline in some query return types — consolidate to this
named interface. If no named `ProductoRow` exists yet, add it fresh.

**New private helper** (add immediately before `export async function addItem`):

```ts
async function fetchCatalog(
  sql: Sql,
  productoIds: number[],
  ingredienteIds: number[]
): Promise<{
  prodMap: Map<number, ProductoRow>
  ingMap: Map<number, CatalogIngredienteRow>
}> {
  const prodQuery =
    productoIds.length > 0
      ? sql<ProductoRow[]>`SELECT id, precio FROM productos WHERE id = ANY(${sql.array(productoIds, 'int8')})`
      : Promise.resolve([] as ProductoRow[])

  const ingQuery =
    ingredienteIds.length > 0
      ? sql<CatalogIngredienteRow[]>`SELECT id, precio FROM ingredientes WHERE id = ANY(${sql.array(ingredienteIds, 'int8')})`
      : Promise.resolve([] as CatalogIngredienteRow[])

  const [prodRows, ingRows] = await Promise.all([prodQuery, ingQuery])

  const prodMap = new Map<number, ProductoRow>(prodRows.map((r) => [Number(r.id), r]))
  const ingMap = new Map<number, CatalogIngredienteRow>(ingRows.map((r) => [Number(r.id), r]))

  return { prodMap, ingMap }
}
```

Key implementation details:
- Empty-array guard on BOTH queries — skip the RTT entirely when the array is empty
- `sql.array(ids, 'int8')` — explicit type hint required (PKs are `bigint`; prevents text[]-vs-bigint mismatch)
- `Promise.all` — parallel execution on the caller's `sql` handle (no new connection)
- Map keys are `Number(r.id)` — converts `bigint` to `number` for consistent lookup

### Acceptance criteria

- `fetchCatalog` is not exported (private to module)
- `ProductoRow` and `CatalogIngredienteRow` interfaces exist in file
- Calling `fetchCatalog(sql, [], [])` issues zero queries (both guards hit)
- Calling `fetchCatalog(sql, [1,2], [])` issues exactly one SELECT (productos only)
- Calling `fetchCatalog(sql, [1], [10,20])` issues both SELECTs via `Promise.all`
- `npx tsc --noEmit` passes

---

## TASK-03 — Refactor `addItem()` to use `fetchCatalog()` [x] complete

**Priority**: HIGH
**File**: `src/lib/services/ordenes.ts`
**Estimated lines changed**: ~20 (net reduction — removes per-ingrediente SELECT loop)
**Spec requirements satisfied**: "Batch-fetch productos before INSERT loop", "Batch-fetch ingredientes before INSERT loop", "addItem query ceiling ≤5"

### What to do

Replace the current `addItem` body (L532–576) with the fetch-then-loop pattern.

Current defects to fix:
- Producto SELECT is inside the function (acceptable for single item) but does not use `fetchCatalog`
- Ingrediente SELECTs are issued one per ingrediente inside a `for` loop (N+1)

New body structure:

```
1. Validate orden (same as today — SELECT + estado check)
2. Collect ingredienteIds: (data.ingredientes ?? []).map(i => i.ingredienteId)
3. fetchCatalog(sql, [data.productoId], ingredienteIds) — replaces both old SELECTs
4. Validate: prodMap.has(data.productoId) → throw NotFoundError('Producto no encontrado')
5. INSERT into orden_items using prodMap.get(data.productoId)!.precio → RETURNING id
6. For each ingrediente:
   a. Validate: ingMap.has(ing.ingredienteId) → throw NotFoundError(`Ingrediente ${ing.ingredienteId} no encontrado`)
   b. INSERT into orden_item_ingredientes using ingMap.get(ing.ingredienteId)!.precio
7. recalcularTotal(sql, ordenId)
8. buildOrden(sql, ordenId)
9. COMMIT / ROLLBACK on catch (same boundaries as today)
```

Error message format: NO `(item #N)` suffix — single-item call. Exact messages:
- `'Producto no encontrado'`
- `` `Ingrediente ${ing.ingredienteId} no encontrado` ``

### Acceptance criteria

- No `SELECT ... FROM ingredientes WHERE id = ${ing.ingredienteId}` line-by-line query remains in `addItem`
- `fetchCatalog` is called once per `addItem` invocation
- Error messages match exactly (no `(item #N)` suffix)
- Transaction boundary unchanged (BEGIN/COMMIT/ROLLBACK)
- `npx tsc --noEmit` passes

---

## TASK-04 — Refactor `addItems()` to use `fetchCatalog()` + sequential INSERTs [x] complete

**Priority**: HIGH (highest impact — eliminates batch-INSERT fragility + fixes 2 latent defects)
**File**: `src/lib/services/ordenes.ts`
**Estimated lines changed**: ~30 (removes batch-INSERT helper; adds sequential INSERT loop)
**Spec requirements satisfied**: "Batch-fetch productos before INSERT loop", "Batch-fetch ingredientes before INSERT loop", "Parallel batch fetch execution", "addItems query ceiling ≤10", "Duplicate productoId dedup"

### What to do

Replace the current `addItems` body (L578–660) with the fetch-then-loop pattern.

Current defects to fix:
1. `sql.array(productoIds)` — missing `'int8'` type hint (latent bigint/text[] mismatch)
2. `sql.array(allIngIds)` — missing `'int8'` type hint
3. producto SELECT and ingrediente SELECT are sequential — must be parallel via `Promise.all`
4. Batch INSERT (`sql(itemInsertRows, ...cols)`) relies on `RETURNING id` ordering — fragile coupling with `insertedItems[idx]`; replace with sequential INSERTs

New body structure:

```
1. Validate orden (same as today — SELECT + estado check)
2. Collect productoIds: [...new Set(items.map(it => it.productoId))]  ← deduplicate
3. Collect ingredienteIds: [...new Set(items.flatMap(it => (it.ingredientes ?? []).map(i => i.ingredienteId)))]
4. fetchCatalog(sql, productoIds, ingredienteIds) → { prodMap, ingMap }
5. Validate all productos (for loop, 0-based → 1-based error label):
   if (!prodMap.has(items[i].productoId)) throw NotFoundError(`Producto no encontrado (item #${i+1})`)
6. Validate all ingredientes (nested for loop, same 1-based label):
   if (!ingMap.has(ing.ingredienteId)) throw NotFoundError(`Ingrediente ${ing.ingredienteId} no encontrado (item #${i+1})`)
7. Sequential INSERT loop for orden_items:
   for each item → INSERT ... RETURNING id → store returned id
8. Sequential INSERT loop for orden_item_ingredientes:
   for each item × ingrediente → INSERT using stored item id + ingMap price
9. recalcularTotal(sql, ordenId)
10. buildOrden(sql, ordenId)
11. COMMIT / ROLLBACK on catch
```

Remove entirely: `sql(itemInsertRows, ...)` batch helper, `insertedItems[idx]` coupling, the `/* eslint-disable */` block.

Error message format: WITH `(item #N)` suffix (1-based index). Exact messages:
- `` `Producto no encontrado (item #${i + 1})` ``
- `` `Ingrediente ${ing.ingredienteId} no encontrado (item #${i + 1})` ``

### Acceptance criteria

- `sql(itemInsertRows` batch helper is gone from `addItems`
- `fetchCatalog` is called once with deduplicated ID arrays
- Both the productos query and ingredientes query run via `Promise.all` (inside `fetchCatalog`)
- `sql.array(..., 'int8')` is used for both arrays (via `fetchCatalog`)
- Sequential INSERT loops replace batch INSERT
- Error messages match exactly (with `(item #N)` suffix, 1-based)
- `npx tsc --noEmit` passes

---

## TASK-05 — Refactor `updateItem()` ingredientes loop to use `fetchCatalog()` [x] complete

**Priority**: HIGH
**File**: `src/lib/services/ordenes.ts`
**Estimated lines changed**: ~15 (removes per-ingrediente SELECT loop in updateItem)
**Spec requirements satisfied**: "Batch-fetch ingredientes before INSERT loop", "updateItem query ceiling ≤7", "updateItem ingredientes loop — N+1 removed"

### What to do

Replace the ingredientes section of `updateItem` (L699–711) with the fetch-then-loop pattern.
The producto SELECT in `updateItem` is a single lookup (only one product per call) and is also
replaced by `fetchCatalog` for consistency and to apply the `int8` type hint.

Current defect:
- `for (const ing of data.ingredientes)` issues one SELECT per ingrediente (N+1)
- `prodRows` SELECT uses inline anonymous type instead of `ProductoRow`

New body structure:

```
1. Validate orden (same as today)
2. Validate item ownership (same as today — SELECT orden_items WHERE id = itemId)
3. Collect ingredienteIds: (data.ingredientes ?? []).map(i => i.ingredienteId)
4. fetchCatalog(sql, [data.productoId], ingredienteIds) → { prodMap, ingMap }
5. Validate: prodMap.has(data.productoId) → throw NotFoundError('Producto no encontrado')
6. DELETE FROM orden_item_ingredientes WHERE item_id = itemId  ← same as today
7. UPDATE orden_items SET precio_unitario = prodMap.get(data.productoId)!.precio ... ← same UPDATE
8. For each ingrediente:
   a. Validate: ingMap.has(ing.ingredienteId) → throw NotFoundError(`Ingrediente ${ing.ingredienteId} no encontrado`)
   b. INSERT into orden_item_ingredientes using ingMap.get(ing.ingredienteId)!.precio
9. recalcularTotal(sql, ordenId)
10. buildOrden(sql, ordenId)
11. COMMIT / ROLLBACK on catch
```

DELETE-before-UPDATE ordering preserved (same as today).
Error message format: NO `(item #N)` suffix. Exact messages:
- `'Producto no encontrado'`
- `` `Ingrediente ${ing.ingredienteId} no encontrado` ``

### Acceptance criteria

- No `SELECT ... FROM ingredientes WHERE id = ${ing.ingredienteId}` line-by-line query remains in `updateItem`
- `fetchCatalog` is called once per `updateItem` invocation
- DELETE-before-UPDATE ordering is preserved
- Validation happens BEFORE DELETE (validate from Map; DELETE only after all checks pass)
- Error messages match exactly (no `(item #N)` suffix)
- `npx tsc --noEmit` passes

---

## TASK-06 — TypeScript compilation gate [x] complete

**Priority**: CRITICAL (ship gate)
**File**: `src/lib/services/ordenes.ts` (read-only verification)
**Estimated lines changed**: 0

### What to do

Run `npx tsc --noEmit` from the project root. Fix any TypeScript errors introduced by
TASK-01 through TASK-05 before considering the change complete.

Common failure modes to check:
- `bigint` vs `number` Map key mismatches (ensure `Number(r.id)` on all Map constructions)
- `prodMap.get(id)!` used without null-check where `!` is not appropriate
- `CatalogIngredienteRow` or `ProductoRow` interfaces missing import/declaration
- `ItemIngredienteRow` references missed during rename in TASK-01

### Acceptance criteria

- `npx tsc --noEmit` exits with code 0, zero errors, zero warnings treated as errors
- No `@ts-ignore` or `@ts-expect-error` comments introduced

---

## Linked spec requirements → tasks

| Spec requirement | Task(s) |
|---|---|
| Batch-fetch productos before INSERT loop | TASK-03, TASK-04 |
| Batch-fetch ingredientes before INSERT loop | TASK-02, TASK-03, TASK-04, TASK-05 |
| Parallel batch fetch execution (`Promise.all`) | TASK-02 (inside `fetchCatalog`) |
| Duplicate productoId dedup (Set) | TASK-04 |
| Empty ingredientes guard (skip SELECT) | TASK-02 (guard inside `fetchCatalog`) |
| `addItems` query ceiling ≤10 | TASK-04 |
| `addItem` query ceiling ≤5 | TASK-03 |
| `updateItem` query ceiling ≤7 | TASK-05 |
| Order-item mutations preserve full behavioral contract | TASK-03, TASK-04, TASK-05 |
| Error messages byte-for-byte identical | TASK-03, TASK-04, TASK-05 |
| Transaction boundary (BEGIN/COMMIT/ROLLBACK) | TASK-03, TASK-04, TASK-05 |
| IngredienteRow naming collision resolved | TASK-01, TASK-02 |
| TypeScript compiles clean | TASK-06 |

## Out of scope (do NOT touch)

- `removeItem()`, `separarItem()`, `dividirOrden()`
- `recalcularTotal()` implementation
- INSERT statements structure (must remain sequential, one per row, `RETURNING id`)
- API route handlers or Zod schemas
- Database indexes or migrations
- `getOrdenes()` / `getHistorial()`
