# Tasks — tenant-expiry

## Dependency graph

```
TAREA-1 (migration)
    └── TAREA-2 (types + service)
            ├── TAREA-3 (PATCH endpoint)  ──┐
            ├── TAREA-4 (GET /me/tenant)    │
            └── TAREA-5 (ordenes guard)     │
                                            │
            TAREA-4 ──> TAREA-6 (banner)    │
            TAREA-3 ──> TAREA-7 (badge) ──> TAREA-8 (modal)
```

Sequential chain: **1 → 2 → {3, 4, 5 parallel} → {6 parallel with 7} → 8**

---

## TAREA-1 — SQL migration

**File**: `supabase/migrations/20260804130000_tenant_expiry.sql`
**Depends on**: nothing
**Parallel with**: nothing (blocks all others)

**What to do**:
- `ALTER TABLE master.tenants ADD COLUMN IF NOT EXISTS fecha_vencimiento TIMESTAMPTZ NULL DEFAULT NULL;`
- Include rollback comment: `-- Rollback: ALTER TABLE master.tenants DROP COLUMN fecha_vencimiento;`
- No backfill, no index.

**Acceptance check**:
- File exists at the path above.
- Running against live DB with existing rows leaves all `fecha_vencimiento = NULL`.
- Re-running is safe (`IF NOT EXISTS`).

**Spec link**: Requirement: Expiry Column — "Existing tenant unaffected by migration".

---

## TAREA-2 — Type + service layer

**Files**:
- `src/types/index.ts`
- `src/lib/services/tenants.ts`
- `src/lib/schemas/index.ts`

**Depends on**: TAREA-1
**Parallel with**: can be authored concurrently with TAREA-1

**What to do**:

`src/types/index.ts`:
- Add `fechaVencimiento?: string | null` to `Tenant` interface.
- Add new interface `TenantExpiryState { fechaVencimiento: string | null; diasRestantes: number | null; vencida: boolean }`.

`src/lib/schemas/index.ts`:
- Add `UpdateTenantExpirySchema = z.object({ fechaVencimiento: z.string().datetime().nullable() })`.

`src/lib/services/tenants.ts`:
- Add `fecha_vencimiento: Date | null` to `TenantRow`.
- In `toTenant()`: serialize via `.toISOString()` (guard for null).
- All existing SELECT queries (`listTenants`, `getTenant`, `createTenant`, `desactivarTenant`): include `fecha_vencimiento` in column list.
- Add `updateTenantExpiry(sql, slug, fecha: Date | null): Promise<Tenant>` — `UPDATE master.tenants SET fecha_vencimiento = $fecha WHERE slug = $slug RETURNING *`.
- Add `getTenantExpiryState(sql, slug): Promise<TenantExpiryState>` — single query using `NOW()` for DB-clock computation. SQL for `dias_restantes`: `FLOOR(EXTRACT(EPOCH FROM (fecha_vencimiento - NOW())) / 86400)::int`. `vencida`: `fecha_vencimiento IS NOT NULL AND fecha_vencimiento < NOW()`.
- Add `isTenantExpired(sql, slug): Promise<boolean>` — `SELECT (fecha_vencimiento IS NOT NULL AND fecha_vencimiento < NOW()) AS vencida FROM master.tenants WHERE slug = $slug`.

**Acceptance check**:
- TypeScript compiles with no errors on changed files.
- `updateTenantExpiry(sql, 'demo', null)` clears the column.
- `getTenantExpiryState` returns `{ fechaVencimiento: null, diasRestantes: null, vencida: false }` when column is NULL.
- `isTenantExpired` returns `false` when NULL, `true` when `< NOW()`.

**Spec links**: Requirement: Expiry Column (evaluation scenario); all downstream service call requirements.

---

## TAREA-3 — PATCH /api/admin/tenants/[slug]

**File**: `src/app/api/admin/tenants/[slug]/route.ts` (extend existing — add `PATCH` export)
**Depends on**: TAREA-2
**Parallel with**: TAREA-4, TAREA-5

**What to do**:
- File already has `GET`. Add `export async function PATCH(req, ctx)`.
- Pattern: role check (`SUPERADMIN`) → parse body with `UpdateTenantExpirySchema` → convert to `new Date(fechaVencimiento)` or `null` → `TenantsService.updateTenantExpiry(masterDb(), slug, fecha)` → `apiSuccess(tenant)`.
- On Zod failure: `throw new ValidationError(...)`.
- Non-SUPERADMIN: `throw new ForbiddenError()` → 403.

**Acceptance check**:
- SUPERADMIN + `{ "fechaVencimiento": "2026-09-01T00:00:00Z" }` → 200 with updated tenant.
- Non-SUPERADMIN JWT → 403.
- `{ "fechaVencimiento": "not-a-date" }` → 400 `{ message: "..." }`.
- `{ "fechaVencimiento": null }` → 200, column cleared.

