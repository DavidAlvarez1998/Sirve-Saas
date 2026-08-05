# Archive Report — `perf-n1-ordenes`

**Status**: archived
**Date archived**: 2026-08-05
**Owner**: David Alvarez
**Verdict from verify**: PASS (0 CRITICAL, 0 WARNING, 1 SUGGESTION)

---

## Change summary

Removed N+1 SELECT pattern from three order-item mutation functions (`addItem`, `addItems`, `updateItem`) in `src/lib/services/ordenes.ts`. Introduced a shared private helper `fetchCatalog()` that batch-loads productos and ingredientes in a single `Promise.all`, with empty-array guards and OID 20 type hint for `sql.array()`.

## What shipped

**File changed**: `src/lib/services/ordenes.ts` (single file, ~140 lines touched, ~30 net added).

**New types**:
- `ProductoRow { id: bigint; precio: string }` (L535-538)
- `CatalogIngredienteRow { id: bigint; precio: string }` (L540-543)

**New helper**:
- `fetchCatalog(sql, productoIds, ingredienteIds)` (L545-565) — private, non-exported. `Promise.all` for parallel execution. Empty-array guards. `bigint→number` Map key conversion.

**Refactored functions**:
- `addItem()` (L567-608) — single `fetchCatalog` call replaces producto SELECT + N ingrediente SELECTs.
- `addItems()` (L610-675) — `Set` dedup + `fetchCatalog` + sequential INSERTs. Batch-INSERT helper (`sql(rows, ...cols)`) removed along with `eslint-disable @typescript-eslint/no-explicit-any` block.
- `updateItem()` (L677-737) — `fetchCatalog` + validation-before-DELETE ordering (strictly better failure mode).

**Rename**:
- `IngredienteRow` → `ItemIngredienteRow` (5 refs: L122, L174, L217, L338, L422) to disambiguate from the new catalog row type.

## Performance impact

| Function | Before (5 items × 3 ings) | After | Reduction |
|---|---|---|---|
| `addItems` | 42+ non-INSERT RTT | ~8 non-INSERT RTT | ~80% |
| `addItem` (1×3) | 6 non-INSERT RTT | ~4 non-INSERT RTT | ~33% |
| `updateItem` (1×3) | 8 non-INSERT RTT | ~7 non-INSERT RTT | ~13% |

## Behavioral contract preserved

- Function signatures unchanged.
- Return type `Orden` unchanged (built by `buildOrden()` after `recalcularTotal()`).
- Transaction boundary `BEGIN → try → COMMIT / catch → ROLLBACK` unchanged.
- `recalcularTotal` called exactly once per mutation.
- `buildOrden` called exactly once per mutation.
- Error messages byte-for-byte identical:
  - `addItems`: `"Producto no encontrado (item #N)"`, `"Ingrediente ${id} no encontrado (item #N)"` (1-based).
  - `addItem`, `updateItem`: `"Producto no encontrado"`, `"Ingrediente ${id} no encontrado"` (no suffix).
- Flat `{ message: string }` error contract unchanged.
- Tenant isolation via caller's `sql` handle — no new connection reservation, no `masterDb()` calls.

## Deviations from design

Only one: `sql.array(ids, 20)` instead of `sql.array(ids, 'int8')`.
- postgres.js `sql.array` signature is `(value: T[], type?: number)`, not `(value: T[], type?: string)`.
- OID 20 is the PostgreSQL OID for `int8`/`bigint` — semantically equivalent.
- Documented in apply-progress and verify-report.

## Quality gates

- `npx tsc --noEmit` → exit code 0 (clean, zero errors project-wide).
- Zero `eslint-disable` / `no-explicit-any` in changed functions.
- All 10 spec requirements verified against implementation.
- All 6 tasks marked complete in tasks artifact.

## SDD artifacts

All persisted in both Engram and OpenSpec:

| Artifact | Engram topic key | OpenSpec file |
|---|---|---|
| Proposal | `sdd/perf-n1-ordenes/proposal` | `openspec/changes/perf-n1-ordenes/proposal.md` |
| Spec | `sdd/perf-n1-ordenes/spec` | `openspec/changes/perf-n1-ordenes/spec.md` |
| Design | `sdd/perf-n1-ordenes/design` | `openspec/changes/perf-n1-ordenes/design.md` |
| Tasks | `sdd/perf-n1-ordenes/tasks` | `openspec/changes/perf-n1-ordenes/tasks.md` |
| Apply progress | `sdd/perf-n1-ordenes/apply-progress` | `openspec/changes/perf-n1-ordenes/apply-progress.md` |
| Verify report | `sdd/perf-n1-ordenes/verify-report` | `openspec/changes/perf-n1-ordenes/verify-report.md` |
| Archive report | `sdd/perf-n1-ordenes/archive-report` | `openspec/changes/perf-n1-ordenes/archive-report.md` |

## Learnings captured for future work

- postgres.js `sql.array` accepts numeric OID only (not string type name). Reference OIDs: `int8 = 20`, `int4 = 23`, `text = 25`, `varchar = 1043`.
- The `IngredienteRow` name in this file was misleading (it modeled `orden_item_ingredientes` row, not the `ingredientes` catalog). Rename to `ItemIngredienteRow` freed the semantic name for the catalog row.
- `updateItem`'s DELETE-before-INSERT ordering is preserved, but validation is shifted strictly EARLIER via the `ingMap.has()` loop — strictly better failure mode (no WAL churn on invalid input).
- Empty-array guard (`ids.length > 0`) is a query-count-budget concern, not correctness. `ANY('{}')` is valid SQL and returns 0 rows correctly; guard exists purely to save the RTT and meet spec ceilings.
- SDD suggestion for future perf work: `buildOrden` internally issues 4 SELECTs. Any future query-ceiling spec should either explicitly exclude it or count its internal RTTs.

## Out of scope (intentionally not touched)

- `removeItem()`, `separarItem()`, `dividirOrden()` — could benefit from the same batch pattern but not in this change.
- `recalcularTotal()` implementation — the correlated subquery in the UPDATE is a separate perf concern.
- INSERT statements remain sequential (one per row, `RETURNING id`) — batch INSERT via `sql(rows, ...cols)` was considered and rejected in ADR-2 due to fragile FK-order coupling.
- API route handlers, Zod schemas, database indexes, migrations — untouched.

## Follow-ups (optional, not blocking)

1. Consider batching `removeItem` / `separarItem` / `dividirOrden` in a future perf change.
2. Add integration test asserting query counts (would require query-count instrumentation on the sql handle).
3. Review `buildOrden` for further RTT reduction (currently 4 SELECTs via `Promise.all` — could potentially collapse via `json_agg` subqueries).

## Verdict

Change is COMPLETE and ARCHIVED. Ready for commit/PR when the user chooses to ship.
