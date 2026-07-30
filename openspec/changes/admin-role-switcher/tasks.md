# Tasks: Admin Role Switcher

Generated: 2026-07-25  
Change: `admin-role-switcher`  
Delivery strategy: `ask-on-risk`

---

## Review Workload Forecast

| Metric | Estimate |
|--------|----------|
| Files created | 2 (RoleSwitcher.tsx, migration) |
| Files modified | 3 (setup.ts, admin/layout.tsx, cocina/page.tsx) |
| Estimated lines changed | ~110 (net new) |
| 400-line budget risk | Low |
| Chained PRs recommended | No — single PR is safe |
| Decision needed before apply | No |

All work fits comfortably in one PR. No chaining required.

---

## Task List

### TASK-01 — Extend `completarSetup()` to insert 3 roles atomically

**File**: `src/lib/services/setup.ts`  
**Spec requirement**: "Tenant Admin Receives All Operational Roles at Creation"  
**Sequential after**: nothing (starting point)  
**Parallel with**: TASK-04 (migration is independent)

**What to do**:  
Inside the existing `sql.begin` transaction in `completarSetup()`, after the current `INSERT INTO master.usuario_roles ... VALUES (..., 'ADMIN')`, add two additional inserts for MESERO and COCINA. All three must be in the same transaction block — the `sql.begin` already guarantees atomicity.

Current code reference (line 94–97):
```ts
await tx`
  INSERT INTO master.usuario_roles (usuario_id, rol)
  VALUES (${Number(inserted[0].id)}, 'ADMIN')
`
```

Replace with three sequential `await tx` calls (or a single VALUES with three rows — prefer the VALUES(…),(…),(…) form for a single round-trip):
```ts
await tx`
  INSERT INTO master.usuario_roles (usuario_id, rol)
  VALUES
    (${Number(inserted[0].id)}, 'ADMIN'),
    (${Number(inserted[0].id)}, 'MESERO'),
    (${Number(inserted[0].id)}, 'COCINA')
`
```

**Done when**: unit test (or manual test) confirms `master.usuario_roles` has 3 rows after `completarSetup()` completes. Rollback on any failure still removes all 3.

---

### TASK-02 — Create `RoleSwitcher` component

**File**: `src/components/admin/RoleSwitcher.tsx` (NEW)  
**Spec requirement**: "Admin Sidebar Shows Role-Conditional Navigation Links"  
**Sequential after**: nothing (can run in parallel with TASK-01 and TASK-04)  
**Parallel with**: TASK-01, TASK-04

**What to do**:  
Create a `'use client'` component. It accepts `variant: 'sidebar' | 'bottom-nav'`. Internally calls `useAuth()` to get `hasRole`. Renders a `<Link href="/mesero">` if `hasRole('MESERO')` and a `<Link href="/cocina">` if `hasRole('COCINA')`. Returns `null` if neither role is present (no section rendered at all).

For the `sidebar` variant, wrap links in a `<div>` with a label "Cambiar vista" styled consistently with the existing sidebar nav (same classes pattern as the `nav` array links in `layout.tsx`). For `bottom-nav`, render compact icon-only links matching the mobile bottom bar style.

Icons to use (already available in the layout):
- Mesero → `UtensilsCrossed` or `Users` from `lucide-react`
- Cocina → `ChefHat` from `lucide-react` (already imported in cocina/page.tsx)

**Done when**: component renders correct links for a mocked `useAuth` with various role combinations; renders nothing when neither MESERO nor COCINA is present.

---

### TASK-03 — Wire `RoleSwitcher` into `AdminLayout`

**File**: `src/app/admin/layout.tsx`  
**Spec requirement**: "Admin Sidebar Shows Role-Conditional Navigation Links"  
**Sequential after**: TASK-02 (component must exist before import)  
**Parallel with**: TASK-05 (cocina button is independent)

**What to do**:  
1. Import `RoleSwitcher` from `@/components/admin/RoleSwitcher`.
2. In the desktop sidebar `<nav>` block (after the existing nav links, before the bottom `<div>` with ThemeToggle/LogoutButton), add `<RoleSwitcher variant="sidebar" />`.
3. In the mobile bottom nav `<nav>`, append `<RoleSwitcher variant="bottom-nav" />` after the existing mapped links.

