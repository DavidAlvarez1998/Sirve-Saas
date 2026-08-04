# Spec — tenant-expiry

## Purpose

Define the behavioral contract for tenant subscription expiry: schema change, SUPERADMIN management, ADMIN visibility, and order-creation enforcement.

---

## Requirements

### Requirement: Expiry Column

`master.tenants` MUST have a `fecha_vencimiento TIMESTAMPTZ NULL DEFAULT NULL` column.
NULL means no expiry (subscription runs indefinitely). Existing rows are unaffected.

#### Scenario: Existing tenant unaffected by migration

- GIVEN the migration runs against a live database with existing tenants
- WHEN `fecha_vencimiento` is not provided
- THEN all existing rows have `fecha_vencimiento = NULL`
- AND no existing data is altered

#### Scenario: Expiry evaluation

- GIVEN a tenant with `fecha_vencimiento IS NOT NULL`
- WHEN the DB evaluates `fecha_vencimiento < NOW()`
- THEN the tenant is considered expired
- AND a NULL value is never treated as expired

---

### Requirement: SUPERADMIN Set/Clear Expiry

`PATCH /api/superadmin/tenants/[slug]` MUST be accessible only to SUPERADMIN role.
Body: `{ fechaVencimiento: string | null }`. A valid ISO 8601 string sets the date; `null` clears it.

#### Scenario: Set a future expiry date

- GIVEN an authenticated SUPERADMIN
- WHEN PATCH `/api/superadmin/tenants/demo` with `{ "fechaVencimiento": "2026-09-01T00:00:00Z" }`
- THEN the server updates `master.tenants.fecha_vencimiento` for slug `demo`
- AND returns HTTP 200 with the updated tenant object

#### Scenario: Clear expiry

- GIVEN a tenant with `fecha_vencimiento` set
- WHEN PATCH with `{ "fechaVencimiento": null }`
- THEN `fecha_vencimiento` is set to NULL
- AND the response reflects the cleared state

#### Scenario: Non-SUPERADMIN is rejected

- GIVEN a request authenticated as ADMIN or MESERO
- WHEN PATCH `/api/superadmin/tenants/[slug]`
- THEN HTTP 403 is returned
- AND `master.tenants` is not modified

#### Scenario: Invalid ISO string is rejected

- GIVEN an authenticated SUPERADMIN
- WHEN PATCH with `{ "fechaVencimiento": "not-a-date" }`
- THEN HTTP 400 is returned with `{ message: "..." }`
- AND `master.tenants` is not modified

---

### Requirement: GET /api/me/tenant

ADMIN role MUST be able to retrieve their own tenant's expiry state.
Response: `{ fechaVencimiento: string | null, diasRestantes: number | null, vencida: boolean }`.
All computation MUST happen server-side using the DB clock.

| Field | Rule |
|---|---|
| `fechaVencimiento` | ISO 8601 string or null |
| `diasRestantes` | null if no expiry; floor of days remaining; 0 on last day; negative if expired |
| `vencida` | true only if `fecha_vencimiento IS NOT NULL AND fecha_vencimiento < NOW()` |

#### Scenario: No expiry set

- GIVEN a tenant with `fecha_vencimiento = NULL`
- WHEN ADMIN calls GET `/api/me/tenant`
- THEN `{ fechaVencimiento: null, diasRestantes: null, vencida: false }` is returned

#### Scenario: Expiry in 3 days

- GIVEN `fecha_vencimiento` is 3 days from now (DB clock)
- WHEN ADMIN calls GET `/api/me/tenant`
- THEN `diasRestantes` is 3 and `vencida` is false

#### Scenario: Expiry today

- GIVEN `fecha_vencimiento` is today but in the past (DB clock)
- WHEN ADMIN calls GET `/api/me/tenant`
- THEN `diasRestantes` is 0 or negative and `vencida` is true

#### Scenario: Non-ADMIN is rejected

- GIVEN a request without ADMIN role
- WHEN GET `/api/me/tenant`
- THEN HTTP 403 is returned

#### Scenario: Tenant isolation

- GIVEN ADMIN of tenant A
- WHEN GET `/api/me/tenant`
- THEN only tenant A's `fecha_vencimiento` is returned (derived from JWT `tenantSlug`)

---

### Requirement: Superadmin UI — Expiry Badge and Edit Modal

The superadmin tenant list MUST display an expiry badge per row and allow editing via a modal.

| State | Badge |
|---|---|
| No expiry | "Sin vencimiento" (muted) |
| ≤5 days remaining | Warning badge with days remaining |
| Expired | Red "Vencida" badge |

