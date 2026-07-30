# Spec: flat-domain-tenant

## Change Summary

Replace subdomain-based tenant routing with JWT-based tenant resolution on a single flat domain.

---

# tenant-resolution Specification

## Purpose

Defines how the application determines the active tenant for every inbound request, using the authenticated JWT as the sole source of tenant identity. Subdomain parsing is eliminated.

---

## Requirements

### Requirement: JWT Is the Sole Tenant Authority

The system MUST resolve the active tenant exclusively from the `tenantId` claim in the verified JWT. The hostname, subdomain, or any URL segment MUST NOT be used as tenant input.

#### Scenario: Authenticated request carries valid JWT with tenantId

- GIVEN a user holds a signed JWT with `tenantId: "roma"` and `role: "ADMIN"`
- WHEN they make a request to any protected route
- THEN middleware sets `x-tenant-slug: "roma"` on the forwarded request
- AND the route handler receives the correct tenant context via `getContext()`

#### Scenario: Superadmin JWT has null tenantId

- GIVEN a user holds a signed JWT with `tenantId: null` and `role: "SUPERADMIN"`
- WHEN they make a request to `/superadmin` or any `/api/superadmin/` route
- THEN middleware sets `x-tenant-slug: "__master__"`
- AND the route handler uses `masterDb()` — `withTenant()` is never called

#### Scenario: Request arrives with no JWT

- GIVEN an unauthenticated request to a protected route
- WHEN middleware evaluates the request
- THEN the request is rejected with HTTP 401
- AND no tenant context is set

#### Scenario: Request carries an expired or tampered JWT

- GIVEN a JWT that is expired or has an invalid signature
- WHEN middleware attempts to verify it
- THEN the request is rejected with HTTP 401

---

### Requirement: Public Routes Bypass JWT Verification

The system MUST allow `/login`, `/api/auth/login`, and static asset routes to proceed without a JWT. All other routes MUST require a valid JWT.

#### Scenario: Login page accessed unauthenticated

- GIVEN an unauthenticated user
- WHEN they navigate to `localhost:3000/login`
- THEN the page renders without a JWT check
- AND no redirect or 401 occurs

#### Scenario: Non-public route accessed unauthenticated

- GIVEN an unauthenticated user
- WHEN they navigate to `/admin` or call `/api/menus`
- THEN middleware redirects to `/login` (page route) or returns HTTP 401 (API route)

---

### Requirement: Login Resolves Tenant Without Prior Knowledge

The system MUST allow any user to authenticate by providing email and password only, without specifying the tenant upfront. The login endpoint MUST return a JWT containing the resolved `tenantId` and `role`.

#### Scenario: Restaurant user logs in successfully

- GIVEN a user with email `admin@roma.com` exists in `master.usuarios` with `tenantId: "roma"`
- WHEN they POST to `/api/auth/login` with valid credentials
- THEN the response contains a signed JWT with `{ tenantId: "roma", role: "ADMIN", userId }`
- AND the client stores the JWT in the `sirve_session` cookie

#### Scenario: Superadmin logs in successfully

- GIVEN a user with `role: "SUPERADMIN"` and `tenantId: null` exists in `master.usuarios`
- WHEN they POST to `/api/auth/login` with valid credentials
- THEN the response contains a signed JWT with `{ tenantId: null, role: "SUPERADMIN", userId }`

#### Scenario: Invalid credentials

- GIVEN a user provides an incorrect password or unknown email
- WHEN they POST to `/api/auth/login`
- THEN the response is HTTP 401 with `{ message: "Credenciales inválidas" }`
- AND no JWT is issued

---

### Requirement: Post-Login Role-Based Redirect

The system MUST redirect the authenticated user to the correct route based on their JWT `role` claim immediately after login.

#### Scenario: SUPERADMIN login redirect

- GIVEN a successful login with `role: "SUPERADMIN"`
- WHEN `AuthContext` processes the JWT
- THEN the browser is redirected to `/superadmin`

#### Scenario: ADMIN login redirect

- GIVEN a successful login with `role: "ADMIN"`
- WHEN `AuthContext` processes the JWT
- THEN the browser is redirected to `/admin`

#### Scenario: Role-specific routes (MESERO, COCINA)

- GIVEN a successful login with `role: "MESERO"` or `role: "COCINA"`
- WHEN `AuthContext` processes the JWT
- THEN the browser is redirected to the matching role route (`/mesero` or `/cocina`)

---

### Requirement: Cross-Tenant Isolation via JWT

The system MUST guarantee that a user's JWT `tenantId` cannot be overridden by any client-supplied value. A user with `tenantId: "roma"` MUST NOT access data belonging to another tenant.

#### Scenario: User attempts to access another tenant's data

- GIVEN a user with a valid JWT `tenantId: "roma"`
- WHEN they call an API route that reads tenant data
- THEN middleware injects `x-tenant-slug: "roma"` regardless of any other input
- AND `withTenant("roma", fn)` scopes all queries to `tenant_roma` schema only

---

### Requirement: Removal of Subdomain Tenant Resolution

The system MUST NOT contain any logic that reads or parses the hostname to derive tenant identity. `resolveTenantSlug(hostname)` MUST be deleted. No dev escape hatches or subdomain pickers SHALL exist.

#### Scenario: No devTenant picker in login UI

- GIVEN a developer running `localhost:3000`
- WHEN the login page loads
- THEN no tenant selector, `devTenant` input, or subdomain override control is present

#### Scenario: Flat domain works in local development

- GIVEN a developer running `next dev` on `localhost:3000`
- WHEN they log in with any user's credentials
- THEN the tenant is resolved from the JWT — no `/etc/hosts` changes or DNS configuration is required

---

### Requirement: Downstream Header Contract Preserved

The system MUST continue to set `x-tenant-slug`, `x-user-id`, and `x-user-role` headers on every forwarded request so that all existing route handlers receive tenant context via `getContext()` without modification.

#### Scenario: Route handler receives context unchanged

- GIVEN middleware resolves tenant from JWT
- WHEN a request reaches any of the ~25 existing route handlers
- THEN `getContext()` returns the same `{ tenantSlug, userId, role }` shape as before this change
- AND no route handler code is modified
