# Design: orden-creation-perf

## Overview

Performance refactor of the order-mutation hot path. No public contract changes: response shapes, HTTP status codes, error shapes, and business rules stay identical to what `spec.md` locks in. This document specifies the HOW at architectural level; task decomposition belongs to `tasks.md`.

Three phases are already partially applied in the working tree; this design confirms what is in place, closes the gaps, and locks in the exact query shapes for the remaining work.

---

## Current-State Audit (verified against HEAD)

Verified reading `src/lib/services/ordenes.ts`, `src/app/api/ordenes/route.ts`, `src/app/api/ordenes/[id]/items/batch/route.ts`, and `supabase/migrations/20260804120000_add_perf_indexes.sql`:

| Phase | Item | Status |
|-------|------|--------|
| 1 | `broadcastOrden` un-awaited in `POST /api/ordenes` | Already applied (line 41 has no `await`) |
| 1 | `broadcastOrden` un-awaited in `POST /api/ordenes/[id]/items/batch` | Already applied (line 31 has no `await`) |
| 1 | `buildOrden` queries b/c/d in `Promise.all` | Already applied (lines 208–231) |
| 2 | Perf indexes migration file exists | Yes — `20260804120000_add_perf_indexes.sql` |
| 2 | Migration applied to production DB | Unverified — manual smoke required |
| 3 | `addItems` batch rewrite | NOT applied — still per-item sequential SELECT + INSERT loop (lines 578–627) |

Design implication: only Phase 3 requires new code. Phases 1 and 2 remain in the design for traceability but the task list should reflect that Phase 1 code work is a **verify + polish** step, not a rewrite.

---

## Architecture Approach

Service-layer refactor. No new layers, no new modules, no new dependencies. All changes are confined to the existing pattern:

- **Route handler** (thin): validate → call service → broadcast → return.
- **Service function** (pure over `Sql`): open transaction, execute queries, return domain object.
- **`withTenant(slug, fn)`** owns connection reservation and search_path.

The single architectural principle at play is **query minimization inside the transaction**: shrink round-trips from `O(N + N*M)` to `O(1)` per class of work (validate producto, validate ingrediente, insert items, insert item ingredientes). The transactional boundary and the domain shape are unchanged, so the surface area of risk is only inside `addItems()`.

### Why not a stored procedure / RPC?

Rejected. Reasons: (1) service code already lives in TS and is testable in isolation; (2) new `provision_tenant` schema requirements would multiply for every future rename; (3) `postgres.js` batch helpers already give us the multi-row insert we need. A procedure would trade one problem (round-trips) for a worse one (schema drift across tenants).

### Why not batch INSERT via a single VALUES + RETURNING for items + ingredientes together?

Rejected. `orden_item_ingredientes.item_id` FK is only known after `orden_items` returns generated IDs. Splitting into two batch inserts (items first, ingredientes second, joined in TS by array index) is straightforward and safe. A single-shot CTE `WITH inserted_items AS (INSERT ... RETURNING id) INSERT INTO orden_item_ingredientes SELECT ...` would require encoding the item→ingrediente mapping inside SQL — high complexity, low payoff (one RTT saved), harder to read. Not worth it.

---

## Component Map

```
┌───────────────────────────────────────────────────────────────────────┐
│ POST /api/ordenes/[id]/items/batch (Route Handler)                    │
│   validate body (Zod) → withTenant(slug, sql => addItems(sql, ...))   │
│   → broadcastOrden(...) [fire-and-forget]                             │
└─────────────────────────────┬─────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────┐
│ OrdenService.addItems(sql, ordenId, items[])                          │
│   BEGIN                                                               │
│     1. SELECT orden (guard: exists, not PAGADA/CANCELADA)             │
│     2. SELECT productos WHERE id = ANY($productoIds)  ← BATCH         │
│     3. SELECT ingredientes WHERE id = ANY($ingredienteIds) ← BATCH    │
│     4. Validate all IDs present → throw NotFoundError if any missing  │
│     5. INSERT INTO orden_items ... VALUES (...), (...), ... RETURNING id ← BATCH │
│     6. INSERT INTO orden_item_ingredientes ... VALUES (...) ← BATCH   │
│     7. recalcularTotal(sql, ordenId)                                  │
│     8. buildOrden(sql, ordenId) ← already parallelized                │
│   COMMIT                                                              │
└───────────────────────────────────────────────────────────────────────┘
```