The modal MUST contain a date input (`type="date"`) and a "Quitar vencimiento" button.
On save: PATCH endpoint is called. On success: the list updates in-place (no full reload).

#### Scenario: Badge renders correctly for each state

- GIVEN the superadmin tenant list is displayed
- WHEN a tenant has no expiry / ≤5 days / is expired
- THEN the corresponding badge variant (muted / warning / red) renders for that row

#### Scenario: Edit modal sets expiry

- GIVEN SUPERADMIN clicks "Editar" on a tenant row
- WHEN they enter a date and save
- THEN PATCH is called with the ISO date
- AND the row badge updates in-place on success

#### Scenario: Edit modal clears expiry

- GIVEN SUPERADMIN opens the edit modal for a tenant with expiry set
- WHEN they click "Quitar vencimiento"
- THEN PATCH is called with `{ fechaVencimiento: null }`
- AND the badge changes to "Sin vencimiento"

---

### Requirement: Admin Expiry Banner

`src/app/admin/layout.tsx` MUST render a banner when `diasRestantes <= 5` or `vencida === true`.
The banner MUST be dismissible within the session via `localStorage` key `sirve_banner_dismissed_{tenantSlug}`.
Expiry data MUST be fetched from GET `/api/me/tenant` on first render and cached in React state.

| Condition | Style | Text |
|---|---|---|
| `diasRestantes <= 5` (not expired) | Yellow / warning | "Tu suscripción vence en {N} días. Contactá al administrador." |
| `vencida === true` | Red / destructive | "Tu suscripción ha vencido. La creación de órdenes está bloqueada." |

#### Scenario: Warning banner appears near expiry

- GIVEN an ADMIN whose tenant expires in 3 days
- WHEN they load any admin page
- THEN a yellow banner with "Tu suscripción vence en 3 días..." renders above the main content

#### Scenario: Expired banner appears

- GIVEN an ADMIN whose tenant is expired
- WHEN they load any admin page
- THEN a red banner with "Tu suscripción ha vencido..." renders

#### Scenario: Banner is suppressed after dismiss

- GIVEN the banner is visible
- WHEN the user dismisses it
- THEN `localStorage` key `sirve_banner_dismissed_{tenantSlug}` is set
- AND the banner does not re-render during the same session

#### Scenario: No banner when no expiry

- GIVEN a tenant with `fecha_vencimiento = NULL`
- WHEN an ADMIN loads an admin page
- THEN no banner is rendered

---

### Requirement: Order Creation Expiry Guard

`POST /api/ordenes` MUST check `master.tenants.fecha_vencimiento` via `masterDb()` BEFORE calling `withTenant()`.
If the tenant is expired, the handler MUST return HTTP 403 with `{ message: "Suscripción vencida. No es posible crear órdenes." }`.
If `fecha_vencimiento IS NULL`, the request MUST proceed normally.

The client-side axios interceptor MUST prefer the server-returned `message` over its generic 403 message.

#### Scenario: Order blocked when expired

- GIVEN a tenant with `fecha_vencimiento < NOW()`
- WHEN POST `/api/ordenes` is called (any authenticated role)
- THEN HTTP 403 with `{ message: "Suscripción vencida. No es posible crear órdenes." }` is returned
- AND no order is written to the tenant schema

#### Scenario: Order allowed when no expiry

- GIVEN a tenant with `fecha_vencimiento = NULL`
- WHEN POST `/api/ordenes` is called
- THEN the request proceeds normally past the guard

#### Scenario: Order allowed when not yet expired

- GIVEN a tenant with `fecha_vencimiento` in the future
- WHEN POST `/api/ordenes` is called
- THEN the request proceeds normally past the guard

#### Scenario: 403 message shown to client

- GIVEN the server returns HTTP 403 with `{ message: "Suscripción vencida..." }`
- WHEN the axios interceptor handles the response
- THEN the UI displays the server message, not the generic "No tenés permiso..." fallback

#### Scenario: Other routes unaffected

- GIVEN a tenant with `fecha_vencimiento < NOW()`
- WHEN any route other than POST `/api/ordenes` is called
- THEN the request proceeds without an expiry check (no 403 from this guard)

#### Scenario: Tenant isolation in guard

- GIVEN the JWT contains `tenantSlug = "restaurant-a"`
- WHEN the guard queries `masterDb()`
- THEN only `restaurant-a`'s `fecha_vencimiento` is read and evaluated
