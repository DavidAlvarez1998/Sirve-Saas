# Proposal: orden-creation-perf

## Intent

Order creation and mutation endpoints (`POST /api/ordenes`, `POST /api/ordenes/[id]/items/batch`) are the hot path in a live restaurant. Current implementation adds Supabase realtime RTT to every HTTP response, runs `buildOrden()` as 4 sequential queries when 3 are independent, and issues O(N*M) queries in `addItems()` for N items with M ingredients each. Tenant tables also lack indexes on the FK/filter columns used by every list, active-order check, and order rebuild. Result: p95 latency on order mutations is dominated by avoidable network round trips and sequential scans that will only worsen as tenants accumulate orders.

## Scope

### In Scope
- Phase 1 — Fire-and-forget broadcast: stop awaiting `broadcastOrden()` in `src/app/api/ordenes/route.ts` and `src/app/api/ordenes/[id]/items/batch/route.ts` (errors already swallowed inside).
- Phase 1 — Parallelize `buildOrden()` queries b/c/d via `Promise.all()` (all three depend only on `ordenId`).
- Phase 2 — Migration adding 5 indexes across every tenant schema (see Migration Plan). Reconcile with pre-existing migration `20260804120000_add_perf_indexes.sql`.
- Phase 3 — Rewrite `addItems()` to batch-fetch productos + ingredientes upfront (validate all IDs), then batch-INSERT items and ingredientes with multi-row VALUES.

### Out of Scope
- Replacing `recalcularTotal()` with in-memory calculation (low impact, defer).
- `withTenant()` reserved-connection overhead (single RTT to PgBouncer, acceptable).
- Middleware JWT verify (in-memory, negligible).
- Any change to `master.*` schema.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- None. This is a pure performance/refactor change; endpoint contracts, response shapes, and business rules stay identical. No spec-level behavior change.

## Approach

Three phases delivered as a single PR (~110 lines total, under the 400-line budget). Phase 1 is mechanical: remove `await` from broadcast callers, wrap 3 `buildOrden()` queries in `Promise.all`. Phase 2 reconciles with the existing `20260804120000_add_perf_indexes.sql` — that migration already covers the same 5 indexes with `CREATE INDEX CONCURRENTLY IF NOT EXISTS` iterating `master.tenants` via `\gexec`. Decision needed (see Risks): keep the existing CONCURRENTLY migration OR replace it with a non-CONCURRENTLY variant. Phase 3 restructures `addItems()`: pre-load all productos and ingredientes by ID in two queries (`WHERE id = ANY($1)`), validate all references, then issue one multi-row `INSERT ... VALUES (...), (...)` for items and one for ingredientes using `unnest()` or a VALUES list.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/services/ordenes.ts` | Modified | Parallelize `buildOrden()` (Phase 1). Rewrite `addItems()` — batch fetch + batch insert (Phase 3). |
| `src/app/api/ordenes/route.ts` | Modified | Drop `await` on `broadcastOrden()` call (Phase 1). |
| `src/app/api/ordenes/[id]/items/batch/route.ts` | Modified | Drop `await` on `broadcastOrden()` call (Phase 1). |
| `supabase/migrations/20260804120000_add_perf_indexes.sql` | Reconcile | Existing migration already targets these 5 indexes across all tenants. Verify applied; keep as source of truth OR supersede. |
| `src/lib/realtime.ts` | Unchanged | Already swallows errors. |

## Migration Plan

- Existing migration `20260804120000_add_perf_indexes.sql` uses `CREATE INDEX CONCURRENTLY IF NOT EXISTS` iterating `master.tenants` via `\gexec`. It targets each `tenant_{slug}` schema — correct multi-tenant behavior.
- CONCURRENTLY cannot run inside a transaction; the migration file already documents `psql -v ON_ERROR_STOP=1` (no `--single-transaction`) and Supabase editor fallback instructions.
- The user prompt's note about "no CONCURRENTLY due to PgBouncer transaction mode" concerns application-runtime connections. **Migrations run out-of-band via direct psql, not through PgBouncer**, so CONCURRENTLY is correct and preferable (avoids table locks on live data).
- **Action**: verify migration has been applied against production. If yes, Phase 2 is documentation-only (record the migration as part of this change). If no, run it via psql per the file's header instructions.
- New tenants: `provision_tenant` fn must be updated (follow-up, out of scope here) OR the migration must be re-run after each tenant provisioning — noted in migration header.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Un-awaited `broadcastOrden()` produces an unhandled promise rejection | Low | Function's internal try/catch already swallows errors; add `.catch(err => console.error(...))` at call site as defense-in-depth. |
| Phase 3 batch INSERT partially succeeds, leaving orphan `orden_items` without ingredientes | Medium | Validate ALL product/ingredient IDs before ANY INSERT; wrap `addItems()` body in a transaction so any failure rolls back. |
| Existing perf-indexes migration was NOT run against production | Medium | Verify pre-apply: `SELECT indexname FROM pg_indexes WHERE schemaname LIKE 'tenant_%' AND indexname LIKE 'idx_%_ordenes_%'`. Run migration if missing. |
| Migration author intent vs. user prompt mismatch (CONCURRENTLY vs. not) | Low | Keep CONCURRENTLY — correct for direct-psql migrations, safer on live DB. |
| Parallelized `buildOrden()` masks a hidden ordering assumption | Low | Read code carefully; queries b/c/d only take `ordenId` parameter and write to independent result variables. |

## Rollback Plan

- **Phase 1 rollback**: re-add `await` before both `broadcastOrden()` calls; revert `buildOrden()` to sequential awaits. Pure code revert, one commit.
- **Phase 2 rollback**: `DROP INDEX CONCURRENTLY IF EXISTS tenant_{slug}.idx_{slug}_<name>` — one statement per (tenant, index). Rollback template already documented in the migration file.
- **Phase 3 rollback**: revert `addItems()` to per-item sequential SELECT+INSERT. Data on disk is compatible either way (schema unchanged).

## Dependencies

- Access to run migration via `psql "$DATABASE_URL"` (Supabase pooler/direct connection), NOT via PgBouncer transaction-mode pool.
- No new npm packages.

## Success Criteria

- [ ] `broadcastOrden()` is no longer awaited by either route; HTTP response no longer includes Supabase RTT.
- [ ] `buildOrden()` executes queries b/c/d in parallel — verified by reading the code (single `Promise.all`).
- [ ] All 5 indexes exist and are `indisvalid = true` in every active tenant schema.
- [ ] `addItems()` issues a bounded number of queries regardless of item/ingredient count: ≤ 5 queries total (fetch orden, fetch productos, fetch ingredientes, batch INSERT items, batch INSERT ingredientes) + buildOrden.
- [ ] `next build` and `next lint` pass.
- [ ] Manual smoke test: create MESA order with 3 items × 2 ingredientes each; verify same response payload as before.