**Spec links**: Requirement: SUPERADMIN Set/Clear Expiry — all four scenarios.

---

## TAREA-4 — GET /api/me/tenant

**File**: `src/app/api/me/tenant/route.ts` (new file, new directory)
**Depends on**: TAREA-2
**Parallel with**: TAREA-3, TAREA-5

**What to do**:
- New route file. `export const runtime = 'nodejs'`.
- `export async function GET(req: NextRequest)`.
- `getContext(req)` → `{ user, tenantSlug }`.
- Role check: `if (!user.roles.includes('ADMIN')) throw new ForbiddenError()`.
- Guard: `if (!tenantSlug || tenantSlug === '__master__') throw new ForbiddenError()`.
- `const sql = masterDb()` → `TenantsService.getTenantExpiryState(sql, tenantSlug)`.
- Return `apiSuccess(result)`.
- Creates new directory `src/app/api/me/tenant/`.

**Acceptance check**:
- ADMIN JWT → 200 `{ fechaVencimiento, diasRestantes, vencida }`.
- Non-ADMIN JWT → 403.
- NULL column → `{ fechaVencimiento: null, diasRestantes: null, vencida: false }`.
- Tenant A ADMIN cannot read Tenant B data (tenantSlug from JWT only).

**Spec links**: Requirement: GET /api/me/tenant — all five scenarios.

---

## TAREA-5 — Order creation expiry guard

**File**: `src/app/api/ordenes/route.ts` (extend existing POST handler)
**Depends on**: TAREA-2
**Parallel with**: TAREA-3, TAREA-4

**What to do**:
- Add `masterDb` to import from `@/lib/db` (currently only `withTenant`).
- Add `import * as TenantsService from '@/lib/services/tenants'`.
- Add `ForbiddenError` to imports from `@/lib/errors`.
- In `POST` handler, BEFORE `req.json()` call, add:
  ```ts
  const expired = await TenantsService.isTenantExpired(masterDb(), tenantSlug)
  if (expired) throw new ForbiddenError('Suscripción vencida. No es posible crear órdenes.')
  ```
- `GET` handler: no change.

**Acceptance check**:
- Expired tenant POST → 403 `{ message: "Suscripción vencida. No es posible crear órdenes." }`, no order written.
- NULL expiry POST → proceeds to `withTenant()`, order created normally.
- Future expiry POST → proceeds normally.
- GET ordenes with expired tenant → no 403 (guard only on POST).
- axios interceptor already uses `data.message` over generic 403 — no client change needed.

**Spec links**: Requirement: Order Creation Expiry Guard — all six scenarios.

---

## TAREA-6 — ExpiryBanner component + admin layout injection

**Files**:
- `src/components/admin/ExpiryBanner.tsx` (new file)
- `src/app/admin/layout.tsx` (inject banner)

**Depends on**: TAREA-4
**Parallel with**: TAREA-7

**What to do**:

`src/components/admin/ExpiryBanner.tsx`:
- `'use client'` component.
- On mount: read `localStorage.getItem('sirve_banner_dismissed_{tenantSlug}')`. If set, skip fetch and render null.
- Fetch `getMyTenantExpiry()` from `src/lib/api/tenants.ts` (added in TAREA-8 — inline `fetch('/api/me/tenant')` if TAREA-8 not yet done).
- Render null if: dismissed, no state, or `!vencida && diasRestantes > 5`.
- Yellow banner (`diasRestantes <= 5 && !vencida`): `"Tu suscripción vence en {N} días. Contactá al administrador."`.
- Red banner (`vencida`): `"Tu suscripción ha vencido. La creación de órdenes está bloqueada."`.
- Dismiss button: `localStorage.setItem('sirve_banner_dismissed_{tenantSlug}', '1')` then hide.
- Get `tenantSlug` from `JSON.parse(localStorage.getItem('sirve_auth') ?? '{}').tenantSlug`.
- Use existing design tokens / UI primitives (no new deps).

`src/app/admin/layout.tsx`:
- Import `ExpiryBanner`.
- Change children render: `<AppLayout ...><ExpiryBanner />{children}</AppLayout>`.

**Acceptance check**:
- ADMIN with 3 days remaining: yellow banner "3 días".
- Expired ADMIN: red banner.
- Dismiss → hidden; re-render still hidden.
- NULL expiry → no banner.
- MESERO / COCINA layouts unaffected.

**Spec links**: Requirement: Admin Expiry Banner — all four scenarios.

---

## TAREA-7 — Superadmin UI — expiry badge in tenant list

