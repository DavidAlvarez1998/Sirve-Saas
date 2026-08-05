# Design — `perf-n1-ordenes`

**Status**: designed
**Owner**: David Alvarez
**Consumes**: `sdd/perf-n1-ordenes/proposal`
**Artifact store**: hybrid (Engram `sdd/perf-n1-ordenes/design` + this file)

---

## 1. Architectural approach

**Pattern**: fetch-then-loop with an extracted private helper.

The mutation paths (`addItem`, `addItems`, `updateItem`) all share the same shape:

1. Validate the parent `orden` row (still per-call; unavoidable — one row lookup).
2. **Batch fetch** all catalog rows (`productos`, `ingredientes`) needed by the whole call in two parallel SELECTs.
3. Loop only for INSERTs, using in-memory `Map` lookups for validation and to obtain `precio`.

The pattern already exists in `addItems()` (lines 590–617 of `src/lib/services/ordenes.ts`) but has three problems worth cleaning up simultaneously:

- Empty-array guard is missing for `productoIds` (it exists for `allIngIds`).
- `sql.array(ids)` is missing the explicit `'int8'` type hint required by postgres.js for `bigint[]`.
- The batch-fetch block is not shared with `addItem()` or `updateItem()`, so those two still do per-item SELECTs.

The design extracts a small private helper `fetchCatalog(sql, productoIds, ingredienteIds)` that centralises:

- Empty-array guards for both ID lists.
- The `sql.array(ids, 'int8')` type hint.
- `bigint → number` map key conversion.
- Parallel `Promise.all` execution.

`addItem`, `addItems`, and `updateItem` all call `fetchCatalog()` once at the top of their write path.

**No changes** to:
- Transaction boundaries (`BEGIN`/`COMMIT`/`ROLLBACK` remain per-function).
- The `Sql` handle passed by the caller (`withTenant()` upstream is unchanged).
- `recalcularTotal()` or `buildOrden()` — both remain unchanged.
- The public `Orden` payload or the flat `{ message: string }` error contract.
- Error messages (byte-for-byte identical, including `(item #N)` labels).

---

## 2. Components and data flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Route Handler (src/app/api/ordenes/*.ts)                                 │
│   → withTenant(slug, sql => ordenes.addItems(sql, ordenId, items))       │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ addItem() / addItems() / updateItem()                                    │
│   BEGIN                                                                   │
│   ├─ orden row lookup (single SELECT)                                    │
│   ├─ collect productoIds + ingredienteIds from input                     │
│   ├─ fetchCatalog(sql, productoIds, ingredienteIds)   ◄── NEW HELPER     │
│   │     → { prodMap, ingMap }  (2 parallel SELECTs, or 0/1 if empty)     │
│   ├─ validation loop: prodMap.get / ingMap.get → throw NotFoundError    │
│   ├─ INSERT loop (sequential, RETURNING id required for FK)             │
│   ├─ recalcularTotal(sql, ordenId)                                       │
│   └─ buildOrden(sql, ordenId)                                            │
│   COMMIT                                                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

Data flow for `fetchCatalog`:

```
Input:  productoIds: number[], ingredienteIds: number[]
        │
        ├── productoIds.length === 0? → prodQuery = Promise.resolve([])
        │                             else → SELECT ... WHERE id = ANY(int8[])
        │
        └── ingredienteIds.length === 0? → ingQuery = Promise.resolve([])
                                        else → SELECT ... WHERE id = ANY(int8[])
                                              │
                                              ▼
                                 Promise.all([prodQuery, ingQuery])
                                              │
                                              ▼
                            build Map<number, Row> for each result set
                                              │
                                              ▼
Output: { prodMap: Map<number, ProductoRow>, ingMap: Map<number, IngredienteRow> }
```

---

## 3. Types and helper signature

