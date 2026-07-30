# Design: Admin Role Switcher

## 1. Architecture Overview

Purely additive change layered on the existing multi-role auth model. No middleware, JWT, or auth-service changes. Two axes of work:

1. **Data axis** — extend the tenant-admin bootstrap so its user row in `master.usuarios` acquires all three tenant-facing roles (`ADMIN` + `MESERO` + `COCINA`) at creation time, and backfill this for existing tenants.
2. **UI axis** — surface conditional navigation entries in the admin shell (sidebar + bottom nav) and a return button in the fullscreen cocina screen. All conditional rendering is driven by `useAuth().hasRole(...)`, which already reads the `roles[]` array embedded in the signed JWT.

The design deliberately preserves the least-privilege model for non-admin operators (a plain `MESERO` or `COCINA` user gets no extra roles) and does not touch the middleware `ROLE_GATES` array — a user carrying multiple roles already passes any gate whose set intersects.

## 2. Component Map

```
┌─────────────────────────────────────────────────────────────┐
│  Superadmin flow (existing)                                 │
│  ─────────────────────────────                              │
│  createTenant()  ──►  master.invitaciones (token)           │
│                       │                                     │
│                       ▼                                     │
│  /setup/[token] page ──► POST /api/setup/[token]/complete   │
│                            │                                │
│                            ▼                                │
│         ┌──────────────────────────────────────┐            │
│  MOD ►  │  completarSetup(sql, token, creds)   │            │
│         │  INSERT usuarios ..                  │            │
│         │  INSERT usuario_roles ('ADMIN')      │            │
│         │  INSERT usuario_roles ('MESERO') NEW │            │
│         │  INSERT usuario_roles ('COCINA') NEW │            │
│         └──────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Client shell (existing + additive)                         │
│  ──────────────────────────                                 │
│                                                             │
│  AuthContext ──► useAuth() { roles, hasRole }               │
│         │                                                   │
│         ├──► admin/layout.tsx                               │
│         │      └─ NEW RoleSwitcher (sidebar + bottom nav)   │
│         │           • "Ir a mesero"  if hasRole('MESERO')   │
│         │           • "Ir a cocina"  if hasRole('COCINA')   │
│         │                                                   │
│         └──► cocina/page.tsx (fullscreen, no layout)        │
│                └─ NEW "Volver al panel"                     │
│                    • header button, hasRole('ADMIN') only   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Backfill (one-shot SQL migration)                          │
│  ────────────────────────────                               │
│  00000000000003_admin_roles_backfill.sql                    │
│    INSERT usuario_roles (id, 'MESERO')                      │
│      SELECT id FROM master.usuarios u                       │
│        WHERE EXISTS (usuario_roles r                        │
│                        WHERE r.usuario_id=u.id              │
│                          AND r.rol='ADMIN')                 │
│        AND u.tenant_slug IS NOT NULL                        │
│      ON CONFLICT DO NOTHING;                                │
│    -- same for COCINA                                       │
└─────────────────────────────────────────────────────────────┘
```

## 3. Data Flow

### 3.1 New tenant admin (post-change)
1. Superadmin POSTs to `/api/tenants` → `createTenant()` in `src/lib/services/tenants.ts` (unchanged) issues invitation.
2. Invited user submits credentials at `/setup/[token]` → `completarSetup()` in `src/lib/services/setup.ts` (MODIFIED) inserts the user row and now three role rows inside the same transaction.
3. First login yields a JWT containing `roles: ['ADMIN','MESERO','COCINA']`.
4. Middleware unchanged — `ROLE_GATES` for `/admin`, `/mesero`, `/cocina` each pass because `roles[]` intersects.

### 3.2 Existing tenant admin (post-backfill)
1. Migration `00000000000003_admin_roles_backfill.sql` inserts the missing rows.
2. On the user's **next login**, the new JWT carries the extra roles. Existing sessions keep the old JWT until re-login (documented risk from proposal).

### 3.3 Client navigation
1. `AdminLayout` mounts → `useAuth()` returns `roles`.
2. `RoleSwitcher` renders zero, one, or two extra links depending on which roles are present. No network call, no additional state.
3. Click on "Ir a cocina" → `next/link` navigates to `/cocina`. Middleware sees `COCINA` in JWT roles → allowed.
4. On `/cocina`, header renders "Volver al panel" only when `hasRole('ADMIN')` → click calls `router.push('/admin')`.

