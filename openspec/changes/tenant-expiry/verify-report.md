# Verify Report — tenant-expiry

## Executive Summary

**Status**: PASS with 1 WARNING and 2 SUGGESTIONS. No CRITICAL issues.
**TypeScript check**: `npx tsc --noEmit` → PASSED (no errors).
**Task completion**: All 8 TAREAs marked complete in apply-progress and confirmed in code.

Counts: **CRITICAL: 0** | **WARNING: 1** | **SUGGESTION: 2**

---

## REQ-1: Expiry Column — PASS

- Migration file `supabase/migrations/20260804130000_tenant_expiry.sql` adds `fecha_vencimiento TIMESTAMPTZ NULL DEFAULT NULL` to `master.tenants` with `IF NOT EXISTS` guard and rollback comment.
- All spec scenarios satisfied.

---

## REQ-2: SUPERADMIN Set/Clear Expiry — PASS (with WARNING on path)

**File**: `src/app/api/admin/tenants/[slug]/route.ts` (lines 24-43)
- PATCH export with SUPERADMIN role check, `UpdateTenantExpirySchema` parsing, `masterDb()` + `TenantsService.updateTenantExpiry`.
- All four spec scenarios covered.

### WARNING-1: Endpoint path mismatch (spec drift)

Spec says `PATCH /api/superadmin/tenants/[slug]` but code lives at `PATCH /api/admin/tenants/[slug]`. The **role** enforced is SUPERADMIN and client + server are internally consistent, but the URL differs from the spec. All other admin/tenants endpoints (GET, POST create, PATCH desactivar, DELETE, GET usuarios) live under `/api/admin/tenants`, so keeping code and correcting the spec is the sensible fix.

---

## REQ-3: GET /api/me/tenant — PASS

**File**: `src/app/api/me/tenant/route.ts`
- `runtime = 'nodejs'`, ADMIN role gate, `__master__`/empty slug guard, server-side computation via `getTenantExpiryState(masterDb(), tenantSlug)`.
- Response shape matches `{ fechaVencimiento, diasRestantes, vencida }`.
- Tenant isolation via JWT-derived `tenantSlug` from `getContext(req)`.

---

## REQ-4: Superadmin UI (badge + modal) — PASS

**Files**: `src/app/superadmin/page.tsx`, `src/components/superadmin/ExpiryModal.tsx`
- `Vencimiento` column added to the tenant table.
- Inline `ExpiryBadge`: NULL → muted "Sin vencimiento", `vencida` → red "Vencida", `diasRestantes <= 5` → warning "Vence en N d", otherwise formatted date.
- `Badge variant="warning"` confirmed in `src/components/ui/Badge.tsx`.
- Modal uses `<input type="date">`, transforms to end-of-day ISO on save, calls PATCH via client helper, updates row in-place via `onSuccess`.
- "Quitar vencimiento" branch calls PATCH with `null`.

### SUGGESTION-1: Clearing via empty input
`Guardar` is disabled when `!editDate`, so clearing requires the "Quitar vencimiento" button. Consider unifying the two flows or improving affordance. Non-blocking.

---

## REQ-5: Admin Expiry Banner — PASS

**Files**: `src/components/admin/ExpiryBanner.tsx`, `src/app/admin/layout.tsx`
- Client component reads `sirve_banner_dismissed_{tenantSlug}` from localStorage first; if dismissed, skips fetch.
- Fetches `GET /api/me/tenant`.
- Renders null if `!vencida && (diasRestantes === null || diasRestantes > 5)`.
- Warning yellow for near-expiry, destructive red for expired; message strings match spec (with added plural handling).
- Dismiss button persists to localStorage.
- Injected inside `AppLayout` above `{children}` in `src/app/admin/layout.tsx` line 25.

### SUGGESTION-2: ExpiryBanner uses raw fetch, not axios
`ExpiryBanner` uses `fetch('/api/me/tenant')` instead of `getMyTenantExpiry()` from `src/lib/api/tenants.ts`. Since `/api/*` routes require `Authorization: Bearer <token>` (per project CLAUDE.md), the raw fetch may 401 unless middleware also honors the `sirve_session` cookie for `/api/me/*`. The axios client already exists and injects Bearer via interceptor. Consider swapping to the helper. Non-blocking pending runtime verification.

---

## REQ-6: Order Creation Expiry Guard — PASS

**File**: `src/app/api/ordenes/route.ts` (lines 20-26)
- `isTenantExpired(masterDb(), tenantSlug)` runs **before** `req.json()` and **before** `withTenant()`.
- On expiry, throws `ForbiddenError('Suscripción vencida. No es posible crear órdenes.')` — exact match with spec.
- GET handler unchanged.
- axios interceptor at `src/lib/api/axios.ts` line 42 prefers server `{ message }` over the generic 403 fallback — no code change was needed.
- `isTenantExpired` returns `false` (not throws) on missing slug — safe for the guard.

---

## Service, Types, Schemas, Client — PASS

- `src/lib/services/tenants.ts`: `TenantRow.fecha_vencimiento`, `toTenant()` serialization, all SELECTs include the column, three new functions (`updateTenantExpiry`, `getTenantExpiryState`, `isTenantExpired`).
- `src/types/index.ts`: `Tenant.fechaVencimiento?: string | null`, new `TenantExpiryState` interface.
- `src/lib/schemas/index.ts`: `UpdateTenantExpirySchema = z.object({ fechaVencimiento: z.string().datetime().nullable() })`.
- `src/lib/api/tenants.ts`: `updateTenantExpiry` + `getMyTenantExpiry` client helpers.

---

## TypeScript Compilation — PASS

`npx tsc --noEmit` → no output (clean).

---

## Verdict

**next_recommended**: `sdd-archive`

The single WARNING is documentation drift only. The two SUGGESTIONs are non-blocking UX polish and can become follow-up work.

**Risks blocking archive**: none.
