# Admin Role Switcher Specification

## Purpose

Defines what MUST be true after the admin-role-switcher change is applied. The admin user of a tenant MUST be able to navigate between admin, mesero, and cocina views from a single session without reauthenticating, without breaking the role model, and with a clear path back from cocina to the admin panel.

---

## Requirements

### Requirement: Tenant Admin Receives All Operational Roles at Creation

When a new tenant is provisioned via `/setup`, the initial admin user MUST receive ADMIN, MESERO, and COCINA roles simultaneously. This MUST happen transparently — no form change, no extra step for the user.

The system MUST insert all three roles into `master.usuario_roles` atomically as part of the same tenant-creation transaction.

#### Scenario: New tenant created via setup flow

- GIVEN a superadmin submits the `/setup` form with valid tenant and admin credentials
- WHEN the tenant provisioning service creates the admin user
- THEN `master.usuario_roles` contains rows for ADMIN, MESERO, and COCINA for that user
- AND the JWT issued at first login includes all three roles in `roles[]`

#### Scenario: Role assignment does not affect the setup form UX

- GIVEN the `/setup` form is rendered
- WHEN the superadmin fills in tenant name, slug, and admin credentials
- THEN no additional role-selection field is visible
- AND submission succeeds without any role input from the user

---

### Requirement: Admin Sidebar Shows Role-Conditional Navigation Links

The admin sidebar (desktop and mobile) MUST display a distinct "Cambiar vista" section containing links to `/mesero` and/or `/cocina` when the authenticated user's JWT contains those roles. Links MUST NOT appear when the role is absent from the JWT.

#### Scenario: Admin with all three roles sees both links

- GIVEN an authenticated user whose JWT contains ADMIN, MESERO, and COCINA
- WHEN the admin layout renders
- THEN the sidebar contains a "Cambiar vista" section
- AND that section contains a link to `/mesero`
- AND that section contains a link to `/cocina`

#### Scenario: Admin missing MESERO role does not see mesero link

- GIVEN an authenticated user whose JWT contains ADMIN and COCINA but NOT MESERO
- WHEN the admin layout renders
- THEN the sidebar does NOT contain a link to `/mesero`
- AND the sidebar DOES contain a link to `/cocina`

#### Scenario: Role-conditional links navigate without 403

- GIVEN a user with ADMIN + MESERO roles
- WHEN the user clicks the "Vista Mesero" link in the sidebar
- THEN the browser navigates to `/mesero` with HTTP 200
- AND no authentication error occurs

---

### Requirement: Cocina View Provides Return Path for Admin Users

The `/cocina` page MUST display a "Volver al panel" button in its header when the authenticated user's JWT contains the ADMIN role. The button MUST navigate to `/admin`. The button MUST NOT be visible to users who do not have the ADMIN role.

#### Scenario: Admin user sees the back button in cocina

- GIVEN an authenticated user whose JWT contains ADMIN and COCINA
- WHEN the `/cocina` page renders
- THEN a "Volver al panel" button is visible in the page header
- AND clicking it navigates the user to `/admin`

#### Scenario: Cocina-only user does not see the back button

- GIVEN an authenticated user whose JWT contains only COCINA
- WHEN the `/cocina` page renders
- THEN no "Volver al panel" button is visible

---

### Requirement: Existing Tenant Admins Receive Missing Roles via Backfill Migration

Tenant admin users created before this change MUST receive MESERO and COCINA roles via an idempotent SQL migration. The migration MUST use `ON CONFLICT DO NOTHING` to be safe to run multiple times. The migration MUST include a `down.sql` that reverses the backfill.

#### Scenario: Migration runs against a tenant with existing admin lacking roles

- GIVEN a tenant admin user exists in `master.usuario_roles` with only the ADMIN role
- WHEN the backfill migration is applied
- THEN `master.usuario_roles` gains MESERO and COCINA rows for that user
- AND running the migration a second time produces no error and no duplicate rows

#### Scenario: Migration down reverses the backfill

- GIVEN the up migration has been applied
- WHEN the down migration is applied
- THEN the MESERO and COCINA rows added by the backfill are removed for tenant admin users
- AND ADMIN rows are unaffected

---

### Requirement: No Changes to Middleware or Auth Service

The implementation MUST NOT modify `src/middleware.ts` or `src/lib/services/auth.ts`. Multi-role JWT validation and route gating MUST remain unchanged.

#### Scenario: Middleware accepts multi-role JWT without modification

- GIVEN a user JWT contains ADMIN, MESERO, and COCINA
- WHEN that user accesses `/mesero`
- THEN middleware grants access using the existing role intersection logic
- AND no code in `src/middleware.ts` was modified by this change

---

## Tenant Isolation

All role writes target `master.usuario_roles` (master schema). No tenant-schema tables are touched. Isolation guarantee: roles assigned to admin user in tenant A do not affect any user in tenant B.

## Post-Backfill Re-login Requirement

Roles are baked into the JWT at login time. Existing admin users MUST re-login after the backfill migration to receive a JWT that includes the new roles. This SHOULD be documented in release notes.