## 4. Integration Points

| # | Point | Contract | Notes |
|---|-------|----------|-------|
| 1 | `completarSetup()` in `src/lib/services/setup.ts` | Adds two additional `INSERT INTO master.usuario_roles` inside the existing `sql.begin` transaction | Atomic with the user insert — either all four rows land or none |
| 2 | `AdminLayout` in `src/app/admin/layout.tsx` | Renders `<RoleSwitcher />` between `<nav>` and the footer; also in the mobile bottom nav | No prop drilling — `RoleSwitcher` calls `useAuth()` itself |
| 3 | `RoleSwitcher` component (NEW) at `src/components/admin/RoleSwitcher.tsx` | Client component. Reads `useAuth()`, renders 0-2 `<Link>`s | Accepts a `variant: 'sidebar' \| 'bottom-nav'` prop for layout switching |
| 4 | `CocinaPage` in `src/app/cocina/page.tsx` | Header shows extra button when `useAuth().hasRole('ADMIN')` | Existing header keeps `ThemeToggle` + `LogoutButton`; new button sits to the left of them |
| 5 | Migration `supabase/migrations/00000000000003_admin_roles_backfill.sql` | Idempotent (`ON CONFLICT DO NOTHING`), scoped to users with `tenant_slug IS NOT NULL` who already hold `ADMIN` | Ships with a `down.sql` snippet in a header comment for rollback |

## 5. Architectural Decisions (ADR-style)

### ADR-001 — Extract `RoleSwitcher` into its own component
- **Decision**: Create `src/components/admin/RoleSwitcher.tsx` rather than inlining the logic in `AdminLayout`.
- **Rationale**: `AdminLayout` already carries desktop sidebar + mobile bottom-nav rendering with two `nav.map(...)` loops; adding a role-conditional section inline in both would duplicate the `useAuth()` read and the conditional rendering. Extraction keeps `AdminLayout` focused on layout structure and puts role-driven navigation next to its own concerns.
- **Alternatives rejected**:
  - *Inline in `layout.tsx`*: shorter diff but duplicates conditional rendering in two places and mixes layout with role logic. Rejected because the mobile bottom nav needs a different visual variant, and duplicating conditionals across two render locations is fragile.
  - *Push into `AuthContext`*: rejected — context should expose primitives (`roles`, `hasRole`), not render UI.
- **Consequence**: One new file. `AdminLayout` imports `RoleSwitcher` and passes a `variant` prop.

### ADR-002 — Insert extra roles inside `completarSetup()`, not `createTenant()`
- **Decision**: The MESERO + COCINA role inserts live in `src/lib/services/setup.ts::completarSetup()`, extending the existing transaction that already inserts the user + `ADMIN` role. `src/lib/services/tenants.ts::createTenant()` is not modified.
- **Rationale**: The tenant-admin `usuarios` row does not exist at tenant creation time — `createTenant()` only issues an invitation (`master.invitaciones`). The user row is materialized when the invitee redeems the invite in `completarSetup()`. That is the only place where we hold a valid `usuario_id` in a transaction that also creates its first role. Doing the extra inserts here is atomic and requires no cross-service changes.
- **Alternatives rejected**:
  - *Trigger on `master.usuario_roles` insert of `ADMIN`*: rejected — hides business logic in the DB, harder to test and debug from application code.
  - *Post-setup service call*: rejected — introduces a second transaction and a failure window where the admin exists but only holds `ADMIN`.
- **Consequence**: The proposal's "Affected Areas" line mentioning `src/lib/services/tenants.ts` is superseded by this decision. The spec and tasks must target `setup.ts`.

### ADR-003 — Do not touch middleware or JWT layer
- **Decision**: `src/middleware.ts` (`ROLE_GATES`) and `src/lib/services/auth.ts` are untouched.
- **Rationale**: The current middleware already computes `gate.roles.some(r => session.roles.includes(r))`, which allows a user carrying `['ADMIN','MESERO','COCINA']` to pass any of the three gates. The JWT already ships `roles[]` (see `AuthContext.roles`). No new capability is needed at the auth boundary.
- **Alternatives rejected**:
  - *Per-request "active role" concept*: rejected — introduces impersonation semantics, breaks audit trails, and is explicitly out of scope in the proposal.
  - *Widening `ROLE_GATES`*: rejected — would relax gates for everyone, not just admins.
- **Consequence**: Reviewers should be able to grep for `middleware.ts` and `services/auth.ts` in the diff and find nothing.

