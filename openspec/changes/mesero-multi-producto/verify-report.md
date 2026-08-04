# Verify Report: mesero-multi-producto

**Verdict**: PASS
**Counts**: 0 CRITICAL, 1 WARNING, 3 SUGGESTION
**Typecheck**: `npx tsc --noEmit` clean.

## Scope
Verified TASK-01..TASK-05 against spec.
TASK-06 (rollback manual test) and TASK-07 (broadcast eyeball test) are post-deploy — not blocking archive but MUST run before merge.

## File-by-file audit

### src/lib/schemas/index.ts — PASS
- Lines 44-46: `AddItemsBatchSchema = z.object({ items: AddItemSchema.array().min(1).max(50) })`
- Type export `AddItemsBatchData` (bonus).

### src/lib/services/ordenes.ts (addItems, lines 578-627) — PASS
- BEGIN at 579, COMMIT at 621, ROLLBACK at 624 wrap the ENTIRE loop.
- Orden guard (NotFoundError, ConflictError PAGADA/CANCELADA) runs once at start.
- 1-based error label `(item #${i + 1})` at line 591, used in both producto and ingrediente errors.
- `recalcularTotal(sql, ordenId)` called once at line 619 AFTER loop — not per item.
- `buildOrden(sql, ordenId)` called once at line 620.
- `addItem()` (single, lines 532-576) UNCHANGED — pattern matches perfectly.

### src/app/api/ordenes/[id]/items/batch/route.ts — PASS
- `runtime = 'nodejs'`, uses `AddItemsBatchSchema.safeParse`.
- Errors flow through `ValidationError` -> `handle()` -> `apiError()` -> flat `{ message: string }`.
- `broadcastOrden` called ONCE at line 31 after `withTenant()`.
- Tenant resolved via `getContext(req).tenantSlug` and passed to `withTenant`.
- Success: `apiSuccess(orden, 201)`.

### src/lib/api/ordenes.ts — PASS
- `addItems(id, items[])` at lines 42-43 posts to `/ordenes/${id}/items/batch`.
- `addItem()` single still present at line 39 — no regression.

### src/app/mesero/ordenes/page.tsx (AddItemModal, lines 729-993) — PASS
- Import `addItems` only; `addItem` single import removed.
- CartEntry type (731-737), state: staging/cart/saving/submitError.
- Reset useEffect (758-761): all state cleared when `!open`.
- `handleSelectProduct` (784) replaces staging (no silent push).
- `handleAddToCart` (794) pushes to cart, clears staging.
- `handleDiscard` clears staging only.
- `handleRemoveFromCart` filters by clientId.
- `handleConfirm` (805-825) calls `addItems()` single POST; on error keeps modal open, cart preserved, `saving=false`.
- `canConfirm = cart.length >= 1 && !saving` (763).
- Button disabled = `!canConfirm`; label `Confirmar (N producto/s)` with pluralization.
- Modal body: `overflow-y-auto max-h-[85dvh]` (831). Catalog: `max-h-48` (cart) / `max-h-64` (empty). Cart list: `max-h-48 overflow-y-auto`.
- crypto.randomUUID() used for clientId (786).

### src/app/api/ordenes/[id]/items/route.ts — PASS
- Confirmed via `git status`: NOT in modified list. Untouched.

## Findings

### CRITICAL — 0
None.

### WARNING — 1
- **W1 — Status code drift spec vs implementation**. Spec §"Batch API Endpoint" says success returns "HTTP 200". Implementation returns `apiSuccess(orden, 201)` to align with the single-item endpoint and matches TASK-03 AC ("valid batch -> 201"). Tasks contract took precedence — client doesn't check status. Recommend updating spec to 201 during archive.

### SUGGESTION — 3
- **S1 — Duplicate error surface**. `handleConfirm` shows the error both as `submitError` inline (line 977) AND via `onError(msg)` toast in parent. User sees the same error twice. Pick one channel.
- **S2 — Cart extras not detailed**. Cart row shows only `+extras` marker without ingredient names/counts. Spec §"Cart Display" requires product name, cantidad, notas — extras aren't required, but a tooltip or expandable detail would improve UX.
- **S3 — Extras deviation**. Extras toggle sets `cantidad: 1` fixed (no per-ingredient stepper). Documented in apply-progress as intentional per design §5. Note in archive report for future reference.

## Requirements checklist
- [PASS] POST /api/ordenes/[id]/items/batch exists, accepts {items}
- [PASS] items array validated min 1 max 50
- [PASS] item shape validated
- [PASS] single transaction wraps ALL inserts
- [PASS] recalcularTotal() called exactly once (line 619, AFTER loop)
- [PASS] Success returns full Orden object (status 201 — see W1)
- [PASS] Error `{message}` flat, never nested
- [PASS] 1-based index in error labels
- [PASS] Single-item endpoint untouched (verified via git status)
- [PASS] Staging phase: select populates staging (not auto-add)
- [PASS] "Agregar al carrito" pushes staging -> cart, clears staging
- [PASS] Cart shows product name + cantidad + remove button
- [PASS] Confirm shows count and disabled when cart empty OR saving
- [PASS] Modal close resets all state
- [PASS] Content scrollable on mobile (max-h-[85dvh] + inner overflow-y-auto)
- [PASS] Empty batch rejected at schema level
- [PASS] addItem single-item import removed

## Post-deploy actions (blocking merge, not blocking archive)
- TASK-06 — Batch rollback: submit `[valid, productoId=999999]` -> expect HTTP 404 with `item #2`, zero rows persisted, total_monto unchanged. Then retry valid batch -> 201.
- TASK-07 — Kitchen broadcast: 3-item batch -> observe exactly ONE realtime event on kitchen tab.

## Next recommended
`sdd-archive` — implementation is clean. Consider incorporating W1 (spec 200 -> 201) and S3 (extras toggle deviation) into the archive report.
