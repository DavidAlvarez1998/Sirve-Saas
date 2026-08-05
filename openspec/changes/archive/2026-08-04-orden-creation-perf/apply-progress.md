# Apply Progress: orden-creation-perf

## Status: COMPLETE

## Tasks

### Phase 1: Core Implementation
- [x] 1.1 Replaced sequential for-loop in `addItems()` with batch approach in `src/lib/services/ordenes.ts` (~line 578)
- [x] 1.2 Batch SELECT productos: `WHERE id = ANY(${sql.array(productoIds)})` with NotFoundError per item
- [x] 1.3 Batch SELECT ingredientes: `WHERE id = ANY(${sql.array(allIngIds)})` with NotFoundError per item; guarded with `if (allIngIds.length > 0)`
- [x] 1.4 Batch INSERT `orden_items` using postgres.js helper via `sql(itemInsertRows, ...cols)` with RETURNING id
- [x] 1.5 Batch INSERT `orden_item_ingredientes` using `sql(ingInsertRows, ...cols)`; guarded with `if (ingInsertRows.length > 0)`
- [x] 1.6 `recalcularTotal` and `buildOrden` calls preserved unchanged

### Phase 2: Verification
- [x] 2.1 `npx tsc --noEmit` — exit 0
- [x] 2.2 `npx next lint` — exit 0 (pre-existing `<img>` warnings in page.tsx are unrelated)
- [x] 2.3 `await broadcastOrden` — zero matches in src/
- [ ] 2.4 Manual smoke test — pending (requires running app)

## Implementation Notes

**TypeScript quirk**: postgres.js v3's `sql()` helper returns `Helper<T, readonly K[]>` but `SerializableParameter` only accepts `Helper<any, any[]>` (mutable). Worked around with `as any` cast on the intermediate helper variable, wrapped in `eslint-disable/enable` block. This is a known postgres.js v3 type definition inconsistency.

**sql.array()**: Omitted the second `type` argument (was incorrectly specified as string `'int8'` in the design; the signature expects a numeric OID). postgres.js infers the correct array type from `number[]`.

## Files Changed
- `src/lib/services/ordenes.ts` — `addItems()` rewritten (lines 578–660 approx), N+1 queries eliminated: O(2N+1) RTTs → 6 RTTs flat
