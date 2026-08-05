# Delta Spec — orden-creation-perf

**Change**: `orden-creation-perf`
**Type**: Pure performance refactor — no capability changes, no schema changes.

---

## MODIFIED Requirements

### Requirement: Broadcast Fire-and-Forget

`broadcastOrden()` callers MUST NOT await the broadcast call. The HTTP response for `POST /api/ordenes` and `POST /api/ordenes/[id]/items/batch` MUST be returned immediately after the DB write succeeds, without waiting for Supabase broadcast to complete. Broadcast errors MUST remain swallowed (MUST NOT propagate to the caller or change the HTTP response status).

(Previously: broadcast was awaited, blocking the HTTP response until Supabase confirmed delivery.)

#### Scenario: Successful orden creation with broadcast

- GIVEN a valid `POST /api/ordenes` request
- WHEN `createOrden()` succeeds and `broadcastOrden()` is triggered
- THEN the HTTP 201 response is returned without waiting for broadcast to complete
- AND broadcast errors, if any, are silently discarded

#### Scenario: Successful batch item addition with broadcast

- GIVEN a valid `POST /api/ordenes/[id]/items/batch` request
- WHEN `addItems()` succeeds and `broadcastOrden()` is triggered
- THEN the HTTP 200 response is returned without waiting for broadcast to complete
- AND broadcast errors, if any, are silently discarded

#### Scenario: Broadcast network timeout

- GIVEN Supabase broadcast is slow or unavailable
- WHEN `broadcastOrden()` is triggered after a DB write
- THEN the HTTP response is NOT delayed by broadcast latency
- AND no error is surfaced to the client

---

### Requirement: buildOrden Parallel Query Execution

`buildOrden()` MUST execute its independent queries (items+products, item-ingredients, payments) concurrently using `Promise.all()`. The orden row fetch MAY remain sequential as it provides the base object. The assembled result MUST be structurally and semantically identical to the current sequential output.

(Previously: queries were executed sequentially, each waiting for the previous to complete.)

#### Scenario: Happy path — all sub-queries succeed

- GIVEN a valid `ordenId` exists in the tenant DB
- WHEN `buildOrden(ordenId)` is called
- THEN items+products, item-ingredients, and payments queries execute concurrently
- AND the returned `Orden` object has identical shape and data to the pre-refactor implementation

#### Scenario: One sub-query fails

- GIVEN a valid `ordenId` and one of the parallel queries throws
- WHEN `buildOrden(ordenId)` is called
- THEN `Promise.all()` rejects and the error propagates to the caller unchanged

---

### Requirement: addItems Batch Efficiency

`addItems()` MUST NOT issue per-item or per-ingredient SELECT queries inside a loop. All `productoId` values for the batch MUST be resolved in a single SELECT before any INSERT. All ingredient data for the entire batch MUST be fetched in a single SELECT. Ingredient inserts MUST be executed as a single batch INSERT using a VALUES list. The total number of DB queries MUST be bounded by a constant (O(1)) regardless of the number of items (N) or ingredients per item (M). If any `productoId` or `ingredienteId` in the batch is invalid or missing, the operation MUST roll back entirely with no partial inserts. The returned `Orden` shape MUST be identical to current behavior.

(Previously: addItems issued per-item SELECTs and per-ingredient individual INSERTs, resulting in O(N*M) queries.)

#### Scenario: Batch of N items with M ingredients each — success

- GIVEN `addItems()` receives N items, each with M ingredients
- WHEN the function executes
- THEN total DB queries is a small constant (not O(N) or O(N*M))
- AND the returned `Orden` reflects all inserted items with correct totals

#### Scenario: Invalid productoId in batch

- GIVEN a batch where at least one item references a non-existent `productoId`
- WHEN `addItems()` executes the batch SELECT for productos
- THEN the transaction rolls back with no items or ingredients inserted
- AND an error is returned to the caller

#### Scenario: Invalid ingredienteId in batch

- GIVEN a batch where at least one ingredient references a non-existent `ingredienteId`
- WHEN `addItems()` attempts the batch ingredient INSERT
- THEN the transaction rolls back with no partial inserts
- AND an error is returned to the caller

#### Scenario: Empty batch

- GIVEN `addItems()` receives an empty items array
- WHEN the function executes
- THEN no DB queries are issued for productos or ingredients
- AND the returned `Orden` is unchanged

---

### Requirement: No Functional Regression

`createOrden()` and `addItems()` MUST produce identical DB state and return values before and after the refactor. Order totals MUST remain correct after the batch-insert refactor. `next lint` and `npx tsc --noEmit` MUST pass with 0 errors after all changes are applied.

#### Scenario: createOrden output unchanged

- GIVEN a valid orden creation request
- WHEN `createOrden()` is called after the refactor
- THEN the returned `Orden` object is structurally and semantically identical to pre-refactor output
- AND the DB rows written are identical

#### Scenario: addItems totals correct

- GIVEN a batch of items with known prices and ingredient modifiers
- WHEN `addItems()` is called
- THEN order totals match the expected values computed by `recalcularTotal()`

#### Scenario: Static analysis passes

- GIVEN all three phases of the refactor are applied
- WHEN `next lint` and `npx tsc --noEmit` are run
- THEN both commands exit with 0 errors

---

## Out of Scope

- `recalcularTotal()` in-memory refactor
- `withTenant()` overhead optimization
- Updating `provision_tenant` to include indexes for new tenants
- Running `supabase/migrations/20260804120000_add_perf_indexes.sql` (manual step)
