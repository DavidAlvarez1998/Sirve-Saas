# Proposal — `perf-n1-ordenes`

**Status**: proposed
**Owner**: David Alvarez
**Related exploration**: `perf-orden-queries`
**Artifact store**: hybrid (Engram `sdd/perf-n1-ordenes/proposal` + this file)

---

## 1. Intent

Eliminate the N+1 SELECT pattern in the order-item mutation paths of `src/lib/services/ordenes.ts`. Today, `addItem()`, `addItems()`, and `updateItem()` validate each `productoId` and each `ingredienteId` with an individual round trip to the database inside a `for` loop, all wrapped in a `BEGIN`/`COMMIT` transaction on a reserved PgBouncer connection.

**Why now**

- `addItems()` is the batch entry point invoked by the mesero flow when submitting a full order (up to ~50 items). For a realistic batch of 5 items × 3 ingredients each, the endpoint currently fires ~42 sequential queries before it can commit. Each of those queries is a full network round trip through PgBouncer (with `prepare: false`), so this is pure serialized latency.
- Because the loop lives inside a transaction on a reserved connection, every extra millisecond of round-trip time locks a scarce tenant pool slot (max 10). Under mesero peak load this is the most likely first bottleneck.
- All queries are already available in bulk form via `WHERE id = ANY($1::bigint[])`. The fix is mechanical, low risk, and preserves the transaction boundary. There is no reason to keep the N+1 shape.

**Success looks like**

- `addItems(5 items, 3 ingredientes each)` fires **≤ 10 queries** total (currently 42+).
- `addItem(1 item, 3 ingredientes)` fires **≤ 5 queries** total (currently 8+).
- `updateItem(1 item, 3 ingredientes)` fires **≤ 7 queries** total (currently 10+).
- Public API contract unchanged: same `Orden` payload shape, same `{ message: string }` error contract, same 1-based error labels (`"... (item #N)"`, `"Ingrediente X no encontrado ..."`).
- Same transactional guarantee: a bad product/ingrediente in any item still triggers a full `ROLLBACK`.

---

## 2. Scope

### In scope

- Refactor `addItems(sql, ordenId, items)` — the batch path, highest impact.
- Refactor `addItem(sql, ordenId, data)` — single-item path, same N+1 shape on the ingredientes loop.
- Refactor `updateItem(sql, ordenId, itemId, data)` — the ingredientes loop (lines 666–678) has the same N+1 pattern; the single `productoId` lookup stays as-is (only one product per call — batching a single row is not worth it).
- Introduce the batch-fetch pattern: collect all `productoId`s and `ingredienteId`s upfront → issue **two parallel** `WHERE id = ANY($1::bigint[])` queries via `Promise.all` → build `Map<number, Row>` lookups → keep the INSERT loop sequential inside the transaction.
- Preserve the flat `{ message: string }` error contract and the 1-based `(item #N)` labels.

### Out of scope

- Refactoring `updateItem()` to a single "replace ingredientes" bulk `INSERT ... SELECT` (that is a separate structural change; this proposal only removes the per-ingrediente SELECT).
- `removeItem()`, `separarItem()`, `dividirOrden()` — they do not have the same N+1 shape (they operate on rows already loaded, not on caller-supplied ID lists).
- `recalcularTotal()` refactor — the correlated subquery could be inlined into a single UPDATE, but that is a separate optimization and is already invoked only once per mutation.
- `getOrdenes()` / `getHistorial()` — already use the correct batch shape (`WHERE ... IN (SELECT ...)` + in-memory grouping).
- Adding new indexes or migrations. `productos.id` and `ingredientes.id` are primary keys — `= ANY(...)` already uses the PK index.
- Introducing a query builder, ORM, or `pg-promise` — plain postgres.js tagged templates stay.
- API schema / Zod changes. Endpoints and payloads are unchanged.

---

## 3. Approach

**Pattern**: fetch-then-loop.

1. Before entering the write loop, walk the input to collect the set of `productoId`s and the set of `ingredienteId`s (deduped via `Set`).
2. Issue **two parallel** SELECTs via `Promise.all` on the transactional connection:
   - `SELECT id, precio FROM productos WHERE id = ANY(${sql.array([...productoIds], 'int8')})`
   - `SELECT id, precio FROM ingredientes WHERE id = ANY(${sql.array([...ingredienteIds], 'int8')})` — **skipped entirely** when the set is empty (do not send a query with an empty array).
3. Build two `Map<number, { precio: string }>` lookups keyed by `Number(row.id)` (bigint → number is safe here — these are catalog IDs, not orden IDs).
4. Walk `items` again, this time only for **validation + INSERTs**:
   - `prodMap.get(item.productoId)` → if missing, throw `NotFoundError("Producto no encontrado (item #N)")` with 1-based label, matching the current message shape byte-for-byte.
   - `INSERT INTO orden_items ... RETURNING id` — unchanged.
   - For each ingrediente: `ingMap.get(ing.ingredienteId)` → if missing, throw `NotFoundError("Ingrediente X no encontrado (item #N)")`.
   - `INSERT INTO orden_item_ingredientes ...` — unchanged.
5. Everything remains inside the existing `BEGIN` / `COMMIT` / `ROLLBACK` block on the same `Sql` handle. No new connection reservation. No change to `withTenant()` usage upstream.

**Query count arithmetic**

