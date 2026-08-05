# Tasks: orden-creation-perf

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 60–80 (rewrite ~40 lines, net ~20 new) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Rewrite addItems() batch + static checks | PR 1 | Only Phase 3 remains; Phases 1–2 already in HEAD |

---

## Phase 1: Core Implementation

- [ ] 1.1 In `src/lib/services/ordenes.ts` (~line 578), replace the sequential for-loop in `addItems()` with the batch approach. Keep BEGIN/COMMIT/ROLLBACK, orden guard (exists + not PAGADA/CANCELADA), and identical error messages.
- [ ] 1.2 Add batch SELECT: `SELECT id, precio FROM productos WHERE id = ANY(${sql.array(productIds, 'int8')})`. If any productoId is missing, throw with `(item #${i + 1})` label before any INSERT.
- [ ] 1.3 Add batch SELECT: `SELECT id, precio FROM ingredientes WHERE id = ANY(${sql.array(ingredienteIds, 'int8')})`. If any ingredienteId is missing, throw before any INSERT. Skip entirely if ingredienteIds is empty.
- [ ] 1.4 Add batch INSERT `orden_items` using postgres.js helper: `` INSERT INTO orden_items ${sql(rows, 'orden_id', 'producto_id', 'cantidad', 'precio_unitario', 'notas')} RETURNING id ``. Map RETURNING order (insertion-order guaranteed) to resolve item IDs.
- [ ] 1.5 Add batch INSERT `orden_item_ingredientes` using postgres.js helper: `` INSERT INTO orden_item_ingredientes ${sql(rows, 'item_id', 'ingrediente_id', 'cantidad', 'precio_unitario') }`` . Guard with `if (rows.length > 0)` to avoid empty-VALUES error.
- [ ] 1.6 Keep `recalcularTotal(sql, ordenId)` and `buildOrden(sql, ordenId)` calls unchanged after the batch inserts.

## Phase 2: Verification

- [ ] 2.1 Run `npx tsc --noEmit` — must exit 0 errors.
- [ ] 2.2 Run `npx next lint` — must exit 0 errors.
- [ ] 2.3 Grep verify: confirm zero occurrences of `await broadcastOrden` anywhere in `src/` (regression guard from Phase 1 which is already done in HEAD).
- [ ] 2.4 Manual smoke: call `POST /api/ordenes/[id]/items/batch` with N=3 items × 2 ingredientes each; confirm returned `Orden` shape and totals are byte-identical to pre-refactor baseline.
