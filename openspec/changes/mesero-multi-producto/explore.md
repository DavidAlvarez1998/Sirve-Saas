## Exploration: mesero-multi-producto

### Current State

The "Agregar producto" modal is `AddItemModal`, defined inline at lines 726–900 of
`src/app/mesero/ordenes/page.tsx`. It lives inside the 1 400-line page file.

**Current state shape inside `AddItemModal`:**
```
selectedProduct: Producto | null   ← one product at a time
cantidad: number                   ← that product's quantity
notas: string                      ← that product's notes
extras: Record<number, number>     ← ingredienteId → qty for that product
saving: boolean
```

On "Agregar a la orden", it calls `addItem(ordenId, { productoId, cantidad, notas, ingredientes[] })`
→ `POST /api/ordenes/{id}/items` → returns the full updated `Orden`. Modal closes, parent receives
the updated orden via `onDone`.

**Products and ingredients:**
Already loaded at layout mount by `MeseroProvider` (`src/context/MeseroContext.tsx`). Fetched from
`/api/productos` and `/api/ingredientes` in parallel on mount, kept in context. The modal accesses
them via `useMesero()` — no additional fetches needed.

**API surface today:**
- `POST /api/ordenes/{id}/items` — single item, validated by `AddItemSchema`
- `AddItemSchema`: `{ productoId, cantidad, notas?, ingredientes?: [{ingredienteId, cantidad}][] }`
- Service `addItem()`: BEGIN/COMMIT — inserts one `orden_items` row + N `orden_item_ingredientes`,
  calls `recalcularTotal()`, then `buildOrden()` (full re-fetch)
- No batch/bulk endpoint exists

### Recommended Approach

**Cart UI + new `POST /items/batch` endpoint (Approach 2)**

Flow:
1. User selects a product → "staging" phase: sets cantidad/notas/extras
2. "Agregar al carrito" → pushes entry to `cart[]`, resets staging
3. Cart list shows accumulated entries (product name, qty, extras summary)
4. "Confirmar (N productos)" → fires single `POST /api/ordenes/{id}/items/batch`
5. Backend wraps all inserts in one transaction, calls `recalcularTotal()` once

**New state shape:**
```ts
type CartEntry = {
  product: Producto
  cantidad: number
  notas: string
  extras: Record<number, number>  // ingredienteId → qty
}

staging: CartEntry | null   // product currently being configured
cart: CartEntry[]           // confirmed entries ready to submit
```

### Files Affected

| File | Action |
|------|--------|
| `src/app/mesero/ordenes/page.tsx` | Refactor `AddItemModal` (two-phase state) |
| `src/app/api/ordenes/[id]/items/batch/route.ts` | NEW — batch endpoint |
| `src/lib/services/ordenes.ts` | NEW `addItems()` batch service fn |
| `src/lib/schemas/index.ts` | NEW `AddItemsBatchSchema` |
| `src/lib/api/ordenes.ts` | NEW `addItems()` client helper |

### Risks

- Modal height on mobile: stacked catalog + cart list may overflow — needs `max-h-[85dvh]` on body
- Two-phase state reset when modal closes (both `staging` and `cart` must clear)
- Partial batch failure rolls back entire transaction — acceptable, one clear error message
- No automated tests — `addItems()` service is highest-risk, needs manual verification
