# Design: Mesero — Multi-producto (carrito + batch)

Change: `mesero-multi-producto`
Store: hybrid (Engram + OpenSpec)
Depends on: `openspec/changes/mesero-multi-producto/proposal.md`

## 1. Architecture Overview

Two aligned refactors — one on the client (state machine of the modal) and one on the server (transactional batch insert). Neither changes DB schema, existing endpoints, or contracts of any other component. Existing `POST /api/ordenes/[id]/items` (single) stays alive and untouched.

```
┌─────────────────────────────────────────────────────────────────┐
│ AddItemModal (client, state machine)                            │
│                                                                 │
│  ┌───────────┐  select  ┌─────────┐  add-to-cart ┌───────────┐  │
│  │ IDLE      │──────────▶│ STAGING │──────────────▶│ CART      │  │
│  │ (no prod) │           │ (config │               │ (N items) │  │
│  │           │◀──────────│  1 prod)│◀──────────────│           │  │
│  └───────────┘  clear    └─────────┘  select next  └───────────┘  │
│        │                                              │           │
│        └──────────────── close ────────┬──────────────┘           │
│                                        ▼                          │
│                                    DISCARD                        │
│                                        │  confirm (cart.len ≥ 1)  │
│                                        ▼                          │
│                          POST /api/ordenes/[id]/items/batch       │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Route Handler (Next.js Node runtime)                            │
│   validate AddItemsBatchSchema → withTenant → OrdenService      │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ addItems(sql, ordenId, items[]) — one transaction               │
│   BEGIN                                                         │
│   ├── validate orden (not PAGADA/CANCELADA)                     │
│   ├── FOR each item: SELECT producto → INSERT orden_items       │
│   │       └── FOR each ingrediente: SELECT + INSERT             │
│   ├── recalcularTotal(sql, ordenId)   ← ONE call                │
│   ├── buildOrden(sql, ordenId)                                  │
│   COMMIT                                                        │
│                                                                 │
│   any error → ROLLBACK, throw with item index                   │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ▼
              broadcastOrden(tenantSlug, ...)  ← ONE event
```

Layering respects the existing project convention:

- Route Handlers stay thin: parse → validate → `withTenant` → service → `broadcastOrden` → `apiSuccess`.
- Service (`src/lib/services/ordenes.ts`) owns business logic and transaction lifecycle.
- Client helper (`src/lib/api/ordenes.ts`) is a plain axios wrapper mirroring `addItem()`.
- No new files under `src/lib/` except an optional type alias.

## 2. State Architecture — AddItemModal

### 2.1 Types (component-local)

```ts
// component-local; not exported
type CartEntry = {
  clientId: string          // crypto.randomUUID() — React key + delete target
  producto: Producto        // full object cached from context (for name/price/image render)
  cantidad: number
  notas: string             // '' when empty
  ingredientes: Array<{     // shape MATCHES AddItemData.ingredientes exactly
    ingredienteId: number
    cantidad: number
  }>
}
```

`CartEntry` is designed so `toAddItemData(entry)` is a trivial projection:

```ts
const toAddItemData = (e: CartEntry): AddItemData => ({
  productoId: e.producto.id,
  cantidad: e.cantidad,
  notas: e.notas || undefined,
  ingredientes: e.ingredientes.length ? e.ingredientes : undefined,
})
```

### 2.2 State variables

```ts
const [staging, setStaging] = useState<CartEntry | null>(null)
const [cart, setCart]       = useState<CartEntry[]>([])
const [saving, setSaving]   = useState(false)
```

`selectedProduct`, `cantidad`, `notas`, `extras` disappear — their content lives inside `staging`. When `staging === null`, no product is being configured; when non-null, the user is editing exactly that entry until they push it into `cart`.

### 2.3 State machine

