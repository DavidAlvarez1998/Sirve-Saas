# Proposal: Performance — Orden Query Parallelization + Missing Indexes

## Intent

Every mesero mutation on an order (create, add item, update item, remove item, split, pay, change status) ends with a call to `buildOrden(sql, id)` to return the fresh state. Today `buildOrden()` fires **4 sequential DB queries** (orden header, items, ingredients, pagos) — 3 of which are fully independent — and the underlying tables have **zero indexes on the FK columns used by those queries**, so every one of them is a full sequential scan on the tenant schema.

Symptoms today:
- Every mutation pays 4 sequential round trips on the response path, on top of whatever the mutation itself did.
- With production latency to Supabase (single-digit-to-tens of ms per round trip) and no index support, even trivial actions like "cambiar estado" feel sluggish. The problem compounds under any moderate concurrent load because sequential scans hold `orden_items` and `orden_item_ingredientes` pages in the buffer cache while other tenants are also scanning them.
- `getPendientes()` / `getFinalizadas()` in `cocina.ts` already parallelize `buildOrden()` per row, which means the pain is multiplied N times per kitchen refresh.

Why now: two other performance issues (`addItems()` N+1 and the correlated subquery in `recalcularTotal()`) came up in exploration but they are strictly larger changes. Parallelizing `buildOrden()` and adding the 5 missing FK indexes is a **surgical, safe, high-leverage** first step that unblocks the rest and is verifiable in isolation.

Success looks like:
- `buildOrden()` fires 2 sequential round trips per call (header, then the 3 dependents in parallel) instead of 4.
- The 5 hot FK columns are indexed so every buildOrden query is an `Index Scan` / `Bitmap Index Scan`, not a `Seq Scan`, on `EXPLAIN ANALYZE`.
- No behavioral change — same rows returned, same shape, same order.

## Scope

### In Scope

**Fix 1 — Parallelize `buildOrden()` in `src/lib/services/ordenes.ts`:**
- Keep query 5a (orden + mesa header) as the first `await` — it is the existence check that throws `NotFoundError` before any dependent work.
- Wrap the three independent queries (items+productos, ingredientes, pagos) in a single `Promise.all([...])`.
- No signature change, no call-site change, no transaction-boundary change.

**Fix 2 — Add 5 missing FK indexes in a new migration:**
- `supabase/migrations/<timestamp>_perf_orden_indexes.sql`
- Indexes:
  - `idx_ordenes_mesa_id` on `ordenes(mesa_id)`
  - `idx_ordenes_estado_pagada` on `ordenes(estado, pagada)`
  - `idx_orden_items_orden_id` on `orden_items(orden_id)`
  - `idx_orden_item_ingredientes_item_id` on `orden_item_ingredientes(item_id)`
  - `idx_pagos_orden_id` on `pagos(orden_id)`
- All indexes created with `CREATE INDEX CONCURRENTLY IF NOT EXISTS` so the migration is safe to run on live Supabase without locking writers.
- The migration MUST be applied per tenant schema (loop over `master.tenants.slug` in the migration script) because tables live under `tenant_{slug}`, not `public`.

### Out of Scope
- Fixing the N+1 in `addItems()`, `addItem()`, `updateItem()`, `separarItem()`, `dividirOrden()` (batch `WHERE id = ANY($1::bigint[])` fetch) — separate SDD change.
- Refactoring `recalcularTotal()` correlated subquery — separate SDD change.
- Rewriting `getOrdenes()` / `getHistorial()` — already batched, not on the critical path per mutation.
- Adding a materialized `ordenes.total_monto` trigger — bigger change, requires migration + trigger tests.
- Any pool-size, PgBouncer, or Supabase infra tuning.
- Instrumentation / OpenTelemetry — nice to have but out of this change.

## Capabilities

### New Capabilities
- None (this is a performance fix; observable behavior is unchanged).

### Modified Capabilities
- None (no spec-level flow change).

## Approach

### Fix 1 — Parallelization inside a reserved connection

