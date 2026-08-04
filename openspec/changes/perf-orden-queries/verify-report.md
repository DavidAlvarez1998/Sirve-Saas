# Verify Report: perf-orden-queries

**Change**: perf-orden-queries
**Date**: 2026-08-04
**Verdict**: PASS (0 CRITICAL, 0 WARNING, 1 SUGGESTION)
**Ready for archive**: Yes

---

## Executive Summary

Both code changes match the spec exactly. `buildOrden()` now parallelizes its 3 tail queries via `Promise.all()` while preserving the sequential header query + `NotFoundError` guard. The FK-index migration uses `\gexec` over `master.tenants` with `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, no transaction wrapper, and all 5 indexes present. `tsc --noEmit` exits 0.

TASK-03 (manual EXPLAIN ANALYZE) is an operator step and does not block archive.

---

## Files Audited

- `src/lib/services/ordenes.ts` (buildOrden at lines 196–245)
- `supabase/migrations/20260804120000_add_perf_indexes.sql`

## Test Suite

- `npx tsc --noEmit` — EXIT 0, zero errors.
- No unit-test runner in this repo (Standard Mode).

---

## Checklist — buildOrden() parallelization

| Item | Status | Evidence |
|---|---|---|
| Orden row query awaited first | PASS | ordenes.ts:197–205 (`await sql<OrdenRow[]>` before Promise.all) |
| `NotFoundError` guard after first await | PASS | ordenes.ts:206 (`if (!rows[0]) throw new NotFoundError(...)`) before Promise.all |
| Items/ingredientes/pagos in `Promise.all()` | PASS | ordenes.ts:208–231 (single destructure) |
| Return shape unchanged (`Orden`) | PASS | ordenes.ts:244 (`return toOrden(rows[0], items, pagoRows.map(toPago))`) — same signature as before |
| Function signature unchanged | PASS | ordenes.ts:196 (`buildOrden(sql: Sql, id: number): Promise<Orden>`) |
| Empty-order safety | PASS | Empty arrays from each SELECT flow into empty `items` and `pagos` — no null-deref, no crash |
| No other sequential awaits | PASS | Only 2 top-level awaits: header (line 197) + Promise.all (line 208). Map build + `.map(toItem)` are synchronous |

## Checklist — Migration

| Item | Status | Evidence |
|---|---|---|
| File exists at expected path | PASS | `supabase/migrations/20260804120000_add_perf_indexes.sql` |
| 5 indexes present | PASS | Lines 27–31 — all 5 suffixes: `ordenes_mesa_id`, `ordenes_estado_pagada`, `orden_items_orden_id`, `orden_item_ingredientes_item`, `pagos_orden_id` |
| `CREATE INDEX CONCURRENTLY IF NOT EXISTS` | PASS | Line 18 (`format(...CREATE INDEX CONCURRENTLY IF NOT EXISTS...)`) |
| `\gexec` present (no DO block) | PASS | Line 34 |
| `master.tenants` prefix | PASS | Line 25 (`FROM master.tenants t`) |
| `WHERE t.activo = true` | PASS | Line 33 |
| No `BEGIN`/`COMMIT` wrapper | PASS | Grep confirmed no top-level transaction statements |

## Checklist — Behavioral invariants

| Item | Status | Evidence |
|---|---|---|
| All `buildOrden()` call sites unaffected | PASS | 14 call sites across `ordenes.ts` (lines 304, 386, 481, 495, 529, 569, 620, 681, 710, 747, 804, 912, 913) and 2 in `cocina.ts` — all use `buildOrden(sql, id)` signature |
| Mutation helpers unchanged | PASS | `addItem` (532), `addItems` (578), `updateItem` (629), `removeItem` (690), `pagarOrden` (719), `createOrden` (269), `updateOrden` (480) still call `buildOrden(sql, id)` identically |
| `tsc --noEmit` clean | PASS | Exit 0, zero errors |

---

## SUGGESTIONS (non-blocking)

**SUG-1** — The commented smoke-check query at lines 38–45 has an operator precedence bug: the `AND indexname LIKE 'idx_%_ordenes_%'` binds tighter than the following `OR` clauses, so it will match any index matching any of the `OR`-ed `LIKE` patterns regardless of `indisvalid`. Wrap the four `LIKE` predicates in parentheses:

```sql
WHERE NOT pg_index.indisvalid
  AND (indexname LIKE 'idx_%_ordenes_%'
    OR indexname LIKE 'idx_%_orden_items_%'
    OR indexname LIKE 'idx_%_orden_item_ingredientes_%'
    OR indexname LIKE 'idx_%_pagos_%');
```

This is a comment-only fix; the migration itself is unaffected. Not blocking archive.

---

## CRITICAL / WARNING

None.

---

## TASK-03 Status

**PENDING (operator step)** — Manual `EXPLAIN (ANALYZE, BUFFERS)` verification on a live tenant with real data. Non-blocking for merge/archive; document in PR description when run.

---

## Next Recommended Phase

`sdd-archive` — implementation matches spec, no blockers.
