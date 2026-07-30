# Proposal: Admin Role Switcher

## Intent

An ADMIN of a restaurant currently cannot access the mesero or cocina views without logging in as a different user. This forces context switching, extra accounts, and blocks admins from validating flows they own. We need admins to jump into `/mesero` and `/cocina` from the admin sidebar in a single click, without weakening the role model.

Success = an admin logs in once and freely navigates between admin, mesero, and cocina views; cocina remains a fullscreen kitchen display but offers a clear way back to the panel.

## Scope

### In Scope
- Assign roles `ADMIN + MESERO + COCINA` to the tenant admin user at tenant creation (superadmin flow).
- Add a "Vista rápida" section in `src/app/admin/layout.tsx` (desktop sidebar + mobile bottom nav) with conditional links to `/mesero` and `/cocina` based on JWT roles.
- Add a "Volver al panel" button in `src/app/cocina/page.tsx` header, shown only when the user has the `ADMIN` role.
- Backfill existing tenant admin users with MESERO + COCINA roles via a one-shot SQL migration.

### Out of Scope
- Changes to `src/middleware.ts` — multi-role gating already works.
- Changes to `src/lib/services/auth.ts` — JWT already carries `roles: string[]`.
- A generic "impersonation" or per-request role override system.
- Multi-role assignment UI in `/admin/usuarios` (deferred — separate change).
- Redesigning cocina into a sidebar-nav app.

## Capabilities

### New Capabilities
- `admin-role-switcher`: Allows an ADMIN user, when granted MESERO/COCINA roles, to navigate to those views from the admin sidebar and return from cocina to the admin panel.

### Modified Capabilities
- None (no existing `openspec/specs/`).

## Approach

Approach A from exploration: multi-role in DB + free navigation. The middleware already accepts any user whose `roles[]` intersects the route gate — no auth changes required.

1. **Tenant creation**: extend the superadmin tenant-provisioning service so the initial admin user is inserted into `master.usuario_roles` with all three roles (ADMIN, MESERO, COCINA).
2. **Admin sidebar**: read `roles` from `AuthContext` and render a "Vista rápida" section with `/mesero` and `/cocina` links, each conditional on `hasRole(...)`.
3. **Cocina exit**: since `/cocina` has no layout, add a "Volver al panel" button inline in its header, visible only when `hasRole('ADMIN')`.
4. **Backfill**: one-shot SQL migration inserting missing MESERO/COCINA rows for existing admin users, idempotent via `ON CONFLICT DO NOTHING`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/admin/layout.tsx` | Modified | Add "Vista rápida" section (desktop sidebar + mobile bottom nav) |
| `src/app/cocina/page.tsx` | Modified | Add "Volver al panel" button in header (ADMIN-only) |
| `src/lib/services/tenants.ts` | Modified | Insert MESERO + COCINA rows alongside ADMIN at tenant creation |
| `src/components/admin/RoleSwitcher.tsx` | New (optional) | Extracted component for the switcher UI |
| `supabase/migrations/NNN_admin_multirole_backfill.sql` | New | Backfill MESERO + COCINA for existing tenant admins |

Multi-tenant impact: master schema only. `master.usuario_roles` writes for tenant admin users. No tenant-schema changes.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Admin sees cocina/mesero links but has no role (partial backfill) | Med | Backfill migration is idempotent; links are conditional on JWT roles, so no 403 loop |
| JWT of currently-logged-in admins does not yet include new roles | High | Roles are baked into the JWT at login; admins must re-login after backfill. Document in release notes |
| Assigning MESERO/COCINA by default weakens principle of least privilege | Low | Explicitly scoped to tenant admins only; other users unchanged; future UI in `/admin/usuarios` can revoke per-user |
| Cocina "Volver al panel" button clutters kitchen-only devices | Low | Button rendered only when `hasRole('ADMIN')`; kitchen-only users (COCINA without ADMIN) see nothing new |

## Rollback Plan

1. **Sidebar/cocina UI**: revert `src/app/admin/layout.tsx`, `src/app/cocina/page.tsx`, and any new `RoleSwitcher.tsx`. No data changes required.
2. **Tenant creation**: revert `src/lib/services/tenants.ts` to insert only the ADMIN role.
3. **Backfill migration**: reversible via `DELETE FROM master.usuario_roles WHERE role IN ('MESERO','COCINA') AND user_id IN (SELECT id FROM master.usuarios WHERE ... )` — include a `down.sql` alongside the migration. Safe because these rows were auto-inserted, not user-configured.

## Dependencies

- Existing `master.usuario_roles` table and `AuthContext.roles` array (already in place).
- Middleware multi-role logic (already in place — no changes needed).

## Success Criteria

- [ ] Tenant admin created via superadmin flow receives ADMIN + MESERO + COCINA in `master.usuario_roles`.
- [ ] Admin sidebar shows "Ir a mesero" and "Ir a cocina" links only when the corresponding role is present in the JWT.
- [ ] Clicking those links navigates to `/mesero` and `/cocina` without 403.
- [ ] `/cocina` shows a "Volver al panel" button that returns to `/admin` when the user is ADMIN.
- [ ] Backfill migration adds MESERO + COCINA to all existing tenant admin users idempotently.
- [ ] No changes to `src/middleware.ts` or `src/lib/services/auth.ts`.
