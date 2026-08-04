# Spec: perf-orden-queries

## Purpose

Performance fix for `buildOrden()` in the ordenes service and 5 missing FK indexes across tenant schemas. No functional behavior changes. All requirements below MUST be satisfied without altering the observable API contract.

---

## Requirements

### Requirement: Parallel Dependent Queries in buildOrden

The system MUST execute the three independent sub-queries of `buildOrden()` (items+productos, ingredientes, pagos) concurrently rather than sequentially.

The orden-header query MUST remain the first sequential await so that a missing orden triggers `NotFoundError` before any dependent work is attempted.

The function MUST use a single `Promise.all([...])` for the three dependent queries on the same reserved connection.

#### Scenario: Mutation path — orden with items, ingredientes, and pagos

- GIVEN a valid orden with at least one item, one ingrediente override, and one pago
- WHEN any mesero mutation calls `buildOrden(sql, id)` inside a `withTenant()` callback
- THEN the function MUST issue exactly 2 sequential awaits: the header query first, then one `Promise.all` for the three dependent queries
- AND the returned `Orden` shape MUST be identical to the pre-change behavior (same fields, same values)

#### Scenario: Empty orden

- GIVEN a valid orden that has 0 items, 0 pagos, and 0 ingrediente overrides
- WHEN `buildOrden(sql, id)` is called
- THEN the three `Promise.all` branches each return empty arrays
- AND the function MUST return a valid `Orden` object with empty arrays for those fields — no crash, no partial result

#### Scenario: Non-existent orden

- GIVEN an `id` that does not exist in the tenant schema
- WHEN `buildOrden(sql, id)` is called
- THEN the header query returns zero rows
- AND the function MUST throw `NotFoundError` (or equivalent) before issuing any dependent queries

#### Scenario: One dependent query fails inside Promise.all

- GIVEN a valid orden with data
- WHEN one of the three parallel queries rejects (e.g., transient DB error)
- THEN `Promise.all` rejects and the enclosing transaction rolls back
- AND no partial state is persisted (all three queries are read-only SELECTs — no side effect to undo)

---

### Requirement: Unchanged Public Signature and Caller Behavior

`buildOrden(sql, id)` MUST retain its exact TypeScript signature `(sql: Sql, id: number) => Promise<Orden>`.

All existing call sites MUST NOT require any changes.

#### Scenario: Call site in mesero mutations

- GIVEN any of: `crearOrden`, `addItem`, `addItems`, `updateItem`, `removeItem`, `pagarOrden`, `cambiarEstado`
- WHEN they call `buildOrden(sql, id)` at the end of their mutation
- THEN the call compiles with zero TypeScript errors and returns the same `Orden` type
- AND `tsc --noEmit` passes with zero new errors or warnings

---

### Requirement: FK Index Coverage per Tenant Schema

The system MUST have the following indexes on every `tenant_{slug}` schema after the migration is applied:

| Index name | Table | Columns |
|---|---|---|
| `idx_ordenes_mesa_id` | `ordenes` | `(mesa_id)` |
| `idx_ordenes_estado_pagada` | `ordenes` | `(estado, pagada)` |
| `idx_orden_items_orden_id` | `orden_items` | `(orden_id)` |
| `idx_orden_item_ingredientes_item_id` | `orden_item_ingredientes` | `(item_id)` |
| `idx_pagos_orden_id` | `pagos` | `(orden_id)` |

Each index MUST be created with `CREATE INDEX CONCURRENTLY IF NOT EXISTS` so the statement is idempotent and lock-free for live tenants.

#### Scenario: Migration applied to an existing tenant

- GIVEN a tenant schema `tenant_{slug}` that has rows in `ordenes`, `orden_items`, etc.
- WHEN the migration script is executed
- THEN all 5 indexes are created without acquiring an `ACCESS EXCLUSIVE` lock on any table
- AND `SELECT indisvalid FROM pg_index WHERE indexrelid = 'idx_ordenes_mesa_id'::regclass` returns `true`

#### Scenario: Migration applied a second time (idempotency)

- GIVEN the 5 indexes already exist in `tenant_{slug}`
- WHEN the migration script is run again
- THEN no error is raised (`IF NOT EXISTS` guard)
- AND the existing indexes are unmodified

#### Scenario: New tenant schema (future provisioning)

- GIVEN a new tenant schema `tenant_{slug2}` provisioned AFTER this migration was first run
- WHEN the migration script is run again for `tenant_{slug2}`
- THEN all 5 indexes are created in `tenant_{slug2}` without error

---

### Requirement: Migration File Constraints

The migration file MUST be plain SQL with NO `BEGIN` / `COMMIT` wrapper at the outer level, because `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block.

The migration MUST reside at `supabase/migrations/<timestamp>_perf_orden_indexes.sql`.

The migration MUST iterate over `master.tenants.slug` to apply each `CREATE INDEX CONCURRENTLY IF NOT EXISTS` statement per tenant schema.

#### Scenario: Migration file structure

- GIVEN the migration file at `supabase/migrations/<timestamp>_perf_orden_indexes.sql`
- WHEN the file is inspected
- THEN it MUST NOT contain a top-level `BEGIN` or `START TRANSACTION` statement
- AND it MUST loop or iterate over tenant slugs from `master.tenants`
- AND each of the 5 index statements MUST use `IF NOT EXISTS`

---

### Requirement: No Regression in API Response Shape

All route handlers that call `buildOrden()` indirectly MUST return the same JSON response shape after this change.

#### Scenario: POST /api/ordenes/[id]/items response

- GIVEN a valid add-item request
- WHEN the route handler calls `addItem()` → `buildOrden()` and returns the result
- THEN the JSON response body MUST match the pre-change `Orden` schema (same keys, same types)
- AND the HTTP status code MUST be unchanged

#### Scenario: POST /api/ordenes/[id]/items/batch response

- GIVEN a valid batch add-items request
- WHEN the route handler calls `addItems()` → `buildOrden()` and returns the result
- THEN the JSON response body MUST match the pre-change `Orden` schema
- AND the HTTP status code MUST be unchanged

---

## Out of Scope (Explicit)

The following are NOT requirements of this change and MUST NOT be implemented here:

- N+1 fix in `addItem()`, `addItems()`, `updateItem()`, `separarItem()`, `dividirOrden()`
- `recalcularTotal()` correlated-subquery refactor
- New-tenant provisioning hookup for future migration execution
- `buildOrden()` consolidation into a single JSON-agg query
- Any change to `withTenant()`, `db.ts`, pool sizes, or PgBouncer config
- Instrumentation or OpenTelemetry tracing
