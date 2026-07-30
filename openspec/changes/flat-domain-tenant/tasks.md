# Tasks: flat-domain-tenant

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 120–180 (additions + deletions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All 4 file changes + delete tenant.ts | PR 1 | Self-contained; verified by tsc + manual test |

---

## Phase 1: Foundation — Remove Dead Code

- [x] 1.1 Delete `src/lib/tenant.ts` entirely. No replacement needed; file has a single export (`resolveTenantSlug`) with no remaining callers after Phase 2.

---

## Phase 2: Core Implementation — Middleware Rewrite

- [x] 2.1 In `src/middleware.ts`, delete `extractSubdomain()` function (lines 20–23).
- [x] 2.2 Change `pageMiddleware` signature from `function pageMiddleware(req)` to `async function pageMiddleware(req): Promise<NextResponse>`.
- [x] 2.3 Replace the entire body of `pageMiddleware`: remove subdomain extraction, `__local__` dev branch, and bare-localhost bypass. New flow: (a) allow `PUBLIC_PAGE_PATHS`; (b) read `sirve_session` cookie; (c) call `jwtVerify(session.token, getSecret())`; (d) on failure → redirect `/login`; (e) check ROLE_GATES against `claims.roles`; (f) redirect `/403` on role mismatch; (g) `return NextResponse.next()`.
- [x] 2.4 Replace the API branch tenant-resolution block (lines 131–145): delete `extractSubdomain(host)` call, delete `subdomain === 'admin'` mapping, delete `__local__` dev fallback, delete `'Tenant subdomain required'` error. New single line: `const tenantSlug = (claims.tenantId as string | null) ?? '__master__'` — placed after JWT verification.
- [x] 2.5 Delete the cross-tenant guard block (lines 174–184): remove the `tenantSlug === '__master__'` / `tenantSlug !== '__local__'` / `claims.tenantId !== tenantSlug` checks. `tenantSlug` is computed from claims — the check is a tautology and dead code.
- [x] 2.6 Move the `const roles` / `const isSuperadmin` lines above the new `tenantSlug` assignment so they remain in scope after the refactor (both still read from `claims`).

---

## Phase 3: Integration — AuthContext + Login Page

- [x] 3.1 In `src/context/AuthContext.tsx`, remove the `import { resolveTenantSlug } from '@/lib/tenant'` line.
- [x] 3.2 Delete the `tenantSlug` useMemo block (the `resolveTenantSlug(window.location.hostname)` call) and the `tenantMissing` constant that follows it.
- [x] 3.3 Add `tenantSlug: auth?.tenantId ?? null` directly inside the `useMemo` value object. Remove `tenantMissing` from the value object and from the dependency array.
- [x] 3.4 Remove `tenantMissing: boolean` from the `AuthContextValue` interface.
- [x] 3.5 Remove unused `useMemo` import if `useMemo` is no longer used anywhere in the file after 3.2–3.3 (check: the value object useMemo still uses it — keep it).
- [x] 3.6 In `src/app/(auth)/login/page.tsx`, delete all dev-picker code: `DEV_PREFS_KEY`, `DEV_PREFS_CAP`, `DEFAULT_TENANT`, `DevPrefs` interface, `readDevPrefs()`, `writeDevPrefs()`, `DevShortcut` interface, `parseShortcuts()`, and the `SHORTCUTS` constant.
- [x] 3.7 Delete the `NEXT_PUBLIC_DEV_SHORTCUTS` env read and all `isLocalhost`, `devTenant`, `recentTenants` state declarations + the `useEffect` that sets them.
- [x] 3.8 Delete the `resolveTenantSlug` import and the `tenantSlug` local variable derived from it.
- [x] 3.9 Remove `tenantMissing` from the `useAuth()` destructure and delete the early-return error screen that renders when `tenantMissing && !isLocalhost`.
- [x] 3.10 Remove the `handleShortcutClick` function and the `{showShortcuts && ...}` JSX block from the render.
- [x] 3.11 Simplify `handleSubmit`: remove `effectiveTenant`, `isLocalhost` branch, and `writeDevPrefs` call. Keep `login(username, password)` call, roles extraction, and `router.replace(redirect.path)`.

---

## Phase 4: Verification — Type-check + Smoke Tests

- [x] 4.1 Run `tsc --noEmit` from project root. Expected: zero errors. Confirm `src/lib/tenant.ts` absence does not surface unused-module warnings (it should not — callers were removed first).
- [ ] 4.2 Verify test point 1: `POST /api/auth/login` with no auth header reaches the handler (public bypass) and `x-tenant-slug: __master__` is forwarded.
- [ ] 4.3 Verify test point 2: `GET /api/ordenes` with Bearer JWT `tenantId=roma` → middleware sets `x-tenant-slug: roma`. Confirm `getContext()` returns `{ tenantSlug: 'roma', ... }`.
- [ ] 4.4 Verify test point 3: superadmin JWT (`tenantId: null`) → `x-tenant-slug: __master__`.
- [ ] 4.5 Verify test point 4: missing Bearer on protected API → 401 `"Authorization header required"`.
- [ ] 4.6 Verify test point 5: tampered/expired JWT → 401 `"Invalid or expired token"`.
- [ ] 4.7 Verify test point 6: page request with valid ADMIN cookie → `jwtVerify` passes → `/admin` renders.
- [ ] 4.8 Verify test point 7: MESERO cookie visiting `/admin` → redirect `/403`.
- [ ] 4.9 Verify test point 8: tampered cookie JSON (`roles: ["ADMIN"]` but JWT signed as MESERO) → `jwtVerify` rejects → redirect `/login`.
- [ ] 4.10 Verify test point 9: expired JWT cookie → redirect `/login`, `sirve_session` cookie cleared.
- [ ] 4.11 Verify test point 10: `AuthContext` — `tenantSlug` is `null` before login, equals `claims.tenantId` (or `__master__`) after login.
- [ ] 4.12 Verify test point 11: bare `localhost:3000/login` renders without error screen, submit succeeds, role redirect fires.

---

## Phase 5: Cleanup

- [x] 5.1 Remove `NEXT_PUBLIC_DEV_SHORTCUTS` from `.env.local` (and `.env.example` if it exists). Added comment in `env.local.example.txt`: `# DEV_SHORTCUTS removed in flat-domain-tenant change — tenant is now JWT-only`.
- [x] 5.2 Grep for any remaining `resolveTenantSlug`, `tenantMissing`, `devTenant`, `extractSubdomain`, `__local__` references across `src/`. Result: zero hits.
- [x] 5.3 Confirm `src/hooks/useOrdenRealtime.ts` still compiles and the `if (!tenantSlug) return` guard is semantically valid under the new null-when-logged-out contract.