**File**: `src/app/superadmin/page.tsx`
**Depends on**: TAREA-2 (Tenant type has `fechaVencimiento`)
**Parallel with**: TAREA-6
**Note**: TAREA-8 also modifies this file — TAREA-7 MUST complete before TAREA-8 starts.

**What to do**:
- Add `"Vencimiento"` column to the tenant table.
- Inline `ExpiryBadge` helper component (or function) within the file:
  - `fechaVencimiento === null | undefined` → muted `"Sin vencimiento"` badge.
  - `vencida === true` → red/destructive `"Vencida"` badge.
  - `diasRestantes !== null && diasRestantes <= 5` → yellow warning `"Vence en {N} d"` badge.
  - Otherwise → muted date display (`"Vence: {date}"`).
- Compute `diasRestantes` and `vencida` from `Tenant.fechaVencimiento` on the client using `Date.now()` (display only — server is authoritative for guards).

**Acceptance check**:
- NULL expiry → "Sin vencimiento" badge.
- Expired → red "Vencida" badge.
- ≤5 days → yellow warning badge.
- Badge updates in-place after TAREA-8 modal save (via `setTenants` state update).

**Spec links**: Requirement: Superadmin UI — badge scenarios.

---

## TAREA-8 — Superadmin UI — edit modal + client API helper

**Files**:
- `src/components/superadmin/ExpiryModal.tsx` (new file, new directory)
- `src/app/superadmin/page.tsx` (wire modal — after TAREA-7)
- `src/lib/api/tenants.ts` (add two client helpers)

**Depends on**: TAREA-3, TAREA-7
**Parallel with**: TAREA-6 (different files once TAREA-7 is done)

**What to do**:

`src/lib/api/tenants.ts`:
- Add `updateTenantExpiry(slug: string, isoDate: string | null): Promise<Tenant>` → `PATCH /api/admin/tenants/{slug}` with `{ fechaVencimiento: isoDate }`.
- Add `getMyTenantExpiry(): Promise<TenantExpiryState>` → `GET /api/me/tenant`.

`src/components/superadmin/ExpiryModal.tsx`:
- `'use client'`. Props: `tenant: Tenant`, `open: boolean`, `onClose: () => void`, `onSuccess: (updated: Tenant) => void`.
- `<input type="date" />` pre-filled with `tenant.fechaVencimiento?.slice(0, 10) ?? ''`.
- "Guardar" button: transforms `YYYY-MM-DD` → `YYYY-MM-DDT23:59:59.999Z`, calls `updateTenantExpiry(slug, iso)`. On success: `onSuccess(updatedTenant)`, then `onClose()`.
- "Quitar vencimiento" button: calls `updateTenantExpiry(slug, null)`. On success: `onSuccess(updatedTenant)`, then `onClose()`.
- Errors via `toast` (sonner).
- Create directory `src/components/superadmin/`.

`src/app/superadmin/page.tsx`:
- Import `ExpiryModal`.
- Add state: `const [modalTenant, setModalTenant] = useState<Tenant | null>(null)`.
- Per-row: "Editar vencimiento" button → `setModalTenant(tenant)`.
- Render `<ExpiryModal tenant={modalTenant} open={!!modalTenant} onClose={() => setModalTenant(null)} onSuccess={(updated) => { setTenants(prev => prev.map(t => t.slug === updated.slug ? updated : t)); setModalTenant(null); }} />` at page bottom.

**Acceptance check**:
- "Editar vencimiento" opens modal with pre-filled date.
- Saving a date calls PATCH → badge updates in-place, no page reload.
- "Quitar vencimiento" → badge → "Sin vencimiento" in-place.
- Modal closes on success and on cancel.

**Spec links**: Requirement: Superadmin UI — edit modal scenarios (all three).

---

## Review Workload Forecast

| Task | Files changed | Est. lines | New / Modify |
|------|--------------|------------|--------------|
| TAREA-1 | 1 | ~5 | New |
| TAREA-2 | 3 | ~80 | Modify |
| TAREA-3 | 1 | ~20 | Modify |
| TAREA-4 | 1 | ~20 | New |
| TAREA-5 | 1 | ~10 | Modify |
| TAREA-6 | 2 | ~80 | New + Modify |
| TAREA-7 | 1 | ~40 | Modify |
| TAREA-8 | 3 | ~100 | New + Modify |
| **Total** | **13** | **~355** | |

**Estimated changed lines**: ~355
**400-line budget risk**: Low-Medium (within budget; TAREA-8 is heaviest single unit at ~100 lines)
**Chained PRs recommended**: No — fits in one PR.
**Optional split**: PR-1 = TAREA-1 through TAREA-5 (backend, ~135 lines); PR-2 = TAREA-6 through TAREA-8 (UI, ~220 lines).
**Decision needed before apply**: No.