The exploration flagged a real concern: is `Promise.all()` safe on the reserved `sql` handle returned by `withTenant()`? Reasoning through it against `src/lib/db.ts` and `src/lib/services/*`:

- `withTenant(slug, fn)` calls `tenantPool().reserve()`, sets `search_path`, and passes ONE reserved connection into `fn`. All queries `fn` runs share that connection.
- `postgres.js` (v3.4+) supports **query pipelining on a single connection**: multiple queries can be sent back-to-back without waiting for the prior response, and results are correlated by order. This means `Promise.all([sql\`q1\`, sql\`q2\`, sql\`q3\`])` on the same reserved connection does NOT execute in true CPU-parallel on the server, but it DOES eliminate the inter-query round-trip latency because the client sends all three requests immediately and the server processes them sequentially without waiting for the client after each.
- **Empirical confirmation in this codebase**: `src/lib/services/cocina.ts` already uses `Promise.all(rows.map(r => buildOrden(sql, Number(r.id))))` on the same reserved connection and it works in production. That is the exact pattern we would apply inside `buildOrden` itself.
- Every mutation call site calls `buildOrden(sql, id)` **inside** a `BEGIN/COMMIT` block. This is fine — pipelining works inside a transaction because the server keeps the transaction open on the same connection; it just executes the three queued statements one after another before COMMIT. There is no risk of one of the three dependent queries running on a different connection (which WOULD be a correctness bug — it would not see the uncommitted writes).