| From    | Event                          | To       | Effect                                                         |
|---------|--------------------------------|----------|----------------------------------------------------------------|
| IDLE    | select producto P              | STAGING  | `staging = { clientId, producto: P, cantidad: 1, notas: '', ingredientes: [] }` |
| STAGING | change cantidad / notas / extras | STAGING  | `setStaging(s => ({ ...s, ...patch }))`                        |
| STAGING | select producto P' (different)  | STAGING  | replace staging (implicit discard — see §6)                     |
| STAGING | click "Agregar al carrito"     | CART     | `setCart(c => [...c, staging!]); setStaging(null)`             |
| STAGING | click "Descartar"              | IDLE     | `setStaging(null)`                                             |
| CART    | select producto P              | STAGING  | begin new staging (cart preserved)                              |
| CART    | delete entry by clientId       | CART/IDLE | filter cart; if `cart.length === 0 && staging === null` → IDLE  |
| any     | click "Confirmar (N)"          | SAVING   | build payload → POST batch → `onDone(orden)` → `onClose()`     |
| SAVING  | server error                   | prev     | keep staging + cart, show toast/inline error, allow retry       |
| any     | close (X, backdrop, esc)       | RESET    | clear both — no confirmation prompt (matches current behaviour) |

Reset effect (extends existing `useEffect`):

```ts
useEffect(() => {
  if (!open) {
    setStaging(null)
    setCart([])
    setSaving(false)
  }
}, [open])
```

### 2.4 Derived values

```ts
const cartCount = cart.length + (staging ? 1 : 0)   // for confirm button label
const canConfirm = cart.length >= 1 && !saving      // staging NOT counted here — see §6
const stagingSubtotal =                             // display-only
  staging
    ? staging.producto.precio * staging.cantidad +
      staging.ingredientes.reduce((s, i) => s + priceOf(i.ingredienteId) * i.cantidad, 0)
    : 0
```

Note: `canConfirm` requires at least one item pushed into cart. Staging on its own does not confirm — user must explicitly press "Agregar al carrito" first. This matches the mental model "cart = things committed to send".

## 3. API Contract

### 3.1 Endpoint

`POST /api/ordenes/[id]/items/batch`

- Runtime: `nodejs` (matches sibling routes)
- Auth: existing `middleware.ts` JWT + tenant guard; no new middleware
- Error shape: `{ message: string }` flat, per project convention
- Success status: `201 Created`
- Response body: full `Orden` (same shape as single-item endpoint)

### 3.2 Request body

```ts
{
  items: [
    {
      productoId: number,
      cantidad: number,
      notas?: string,
      ingredientes?: Array<{ ingredienteId: number, cantidad: number }>
    },
    ...
  ]
}
```

### 3.3 Zod schema (`src/lib/schemas/index.ts`)

```ts
export const AddItemsBatchSchema = z.object({
  items: z.array(AddItemSchema).min(1).max(50),
})
```

Reuse `AddItemSchema` verbatim — no per-item duplication. `.max(50)` is a safety cap; realistic table orders are 3–8 items, 50 is well beyond any legitimate use and prevents accidental payload abuse.

### 3.4 Error responses

| Case                                        | Status | `{ message }`                                                     |
|---------------------------------------------|--------|-------------------------------------------------------------------|
| Body fails Zod                              | 400    | first Zod error message (e.g. `"items: array must contain at least 1 element(s)"`) |
| Orden not found                             | 404    | `"Orden no encontrada"`                                           |
| Orden PAGADA / CANCELADA                    | 409    | `"No se puede modificar una orden pagada o cancelada"`            |
| Producto not found (item at index i)        | 404    | `"Producto no encontrado (item #{i+1})"`                           |
| Ingrediente not found (item i, ing id x)    | 404    | `"Ingrediente {x} no encontrado (item #{i+1})"`                    |
| Anything else                               | 500    | `"Error interno"`                                                 |

Index in message is **1-based** so it matches what the mesero sees on screen ("producto 3 falló"). All errors trigger `ROLLBACK`.

## 4. Service Layer

### 4.1 Signature

```ts
// src/lib/services/ordenes.ts
export async function addItems(
  sql: Sql,
  ordenId: number,
  items: AddItemData[],
): Promise<Orden>
```

Signature mirrors `addItem(sql, ordenId, data)` exactly, only pluralising `data → items[]`.

### 4.2 Transaction structure