Query budget per `addItems` call (target): **6 queries** (guard + 2 batch selects + 2 batch inserts + recalcularTotal) + `buildOrden` (which itself is 1 sequential + 3 parallel = 4 RTTs).

Previous budget: `2 + N*(2 + 2M)` — e.g. 5 items × 3 ingredientes = 40 queries. New budget: 6 queries. Constant, independent of N and M.

---

## Data Flow

### Phase 1 (already applied — documentation only)

**Before/After in routes:**

`src/app/api/ordenes/route.ts:41` and `src/app/api/ordenes/[id]/items/batch/route.ts:31` — both already read:

```typescript
broadcastOrden(tenantSlug, { tipo: 'CREADA', ordenId: orden.id, estado: orden.estado, pagada: orden.pagada })
```

No `await`. `broadcastOrden` already has an internal `try/catch` (`src/lib/realtime.ts:6–14`) that swallows errors and logs them — so no unhandled-rejection risk. No `.catch()` needed at call site.

**Before/After in `buildOrden`:**

`src/lib/services/ordenes.ts:208–231` — already reads:

```typescript
const [itemRows, ingRows, pagoRows] = await Promise.all([
  sql<ItemRow[]>`SELECT oi.id, ... FROM orden_items oi JOIN productos p ...`,
  sql<IngredienteRow[]>`SELECT oii.id, ... FROM orden_item_ingredientes oii JOIN ingredientes ing ...`,
  sql<PagoRow[]>`SELECT id, orden_id, ... FROM pagos WHERE orden_id = ${id} ORDER BY id`,
])
```

Assembly logic (lines 233–244) is unchanged and produces the same `Orden` shape.

Task list should treat Phase 1 as a **verify** step (grep for accidental `await broadcastOrden` regressions; confirm `Promise.all` still present) rather than a rewrite.

### Phase 2 (manual operation — no code change)

Migration `supabase/migrations/20260804120000_add_perf_indexes.sql` already exists and covers the 5 indexes across every active tenant via `\gexec` iteration on `master.tenants`. Design decisions:

- Keep `CREATE INDEX CONCURRENTLY IF NOT EXISTS`. The "no CONCURRENTLY" concern in the earlier proposal draft applied to runtime PgBouncer traffic, not to a direct-psql migration. CONCURRENTLY is preferred here to avoid write locks on live tenant tables.
- Run outside `--single-transaction` (`CREATE INDEX CONCURRENTLY` cannot run inside a transaction block — PG25001).
- Idempotency: `IF NOT EXISTS` on every index — safe to re-run after adding tenants.
- Follow-up (out of scope for this change): update `provision_tenant()` in `master` schema so newly provisioned tenants ship with these indexes.

Verification query (kept in the migration file, lines 39–45) confirms `indisvalid = true` for all 5 index name patterns.

### Phase 3 — `addItems` batch rewrite (NEW CODE)

The complete flow, with exact `postgres.js` syntax. All identifier types are `bigint` in DB; TS surfaces them as `number` via `Number(...)`.

#### Step 0: Guard clause (unchanged)

```typescript
const ordenRows = await sql<OrdenRow[]>`
  SELECT id, estado, pagada FROM ordenes WHERE id = ${ordenId} LIMIT 1
`
if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
if (ordenRows[0].estado === 'PAGADA' || ordenRows[0].estado === 'CANCELADA') {
  throw new ConflictError('No se puede modificar una orden pagada o cancelada')
}
```

Early return when `items.length === 0` is not required — Zod schema (`AddItemsBatchSchema`) already enforces `min(1)`.

#### Step 1: Batch validate productos

```typescript
const productoIds = [...new Set(items.map(i => i.productoId))]
const prodRows = await sql<{ id: bigint; precio: string }[]>`
  SELECT id, precio FROM productos WHERE id IN ${sql(productoIds)}
