# Delta Spec — `perf-n1-ordenes`

**Domain**: ordenes (order-item mutations)
**Functions in scope**: `addItems`, `addItem`, `updateItem`
**File**: `src/lib/services/ordenes.ts`

---

## ADDED Requirements

### Requirement: Batch-fetch productos before INSERT loop

`addItems()` and `addItem()` MUST collect all distinct `productoId` values from the input before entering any write loop, and MUST issue exactly one SELECT against `productos` using `WHERE id = ANY(sql.array(ids, 'int8'))` to retrieve all needed rows in a single round trip.

#### Scenario: Happy path — multiple items with distinct productos

- GIVEN a call to `addItems` with N items each referencing a distinct valid `productoId`
- WHEN the function executes
- THEN exactly one SELECT is issued against `productos` regardless of N
- AND all N items are inserted successfully

#### Scenario: Happy path — duplicate productoId in batch

- GIVEN a call to `addItems` with two items sharing the same `productoId`
- WHEN the function collects IDs
- THEN only one unique `productoId` is included in the batch SELECT (Set dedup)
- AND both items are inserted using the same lookup result

#### Scenario: Single-item call (`addItem`)

- GIVEN a call to `addItem` with one valid `productoId`
- WHEN the function executes
- THEN exactly one SELECT is issued against `productos` (batch pattern applied consistently)

#### Scenario: Invalid productoId in batch — first bad item is item #3

- GIVEN a call to `addItems` with 5 items where item index 3 has a non-existent `productoId`
- WHEN the batch SELECT returns fewer rows than expected
- THEN the function throws with message `"Producto no encontrado (item #3)"` (1-based index)
- AND no rows are inserted into `orden_items` (transaction is rolled back)

---

### Requirement: Batch-fetch ingredientes before INSERT loop

`addItems()`, `addItem()`, and `updateItem()` MUST collect all distinct `ingredienteId` values from the input before entering any write loop and MUST issue at most one SELECT against `ingredientes` using `WHERE id = ANY(sql.array(ids, 'int8'))`.

#### Scenario: Happy path — items with ingredientes

- GIVEN a call to `addItems` with items that collectively reference M distinct ingredienteIds
- WHEN the function executes
- THEN exactly one SELECT is issued against `ingredientes` regardless of total ingredient count

#### Scenario: Empty ingredientes guard

- GIVEN a call to `addItems` where no item has any ingredientes (all empty arrays)
- WHEN the function collects ingredienteIds
- THEN the `ingredientes` SELECT is skipped entirely (zero queries fired against that table)

#### Scenario: Invalid ingredienteId — item #2, ingrediente id 42

- GIVEN a call to `addItems` where item index 2 references `ingredienteId: 42` which does not exist
- WHEN the function validates via the lookup Map
- THEN the function throws with message `"Ingrediente 42 no encontrado (item #2)"` (1-based index, exact format)
- AND no rows are inserted (transaction is rolled back)

---

### Requirement: Parallel batch fetch execution

The two batch SELECTs (productos and ingredientes) MUST be issued concurrently, not sequentially. Each MUST run on the same transactional `sql` handle provided by the caller.

#### Scenario: Concurrent execution for addItems

- GIVEN a call to `addItems` with items that have both productos and ingredientes
- WHEN the batch-fetch phase executes
- THEN both the productos SELECT and the ingredientes SELECT are initiated via `Promise.all` before either result is consumed
- AND both queries execute on the caller's `sql` handle (no new connection reservation)

---

### Requirement: Query count limits

After this change, the number of SELECT queries (non-INSERT round trips) MUST NOT exceed the ceilings defined below, measured for any valid input of the given shape.

| Function | Input shape | Max non-INSERT queries |
|---|---|---|
| `addItems` | 5 items × 3 ings each | 10 |
| `addItem` | 1 item × 3 ings | 5 |
| `updateItem` | 1 item × 3 ings | 7 |

#### Scenario: addItems query ceiling

- GIVEN a call to `addItems` with 5 items each having 3 ingredientes
- WHEN the function completes successfully
- THEN the total number of SELECT queries is ≤ 10

#### Scenario: addItem query ceiling

- GIVEN a call to `addItem` with 1 item having 3 ingredientes
- WHEN the function completes successfully
- THEN the total number of SELECT queries is ≤ 5

#### Scenario: updateItem query ceiling

- GIVEN a call to `updateItem` with 1 item having 3 ingredientes
- WHEN the function completes successfully
- THEN the total number of SELECT queries is ≤ 7

---

## MODIFIED Requirements

### Requirement: Order-item mutations preserve full behavioral contract

`addItems()`, `addItem()`, and `updateItem()` MUST preserve their existing public contract in all of the following dimensions after this change.
(Previously: functions used per-item SELECTs inside the loop; all other behavioral guarantees were already present)

**Signatures**: Function signatures MUST remain unchanged. No new parameters, no removed parameters.

**Return value**: Each function MUST return the same `Orden` type as before (built by `buildOrden()` after `recalcularTotal()`).

**Transaction boundary**: All writes for a single call MUST remain inside one `BEGIN`/`COMMIT` block. A validation failure at any point MUST trigger a full `ROLLBACK` with no partial rows inserted.

**recalcularTotal**: MUST be called exactly once per mutation, after all INSERTs complete, as today.

**buildOrden**: MUST be called exactly once per mutation, after `recalcularTotal`, as today.

**Error HTTP status**: Route handlers MUST return the same HTTP status codes as today (e.g., 404 for not-found errors). The error body shape `{ message: string }` MUST remain flat.

**Tenant isolation**: All queries MUST use the `sql` handle provided by `withTenant()` upstream. No direct `masterDb()` usage inside these functions.

#### Scenario: Happy path — full round trip, 3-item order

- GIVEN a valid 3-item order with ingredientes, all IDs existing in the database
- WHEN `addItems` completes
- THEN the returned `Orden` contains all 3 items with their ingredientes and the correct total
- AND the API response payload is byte-for-byte identical to the pre-refactor response

#### Scenario: Transaction rollback on bad input

- GIVEN a call to `addItems` where one item has a non-existent `productoId`
- WHEN the function throws a `NotFoundError`
- THEN no rows exist in `orden_items` for this `ordenId` (full rollback)
- AND the route handler returns HTTP 404 with body `{ message: "Producto no encontrado (item #N)" }`

#### Scenario: updateItem ingredientes loop — N+1 removed

- GIVEN a call to `updateItem` where the item update includes 3 ingredientes
- WHEN the function validates ingredienteIds
- THEN a single batch SELECT is issued against `ingredientes` (not one per ingrediente)
- AND the productoId SELECT remains as a single lookup (unchanged — only one product per call)

---

## Out of Scope (explicit non-requirements)

The following MUST NOT be changed as part of this spec:

- `removeItem()`, `separarItem()`, `dividirOrden()` — not in scope
- `recalcularTotal()` implementation — called once, stays unchanged
- INSERT statements — each runs individually (sequential, returning id)
- API route handler logic or Zod schemas
- Database indexes or migrations
- `getOrdenes()` / `getHistorial()` — already correct batch shape