The layout does NOT need to import `useAuth` directly — `RoleSwitcher` handles all auth logic internally.

**Done when**: sidebar renders "Cambiar vista" section with correct links for a multi-role JWT; section is absent for a single-role ADMIN JWT.

---

### TASK-04 — Write backfill migration

**File**: `supabase/migrations/00000000000003_admin_roles_backfill.sql` (NEW)  
**Spec requirement**: "Existing Tenant Admins Receive Missing Roles via Backfill Migration"  
**Sequential after**: nothing  
**Parallel with**: TASK-01, TASK-02

**What to do**:  
Write an idempotent `INSERT … ON CONFLICT DO NOTHING` that adds MESERO and COCINA rows for every `usuario_id` in `master.usuario_roles` whose `rol = 'ADMIN'` AND whose corresponding `master.usuarios.tenant_slug IS NOT NULL` (excludes SUPERADMIN).

```sql
-- down.sql (embed as comment at top for manual reference):
-- DELETE FROM master.usuario_roles
-- WHERE rol IN ('MESERO', 'COCINA')
--   AND usuario_id IN (
--     SELECT ur.usuario_id FROM master.usuario_roles ur
--     JOIN master.usuarios u ON u.id = ur.usuario_id
--     WHERE ur.rol = 'ADMIN' AND u.tenant_slug IS NOT NULL
--   );

INSERT INTO master.usuario_roles (usuario_id, rol)
SELECT ur.usuario_id, roles.rol
FROM master.usuario_roles ur
JOIN master.usuarios u ON u.id = ur.usuario_id
CROSS JOIN (VALUES ('MESERO'), ('COCINA')) AS roles(rol)
WHERE ur.rol = 'ADMIN'
  AND u.tenant_slug IS NOT NULL
ON CONFLICT DO NOTHING;
```

**Done when**: running twice against a tenant with admin-only rows produces the correct rows on the first run and zero changes on the second run.

---

### TASK-05 — Add "Volver al panel" button to CocinaPage

**File**: `src/app/cocina/page.tsx`  
**Spec requirement**: "Cocina View Provides Return Path for Admin Users"  
**Sequential after**: nothing  
**Parallel with**: TASK-03

**What to do**:  
1. Add `import { useAuth } from '@/context/AuthContext'` at the top.
2. Add `import { useRouter } from 'next/navigation'`.
3. Inside `CocinaPage`, call `const { hasRole } = useAuth()` and `const router = useRouter()`.
4. In the `<header>` block (lines 238–254 in current file), inside the right-side `<div className="flex items-center gap-2">` alongside `<ThemeToggle />` and `<LogoutButton mobile />`, prepend:

```tsx
{hasRole('ADMIN') && (
  <button
    onClick={() => router.push('/admin')}
    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-600 transition"
  >
    Volver al panel
  </button>
)}
```

Do NOT add a new layout or a global FAB — inline in the existing header per ADR-005.

**Done when**: button is visible for a user with ADMIN role; button is absent for cocina-only user; `router.push('/admin')` is called on click.

---

## Execution Order

```
TASK-01 ─┐
TASK-02 ──┤ (parallel)
TASK-04 ─┘
            ↓
          TASK-03 (needs TASK-02)
          TASK-05 (independent, can run with TASK-03)
```

Minimum sequential depth: 2 steps.

---

## Spec Traceability

| Task | Spec Requirement |
|------|-----------------|
| TASK-01 | Tenant Admin Receives All Operational Roles at Creation |
| TASK-02 | Admin Sidebar Shows Role-Conditional Navigation Links |
| TASK-03 | Admin Sidebar Shows Role-Conditional Navigation Links |
| TASK-04 | Existing Tenant Admins Receive Missing Roles via Backfill Migration |
| TASK-05 | Cocina View Provides Return Path for Admin Users |

No task touches `src/middleware.ts` or `src/lib/services/auth.ts` — satisfies "No Changes to Middleware or Auth Service."

---

## Out of Scope (explicitly excluded)

- `src/lib/services/tenants.ts` — NOT modified (ADR-002: setup.ts is the correct target)
- `src/middleware.ts` — NOT modified (ADR-003)
- `src/lib/services/auth.ts` — NOT modified (ADR-003)
- Any new route layout for `/cocina` (ADR-005)
