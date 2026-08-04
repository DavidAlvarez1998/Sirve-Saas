# mesero-multi-item-cart Specification

## Purpose

Defines behavior for the multi-product cart flow inside `AddItemModal` and the batch
API endpoint that commits all staged items in a single transaction.

---

## Requirements

### Requirement: Two-Phase Modal Flow

The modal MUST operate in two distinct phases: **staging** and **cart**.

In staging phase the mesero selects one product and configures its cantidad, notas,
extras, and ingredientes. In cart phase confirmed entries accumulate and are visible
below the staging form. The mesero MAY repeat the cycle to add more products before
submitting.

#### Scenario: Add a product to the cart

- GIVEN the modal is open and no product is staged
- WHEN the mesero selects a product from the grid
- THEN the modal enters staging phase and shows the configuration form for that product

#### Scenario: Confirm a staged product into the cart

- GIVEN a product is staged and configured
- WHEN the mesero clicks "Agregar al carrito"
- THEN the entry is appended to `cart[]`, the staging form clears, and the modal returns to product selection

#### Scenario: Remove an entry from the cart

- GIVEN the cart contains at least one entry
- WHEN the mesero clicks the delete control on an entry
- THEN that entry is removed from `cart[]` and the remaining entries are unchanged

---

### Requirement: Cart Display

The cart list MUST display, for each entry: product name, cantidad, and notas (if any).
Each entry MUST have a remove control.

#### Scenario: Empty cart state

- GIVEN no products have been added to the cart
- THEN the confirm button MUST be disabled and no cart list is rendered

#### Scenario: Cart with entries

- GIVEN `cart[]` contains N ≥ 1 entries
- THEN the confirm button MUST be enabled and labeled "Confirmar (N productos)"

---

### Requirement: Mobile Layout Constraint

The modal body MUST NOT overflow the viewport on mobile. The scrollable content area
MUST be constrained to `max-h-[85dvh]` with independent scroll sections so the product
grid and cart list are both accessible without clipping.

#### Scenario: Tall content on mobile

- GIVEN the cart has several entries and the product grid is visible
- WHEN rendered at a mobile viewport (≤ 428 px wide)
- THEN both sections remain scrollable and no content is clipped outside the modal

---

### Requirement: State Reset on Close

When the modal closes, ALL transient state MUST be cleared: `staging` set to `null`,
`cart[]` set to `[]`. The next modal open MUST start with a clean slate.

#### Scenario: Stale state after close

- GIVEN the modal was closed while `staging` was non-null and `cart` had entries
- WHEN the modal is reopened
- THEN staging is null and cart is empty

---

### Requirement: Batch API Endpoint

`POST /api/ordenes/{id}/items/batch` MUST insert all items in a single database
transaction. The transaction MUST be tenant-scoped via `withTenant()`. On any item
failure the entire transaction MUST roll back and no items are persisted.

Request body: `{ items: AddItemData[] }` validated by `AddItemsBatchSchema`
(`z.array(AddItemSchema).min(1)`).

Success response: same shape as `POST /api/ordenes/{id}/items` (the rebuilt `Orden`
object). HTTP 201.

Error responses: HTTP 400 for validation failures, HTTP 422 for business-rule
violations. Body: `{ message: string }` — MUST NOT be nested.

Tenant isolation: the route handler MUST resolve the tenant from the JWT/middleware
context. No cross-tenant data access is permitted.

#### Scenario: Valid batch submitted

- GIVEN an authenticated mesero and a valid `{ items: [...] }` body with N ≥ 1 items
- WHEN `POST /api/ordenes/{id}/items/batch` is called
- THEN all N items are inserted, `recalcularTotal()` runs exactly once, one Supabase broadcast is emitted, and HTTP 201 with the updated Orden is returned

#### Scenario: Empty items array rejected

- GIVEN a body `{ items: [] }`
- WHEN `POST /api/ordenes/{id}/items/batch` is called
- THEN HTTP 400 is returned with `{ message: "..." }` and nothing is written to the DB

#### Scenario: One invalid item rolls back all

- GIVEN a body with N items where item at index K has `cantidad: 0`
- WHEN `POST /api/ordenes/{id}/items/batch` is called
- THEN HTTP 422 is returned with `{ message: "..." }` identifying item K, and NO items are persisted

#### Scenario: Tenant isolation enforced

- GIVEN a JWT for tenant A
- WHEN `POST /api/ordenes/{id}/items/batch` is called where `ordenId` belongs to tenant B
- THEN HTTP 404 or 403 is returned and no data is written

---

### Requirement: Single-Item Endpoint Unchanged

`POST /api/ordenes/{id}/items` MUST remain fully functional without modification.
Its behavior, response shape, and error contract are unchanged by this change.

#### Scenario: Single-item endpoint still works

- GIVEN a valid single-item request
- WHEN `POST /api/ordenes/{id}/items` is called
- THEN it responds as before — unaffected by the batch endpoint addition

---

## Out of Scope

- Editing an entry already in `cart[]` (entries are add-only within a session)
- Drag-to-reorder cart entries
- Persisting cart state across modal closes
- Two-panel (catalog left / cart right) desktop layout