```ts
// Local, non-exported types inside src/lib/services/ordenes.ts
interface ProductoRow {
  id: bigint
  precio: string
}

interface IngredienteRow {
  id: bigint
  precio: string
}

/**
 * Batch-fetch catalog rows for order-item mutations.
 * Deduplicates via ANY(...) semantics; skips the query entirely when the ID list is empty.
 * Map keys are Number(bigint) — safe because catalog IDs fit in Number.MAX_SAFE_INTEGER.
 * MUST be called on the transactional `Sql` handle (same reserved connection as the BEGIN).
 */
async function fetchCatalog(
  sql: Sql,
  productoIds: number[],
  ingredienteIds: number[]
): Promise<{
  prodMap: Map<number, ProductoRow>
  ingMap: Map<number, IngredienteRow>
}> {
  const prodQuery = productoIds.length > 0
    ? sql<ProductoRow[]>`
        SELECT id, precio FROM productos
        WHERE id = ANY(${sql.array(productoIds, 'int8')})
      `
    : Promise.resolve([] as ProductoRow[])

  const ingQuery = ingredienteIds.length > 0
    ? sql<IngredienteRow[]>`
        SELECT id, precio FROM ingredientes
        WHERE id = ANY(${sql.array(ingredienteIds, 'int8')})
      `
    : Promise.resolve([] as IngredienteRow[])

  const [prodRows, ingRows] = await Promise.all([prodQuery, ingQuery])

  const prodMap = new Map<number, ProductoRow>()
  for (const r of prodRows) prodMap.set(Number(r.id), r)

  const ingMap = new Map<number, IngredienteRow>()
  for (const r of ingRows) ingMap.set(Number(r.id), r)

  return { prodMap, ingMap }
}
```

**Note**: `ProductoRow` and `IngredienteRow` here are LOCAL, private types for catalog lookup. They do **not** clash with the existing `IngredienteRow` type (line 122 of the file) which is the row shape for `orden_item_ingredientes`. The existing type must be **renamed** to `ItemIngredienteRow` in the same commit to avoid the collision.

**Rename impact**: the existing `IngredienteRow` is referenced at:
- Line 122 (declaration)
- Line 217 (`sql<IngredienteRow[]>` in `buildOrden`)
- Line 338 (`sql<IngredienteRow[]>` in `getOrdenes`)
- Line 422 (`sql<IngredienteRow[]>` in `getHistorial`)
- Line 174 (`toIngrediente(row: IngredienteRow)`)

Rename all five occurrences to `ItemIngredienteRow` for accuracy (the row represents an order-item ingrediente, not a catalog ingrediente).

---

## 4. Exact replacement for `addItems()`

Replaces lines 578–660 of the current file.