`
const prodMap = new Map(prodRows.map(r => [Number(r.id), r.precio]))
for (let i = 0; i < items.length; i++) {
  if (!prodMap.has(items[i].productoId)) {
    throw new NotFoundError(`Producto no encontrado (item #${i + 1})`)
  }
}
```

**postgres.js syntax note:** `WHERE id IN ${sql(array)}` is the officially supported dynamic-IN form. `WHERE id = ANY(${array})` also works and is equally acceptable — both parameterize the array safely. We standardize on `IN ${sql(...)}` because it reads more naturally alongside the batch-insert helper used in step 3.

`Set` dedup avoids sending duplicate IDs when the caller passes several identical `productoId` items. Error message keeps `(item #N)` label parity with the current per-item errors so no client-side change is required.

#### Step 2: Batch validate ingredientes

```typescript
const allIngIds = items.flatMap(i => (i.ingredientes ?? []).map(ing => ing.ingredienteId))
const uniqueIngIds = [...new Set(allIngIds)]
let ingMap = new Map<number, string>()
if (uniqueIngIds.length > 0) {
  const ingRows = await sql<{ id: bigint; precio: string }[]>`
    SELECT id, precio FROM ingredientes WHERE id IN ${sql(uniqueIngIds)}
  `
  ingMap = new Map(ingRows.map(r => [Number(r.id), r.precio]))
  for (let i = 0; i < items.length; i++) {
    for (const ing of items[i].ingredientes ?? []) {
      if (!ingMap.has(ing.ingredienteId)) {
        throw new NotFoundError(`Ingrediente ${ing.ingredienteId} no encontrado (item #${i + 1})`)
      }
    }
  }
}
```

Skip the query entirely when no items have ingredientes.

#### Step 3: Batch INSERT `orden_items` (single VALUES with RETURNING)

```typescript
const itemRows = items.map(item => ({
  orden_id: ordenId,
  producto_id: item.productoId,
  cantidad: item.cantidad,
  precio_unitario: prodMap.get(item.productoId)!,
  notas: item.notas ?? null,
}))

const insertedItems = await sql<{ id: bigint }[]>`
  INSERT INTO orden_items ${sql(itemRows, 'orden_id', 'producto_id', 'cantidad', 'precio_unitario', 'notas')}
  RETURNING id
`
```

**postgres.js syntax note:** `sql(array, ...columnKeys)` is the documented helper that expands a JS array of objects into a multi-row `VALUES (...), (...), ...` clause with parameters, in the exact column order given. Column order in `RETURNING id` is preserved by insert order, so `insertedItems[k].id` corresponds to `items[k]`. This ordering guarantee is explicit in the PostgreSQL docs for multi-row VALUES + RETURNING and is what makes step 4 correct without a secondary join.

#### Step 4: Batch INSERT `orden_item_ingredientes`

```typescript
const ingRows: Array<{
  item_id: number
  ingrediente_id: number
  cantidad: number
  precio_unitario: string
}> = []
for (let k = 0; k < items.length; k++) {
  const newItemId = Number(insertedItems[k].id)
  for (const ing of items[k].ingredientes ?? []) {
    ingRows.push({
      item_id: newItemId,
      ingrediente_id: ing.ingredienteId,
      cantidad: ing.cantidad,
      precio_unitario: ingMap.get(ing.ingredienteId)!,
    })
  }
}

