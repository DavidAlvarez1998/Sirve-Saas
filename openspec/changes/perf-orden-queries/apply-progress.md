# Apply Progress: perf-orden-queries

**Change**: perf-orden-queries
**Mode**: Standard (strict_tdd: false)
**Delivery**: Single PR (~30 LoC)
**Batch**: 1 of 1 (all code tasks complete; TASK-03 is operator-run verification)

---

## Completed Tasks

### [x] TASK-01 — Parallelize tail queries in `buildOrden()`

**File**: `src/lib/services/ordenes.ts`
**Lines changed**: ~10 net (3 sequential awaits → 1 Promise.all destructure)

Replaced 3 sequential `await sql<...>` calls (itemRows, ingRows, pagoRows) with a single
`const [itemRows, ingRows, pagoRows] = await Promise.all([...])`. The `ingByItem` map build
and `items.map(toItem)` remain below the Promise.all (they consume ingRows/itemRows — correct
ordering preserved). The header query + NotFoundError guard stay first and untouched.

`tsc --noEmit` passes with zero errors.

Function signature byte-identical: `(sql: Sql, id: number): Promise<Orden>`.
No call site modified.

### [x] TASK-02 — Create FK index migration

**File**: `supabase/migrations/20260804120000_add_perf_indexes.sql` (NEW)
**Lines**: ~55 LoC

`\gexec` pattern. Generates `CREATE INDEX CONCURRENTLY IF NOT EXISTS` for all 5 index specs
across every active tenant schema via `master.tenants CROSS JOIN (VALUES ...)`.

Acceptance criteria verified:
- No top-level BEGIN / START TRANSACTION / DO $$ block
- `\gexec` present after SELECT
- All 5 suffixes in VALUES list: ordenes_mesa_id, ordenes_estado_pagada,
  orden_items_orden_id, orden_item_ingredientes_item, pagos_orden_id
- `IF NOT EXISTS` in format string
- Header forbids `-1` / `--single-transaction`
- Supabase web editor fallback documented
- Smoke-check SELECT included (commented)
- Rollback template included (commented)

---

## Pending Tasks

### [ ] TASK-03 — Manual EXPLAIN ANALYZE verification

**Type**: Operator-run verification step (no code commit)
**Depends on**: TASK-02 applied to a live tenant schema

Run EXPLAIN (ANALYZE, BUFFERS) on `orden_items WHERE orden_id = ?` in a real tenant.
Must show Index Scan on `idx_{slug}_orden_items_orden_id`.
Run smoke-check for indisvalid indexes.
Document output in PR description.

---

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/lib/services/ordenes.ts` | Modified | buildOrden: 3 sequential awaits → Promise.all; tsc clean |
| `supabase/migrations/20260804120000_add_perf_indexes.sql` | Created | 5 FK/filter indexes via \gexec across all active tenant schemas |

---

## Deviations from Design

- Design artifact named the migration `20260804000001_perf_orden_indexes.sql`; orchestrator
  prompt specified `20260804120000_add_perf_indexes.sql`. Used the orchestrator prompt filename
  (explicit instruction overrides design artifact naming convention). Content is identical.

## Issues Found

None.

---

## Status

2/3 tasks complete (TASK-01, TASK-02). TASK-03 is an operator step, not a code task.
Ready for `sdd-verify`.