**Decision: Option A (from the prompt's decision tree).** Use `Promise.all()` on the reserved `sql`. Do NOT move `buildOrden()` outside the transaction — mutation semantics require it to observe the just-written rows. Do NOT open extra connections in parallel — that would break transactional visibility. The win comes from eliminating client↔server round-trip latency, not from server-side parallelism.

**Expected saving per mutation:** 2 fewer client round trips. In practice, that is roughly `2 × RTT_to_Supabase`. On a Vercel↔Supabase link that is 10–40 ms per RTT, so ~20–80 ms shaved off every mutation. The saving compounds in `cocina.ts` (N orders × 2 RTT saved each).

### Fix 2 — CONCURRENT index creation per tenant

- `CREATE INDEX CONCURRENTLY` on Postgres does not require an `ACCESS EXCLUSIVE` lock; it uses `SHARE UPDATE EXCLUSIVE` and does two full table scans in the background. Safe on live tables under load.
- `CONCURRENTLY` cannot run inside a transaction block, so the migration must be a plain script (not wrapped in `BEGIN/COMMIT`).
- Because we are schema-per-tenant, the migration script iterates `master.tenants.slug`, sets `search_path`, and runs each `CREATE INDEX CONCURRENTLY IF NOT EXISTS` — idempotent by design so a partial run can be re-attempted.
- No downtime, no data change, no application code depends on the index existing (queries are semantically identical before and after).

### Why this order (indexes AND parallelization together, not separately)

Parallelization without indexes still helps client-side latency but leaves the server doing 3 sequential scans in one pipeline burst — under load the DB CPU becomes the bottleneck. Indexes without parallelization keeps 4 client round trips. Shipping both in one change gives the full end-to-end win and there is no reason to stage them separately — they touch different layers (SQL migration vs TS service) and have independent rollback paths.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/services/ordenes.ts` | Modified | `buildOrden()` — parallelize the 3 dependent queries with `Promise.all` |
| `supabase/migrations/<ts>_perf_orden_indexes.sql` | New | 5 `CREATE INDEX CONCURRENTLY IF NOT EXISTS` statements, applied per tenant schema |

No changes to route handlers, no changes to `withTenant()`, no changes to `db.ts`, no changes to `cocina.ts` (its existing `Promise.all(rows.map(...))` remains and now benefits from the child-level parallelism too).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `Promise.all()` on the reserved connection breaks visibility of uncommitted writes inside a transaction | Very low | postgres.js pipelines on the SAME connection — same tx snapshot. The `cocina.ts` precedent already runs this pattern in production. Verified by reading `src/lib/db.ts` (`reserve()` returns one connection) and by testing pagarOrden path (mutation → parallel buildOrden must see the fresh `pagada=true`). |
| `Promise.all()` rejects on one of three queries and leaves the other two "orphaned" | Low | Inside the transaction, rejection propagates to the outer `try`, which triggers `ROLLBACK`. The other queries either completed harmlessly (they are SELECTs) or were queued and cancelled — either way no side effect. Same behavior as sequential today. |
| `CREATE INDEX CONCURRENTLY` fails mid-way and leaves an INVALID index | Medium | Use `IF NOT EXISTS`; after the migration, run `SELECT * FROM pg_index WHERE indisvalid = false` per tenant and re-run for any invalid entries. Add a smoke check step in the tasks phase. |
| Migration script forgets a newly-added tenant | Medium | The loop reads from `master.tenants` at run time so any tenant present when the script runs will be covered. Document in `tasks.md` that this migration must be re-run after any tenant provisioning that happened before it. |
| PgBouncer transaction-mode + reserved connection interaction with pipelined queries | Low | `withTenant()` already uses `reserve()` (session-scoped for the callback), which pins the underlying PgBouncer server connection for the duration. Pipelining rides on that same pinned server-side connection. `prepare: false` is unaffected. |
| Perceived win is smaller than expected because the DB is already fast on small tables | Low | Even in the small-table case, the 2 fewer round trips are pure client-side saving. Under load the indexes carry the bigger win. Both fixes stand on their own. |
| Multi-tenant isolation surface changed | None | No change to `withTenant()`, no change to schema resolution, no cross-tenant query introduced. |

## Rollback Plan

- **Code (Fix 1):** `git revert <commit>` — a single-function, ~10-line change in `ordenes.ts`. Sequential behavior restored.
- **Migration (Fix 2):** indexes are safe to keep on rollback (they only help), but if removal is required: `DROP INDEX CONCURRENTLY IF EXISTS idx_<name>` per tenant schema. No data loss possible from adding or dropping these indexes.
- Rollback of one fix does NOT require rollback of the other — they are independent.

## Dependencies

- None. No new libraries. No config changes. No `withTenant()` refactor. No coordination with other in-flight SDD changes.
- Requires operator to apply the SQL migration against Supabase manually (per project convention in `CLAUDE.md`).

## Success Criteria

- [ ] `buildOrden()` performs exactly 2 sequential awaits (the header query, then a single `Promise.all` for items + ingredients + pagos). Verified by reading the diff.
- [ ] All 5 indexes exist and are `indisvalid = true` in every tenant schema. Verified by a smoke query in the verify phase.
- [ ] `EXPLAIN ANALYZE` of the 3 dependent buildOrden queries shows `Index Scan` (or `Bitmap Index Scan`) on the FK columns, not `Seq Scan`.
- [ ] No functional regression: mesero create → add item → pay → change estado flow returns the same JSON shape and the same values as before. Verified by exercising the flow.
- [ ] `tsc --noEmit` passes. `next build` passes with zero new warnings.
- [ ] The mutation payload latency for `POST /api/ordenes/:id/items` measurably drops (documented in the archive report — nice-to-have, not a hard gate).

## Follow-up (out of this change — recorded for future SDDs)

1. **Fix the N+1 in `addItems()` / `addItem()` / `updateItem()`** — batch-fetch productos and ingredientes with `WHERE id = ANY($1::bigint[])`, keep an in-memory map keyed by id. Same fix for `separarItem()` and `dividirOrden()` per-item ingrediente fetches.
2. **Refactor `recalcularTotal()`** — either denormalize `orden_items.total_linea` via a generated column, or replace the correlated subquery with a single joined SUM. Consider a trigger-based `ordenes.total_monto` maintenance.
3. **Add per-service query-count assertions in a dev-only middleware** — prevents regressions of exactly this class of bug.
