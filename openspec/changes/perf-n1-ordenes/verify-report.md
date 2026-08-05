# Verify Report — `perf-n1-ordenes`

**Verdict**: PASS
**Date**: 2026-08-05
**File verified**: `src/lib/services/ordenes.ts`
**TypeScript gate**: `npx tsc --noEmit` → exit code 0

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| WARNING  | 0 |
| SUGGESTION | 1 |

All spec requirements met. All 6 tasks complete. Code matches implementation notes in apply-progress. Ready for archive.

---

## Requirement-by-requirement verification

### REQ 1 — Batch-fetch productos before INSERT loop — PASS

- `addItem` (L578-579): collects ingredienteIds first, then single `fetchCatalog([data.productoId], ingredienteIds)` — exactly one producto SELECT.
- `addItems` (L623): `productoIds = [...new Set(items.map((it) => it.productoId))]` — Set dedup applied.
- `addItems` error path (L630): throws `"Producto no encontrado (item #${i + 1})"` — 1-based index exact match.

### REQ 2 — Batch-fetch ingredientes before INSERT loop — PASS

- `addItem` (L578): collects `ingredienteIds` before write loop.
- `addItems` (L624): `[...new Set(items.flatMap((it) => (it.ingredientes ?? []).map((ing) => ing.ingredienteId)))]` — Set dedup applied.
- `updateItem` (L698-699): collects `ingredienteIds` before any DELETE.
- Empty guard in `fetchCatalog` (L557-560): skips ingrediente query when `ingredienteIds.length === 0`.
- Error messages: `addItems` at L638 uses `(item #N)` suffix; `addItem` L592 and `updateItem` L706 do NOT — matches spec exactly.

### REQ 3 — Parallel batch fetch execution — PASS

- `fetchCatalog` L561: `await Promise.all([prodQuery, ingQuery])` — both queries initiated before either resolves.
- Both queries execute on caller's `sql` handle (no `masterDb()`, no new reservation).

### REQ 4 — Query count limits — PASS (N+1 eliminated)

- `addItem` — per-ingrediente SELECT in loop is GONE. Single `fetchCatalog` handles both producto and all ingredientes.
- `addItems` — per-item producto SELECT is GONE. Batch fetch handles all.
- `updateItem` — per-ingrediente SELECT loop is GONE. Single `fetchCatalog` call.
- SUGGESTION: The spec ceilings (≤5 / ≤10 / ≤7) count `buildOrden` as a single unit in the design math but `buildOrden` internally issues 4 SELECTs. Ceilings hold when using the design's counting convention. Consider clarifying this in the spec for future refactors that touch `buildOrden`.

### REQ 5 — Behavioral contract preserved — PASS

- **Signatures** unchanged: `addItem(sql, ordenId, data)`, `addItems(sql, ordenId, items)`, `updateItem(sql, ordenId, itemId, data)`.
- **Return value**: all three return `buildOrden(sql, ordenId)` after `recalcularTotal`.
- **Transaction boundary**: all three follow `BEGIN → try → COMMIT / catch → ROLLBACK` pattern (L568-607, L611-674, L683-736).
- **recalcularTotal** called exactly once per mutation, after all INSERTs (L600, L667, L729).
- **buildOrden** called exactly once per mutation, after `recalcularTotal` (L601, L668, L730).
- **Error contract**: `NotFoundError` and `ConflictError` classes unchanged — `{ message: string }` flat shape preserved via error handler layer.
- **Tenant isolation**: no `masterDb()` calls in any of the three functions — all use caller's `sql` handle.

### REQ 6 — `updateItem` validation-before-DELETE — PASS

- L698-702: `fetchCatalog` fetches both catalogs.
- L701-702: validates producto (`prodMap.get(data.productoId)` throws if missing).
- L704-708: validates every ingrediente via `ingMap.has()` — throws before any DELETE.
- L710: `DELETE FROM orden_item_ingredientes WHERE item_id = ${itemId}` — AFTER all validation.
- Improved failure mode: validation failure now happens with no WAL churn.

### REQ 7 — `sql.array(ids, 20)` — OID 20 = int8 — PASS (documented deviation)

- L555 and L559: both use `sql.array(productoIds, 20)` / `sql.array(ingredienteIds, 20)`.
- Design specified `'int8'` string; postgres.js `sql.array(value, type?: number)` accepts a numeric OID only.
- OID 20 is the PostgreSQL OID for `int8/bigint` — semantically equivalent.
- Deviation is documented in apply-progress §"Deviations from Design".

### REQ 8 — No `eslint-disable` / `no-explicit-any` — PASS

- Grep for `eslint-disable|no-explicit-any` in `ordenes.ts` returns 0 matches.
- The `eslint-disable @typescript-eslint/no-explicit-any` block previously wrapping the batch-INSERT helper in `addItems` was correctly removed.

### REQ 9 — TypeScript compilation gate — PASS

- `npx tsc --noEmit` → exit code 0. Zero errors project-wide.

### REQ 10 — Naming collision resolved — PASS

- Grep for `IngredienteRow` returns only `ItemIngredienteRow` matches (5 refs: L122, L174, L217, L338, L422).
- New `CatalogIngredienteRow` type introduced at L540 for the batch-fetch catalog row shape.
- No shadowing, no ambiguity.

---

## Task Completion Verification

| Task | Status | Code evidence |
|---|---|---|
| TASK-01 — Rename IngredienteRow → ItemIngredienteRow (5 refs) | complete | L122, L174, L217, L338, L422 |
| TASK-02 — Add ProductoRow + CatalogIngredienteRow + fetchCatalog() | complete | L535-565 |
| TASK-03 — Refactor addItem() | complete | L567-608 |
| TASK-04 — Refactor addItems() (removed batch-INSERT helper) | complete | L610-675 |
| TASK-05 — Refactor updateItem() (validation-before-delete) | complete | L677-737 |
| TASK-06 — TypeScript gate | complete | tsc exit 0 |

All tasks in `sdd/perf-n1-ordenes/tasks` marked `[x]`. Code state matches.

---

## Findings

### CRITICAL: 0

None.

### WARNING: 0

None.

### SUGGESTION: 1

**S1 — Clarify buildOrden accounting in future query-ceiling specs**
The spec query ceilings (addItem ≤5, addItems ≤10, updateItem ≤7) are met using the design's counting convention where `buildOrden` counts as one logical unit. In practice `buildOrden` internally issues 4 SELECTs (orden, items, ingredientes, pagos via `Promise.all`). For any future perf work that touches `buildOrden`, spec ceilings should either exclude `buildOrden` explicitly or count its internal RTTs. Not a defect in this change — noted for future spec authors.

---

## Verdict

**PASS — ready for archive.**

Zero CRITICAL, zero WARNING findings. All 10 spec requirements verified against code. All 6 tasks complete. TypeScript gate green. Behavioral contract preserved byte-for-byte. N+1 pattern eliminated as required by the proposal.

---

## Backends written

- Engram: `sdd/perf-n1-ordenes/verify-report`
- OpenSpec: `openspec/changes/perf-n1-ordenes/verify-report.md`

## Next recommended
`sdd-archive`
