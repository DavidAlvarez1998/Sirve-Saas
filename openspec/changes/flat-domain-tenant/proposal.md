# Proposal: Flat Domain with JWT-Based Tenant Resolution

## Intent

Eliminate subdomain-based tenant routing (`roma.tuapp.com`) in favor of a single flat domain (`tuapp.com`) where the tenant is resolved from the authenticated JWT. Motivation:

- **DX**: `localhost:3000` works with zero DNS/hosts hacks.
- **Ops**: no wildcard DNS, no wildcard TLS, no per-tenant CNAME.
- **Security**: JWT is the single signed source of truth for tenant identity — removes the current "subdomain must equal JWT.tenantId" cross-check that duplicates signal.
- **Simplicity**: one login URL for every user role (superadmin, admin, waiter, kitchen). The JWT decides where they land.

## Scope

### In Scope

- `src/middleware.ts` — replace `extractSubdomain(host)` with `verifyJWT(cookie|bearer)`; set `x-tenant-slug` from `claims.tenantId` (or sentinel `__master__` for superadmin).
- `src/lib/tenant.ts` — DELETE `resolveTenantSlug(hostname)`.
- `src/context/AuthContext.tsx` — read tenant from JWT/login response instead of `window.location.hostname`.
- `src/app/(auth)/login/page.tsx` — remove `devTenant` picker (obsolete).
- Keep `src/lib/http.ts::getContext()` interface unchanged — still reads `x-tenant-slug` header. Route handlers untouched.
- Keep `src/lib/db.ts::withTenant()` and `schemaName()` regex unchanged.
- Update `middleware.ts` matcher: unauthenticated `/login` and `/api/auth/login` stay public.

### Out of Scope

- Custom domains per tenant (e.g. `pedidos.roma.com`) — deferred.
- Path-based tenant routing (`/t/roma/...`) — explicitly rejected by the user.
- Reworking `ROLE_GATES` or route authorization logic — behavior preserved.
- Schema migrations — none required.
- Rewriting route handlers or services — header contract preserved.

## Capabilities

### New Capabilities

- `tenant-resolution`: how the app determines the active tenant for every request (JWT-first, no host parsing).

### Modified Capabilities

- None (no prior specs exist; `tenant-resolution` fully replaces the implicit subdomain behavior).

## Approach

**New request flow:**

```
Request → middleware
  → read sirve_session cookie OR Authorization: Bearer
  → verifyJWT(token) → claims { userId, tenantId, role }
  → set x-tenant-slug = claims.tenantId ?? "__master__"
  → set x-user-id, x-user-role
Route handler → getContext() → withTenant(slug, fn)   [unchanged]
```

**Public routes** (no JWT required): `/login`, `/api/auth/login`, static assets. Middleware short-circuits these before verification.

**Login flow**: `/api/auth/login` already queries `master.usuarios` by email + returns `{ token, tenantSlug, role }`. No changes to this endpoint. The client stores the token; subsequent requests carry it.

**Post-login routing** (client-side): `AuthContext` reads `role` from JWT and redirects — `role=superadmin` → `/superadmin`, else → `/admin` (or role-specific route).

**Sentinel `__master__`**: middleware emits this for `tenantId === null` (superadmin). Superadmin routes call `masterDb()` directly and never invoke `withTenant()`, so the sentinel never reaches `schemaName()`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/middleware.ts` | Modified | Replace host parsing with JWT verification; keep ROLE_GATES |
| `src/lib/tenant.ts` | Removed | `resolveTenantSlug()` no longer needed |
| `src/context/AuthContext.tsx` | Modified | Tenant read from JWT, not hostname |
| `src/app/(auth)/login/page.tsx` | Modified | Remove dev tenant picker |
| `src/lib/http.ts` | Unchanged | `getContext()` still reads `x-tenant-slug` |
| `src/lib/db.ts` | Unchanged | `withTenant()`, `schemaName()` regex preserved |
| `src/app/api/**` (~25 handlers) | Unchanged | Header contract preserved |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing sessions/cookies bound to subdomain break on cutover | Med | Force re-login on deploy; document in release notes |
| Middleware misclassifies a route as public/private | Low | Explicit allowlist for `/login`, `/api/auth/login`, static; deny by default |
| JWT-only tenant means a compromised token grants full tenant access (no host cross-check) | Med | JWT signed with HS256 + 8h expiry already the trust boundary; add server-side token revocation list as follow-up if needed |
| SEO/marketing links to `roma.tuapp.com` break | Low | Add 301 redirect at edge/DNS from `*.tuapp.com` → `tuapp.com` |

## Rollback Plan

1. Revert commits touching `middleware.ts`, `AuthContext.tsx`, `login/page.tsx`.
2. Restore `src/lib/tenant.ts` from git.
3. No DB migrations to reverse.
4. Users re-login once (cookie domain change).

Rollback is safe at any point pre-DNS-cutover because the API contract (`x-tenant-slug` header) is unchanged — old and new middleware are behaviorally interchangeable from the handler's perspective.

## Dependencies

- None. Existing `JWT_SECRET`, `jose`, and `master.usuarios` schema are already in place.

## Success Criteria

- [ ] `localhost:3000/login` authenticates any role with no subdomain manipulation.
- [ ] JWT `tenantId` claim is the sole determinant of tenant context for API calls.
- [ ] `src/lib/tenant.ts` no longer exists.
- [ ] All ~25 route handlers work without modification.
- [ ] Superadmin (`tenantId: null`) reaches `/superadmin` and queries `master.*` only.
- [ ] `next build` passes; `tsc --noEmit` clean.
- [ ] Manual smoke: login as superadmin, admin, waiter — each lands on the correct route with the correct data.