```
BEGIN
  1. SELECT orden — throw NotFoundError if missing
                  — throw ConflictError if PAGADA or CANCELADA
  2. FOR (i, item) of items:
       a. SELECT producto by item.productoId
          — throw NotFoundError(`Producto no encontrado (item #${i+1})`)
       b. INSERT orden_items RETURNING id
       c. IF item.ingredientes && length > 0:
            FOR ing of item.ingredientes:
              SELECT ingrediente by ing.ingredienteId
                — throw NotFoundError(`Ingrediente ${ing.ingredienteId} no encontrado (item #${i+1})`)
              INSERT orden_item_ingredientes
  3. recalcularTotal(sql, ordenId)          ← EXACTLY ONE call
  4. buildOrden(sql, ordenId)               ← EXACTLY ONE call
COMMIT
return orden

catch: ROLLBACK; rethrow (handled by handle() → { message })
```

Rationale for keeping the per-item loop instead of a single multi-row `INSERT`:
- Each `orden_items` insert needs to return its `id` to insert its `orden_item_ingredientes` rows.
- Multi-row `INSERT ... VALUES (...), (...) RETURNING id` returns ids in insertion order, but tying them back to their ingredient sub-arrays adds indexing complexity for a marginal query-count win (typical batch ≤ 8 items). The proposal's success criterion is "1 recalc + 1 buildOrden + 1 broadcast", not "1 INSERT" — the win is already realised.
- The pattern is IDENTICAL to `addItem()` — reviewers can trust it at a glance.

### 4.3 Concurrency & PgBouncer

- Uses `withTenant()` at the route layer — reserves a connection, sets `search_path`, runs the callback, releases. Standard project pattern.
- `prepare: false` on postgres.js remains — no change.
- The whole batch runs inside ONE reserved connection, so BEGIN/COMMIT are safe under PgBouncer transaction mode.

## 5. UI Layout

### 5.1 Modal shell (unchanged)

Modal component already provides `max-h-[92vh]` with `overflow-y-auto flex-1` on the body. No changes to `Modal.tsx`. Modal size stays `lg`.

### 5.2 Body sections (top → bottom, single scroll column)

```
┌──────────────────────────────────────────┐
│ 1. Catálogo (always visible)             │  ← max-h-56 (mobile) / max-h-64 (sm+)
│    - Grouped by tipo                     │     overflow-y-auto, scrollbar-hide
│    - Grid grid-cols-2 buttons            │     ONE scroll region, cheap to browse
│                                          │
├──────────────────────────────────────────┤
│ 2. Staging (only if staging !== null)    │  ← border-t border-border pt-3
│    - Header: producto seleccionado name  │
│    - Cantidad ±                          │
│    - Notas input                         │
│    - Extras chips (only PLATO_PREPARADO) │
│    - Row: [Descartar] [Agregar al carrito]│
│                                          │
├──────────────────────────────────────────┤
│ 3. Cart list (only if cart.length > 0)   │  ← border-t border-border pt-3
│    - "En el carrito (N)"                 │
│    - Compact rows:                       │
│      [img 32px] nombre  x2   ×  [🗑]     │
│      +ingrediente1, +ingrediente2 · Notas│
│    - max-h-48 overflow-y-auto            │
│                                          │
├──────────────────────────────────────────┤
│ 4. Action bar (sticky-ish at bottom)     │
│    [ Confirmar (N productos) $XXX.XX ]   │  disabled unless cart.length ≥ 1
└──────────────────────────────────────────┘
```

Decisions:

- **Single-column layout, three optional sections.** Mobile-first. Catalogue always on top so browsing is fast. Staging appears only when the user picks a product — collapsing when there is nothing to configure. Cart appears once at least one entry exists.
- **Two independent scroll regions maximum** (catálogo, cart). The staging section is short and fluid; forcing it into its own scroll makes the modal feel jumpy.
- **Reduce catálogo height when cart is visible.** When `cart.length > 0`, drop catálogo from `max-h-64` to `max-h-48` so the cart is visible without extra scrolling. Simple ternary in the className.
- **Confirm button copy is data-driven.** `Confirmar (${cart.length} producto${cart.length === 1 ? '' : 's'}) $${fmt(cartTotal)}` — gives an at-a-glance cost check before send.
- **Staging show/hide uses conditional render, not transition.** Matches current codebase style (no CSS transitions on similar toggles). Keeps the diff small and predictable.
- **Compact cart row** is the highest-density block: image left, name+qty middle, delete right; second line lists extras + notes joined by `·`. No inline edit of cart entries in this iteration (Out of Scope per proposal).

### 5.3 Visual tokens

Uses existing tokens only: `bg-surface`, `bg-surface-sunken`, `border-border`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `bg-success`. No new tokens, no new components.

## 6. Client Helper

`src/lib/api/ordenes.ts` — append after `addItem`:

```ts
export const addItems = (id: number, items: AddItemData[]): Promise<Orden> =>
  api.post<Orden>(`/ordenes/${id}/items/batch`, { items }).then(r => r.data)
```

- Return shape: full `Orden` (same as `addItem`) — caller replaces its local orden state atomically.
- No optional 2nd argument, no wrapper object — payload is `{ items }` inline. Keeps types tight.

Optional (only if the type is referenced elsewhere in the tree):

```ts
// src/types/index.ts
export type AddItemsData = { items: AddItemData[] }
```

Not required if `addItems()` is only called from `AddItemModal` — TypeScript infers.

## 7. Edge Cases

| Case | Behaviour | Rationale |
|------|-----------|-----------|
| Close modal with items in cart | Silent discard (existing reset effect) | Matches current UX (closing loses form state). No confirmation prompt — mesero flow is fast; a modal-on-modal is noisy. |
| Confirm with exactly 1 item in cart | Valid — batch of 1 works | `min(1)` in schema. No artificial "≥ 2" floor. |
| Confirm with staging pending, cart empty | Confirm disabled — button greyed | User must explicitly commit staging first. Alternative (auto-push staging on confirm) hides state and confuses "did I really send that one?". |
| Confirm with staging pending, cart has items | Confirm enabled, staging IGNORED and DISCARDED on send | Matches the mental model: staging = "still deciding", cart = "ready". Consistency > convenience. Documented in confirm button tooltip: title="Agregá el producto en configuración al carrito antes de confirmar". |
| Producto without ingredientes | `ingredientes: []` → helper sends `undefined` → server treats as no-extras | AddItemSchema already handles this via `.optional()`. |
| Producto is VENTA_DIRECTA | Extras section hidden (matches current AddItemModal behaviour, `tipo === 'PLATO_PREPARADO'` guard) | No design change. |
| Server returns 4xx (validation / conflict) | Modal stays open, toast shows `{ message }`, cart preserved, user can edit/retry | `handleConfirm` catches, sets `saving=false`, does NOT clear state. |
| Server returns 5xx | Same as 4xx path — modal open, toast, retry | Whole request atomic → nothing partial. Safe to retry. |
| Network drop mid-request | Axios throws → same catch → retry-safe | Nothing persisted server-side thanks to ROLLBACK. |
| User double-clicks Confirmar | `disabled={!canConfirm || saving}` prevents second POST | Standard pattern, already used across the codebase. |
| Batch of 51 items | Zod rejects → 400 | Cap is generous; only guards against payload abuse. |

## 8. Realtime / Broadcast

Route handler emits ONE `broadcastOrden(tenantSlug, { tipo: 'ACTUALIZADA', ordenId, estado, pagada })` after the service returns — matches the single-item route pattern. Kitchen display already reacts to `orden.updated` and refetches; it receives one event carrying N new items instead of N events with 1 each. No consumer changes needed.

## 9. Decisions (ADR-style)

### ADR-1: Batch endpoint vs. sequential single-item calls with promise batching

**Decision**: New endpoint `POST /api/ordenes/[id]/items/batch`.

**Alternatives considered**:
- **Client-side `Promise.all([addItem, addItem, ...])`.** Rejected — still N round-trips, N `recalcularTotal()` calls (contention on the same row), N broadcasts, non-atomic (partial failure leaves half-inserted orden). Fails 3 of the proposal's success criteria.
- **Reuse `addItem()` with array support via overload.** Rejected — changes an established, working signature; risks silent regressions in other callers (mesa flow, admin panel, tests). Zero-risk path is a sibling function.

**Rationale**: A dedicated batch endpoint is atomic, minimises DB work, and does not touch the existing single-item flow — proposal's rollback plan is a clean revert.

### ADR-2: State machine — staging + cart vs. cart-only with inline edit

**Decision**: Two states — one "in-progress" (staging) and one "confirmed-to-send" (cart) — with an explicit "Add to cart" action.

**Alternatives considered**:
- **Cart-only, edit inline.** Rejected — requires an "editing mode" per cart row, doubles the UX surface, and makes "descartar cambios" ambiguous (per-row vs. modal-level).
- **Staging that auto-commits on product switch.** Rejected — hides intent; if the user misclicks a wrong product, they lose the previous config silently.

**Rationale**: Two-phase mirrors how the mesero thinks — "estoy armando este plato" (staging) vs. "esto ya va" (cart). Explicit commit prevents accidental loss.

### ADR-3: Keep per-item INSERT loop in `addItems()` vs. multi-row VALUES

**Decision**: Loop, one `INSERT ... RETURNING id` per item.

**Alternatives considered**:
- **Single `INSERT ... VALUES (...), (...) RETURNING id`.** Rejected — mapping returned ids back to their ingredient sub-arrays needs positional discipline that complicates the code for a marginal gain (batches are ≤ 8 items in practice; win is < 1 ms).
- **`UNNEST` + CTE join.** Rejected — over-engineered for the size; harder to read.

**Rationale**: The proposal's real win is "1 recalc + 1 buildOrden + 1 broadcast", which is achieved. Keeping the loop makes `addItems()` diff-readable next to `addItem()`.

### ADR-4: Confirm requires cart ≥ 1 (staging alone does not count)

**Decision**: `canConfirm = cart.length >= 1 && !saving`.

**Rejected alternative**: Auto-push staging into cart on confirm. Hides state, breaks the "commit intent" model, makes error recovery ambiguous ("did my last product go?").

**Rationale**: Explicit is better than implicit. The UI teaches the user what "carrito" means the first time they try to confirm with staging only — an educational tooltip guides them.

### ADR-5: No cart entry inline edit in this iteration

**Decision**: Cart entries can only be deleted, not edited.

**Rejected alternative**: Full inline edit per cart row.

**Rationale**: Out of Scope per proposal. Adding inline edit would ~double the UI complexity and roll back the "small, safe change" property. Users delete + re-add — a 2-tap operation that keeps the codebase tiny. Revisit in a follow-up change if usage data justifies it.

### ADR-6: Error message format includes 1-based item index

**Decision**: Errors carry `(item #{i+1})` in the `{ message }` string.

**Rejected alternative**: Return `{ message, itemIndex }` structured error.

**Rationale**: Project convention is flat `{ message }`. Users don't parse errors; humans read them. `#{i+1}` matches the visual order in the cart list ("el tercero falló"). Zero client-side wiring needed.

## 10. Constraints Honoured

- Postgres.js `prepare: false` — unchanged (project-wide config).
- No `connection: { search_path }` startup param — untouched.
- `withTenant()` used at the route boundary — same as `addItem()` route.
- Flat `{ message }` error envelope — enforced by `handle()` wrapper.
- Master schema not touched — no `master.*` queries in this path.

## 11. Success Criteria Traceability

| Proposal criterion | Design section |
|---|---|
| N productos configurados individualmente, 1 POST | §2 state machine + §6 client helper |
| Backend inserta todo en 1 transacción | §4.2 transaction structure |
| `recalcularTotal()` 1 vez | §4.2 step 3 |
| Broadcast 1 vez | §8 realtime |
| Single-item endpoint sin cambios | §1 (untouched) |
| Error en 1 item → rollback + `{ message }` con índice | §3.4 error table + §4.2 catch |
| `next lint` + `tsc --noEmit` pasan | Enforced during apply |
| Verificación manual mobile sin overflow | §5 UI layout |