| Function | Before (5 items × 3 ings) | After |
|---|---|---|
| `addItems` | 1 orden + 5 producto SELECTs + 5 item INSERTs + 15 ingrediente SELECTs + 15 ing INSERTs + 1 recalcular + N buildOrden = **42+** | 1 orden + 2 parallel batch SELECTs + 5 item INSERTs + 15 ing INSERTs + 1 recalcular + buildOrden = **~24 sequential steps, but only ~10 non-INSERT round trips** |
| `addItem` (3 ings) | 1 orden + 1 producto + 1 item + 3 ing SELECTs + 3 ing INSERTs + recalcular + buildOrden = **8+ before INSERTs** | 1 orden + 2 parallel batch SELECTs + 1 item INSERT + 3 ing INSERTs + recalcular + buildOrden = **~5 non-INSERT round trips** |
| `updateItem` (3 ings) | 1 orden + 1 item + 1 producto + 1 delete + 1 update + 3 ing SELECTs + 3 ing INSERTs + recalcular = **10+ before INSERTs** | 1 orden + 1 item + 1 producto + 1 batch ing SELECT + 1 delete + 1 update + 3 ing INSERTs + recalcular = **~7 non-INSERT round trips** |

The INSERTs stay sequential because each returns an `id` that the next iteration needs. That is fine — the win is removing the interleaved SELECTs, not merging INSERTs.

**Why `sql.array(..., 'int8')`**

- postgres.js requires an explicit type hint when the array can be empty at compile time; `int8` matches the `bigint` PK columns.
- `= ANY($1)` is planned as an index scan on the PK — same cost as the individual lookups, minus N-1 round trips.
- The alternative, `IN ($1, $2, ...)`, would inflate the SQL string per call. `ANY(array)` keeps the statement shape stable, which matters for pg planner cache locality even with `prepare: false`.

---

## 4. Risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Empty `ingredienteIds` set** — sending `WHERE id = ANY('{}')` returns zero rows correctly but wastes a round trip. | Guard: `ingredienteIds.size > 0 ? sql`...` : Promise.resolve([])`. Explicit branch, no query fired. |
| R2 | **Error-message drift** — callers/tests may match on the exact string `"Producto no encontrado"` / `"Ingrediente {id} no encontrado (item #N)"`. | Preserve the exact current messages byte-for-byte. Add tests that assert on the message strings. |
| R3 | **Transaction boundary** — batch SELECTs must run on the same reserved connection as the `BEGIN`. | Both queries continue to use the caller-provided `sql: Sql` handle, which is the reserved connection. No new `withTenant()` call, no `sql.begin()` refactor. |
| R4 | **Duplicate IDs in the same batch** — a client sending `productoId: 1` twice must still validate once. | `Set` dedup on the collect step. `Map.get()` handles the lookup uniformly. |
| R5 | **Row-count vs input-count mismatch** — the batch SELECT returns fewer rows than requested when an ID does not exist. | The validation loop already handles this: `prodMap.get(id)` returns `undefined`, we throw the same `NotFoundError` with the 1-based label. Detection happens on the first bad item, matching current fail-fast semantics. |
| R6 | **`bigint` → `number` conversion for map keys** — catalog IDs safely fit in `Number.MAX_SAFE_INTEGER`. | Explicit `Number(row.id)` on both the map key and the input `item.productoId` (already `number` from the Zod schema). Consistent with existing helpers (`toItem`, `toIngrediente`). |
| R7 | **`sql.array` type hint** — postgres.js can infer, but explicit `'int8'` is safer for the bigint PKs. | Use `sql.array(ids, 'int8')` and add a quick smoke test that the query plan uses the PK index (verified once, then trust the plan). |

**Open questions** — none blocking. The exploration already validated the fix shape and query counts.

---

## 5. Success criteria (measurable)

1. **Query count** — a unit/integration test that intercepts the postgres.js `sql` proxy asserts:
   - `addItems([5 items × 3 ings])` → ≤ 10 non-INSERT queries.
   - `addItem({ ingredientes: [3] })` → ≤ 5 non-INSERT queries.
   - `updateItem({ ingredientes: [3] })` → ≤ 7 non-INSERT queries.
2. **Contract parity** — existing route-handler tests (POST `/api/ordenes/:id/items`, PATCH `/api/ordenes/:id/items/:itemId`) still pass unchanged. Response payload identical.
3. **Error parity** — regression tests assert:
   - Bad `productoId` in the 3rd item of a batch → `NotFoundError("Producto no encontrado (item #3)")`.
   - Bad `ingredienteId` (id=42) in the 2nd item → `NotFoundError("Ingrediente 42 no encontrado (item #2)")`.
   - Both trigger `ROLLBACK` (assert via a "no rows inserted" check on `orden_items`).
4. **No regression on happy path** — full round-trip test of a 3-item order continues to return the correctly-populated `Orden` with items + ingredientes + total.

---

## 6. Delivery notes

- **Work-unit commits**: one commit per function (`addItems`, `addItem`, `updateItem`) plus one commit for the shared helper if extracted. Each commit compiles and passes tests standalone.
- **Branch/PR**: single PR, single approved issue link. Diff is small (~50 lines net removed, ~70 added). No `size:exception` needed.
- **Rollback**: pure refactor, no schema change, no data migration. `git revert` is sufficient if a regression appears.

---

## 7. Next phases

- `sdd-spec` — write behavioral spec for the three functions (inputs, error cases, query-count assertions).
- `sdd-design` — document the batch-fetch helper (whether to extract `fetchCatalog(sql, productoIds, ingredienteIds)` as a shared function or inline per call) and the exact SQL shape.
- Both can run in parallel; `sdd-tasks` consumes both.
