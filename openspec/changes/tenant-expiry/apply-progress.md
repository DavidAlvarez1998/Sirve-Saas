# Apply Progress — tenant-expiry

## Ordered task checklist

- [x] TAREA-1 — SQL migration
- [x] TAREA-2 — Type + service layer
- [x] TAREA-3 — PATCH /api/admin/tenants/[slug]
- [x] TAREA-4 — GET /api/me/tenant
- [x] TAREA-5 — Order creation expiry guard
- [x] TAREA-6 — ExpiryBanner component + admin layout injection
- [x] TAREA-7 — Superadmin UI — expiry badge in tenant list
- [x] TAREA-8 — Superadmin UI — edit modal + client API helper

## Files changed

| File | Task | Action |
|------|------|--------|
| `supabase/migrations/20260804130000_tenant_expiry.sql` | TAREA-1 | New |
| `src/types/index.ts` | TAREA-2 | Modified |
| `src/lib/schemas/index.ts` | TAREA-2 | Modified |
| `src/lib/services/tenants.ts` | TAREA-2 | Modified |
| `src/app/api/admin/tenants/[slug]/route.ts` | TAREA-3 | Modified (added PATCH) |
| `src/app/api/me/tenant/route.ts` | TAREA-4 | New |
| `src/app/api/ordenes/route.ts` | TAREA-5 | Modified |
| `src/components/admin/ExpiryBanner.tsx` | TAREA-6 | New |
| `src/app/admin/layout.tsx` | TAREA-6 | Modified |
| `src/app/superadmin/page.tsx` | TAREA-7, TAREA-8 | Modified |
| `src/components/superadmin/ExpiryModal.tsx` | TAREA-8 | New |
| `src/lib/api/tenants.ts` | TAREA-8 | Modified |

## Notes

- ExpiryBanner reads tenantSlug from `localStorage['sirve_auth'].tenantId`.
- axios interceptor already prefers `data.message` — no change needed for 403 spec scenario.
- `isTenantExpired` returns `false` (not throw) when tenant slug not found — safe POST guard default.
- Modal transforms `YYYY-MM-DD` → `YYYY-MM-DDT23:59:59.999Z` per ADR-6.
- Badge `warning` variant confirmed in Badge.tsx.