if (ingRows.length > 0) {
  await sql`
    INSERT INTO orden_item_ingredientes ${sql(ingRows, 'item_id', 'ingrediente_id', 'cantidad', 'precio_unitario')}
  `
}
```

Guard on `ingRows.length > 0` avoids `INSERT ... VALUES ()` which is invalid SQL.

#### Step 5: `recalcularTotal` + `buildOrden` (unchanged)

```typescript
await recalcularTotal(sql, ordenId)
const result = await buildOrden(sql, ordenId)
```

Both already exist and stay identical. `buildOrden` is already parallelized (Phase 1 done).

Transaction commit / rollback wrapper (already present) is unchanged.

---

## ADRs

### ADR-1: Fire-and-forget broadcast (no `.catch()` at call site)

- **Decision:** Call `broadcastOrden(...)` without `await` and without a trailing `.catch()`.
- **Rationale:** `broadcastOrden` wraps its Supabase call in `try/catch` and logs errors. A trailing `.catch()` at call site would be dead code because the internal try/catch already returns a resolved Promise. No unhandled-rejection risk.
- **Rejected alternative:** `void broadcastOrden(...).catch(err => console.error(err))` — adds noise, hides the intent, and never fires.
- **Trade-off:** Errors are logged server-side but never surface to the client. Acceptable per proposal's CT-004 — realtime is best-effort; the HTTP response is source of truth.

### ADR-2: `Promise.all` for buildOrden b/c/d only, not a/b/c/d

- **Decision:** Run query (a) SELECT orden first, then queries b/c/d in parallel.
- **Rationale:** Query (a) must run first to throw `NotFoundError` before wasting work on b/c/d. If (a) misses, b/c/d return empty arrays anyway but we still consume 3 pool connections for nothing.
- **Rejected alternative:** All 4 in a single `Promise.all` — measurably worse under connection pressure, and the `NotFoundError` path becomes more expensive.

### ADR-3: `postgres.js` batch helper (`sql(rows, ...cols)`) over template-string interpolation

- **Decision:** Use `INSERT INTO t ${sql(rows, 'col1', 'col2')}` for both batch inserts in `addItems`.
- **Rationale:** Officially supported, parameterizes every value (no injection risk), and produces a single multi-row `INSERT ... VALUES (...), (...), ...` statement. Column list is explicit — protects against object-key drift.
- **Rejected alternatives:**
  - Loop of single-row inserts inside a JS `for` — defeats the whole purpose of the refactor.
  - String concatenation of a VALUES tuple — SQL-injection surface, not idiomatic.
  - `INSERT ... SELECT * FROM json_populate_recordset(...)` — works but requires shipping a JSON blob and named types; overkill for 4-column tuples.

### ADR-4: Validate-all-before-insert (fail-fast) instead of INSERT-and-cleanup

- **Decision:** Run both batch SELECT validations BEFORE any INSERT. If any producto or ingrediente ID is missing, throw `NotFoundError` immediately.
- **Rationale:** The transaction wrapper rolls back on throw, so INSERT-then-error would work too. But (a) failing early avoids partial DB work under load, (b) the error message can name the offending item cleanly (`item #N`), (c) validating up front leaves the "insert" section as pure batch writes — no interleaved error handling.
- **Trade-off:** 2 extra round-trips (the batch SELECTs) even in the happy path. Compared to the current `N + N*M` round-trip cost, this is a rounding error.

### ADR-5: Split batch inserts (items first, then ingredientes) instead of CTE

- **Decision:** Two separate multi-row INSERTs, joined in TS by array index using the `RETURNING id` ordering guarantee.
- **Rationale:** Readable. Testable. `INSERT ... VALUES (...), (...) RETURNING id` preserves the row order of the VALUES clause per PostgreSQL semantics — no secondary lookup needed.
- **Rejected alternative:** A single `WITH inserted_items AS (...) INSERT INTO orden_item_ingredientes ...` CTE that carries the item↔ingrediente mapping via a JSON blob or `unnest()` arrays. Saves one RTT at the cost of a CTE that is hard to read and hard to modify. Not worth it.

### ADR-6: Keep `CREATE INDEX CONCURRENTLY` in the perf-indexes migration

- **Decision:** Migration continues to use `CREATE INDEX CONCURRENTLY IF NOT EXISTS`.
- **Rationale:** The migration runs via direct psql, not through PgBouncer. CONCURRENTLY avoids write locks on live tenant tables. `IF NOT EXISTS` keeps it idempotent for re-runs after tenant provisioning.
- **Constraint:** Must NOT use `--single-transaction`. `CREATE INDEX CONCURRENTLY` errors inside a transaction block with SQLSTATE PG25001. The migration file's header already warns about this.
- **Follow-up (out of scope):** Fold these 5 indexes into `provision_tenant()` so new tenants ship with them by default.