### ADR-004 — Backfill via one-shot idempotent SQL migration
- **Decision**: Ship `supabase/migrations/00000000000003_admin_roles_backfill.sql` with `INSERT ... ON CONFLICT DO NOTHING`, scoped to users who already have `ADMIN` and a non-null `tenant_slug`.
- **Rationale**: Aligns with the project's Supabase-migration convention (`supabase/migrations/*.sql`, run manually per the project CLAUDE.md). Idempotency lets it be safely re-run. The `tenant_slug IS NOT NULL` filter excludes SUPERADMIN users from getting tenant roles.
- **Alternatives rejected**:
  - *Node one-off script*: rejected — inconsistent with existing migration convention and harder to review.
  - *Trigger on future ADMIN role assignments*: rejected — mixes backfill with steady-state policy; steady state is already handled by ADR-002.
- **Consequence**: Existing admins must re-login to get a JWT reflecting the new roles. This is documented in release notes (proposal risk row).

### ADR-005 — Cocina "Volver al panel" is inline, not in a shared layout
- **Decision**: The button is rendered directly inside the existing header block of `src/app/cocina/page.tsx`.
- **Rationale**: `/cocina` has no route-level layout (unlike `/admin`), it is a single fullscreen client page. Introducing a new layout file just for one conditional button would inflate the surface area and change how the page is composed. The header already houses `ThemeToggle` and `LogoutButton` — the new button belongs in the same cluster.
- **Alternatives rejected**:
  - *New `app/cocina/layout.tsx`*: rejected — over-engineering for one button; would also require re-plumbing `ThemeToggle`/`LogoutButton` placement.
  - *Global floating action button*: rejected — pollutes non-admin operator view, harder to make role-conditional cleanly.
- **Consequence**: The `cocina/page.tsx` diff gets slightly bigger, but no new file is created for it.

## 6. Data Model Changes

None. All new rows land in existing tables:

- `master.usuario_roles(usuario_id, rol)` — additional rows only, using the existing `CHECK (rol IN ('SUPERADMIN','ADMIN','MESERO','COCINA'))` constraint and existing composite PK, which naturally supports `ON CONFLICT DO NOTHING`.

No schema-per-tenant tables touched. No index changes.

## 7. Failure & Rollback Modes

| Failure | Detection | Mitigation |
|---------|-----------|------------|
| `completarSetup` fails after ADMIN insert but before MESERO/COCINA insert | Transaction rollback | Guaranteed atomic — the surrounding `sql.begin` covers all four inserts |
| Backfill migration re-run | Duplicate rows | `ON CONFLICT DO NOTHING` on the composite PK |
| Backfill accidentally targets SUPERADMIN | Wrong grant | Filter `WHERE tenant_slug IS NOT NULL` |
| Existing admin still sees old sidebar after backfill | JWT not refreshed | Documented — user must log out/in; no code fix |
| UI shows link but backend rejects (403) | JWT lacks role | Same as above; conditional rendering keys off JWT, so a link only appears when the JWT itself carries the role — the 403 case is impossible for users seeing the link |

Rollback path is as documented in the proposal, plus the `down.sql` block in the migration header.

## 8. Testing Strategy (design-level)

Actual test cases belong in the spec, but at the architectural level the change is verifiable via:

- **Unit (service)**: `completarSetup` — assert three rows in `master.usuario_roles` after a successful run, and zero rows after a forced failure inside the transaction.
- **Integration (page)**: mount `AdminLayout` with mocked `AuthContext` variants — no extra roles → base nav only; with MESERO → one extra link; with both → two extra links.
- **Integration (page)**: mount `CocinaPage` with `hasRole('ADMIN')=true` vs `false` — button present vs absent.
- **DB**: dry-run the backfill migration twice against a seeded DB — no duplicate-key errors, correct row count on first run, zero deltas on second.

## 9. Open Questions / Assumptions

- **Assumption**: The existing `AuthContext` re-reads `localStorage` on mount and stays in sync with the current session — no reactive update needed after backfill because we require re-login.
- **Assumption**: There is no upcoming redesign of `/cocina` that would move it under a layout file within the same PR window; if there were, ADR-005 would need revisiting.
- **Open**: The proposal notes a future "multi-role assignment UI in `/admin/usuarios`" — this design does not preclude it; that feature can later share the same `master.usuario_roles` shape without migration.
