# Tasks: `mesero-multi-producto`

Change: multi-product cart flow inside `AddItemModal` + batch API endpoint  
Delivery strategy: `ask-on-risk`  
Generated: 2026-08-03

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~265 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |

**Breakdown:**
- TASK-01 (schema): ~5 lines added to existing file
- TASK-02 (service): ~55 lines added to existing file
- TASK-03 (route): ~35 lines new file
- TASK-04 (client helper): ~4 lines added to existing file
- TASK-05 (UI refactor): ~165 lines net (replaces 175-line component with ~165-line rewrite — roughly even; adds ~15 lines of imports/types)

Total estimated net change: ~265 lines. Well under the 400-line budget. Single PR is safe.

---

## Task Checklist

### Group 1 — Schema + Types (no existing code changes needed before this)

---

#### TASK-01 — AddItemsBatchSchema

**Priority:** CRITICAL  
**File:** `src/lib/schemas/index.ts`  
**Parallelizable:** Yes (independent of all other tasks)

**What to do:**
Append one export after `AddItemSchema` (line 42):

```ts
export const AddItemsBatchSchema = z.object({
  items: z.array(AddItemSchema).min(1).max(50),
})
```

No other changes to this file.

**Acceptance criteria:**
- `AddItemsBatchSchema.parse({ items: [] })` throws (min 1).
- `AddItemsBatchSchema.parse({ items: Array(51).fill({ productoId: 1, cantidad: 1 }) })` throws (max 50).
- `AddItemsBatchSchema.parse({ items: [{ productoId: 1, cantidad: 1 }] })` passes.
- `tsc --noEmit` still passes.

**Spec requirement:** "Batch API Endpoint — `z.array(AddItemSchema).min(1)`"

---

### Group 2 — Service layer (requires TASK-01 types; can start in parallel with TASK-01 because it uses `AddItemData` which already exists)

---

#### TASK-02 — `addItems()` service function

**Priority:** CRITICAL  
**File:** `src/lib/services/ordenes.ts`  
**Parallelizable:** Yes (can write while TASK-01 is being written; only depends on `AddItemData` type, which already exists)

**What to do:**
Append `addItems()` after `addItem()` (after line 576). Mirror the `addItem()` structure exactly:

```
BEGIN
  1. SELECT orden → NotFoundError | ConflictError if PAGADA/CANCELADA
  2. FOR each (i, item) in items[]:
       SELECT producto → NotFoundError(`Produto no encontrado (item #${i+1})`)
       INSERT INTO orden_items RETURNING id
       IF item.ingredientes?.length > 0:
         FOR each ing:
           SELECT ingrediente → NotFoundError(`Ingrediente ${ing.ingredienteId} no encontrado (item #${i+1})`)
           INSERT INTO orden_item_ingredientes
  3. recalcularTotal(sql, ordenId)   ← exactly once
  4. buildOrden(sql, ordenId)        ← exactly once
COMMIT
return orden
CATCH → ROLLBACK, rethrow
```

Signature:
```ts
export async function addItems(sql: Sql, ordenId: number, items: AddItemData[]): Promise<Orden>
```

**Acceptance criteria:**
- `addItem()` is completely unchanged (diff shows no removals from that function).
- Happy path: N items inserted, `recalcularTotal` called exactly once (verify by reading service code — no extra calls).
- Error mid-batch: error message includes `(item #${i+1})` with 1-based index.
- On any throw, ROLLBACK is executed and the error is re-thrown (same pattern as `addItem()`).
- `tsc --noEmit` still passes.

**Manual test required (flag for apply):**
Insert a batch where item at index 1 has a valid `productoId` and item at index 2 has `productoId: 999999` (nonexistent). Confirm: HTTP 404, message contains `(item #2)`, zero rows in `orden_items` for this batch.

**Spec requirement:** "Batch API Endpoint — one failure rolls back all"; "recalcularTotal() called exactly once"

---

### Group 3 — API Route (requires TASK-01 for schema import, TASK-02 for service import)

---

#### TASK-03 — `POST /api/ordenes/[id]/items/batch` route handler

**Priority:** CRITICAL  
**File:** `src/app/api/ordenes/[id]/items/batch/route.ts` (NEW — create directory + file)  
**Parallelizable:** No — depends on TASK-01 (schema) and TASK-02 (service). Can be written in parallel if those are complete first.

**What to do:**
Create the file. Model it exactly after `src/app/api/ordenes/[id]/items/route.ts`. Structure:

```
runtime = 'nodejs'
POST handler:
  - getContext(req) → tenantSlug
  - parse { id } from params, parseInt → ValidationError if NaN
  - parse body → AddItemsBatchSchema.safeParse → ValidationError on fail
  - withTenant(tenantSlug, sql => OrdenService.addItems(sql, ordenId, parsed.data.items))
  - broadcastOrden(tenantSlug, { tipo: 'ACTUALIZADA', ordenId, estado, pagada })
  - return apiSuccess(orden, 201)
```

Error shape is handled by `handle()` wrapper (same as all other routes) — no manual try/catch needed.

**Acceptance criteria:**
- `POST /api/ordenes/123/items/batch` with `{ items: [] }` → HTTP 400, `{ message: "..." }` (not nested).
- `POST /api/ordenes/123/items/batch` with 1 valid item → HTTP 201, full `Orden` object returned.
- `POST /api/ordenes/123/items/batch` from wrong tenant → HTTP 404 or 403 (middleware enforces this).
- Only ONE `broadcastOrden` call per request (not per item).
- `POST /api/ordenes/[id]/items` (single) still works — no regression.
- `tsc --noEmit` still passes.

**Spec requirement:** "Batch API Endpoint — single transaction, flat errors, broadcast once"

---

### Group 4 — Client helper (parallel with TASK-03, only depends on existing `Orden` + `AddItemData` types)

---

#### TASK-04 — `addItems()` client helper

**Priority:** HIGH  
**File:** `src/lib/api/ordenes.ts`  
**Parallelizable:** Yes (independent of TASK-02 and TASK-03 — only imports types already present)

**What to do:**
Append after the existing `addItem` export (after line 40):

```ts
export const addItems = (id: number, items: AddItemData[]): Promise<Orden> =>
  api.post<Orden>(`/ordenes/${id}/items/batch`, { items }).then(r => r.data)
```

Also add `addItems` to the import list in `src/app/mesero/ordenes/page.tsx` (line 6–16) — do this as part of TASK-05 since TASK-05 is the consumer.

**Acceptance criteria:**
- Function signature matches the route contract: `items: AddItemData[]`, returns `Promise<Orden>`.
- No other functions in the file are changed.
- `tsc --noEmit` still passes.

**Spec requirement:** "Batch API Endpoint — client submits ONE POST with all cart items"

---

### Group 5 — UI Refactor (depends on TASK-04 being importable; must be done after TASK-04)

---

#### TASK-05 — Refactor `AddItemModal` to two-phase state machine

**Priority:** CRITICAL  
**File:** `src/app/mesero/ordenes/page.tsx` (lines 725–900, the `AddItemModal` function)  
**Parallelizable:** No — depends on TASK-04 (`addItems` client helper).

**What to do:**

Replace the entire `AddItemModal` function body (lines 741–899). Keep the function signature and props interface identical. The refactor must:

**A. State variables** — replace the four existing state vars with:
```ts
const [staging, setStaging] = useState<CartEntry | null>(null)
const [cart, setCart] = useState<CartEntry[]>([])
const [saving, setSaving] = useState(false)
```
Remove: `selectedProduct`, `cantidad`, `notas`, `extras`.

**B. Local type** — add above the function (or inline at top):
```ts
type CartEntry = {
  clientId: string
  producto: Producto
  cantidad: number
  notas: string
  ingredientes: Array<{ ingredienteId: number; cantidad: number }>
}
```

**C. Reset effect** — replace the existing `useEffect` with:
```ts
useEffect(() => {
  if (!open) { setStaging(null); setCart([]); setSaving(false) }
}, [open])
```

**D. Derived values:**
```ts
const canConfirm = cart.length >= 1 && !saving
```

**E. State machine transitions** (implement as handler functions):
- Selecting a product from grid → creates new staging entry (replaces any existing staging without saving it to cart)
- "Agregar al carrito" button → pushes staging to cart, clears staging
- "Descartar" button → clears staging only
- Delete button on cart entry → filters that clientId out of cart
- "Confirmar" button → calls `addItems(ordenId, cart.map(toAddItemData))`, on success calls `onDone(updated)` + `onClose()`, on error calls `onError(msg)` and sets `saving=false` (cart preserved for retry)

**F. UI layout** (single column, mobile-first):
1. Catalog section (always visible) — `max-h-64` when cart empty, `max-h-48` when `cart.length > 0`. Product grid unchanged (2-col, grouped by tipo). Selected product highlighted with `border-primary bg-primary/10`. Remove the `<Check>` icon in favor of the highlight alone (or keep it — either is fine as long as visual selection is clear).
2. Staging section (renders only when `staging !== null`) — separated by `border-t border-border pt-3`. Shows: product name header, cantidad ± stepper, notas input, extras chips (only when `staging.producto.tipo === 'PLATO_PREPARADO'`). Two buttons: `[Descartar]` (secondary) + `[Agregar al carrito]` (primary).
3. Cart list section (renders only when `cart.length > 0`) — header "En el carrito (N)". Each row: product name, `×{cantidad}`, notas (if any), delete button. `max-h-48 overflow-y-auto`.
4. Action bar (always visible at bottom) — `Confirmar ({cart.length} productos)` button, `disabled={!canConfirm}`.

**G. Imports** — add `addItems` to the import from `'../../../lib/api/ordenes'`. Add `ShoppingCart` or `Trash2` icon if needed (Trash2 is already imported). Add `crypto.randomUUID()` call (no import needed — available in browser).

**Acceptance criteria:**
- Selecting a product in IDLE state shows the staging form.
- Selecting a different product while staging replaces staging without touching cart.
- "Agregar al carrito" moves staging entry to cart and clears the form.
- "Descartar" clears staging and returns to IDLE (product grid still visible).
- Cart list renders for each entry: name, ×N, notas if non-empty, delete button.
- Delete button removes only that entry.
- "Confirmar" button is disabled when `cart.length === 0` (even if staging is non-null).
- "Confirmar" button is enabled when `cart.length >= 1`.
- "Confirmar" calls `addItems()` (not `addItem()`) — single POST.
- On server error, modal stays open, `onError` called, cart preserved.
- Closing and reopening modal starts with empty staging and empty cart.
- No viewport overflow on mobile (catalog and cart both independently scrollable within `max-h-*` constraints).
- Old `addItem` import remains (still used by other callers in the same file or can be removed if confirmed unused — check via grep before deleting).
- `tsc --noEmit` still passes.

**Spec requirements:** "Two-Phase Modal Flow", "Cart Display", "Mobile Layout Constraint", "State Reset on Close"

---

### Group 6 — Manual Verification (post-apply checklist, not code tasks)

---

#### TASK-06 — Manual rollback test

**Priority:** CRITICAL  
**File:** None (manual test)  
**Parallelizable:** No — must run after TASK-03 is deployed.

**What to do:**
1. Open a mesero session. Create an order.
2. Add a cart with 2 items: one valid `productoId`, one `productoId: 999999` (nonexistent).
3. Submit via "Confirmar".
4. Verify: HTTP 404 response, `{ message }` contains `(item #2)`, zero new rows in `orden_items` for this batch (check DB directly or confirm order has same item count as before).
5. Retry with 2 valid items.
6. Verify: HTTP 201, both items appear in the order, `recalcularTotal` correctly updated `total_monto`.

**Acceptance criteria:**
- No partial rows survive a mid-batch failure.
- `total_monto` unchanged after failed batch.
- Successful 2-item batch produces correct total.

**Spec requirement:** "One invalid item rolls back all"

---

#### TASK-07 — Kitchen display eyeball test

**Priority:** HIGH  
**File:** None (manual test)  
**Parallelizable:** No — must run after TASK-06.

**What to do:**
1. Submit a valid batch of 3 items from the mesero flow.
2. Open the kitchen display in a second browser tab.
3. Verify: exactly ONE `orden.updated` realtime event fires (not 3). Kitchen display updates with all 3 new items in one refresh.

**Acceptance criteria:**
- One realtime broadcast per batch (not per item).
- Kitchen display renders all items correctly after a single event.

**Spec requirement:** "Batch API Endpoint — one Supabase broadcast emitted"

---

## Dependency Order

```
TASK-01 (schema)
   └── TASK-03 (route) ──┐
TASK-02 (service)         ├── TASK-06 (rollback test)
   └── TASK-03 (route) ──┘       └── TASK-07 (kitchen eyeball)
TASK-04 (client helper)
   └── TASK-05 (UI refactor)
```

TASK-01 and TASK-02 and TASK-04 can be written in parallel.  
TASK-03 depends on TASK-01 + TASK-02.  
TASK-05 depends on TASK-04.  
TASK-06 depends on TASK-03 + TASK-05 being deployed.  
TASK-07 depends on TASK-06 passing.

## Commit plan (work-unit-commits)

```
commit 1: feat(schema): AddItemsBatchSchema                       → TASK-01
commit 2: feat(services): addItems() batch transaction            → TASK-02
commit 3: feat(api): POST /ordenes/[id]/items/batch route         → TASK-03
commit 4: feat(api-client): addItems() client helper              → TASK-04
commit 5: feat(ui): AddItemModal — two-phase cart state machine   → TASK-05
```

Manual tests (TASK-06, TASK-07) run after commit 5. No separate commit needed.