---

## Integration Points

| Consumer | Interaction | Change? |
|----------|-------------|---------|
| `POST /api/ordenes` | Calls `OrdenService.createOrden`; awaits result; fires broadcast without await. | No — already correct in HEAD. |
| `POST /api/ordenes/[id]/items/batch` | Calls `OrdenService.addItems`; awaits result; fires broadcast without await. | No — already correct in HEAD. Service signature and return shape unchanged. |
| `withTenant(slug, fn)` | Reserves a connection, applies `search_path`, runs fn inside. | No. Existing transactional semantics apply to the whole rewritten `addItems`. |
| Realtime subscribers (mesero UI) | Consume `orden_update` broadcast payload `{ tipo, ordenId, estado, pagada }`. | No — payload shape unchanged. |
| Migrations pipeline | Manual `psql -f 20260804120000_add_perf_indexes.sql`. | Verify applied in production. Idempotent — safe to re-run. |

Note: `addItem` (single-item variant, lines 532–576) is intentionally NOT refactored. It is used by other endpoints and its cost profile (2 SELECTs + N ingredient loops) is dominated by ingredient count, not item count. Batching it would duplicate the multi-row logic for marginal gain. Out of scope.

---

## Assumptions

- `orden_items.RETURNING id` returns rows in the same order as the VALUES tuples. This is PostgreSQL-documented behavior for multi-row `INSERT ... VALUES ... RETURNING`.
- `postgres.js` helper `sql(rows, ...cols)` parameterizes every value. Confirmed by library docs; the project already uses it elsewhere is worth spot-checking as a task.
- Zod schema `AddItemsBatchSchema` (`items.min(1).max(50)`) bounds the batch — no need to defend against unbounded input in the service.
- `prepare: false` on the postgres.js pool does not restrict `IN ${sql(...)}` or the batch insert helper — both work by inline parameter expansion, not prepared statements.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `RETURNING id` order not aligned with VALUES tuples | Low | Wrong ingredientes attached to wrong items — silent data corruption | Documented PG behavior; add a verify-report smoke test that creates a batch with N=3 items × distinct ingredientes and checks each item has its own ingredient. |
| Perf indexes not yet applied in production | Medium | Query plans use seq scans; refactor gains masked | Manual pre-check via `pg_indexes` on any tenant schema before merging. Runbook in migration file. |
| Ingredient batch INSERT executes empty array | Low | `INSERT INTO ... VALUES ()` syntax error | Guard `if (ingRows.length > 0)` before the insert. |
| Duplicate producto IDs in payload cause duplicate map entries | Low | None functionally; `Set` dedup already handles it | `[...new Set(...)]` before the SELECT. |
| Regression: someone adds `await` back to `broadcastOrden` | Low | Response latency spikes by the broadcast RTT | Add a lint-time grep in verify: `rg "await broadcastOrden" src/app/api` must return zero matches. |
| `withTenant` transaction rolled back after partial INSERT batch | Low | Data consistent — full rollback | Existing BEGIN/COMMIT/ROLLBACK wrapper handles this. Unchanged. |

---

## Success Criteria (mirrors proposal)

- Query count in `addItems(ordenId, items)` is bounded and independent of `N` and `M`: 6 queries + `buildOrden` (4 RTTs, of which 3 parallel).
- `broadcastOrden` is never awaited in either route (verified by grep).
- `buildOrden` continues to run b/c/d in `Promise.all`.
- All 5 perf indexes exist with `indisvalid = true` in every active tenant schema.
- `next build` and `next lint` pass.
- Response payload from `POST /api/ordenes/[id]/items/batch` with 3 items × 2 ingredientes is byte-identical to pre-refactor payload.

---

## Out-of-Scope (deferred)

- `recalcularTotal` in-memory rewrite (low impact, adds complexity).
- Refactoring `addItem` (single-item) to share code with `addItems`.
- Rolling the 5 indexes into `provision_tenant()` (separate change).
- Any `master.*` schema mutation.