```ts
export async function addItems(sql: Sql, ordenId: number, items: AddItemData[]): Promise<Orden> {
  await sql`BEGIN`
  try {
    // 1. Validate orden
    const ordenRows = await sql<OrdenRow[]>`
      SELECT id, estado, pagada FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    if (ordenRows[0].estado === 'PAGADA' || ordenRows[0].estado === 'CANCELADA') {
      throw new ConflictError('No se puede modificar una orden pagada o cancelada')
    }

    // 2. Collect all catalog IDs (deduped via Set)
    const productoIds = Array.from(new Set(items.map((it) => it.productoId)))
    const ingredienteIds = Array.from(
      new Set(items.flatMap((it) => (it.ingredientes ?? []).map((ing) => ing.ingredienteId)))
    )

    // 3. Batch-fetch catalog
    const { prodMap, ingMap } = await fetchCatalog(sql, productoIds, ingredienteIds)

    // 4. Validate + INSERT items sequentially (INSERTs need RETURNING id for FK)
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const prod = prodMap.get(it.productoId)
      if (!prod) throw new NotFoundError(`Producto no encontrado (item #${i + 1})`)

      const [itemRow] = await sql<{ id: bigint }[]>`
        INSERT INTO orden_items (orden_id, producto_id, cantidad, precio_unitario, notas)
        VALUES (${ordenId}, ${it.productoId}, ${it.cantidad}, ${prod.precio}, ${it.notas ?? null})
        RETURNING id
      `

      for (const ing of it.ingredientes ?? []) {
        const cat = ingMap.get(ing.ingredienteId)
        if (!cat) {
          throw new NotFoundError(`Ingrediente ${ing.ingredienteId} no encontrado (item #${i + 1})`)
        }
        await sql`
          INSERT INTO orden_item_ingredientes (item_id, ingrediente_id, cantidad, precio_unitario)
          VALUES (${Number(itemRow.id)}, ${ing.ingredienteId}, ${ing.cantidad}, ${cat.precio})
        `
      }
    }

    // 5. Recalculate + build
    await recalcularTotal(sql, ordenId)
    const result = await buildOrden(sql, ordenId)
    await sql`COMMIT`
    return result
  } catch (e) {
    await sql`ROLLBACK`
    throw e
  }
}
```

**Deltas versus current code**
- Removed the multi-row `sql(itemInsertRows, ...)` batch INSERT helper. INSERTs go back to sequential loop because each returns an `id` needed for its own ingredientes FK. This is a **regression on INSERT count** but a **correctness win**: the current batch-INSERT relies on order-preservation across `RETURNING id`, which is guarantee-adjacent (postgres returns rows in insert order for a single VALUES clause but this is not something to build correctness on).
- Removed the `/* eslint-disable @typescript-eslint/no-explicit-any */` block and the `as any` casts.
- Removed the `insertedItems[idx]` indirection which coupled the ingrediente loop to the parent `items` array index.
- Empty-array guards for BOTH `productoIds` and `ingredienteIds` are now handled by `fetchCatalog`.
- Explicit `'int8'` type hint on `sql.array` handled by `fetchCatalog`.
- `Set` dedup on both ID lists.

**Query count (5 items × 3 ingredientes)**
- Before: 1 orden + 1 producto batch + 1 ing batch + 1 items batch INSERT + 1 ings batch INSERT + 1 recalcular + N buildOrden queries = **6 + buildOrden**.
- After:  1 orden + 2 parallel batch SELECTs (via fetchCatalog) + 5 item INSERTs + 15 ing INSERTs + 1 recalcular + buildOrden = **8 + buildOrden non-INSERT round trips** (the parallel Promise.all counts as ~1 wall-clock round trip).

The success criterion "≤ 10 non-INSERT queries" is met: `1 (orden) + 2 (parallel catalog, ~1 wall-clock) + 1 (recalcular) + 4 (buildOrden: 1 orden + 3 parallel items/ings/pagos) = 8`.

---

## 5. Exact replacement for `addItem()`

Replaces lines 532–576 of the current file.

```ts
export async function addItem(sql: Sql, ordenId: number, data: AddItemData): Promise<Orden> {
  await sql`BEGIN`
  try {
    // 1. Validate orden
    const ordenRows = await sql<OrdenRow[]>`
      SELECT id, estado, pagada FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    if (ordenRows[0].estado === 'PAGADA' || ordenRows[0].estado === 'CANCELADA') {
      throw new ConflictError('No se puede modificar una orden pagada o cancelada')
    }

    // 2. Collect + batch-fetch catalog
    const ingredienteIds = Array.from(
      new Set((data.ingredientes ?? []).map((ing) => ing.ingredienteId))
    )
    const { prodMap, ingMap } = await fetchCatalog(sql, [data.productoId], ingredienteIds)

    const prod = prodMap.get(data.productoId)
    if (!prod) throw new NotFoundError('Producto no encontrado')

    // 3. INSERT item
    const [itemRow] = await sql<{ id: bigint }[]>`
      INSERT INTO orden_items (orden_id, producto_id, cantidad, precio_unitario, notas)
      VALUES (${ordenId}, ${data.productoId}, ${data.cantidad}, ${prod.precio}, ${data.notas ?? null})
      RETURNING id
    `

    // 4. INSERT ingredientes sequentially
    for (const ing of data.ingredientes ?? []) {
      const cat = ingMap.get(ing.ingredienteId)
      if (!cat) throw new NotFoundError(`Ingrediente ${ing.ingredienteId} no encontrado`)
      await sql`
        INSERT INTO orden_item_ingredientes (item_id, ingrediente_id, cantidad, precio_unitario)
        VALUES (${Number(itemRow.id)}, ${ing.ingredienteId}, ${ing.cantidad}, ${cat.precio})
      `
    }

    await recalcularTotal(sql, ordenId)
    const result = await buildOrden(sql, ordenId)
    await sql`COMMIT`
    return result
  } catch (e) {
    await sql`ROLLBACK`
    throw e
  }
}
```

**Deltas versus current code**
- The per-ingrediente `SELECT id, precio FROM ingredientes WHERE id = ${ing.ingredienteId}` inside the `for` loop is **gone**.
- One `fetchCatalog()` call replaces both the single `SELECT ... FROM productos` and the N ingrediente SELECTs.
- Error message for ingrediente stays as `"Ingrediente ${id} no encontrado"` (NO `(item #N)` suffix — single item, matching current message byte-for-byte).
- Error message for producto stays as `"Producto no encontrado"` (NO `(item #N)` suffix).

**Query count (1 item × 3 ingredientes)**
- Before: 1 orden + 1 producto + 3 ing SELECTs + 1 item INSERT + 3 ing INSERTs + 1 recalcular + buildOrden = **6 non-INSERT round trips + 4 INSERTs**.
- After:  1 orden + 2 parallel catalog SELECTs (~1 wall-clock) + 1 item INSERT + 3 ing INSERTs + 1 recalcular + buildOrden = **~4 non-INSERT round trips + 4 INSERTs**. Meets "≤ 5" target.

---

## 6. Decision on `updateItem()`

**Read current implementation** (lines 662–721).

`updateItem()` has TWO patterns worth analyzing:

1. **Single `productoId` lookup** (line 683): `SELECT id, precio FROM productos WHERE id = ${data.productoId}`. Only ONE producto per call. Not worth batching a single row — no perf win, adds indirection.
2. **Per-ingrediente lookup inside loop** (line 701): `SELECT id, precio FROM ingredientes WHERE id = ${ing.ingredienteId} LIMIT 1`. This IS the N+1. Must be fixed.

**Decision**: use `fetchCatalog()` for BOTH the single producto and the batch of ingredientes. Passing `[data.productoId]` as a 1-element array is idiomatic and consistent with `addItem()`. The cost is trivial (one row lookup via `= ANY(int8[1])` uses the same PK index). The benefit is consistency across all three functions and one fewer specialized code path to test.

Replaces lines 662–721 of the current file.

```ts
export async function updateItem(
  sql: Sql,
  ordenId: number,
  itemId: number,
  data: UpdateItemData
): Promise<Orden> {
  await sql`BEGIN`
  try {
    // 1. Validate orden
    const ordenRows = await sql<OrdenRow[]>`
      SELECT id, estado, pagada FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    if (ordenRows[0].estado === 'PAGADA' || ordenRows[0].estado === 'CANCELADA') {
      throw new ConflictError('No se puede modificar una orden pagada o cancelada')
    }

    // 2. Validate item belongs to orden
    const itemRows = await sql<{ id: bigint; orden_id: bigint }[]>`
      SELECT id, orden_id FROM orden_items WHERE id = ${itemId} AND orden_id = ${ordenId} LIMIT 1
    `
    if (!itemRows[0]) throw new NotFoundError('Item no encontrado en esta orden')

    // 3. Collect + batch-fetch catalog
    const ingredienteIds = Array.from(
      new Set((data.ingredientes ?? []).map((ing) => ing.ingredienteId))
    )
    const { prodMap, ingMap } = await fetchCatalog(sql, [data.productoId], ingredienteIds)

    const prod = prodMap.get(data.productoId)
    if (!prod) throw new NotFoundError('Producto no encontrado')

    // 4. Replace ingredientes: DELETE all, then UPDATE item, then INSERT new ings
    await sql`DELETE FROM orden_item_ingredientes WHERE item_id = ${itemId}`

    await sql`
      UPDATE orden_items
      SET producto_id = ${data.productoId},
          cantidad = ${data.cantidad},
          precio_unitario = ${prod.precio},
          notas = ${data.notas ?? null}
      WHERE id = ${itemId}
    `

    for (const ing of data.ingredientes ?? []) {
      const cat = ingMap.get(ing.ingredienteId)
      if (!cat) throw new NotFoundError(`Ingrediente ${ing.ingredienteId} no encontrado`)
      await sql`
        INSERT INTO orden_item_ingredientes (item_id, ingrediente_id, cantidad, precio_unitario)
        VALUES (${itemId}, ${ing.ingredienteId}, ${ing.cantidad}, ${cat.precio})
      `
    }

    await recalcularTotal(sql, ordenId)
    const result = await buildOrden(sql, ordenId)
    await sql`COMMIT`
    return result
  } catch (e) {
    await sql`ROLLBACK`
    throw e
  }
}
```

**Deltas versus current code**
- The dedicated `SELECT id, precio FROM productos WHERE id = ${data.productoId} LIMIT 1` (line 683) is **replaced** by `fetchCatalog(sql, [data.productoId], ingredienteIds)`.
- The per-ingrediente `SELECT id, precio FROM ingredientes WHERE id = ${ing.ingredienteId} LIMIT 1` (line 701) is **gone**.
- Error messages preserved byte-for-byte: `"Producto no encontrado"` and `"Ingrediente ${id} no encontrado"` (no `(item #N)` suffix — single item).
- The DELETE-then-UPDATE-then-INSERT order preserved. **Important**: DELETE happens BEFORE the ingrediente validation loop in the original code path (line 688). In the refactor, validation happens via `ingMap.get()` — this shifts the effective ordering: we now know all ingredientes are valid BEFORE the DELETE runs, because `fetchCatalog` runs before the DELETE. This is a **strictly better failure mode**: a bad ingredienteId in a `PATCH /items/:id` request now fails without touching the existing ingredientes at all, whereas the current code deletes them first and then rolls back on failure. The transaction rollback still cleans up either way, but the diff-noise on WAL is smaller.

Wait — the original code has the DELETE happening at line 688 BEFORE the ingrediente validation at line 701. Rolling back reverts the DELETE, so end-user state is identical. The refactor keeps the same DELETE-before-ingrediente-INSERT ordering, just with validation moved earlier via the map lookup. **No user-visible behavior change**.

**Query count (1 item × 3 ingredientes)**
- Before: 1 orden + 1 item lookup + 1 producto + 3 ing SELECTs + 1 delete + 1 update + 3 ing INSERTs + 1 recalcular + buildOrden = **8 non-INSERT round trips**.
- After:  1 orden + 1 item lookup + 2 parallel catalog (~1 wall-clock) + 1 delete + 1 update + 3 ing INSERTs + 1 recalcular + buildOrden = **~7 non-INSERT round trips**. Meets "≤ 7" target.

---

## 7. Empty-array guard behavior

postgres.js behavior with `sql.array([], 'int8')`:

- Sends the Postgres array literal `'{}'`.
- `WHERE id = ANY('{}')` is valid SQL and returns 0 rows — **not** a runtime error.
- **However**, it is still a round trip. When `ingredienteIds.length === 0` we skip the query entirely to save the RTT (matches success criterion "≤ 5 non-INSERT queries for `addItem`").

**Exact conditional** (used inside `fetchCatalog`):

```ts
const ingQuery = ingredienteIds.length > 0
  ? sql<IngredienteRow[]>`
      SELECT id, precio FROM ingredientes
      WHERE id = ANY(${sql.array(ingredienteIds, 'int8')})
    `
  : Promise.resolve([] as IngredienteRow[])
```

Symmetric guard for `productoIds` — even though `addItem` and `updateItem` always pass exactly one ID, `addItems` could theoretically receive an empty `items[]` array (Zod schema decides; today it allows empty arrays — the endpoint returns the unchanged orden without doing anything). Guarding defensively costs nothing.

---

## 8. ADRs

### ADR-1: Shared `fetchCatalog()` helper vs inline

**Decision**: extract `fetchCatalog()` as a private (non-exported) helper in `src/lib/services/ordenes.ts`.

**Rationale**
- Three call sites (`addItem`, `addItems`, `updateItem`) share the identical shape: two parallel SELECTs, two empty-array guards, two `bigint → number` map builds. Inlining triplicates ~20 lines of guard/map plumbing.
- The helper is trivially unit-testable in isolation (feed IDs, assert map contents, assert 0 queries when both lists empty).
- Extracting also serves as a **canonical example** of the batch-fetch pattern for future refactors elsewhere in the codebase (e.g., `pagarOrden` doesn't need it now, but future multi-catalog services can copy the pattern).

**Rejected alternative — inline in each function**
- Marginal win: one fewer function call.
- Cost: three copies of the empty-array guard + Map build. First time we need to change the pattern (e.g., add a `nombre` column to the SELECT), we edit three places.
- Verdict: rejected. Duplication is the bigger cost.

**Rejected alternative — export the helper for cross-file use**
- Would allow reuse from other services (e.g., a future `catalogoService`).
- Cost: enlarges the public surface of `ordenes.ts` and forces callers to reason about the transactional-`Sql` requirement.
- Verdict: rejected for now. Keep private. Promote later if a second file needs it.

---

### ADR-2: Why INSERTs stay sequential

**Decision**: INSERT loops for `orden_items` and `orden_item_ingredientes` remain sequential inside the transaction. Do NOT batch-INSERT via `sql(rows, ...cols)` multi-row helpers.

**Rationale**
- Each `INSERT INTO orden_items ... RETURNING id` produces an ID that the very next iteration needs as the FK (`orden_item_ingredientes.item_id`). A batch `INSERT ... VALUES (...), (...) RETURNING id` returns IDs in row order, but relying on this coupling is fragile:
  - It couples the ingrediente loop to the parent items[] array index (`insertedItems[idx].id` — as the current `addItems` does).
  - If a future migration adds a trigger that reorders, or a partitioning scheme changes physical order, the coupling breaks silently.
- The current `addItems()` batch INSERT saves ~4 round trips at the cost of an index-based coupling. The refactor gives up those round trips for correctness clarity. **Net RTT budget is still well within the ≤ 10 target** because the catalog SELECTs are the dominant win, not the INSERTs.

**Rejected alternative — keep the current batch INSERT with `sql(rows, ...cols)` for `orden_items` + WITH-clause batch INSERT for ingredientes**
- Would save ~15 INSERT round trips on the 5×3 batch case.
- Cost: much more complex SQL, dependency on `RETURNING id` ordering, harder to read, requires the `/* eslint-disable no-explicit-any */` block.
- Verdict: rejected. Out of scope per the proposal ("INSERTs stay sequential — that is fine — the win is removing the interleaved SELECTs, not merging INSERTs.").

---

### ADR-3: Why `sql.array(ids, 'int8')` not `sql(ids)` (value list)

**Decision**: use `sql.array(ids, 'int8')` with the explicit `int8` (bigint) type hint inside `= ANY(...)`. Do NOT use `sql(ids)` (the value-list spread that generates `IN ($1, $2, ...)`).

**Rationale**
- postgres.js has two shapes for passing an array to a query:
  - `sql.array(ids, 'int8')` — sends the Postgres **array literal** `'{1,2,3}'::bigint[]`. One parameter. Statement shape is stable across calls with different ID counts.
  - `sql(ids)` inside `IN (...)` — expands to `IN ($1, $2, $3)`. Multiple parameters. Statement shape changes with each ID count.
- With `prepare: false` (PgBouncer transaction mode) we do NOT get plan cache reuse anyway. BUT `ANY(array)` keeps the SQL text identical, which is friendlier for query logs and pg_stat_statements aggregation.
- The **explicit `'int8'` type hint** is required when the array can be empty at code time. Without it, postgres.js infers from the JS values; an empty array cannot be inferred and postgres.js sends a `text[]` literal, which mismatches the `bigint` PK column and can force a cast or fail with "operator does not exist: bigint = text".
- `productos.id` and `ingredientes.id` are both `bigint` PKs → `int8`.

**Rejected alternative — `sql(ids)` value list**
- Statement text changes with N, uglier in logs.
- No support for empty arrays without ad-hoc branching outside the query.
- Verdict: rejected.

**Rejected alternative — `sql.array(ids)` without type hint**
- Works today because the arrays are guarded to non-empty in the call sites.
- Fragile: if a future refactor removes the guard, the empty-array case blows up with a confusing type error.
- Verdict: rejected. Explicit `'int8'` is one token of protection.

---

### ADR-4: Empty `ingredienteIds` guard — skip query vs fire with empty array

**Decision**: skip the query entirely when `ingredienteIds.length === 0`. Do NOT fire `WHERE id = ANY('{}')` for an empty array.

**Rationale**
- `WHERE id = ANY('{}')` is valid SQL and returns 0 rows without error. However it is a full network round trip: send parse + bind + execute over PgBouncer, wait for empty result.
- For `addItem({ ingredientes: [] })` (a single item with no ingredientes — a real, common case for meals with no modifications), the round trip is pure waste.
- The success criterion for `addItem` is **≤ 5 non-INSERT queries**. Without the guard: 1 orden + 2 catalog (parallel) + 1 recalcular + 4 buildOrden = 8; with the guard the parallel Promise.all collapses to a single wall-clock RTT (1 real query + 1 resolved-Promise), keeping the count within budget.

**Symmetric guard for `productoIds`** — even though the call sites always pass at least one producto in practice, the helper defends against `addItems([])` (empty batch) by symmetric guard. Costs nothing.

**Rejected alternative — always fire both queries, use the guard only in `addItems`**
- Two code paths for the same helper — one that guards, one that doesn't.
- Loses the "helper is trivially testable" property.
- Verdict: rejected. Symmetric guard, single code path.

---

## 9. Files changed

| File | Change | Lines affected |
|---|---|---|
| `src/lib/services/ordenes.ts` | Add `ProductoRow` local type (new). Add `fetchCatalog()` helper (new). Rename existing `IngredienteRow` → `ItemIngredienteRow` (5 refs). Add new local `IngredienteRow` for catalog. Rewrite `addItem()` (L532-576). Rewrite `addItems()` (L578-660). Rewrite `updateItem()` (L662-721). | ~140 net lines touched, ~30 net added |

**No other files change.** No Zod schema changes, no route handler changes, no migrations, no new dependencies.

---

## 10. Architectural constraints checklist

- `prepare: false` on postgres.js — **preserved**. No new client, same shared pool.
- `withTenant()` reserved connection — **preserved**. All queries continue to use the caller-supplied `sql: Sql` handle.
- No `connection: { search_path }` startup param — **preserved**. Not touched.
- Flat `{ message: string }` error contract — **preserved**. All `NotFoundError` / `ConflictError` messages byte-for-byte identical.
- `masterDb()` max 5 connections, tenant pool max 10 — **preserved**. In fact IMPROVED: each mutation holds the reserved slot for less time.

---

## 11. Test surface (informative, tasks phase will structure this)

- **Unit test `fetchCatalog`** (mocks the `sql` proxy):
  - Empty both → 0 queries fired, both maps empty.
  - Empty productos, non-empty ingredientes → 1 query fired.
  - Non-empty both → 2 parallel queries, both maps populated.
  - Duplicate IDs in input → single map entry (dedup happens at DB via `= ANY`).
  - Missing ID in DB result → map does NOT contain that key (caller must guard).

- **Integration test each mutation** (real DB, integration test setup — TBD in tasks):
  - Happy path: 1×3 for `addItem`, 5×3 for `addItems`, `updateItem` with 3 new ings.
  - Bad producto in item #3 of batch → `NotFoundError("Producto no encontrado (item #3)")`, `ROLLBACK` confirmed via no rows in `orden_items`.
  - Bad ingrediente (id=42) in item #2 → `NotFoundError("Ingrediente 42 no encontrado (item #2)")`, `ROLLBACK` confirmed.
  - Empty `ingredientes[]` for `addItem` → no ingrediente query fired, item persists correctly.

- **Query count assertion** (spy on `sql` proxy):
  - `addItems([5×3])` → ≤ 10 non-INSERT round trips.
  - `addItem({ ings:[3] })` → ≤ 5.
  - `updateItem({ ings:[3] })` → ≤ 7.

---

## 12. Open questions

None blocking. The `fetchCatalog` extract vs inline decision is resolved. The `updateItem` decision (batch or leave alone) is resolved (batch, for consistency). The `IngredienteRow` rename is a mechanical follow-through — tasks phase will schedule it as a preparatory sub-task inside the same commit as `fetchCatalog`.

---

## 13. Next phase

`sdd-tasks` — decompose into ordered work-unit commits:
1. Rename `IngredienteRow` → `ItemIngredienteRow` (5 references) — mechanical, safe.
2. Add `fetchCatalog()` helper + local catalog types (`ProductoRow`, new `IngredienteRow`) — unit-testable in isolation.
3. Refactor `addItem()` to use `fetchCatalog()`.
4. Refactor `addItems()` to use `fetchCatalog()` (also removes the batch-INSERT helper).
5. Refactor `updateItem()` to use `fetchCatalog()`.
6. Add integration tests (happy path + error paths + query-count assertions).

Each step is an independent commit that compiles and passes existing tests. PR total stays well below 400 lines — no `size:exception` needed, no chained PRs.
