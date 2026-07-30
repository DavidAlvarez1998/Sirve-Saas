# Design: Flat Domain with JWT-Based Tenant Resolution

## 1. Architectural Approach

**Pattern**: single trust boundary at the edge (Next.js middleware) that verifies the JWT once per request and projects `(tenantSlug, actor)` into `x-*` request headers. Every downstream layer (route handlers, services, DB) keeps its current contract and continues to consume those headers via `getContext()`.

**Layering** (unchanged after this change):
```
Edge (middleware.ts)   ←  authority for tenant + role
  ↓ headers: x-tenant-slug, x-user
Route handler          ←  thin (validate, dispatch)
  ↓ getContext()
Service (pure fn(Sql)) ←  business logic
  ↓ withTenant(slug) | masterDb()
Postgres               ←  schema-per-tenant
```

**Boundary rule**: the JWT is the single signed source of truth for tenant identity. No component below the middleware re-derives tenant from URL, cookie contents, or hostname. Cookies carry the JWT; hostnames are opaque.

**Key inversion vs. today**: in the current design, `host` and `JWT.tenantId` must agree, so the cross-check exists as a defensive redundancy. After the change, `host` carries zero tenant signal, so the cross-check disappears entirely — the JWT signature IS the check.

---

## 2. Request Flow (Sequence)

### 2.1 Anonymous page navigation

```
Browser ──GET /login──▶ middleware
                        │
                        ├─ pathname startsWith '/login'? YES → PUBLIC_PAGE_PATHS bypass
                        ▼
                        NextResponse.next()  (no headers set — page renders)
```

### 2.2 Authenticated page navigation

```
Browser ──GET /admin──▶ middleware
   cookie: sirve_session={token,username,roles,tenantId}
                        │
                        ├─ pathname not public
                        ├─ read cookie → parse JSON → session.token
                        ├─ verifyJwt(session.token) → claims OR null
                        │     null → redirect(/login?callbackUrl=/admin)
                        ├─ ROLE_GATES lookup for /admin → requires ADMIN
                        ├─ claims.roles includes ADMIN? NO → redirect(/403)
                        ▼
                        NextResponse.next()  (page renders; no header injection needed for pages)
```

### 2.3 API call (protected)

```
Browser (axios) ──POST /api/ordenes──▶ middleware
   header: Authorization: Bearer <jwt>
                        │
                        ├─ pathname startsWith '/api/'
                        ├─ isApiPublic? NO
                        ├─ read Bearer header → verifyJwt(token) → claims OR null
                        │     null → 401 {message:"Invalid or expired token"}
                        ├─ tenantSlug = claims.tenantId ?? '__master__'
                        ▼
                        propagate(req, {tenantSlug, user: {sub, tenantId, roles}})
                        │  (headers: x-tenant-slug, x-user)
                        ▼
                    Route handler
                        │  getContext(req) → {tenantSlug, user}
                        │  withTenant(tenantSlug, sql => ...)
                        ▼
                    Postgres  (schema tenant_<slug>)
```

### 2.4 Login (public API)

```
Browser (axios) ──POST /api/auth/login──▶ middleware
   body: {username, password}
                        │
                        ├─ pathname startsWith '/api/auth/login' → API_PUBLIC bypass
                        ├─ propagate(req, {tenantSlug: '__master__'})
                        ▼
                    /api/auth/login handler
                        │  masterDb() → services.auth.login()
                        │  → signJwt({sub, tenantId, roles})
                        ▼
                    Response 200 {token, username, roles, tenantId}
                        │
                        ▼
                    Client (AuthContext.login):
                        - localStorage.setItem('sirve_auth', session)
                        - setAuthCookie(session)     (writes sirve_session)
                        - router.replace('/admin' | '/superadmin' | ...)
```

### 2.5 Setup (public API — token-scoped, no JWT)

```
Browser ──POST /api/setup/<token>──▶ middleware
                        │
                        ├─ pathname startsWith '/api/setup/' → API_PUBLIC bypass
                        ├─ propagate(req, {tenantSlug: '__master__'})
                        ▼
                    /api/setup/[token] handler
                        │  masterDb() → services.setup.completarSetup()
                        ▼
                    Response 200
```

Unchanged from today. Setup handlers read the invitation token from the URL, not from JWT.

---

## 3. Component-by-Component Decisions

### 3.1 `src/middleware.ts` (rewrite)

**Delete**:
- `extractSubdomain()` function
- `__local__` branch and dev subdomain workaround
- `admin.` → `__master__` mapping
- Cross-tenant guard `claims.tenantId !== tenantSlug` (obsolete — JWT is authoritative)

**Keep**:
- `getSecret()`, `apiJson()`, `propagate()`
- `SessionCookie` type and shape
- `PUBLIC_PAGE_PATHS`, `ROLE_GATES` and page authorization behavior
- `API_PUBLIC_PREFIXES` (`/api/auth/login`, `/api/setup/`) with `__master__` propagation
- `x-tenant-slug` and `x-user` header contract

**New**:
- Page middleware also verifies the JWT inside the cookie (not just presence). Currently it only trusts `cookieRaw` parsing — with subdomain gone, we must verify the signature to prevent a forged cookie from bypassing ROLE_GATES.
- Protected API middleware becomes `tenantSlug = claims.tenantId ?? '__master__'`.

**Pseudocode** (target `middleware.ts`):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? '')
}

function apiJson(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status })
}

function propagate(
  req: NextRequest,
  ctx: { tenantSlug: string; user?: { sub: string; tenantId: unknown; roles: unknown } }
): NextResponse {
  const headers = new Headers(req.headers)
  headers.set('x-tenant-slug', ctx.tenantSlug)
  if (ctx.user) headers.set('x-user', JSON.stringify(ctx.user))
  return NextResponse.next({ request: { headers } })
}

type SessionCookie = {
  token: string
  username: string
  roles: string[]
  tenantId: string | null
}

const PUBLIC_PAGE_PATHS = ['/login', '/403', '/setup']

const ROLE_GATES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: '/admin', roles: ['ADMIN'] },
  { prefix: '/mesero', roles: ['MESERO'] },
  { prefix: '/cocina', roles: ['COCINA'] },
  { prefix: '/superadmin', roles: ['SUPERADMIN'] },
]

const API_PUBLIC_PREFIXES = ['/api/auth/login', '/api/setup/']

function isApiPublic(pathname: string): boolean {
  return API_PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p))
}

function isPagePublic(pathname: string): boolean {
  return PUBLIC_PAGE_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

async function pageMiddleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl

  if (isPagePublic(pathname)) {
    return NextResponse.next()
  }

  const cookieRaw = req.cookies.get('sirve_session')?.value
  let session: SessionCookie | null = null
  if (cookieRaw) {
    try {
      session = JSON.parse(decodeURIComponent(cookieRaw)) as SessionCookie
    } catch {
      session = null
    }
  }

  if (!session?.token) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('callbackUrl', pathname + req.nextUrl.search)
    return NextResponse.redirect(url)
  }

  // Verify signature: cookie value is client-controlled; roles inside are untrusted.
  let claims: { roles?: string[] } | null = null
  try {
    const { payload } = await jwtVerify(session.token, getSecret())
    claims = payload as { roles?: string[] }
  } catch {
    // Invalid/expired token → clear session, force re-login.
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('callbackUrl', pathname + req.nextUrl.search)
    const res = NextResponse.redirect(url)
    res.cookies.delete('sirve_session')
    return res
  }

  const roles = claims.roles ?? []
  const gate = ROLE_GATES.find(g => pathname === g.prefix || pathname.startsWith(g.prefix + '/'))
  if (gate && !gate.roles.some(r => roles.includes(r))) {
    const url = req.nextUrl.clone()
    url.pathname = '/403'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl

  if (!pathname.startsWith('/api/')) {
    return pageMiddleware(req)
  }

  // Public API bypass — no JWT required, master context propagated
  if (isApiPublic(pathname)) {
    return propagate(req, { tenantSlug: '__master__' })
  }

  // Protected API: JWT required, tenant taken from claims
  const authHeader = req.headers.get('authorization') ?? ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!bearer) return apiJson(401, 'Authorization header required')

  let claims: { sub: unknown; tenantId: unknown; roles: unknown }
  try {
    const { payload } = await jwtVerify(bearer, getSecret())
    claims = payload as typeof claims
  } catch {
    return apiJson(401, 'Invalid or expired token')
  }

  const tenantSlug = (claims.tenantId as string | null) ?? '__master__'

  return propagate(req, {
    tenantSlug,
    user: { sub: claims.sub as string, tenantId: claims.tenantId, roles: claims.roles },
  })
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
}
```

**Rationale for verifying the cookie signature on page requests**:
Today, page auth trusts the presence of a cookie plus a subdomain match. Once the subdomain check is gone, ROLE_GATES sits on top of client-controlled JSON. Verifying `jose.jwtVerify(session.token)` before reading roles closes that gap. The extra edge cost is one HMAC verification per page request — negligible compared with an RSC render.

### 3.2 `src/lib/tenant.ts` (DELETE)

The file is no longer referenced by any runtime path after `AuthContext` and `login/page.tsx` stop importing it. Delete the file. Its only consumer, `resolveTenantSlug()`, is removed.

**Verify before delete**: grep for `from '@/lib/tenant'` and `from '../lib/tenant'` — expected to be empty after step 3.3 + 3.4.

### 3.3 `src/context/AuthContext.tsx` (modify)

**Remove**:
- `import { resolveTenantSlug } from '@/lib/tenant'`
- `useMemo` block that derives tenant from `window.location.hostname`
- `tenantMissing: boolean` from the context value (no host, no missing state)

**Change**:
- `tenantSlug` becomes derived from the persisted session: `auth?.tenantId ?? null`
- Keep the normalization already in `login()`: `data.tenantId ?? '__master__'`. After login, `tenantSlug === auth.tenantId` (always a string; `__master__` for superadmin).
- Public shape of the context value drops `tenantMissing`; downstream consumers (currently only `login/page.tsx` reads it) must adapt.

**Result**:
```ts
const tenantSlug = auth?.tenantId ?? null  // null only when logged out
// tenantMissing removed
```

Consumers that today read `useAuth().tenantSlug` continue to work (`useOrdenRealtime` in particular — it already skips subscription when `tenantSlug` is null, which now matches "not logged in").

### 3.4 `src/app/(auth)/login/page.tsx` (simplify)

**Remove**:
- `DEV_PREFS_KEY`, `readDevPrefs`, `writeDevPrefs`, `DevPrefs` type
- `SHORTCUTS`, `parseShortcuts`, `NEXT_PUBLIC_DEV_SHORTCUTS` parsing
- `isLocalhost`, `devTenant`, `recentTenants` state
- `resolveTenantSlug` import and `tenantSlug` local variable
- `tenantMissing` branch and its error screen
- `handleShortcutClick`, effective-tenant computation

**Keep**:
- `ROLE_REDIRECTS` and role-based post-login navigation
- Email + password form
- Error state and loading state

**Result** (component body):
```ts
const { login } = useAuth()
const router = useRouter()
const [username, setUsername] = useState('')
const [password, setPassword] = useState('')
const [error, setError] = useState<string | null>(null)
const [loading, setLoading] = useState(false)

async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault()
  setError(null); setLoading(true)
  try {
    const session = await login(username, password)
    const roles = session.roles ?? []
    const redirect = ROLE_REDIRECTS.find(r => roles.includes(r.role))
    router.replace(redirect ? redirect.path : '/login')
  } catch (err) {
    const apiErr = err as { friendlyMessage?: string }
    setError(apiErr.friendlyMessage ?? 'Credenciales inválidas')
  } finally { setLoading(false) }
}
```

Optional: keep `NEXT_PUBLIC_DEV_SHORTCUTS` as a pure UX helper (autofill username/password buttons) with no tenant field. Out of scope — remove for now; can be re-added later without touching tenant logic.

### 3.5 `src/lib/auth-cookie.ts` (unchanged behavior, verify no `domain`)

Current implementation does not set a `Domain` attribute — good. The cookie is scoped to the exact host of the login response, which after the change is a single flat domain. Nothing to modify.

If in the future we need cross-subdomain sharing again, add `Domain=.tuapp.com`. For now the absence of `Domain` is the correct default and works transparently on both `localhost` and prod.

### 3.6 Sentinel `__master__` handling

**Invariant**: `__master__` is a marker that means "no tenant schema". It never reaches `schemaName()` because superadmin route handlers always call `masterDb()` directly, never `withTenant()`.

**Where the sentinel appears**:
1. Middleware emits it when `claims.tenantId === null` (protected API path).
2. Middleware emits it on public API paths (login, setup) as a placeholder.
3. `AuthContext.login()` normalizes `data.tenantId ?? '__master__'` for the client-side session state.

**Where it must not appear**:
- `withTenant('__master__', fn)` — would fail `schemaName()` regex (which is the desired failure mode; treat any such call as a bug).
- Any DB query that interpolates `tenantSlug` as a schema name.

**Enforcement**: no runtime check added. Existing `schemaName()` regex `^[a-z][a-z0-9_]{0,62}$` already rejects `__master__` (starts with `_`). This is intentional: if a superadmin handler accidentally routes through `withTenant()`, it crashes loudly with a clear error rather than silently querying the wrong schema.

### 3.7 Cookie domain decision (finalized)

- Do NOT set the `Domain` attribute on `sirve_session`.
- Works on `localhost:3000` (browser scopes cookie to `localhost`).
- Works on `tuapp.com` (browser scopes cookie to `tuapp.com`).
- Rejects `roma.tuapp.com` after cutover (users on old subdomains lose the cookie and must re-login on the new flat domain, which is the desired behavior — see risk mitigation in proposal).

---

## 4. ADR-Style Decisions

### ADR 1: Verify the JWT signature on page requests, not just cookie presence
- **Decision**: `pageMiddleware()` calls `jwtVerify(session.token)` before evaluating ROLE_GATES.
- **Rationale**: Without the subdomain cross-check, ROLE_GATES becomes the only tenant/role authority for page navigation. Trusting client-controlled cookie JSON for `roles[]` would let anyone paint a cookie with `["ADMIN"]` and bypass the gate. The signature verification restores the trust boundary that the subdomain used to provide.
- **Rejected alternative**: keep trusting the cookie JSON and rely on API-layer authorization to prevent data leaks. Rejected because page-level ROLE_GATES intentionally shape the UX (redirect to `/403`), and letting unauthorized users into role-scoped page shells is a UX regression and a defense-in-depth loss even if data stays safe.
- **Cost**: one HMAC verification per non-public page request. Negligible at the edge.

### ADR 2: Drop the tenant/JWT cross-check on API requests
- **Decision**: Remove `if (!isSuperadmin && claims.tenantId !== tenantSlug) return 403`.
- **Rationale**: With no subdomain, `tenantSlug` is now computed from `claims.tenantId`. The check `claims.tenantId !== claims.tenantId` is tautologically true and adds nothing. The JWT signature is the sole authority.
- **Rejected alternative**: keep a defensive `assert(tenantSlug === (claims.tenantId ?? '__master__'))`. Rejected — it's a no-op that reads like dead code and confuses future maintainers.

### ADR 3: Delete `src/lib/tenant.ts` outright rather than repurpose it
- **Decision**: Remove the file.
- **Rationale**: The only export is `resolveTenantSlug(hostname)`, which is exactly what the change eliminates. Leaving the file as an empty module or a `TODO` stub invites dead code accumulation.
- **Rejected alternative**: leave the file with a deprecation warning. Rejected — TypeScript's unused-import warnings + git history are sufficient documentation.

### ADR 4: `tenantSlug` in `AuthContext` becomes `null` when logged out, string when logged in
- **Decision**: `tenantSlug = auth?.tenantId ?? null`. No more `tenantMissing` field.
- **Rationale**: Login is the only way to acquire a tenant. Any component that needs a tenant is by definition rendered inside an authenticated tree. `useOrdenRealtime` already guards `if (!tenantSlug) return` — same shape, different meaning ("not logged in" instead of "no subdomain in URL").
- **Rejected alternative**: keep `tenantMissing` for backward compatibility. Rejected — one consumer (`login/page.tsx`) uses it, and that consumer is being rewritten anyway.

### ADR 5: Do not set a `Domain` attribute on the session cookie
- **Decision**: `document.cookie = 'sirve_session=...; SameSite=Lax; Path=/; Max-Age=86400'` — no `Domain`.
- **Rationale**: Host-only cookies work identically on `localhost` and any single flat domain. Setting `Domain=.tuapp.com` would only be needed for cross-subdomain sharing, which the whole change is designed to eliminate.
- **Rejected alternative**: `Domain=.tuapp.com` for future flexibility. Rejected — YAGNI; can be added in a one-line change if custom domains are ever revisited.

### ADR 6: Remove `NEXT_PUBLIC_DEV_SHORTCUTS` in this change
- **Decision**: Delete the entire dev shortcuts block from `login/page.tsx`.
- **Rationale**: Shortcuts today are coupled to the `devTenant` picker (each shortcut carries a `tenant` field). Decoupling them would leave a mutilated feature; a clean removal is cheaper and can be re-introduced later as a tenant-free "prefill credentials" helper if needed.
- **Rejected alternative**: keep shortcuts without the tenant field. Rejected as scope creep — the proposal explicitly targets tenant plumbing; UX helpers can be a follow-up.

### ADR 7: Middleware matcher unchanged
- **Decision**: Keep the current `matcher` config exactly as-is.
- **Rationale**: The set of routes the middleware must inspect (all `/api/*` + all non-asset pages) is identical before and after. Nothing about the change affects which URLs need edge processing.

---

## 5. Files to Modify / Delete / Verify

| File | Action | Summary |
|------|--------|---------|
| `src/middleware.ts` | Modify (near-rewrite) | Remove `extractSubdomain`, `__local__`, cross-check. Add `jwtVerify` on page cookie. Simplify API branch to `tenantSlug = claims.tenantId ?? '__master__'`. |
| `src/lib/tenant.ts` | Delete | No callers remain. |
| `src/context/AuthContext.tsx` | Modify | Drop `resolveTenantSlug` import + `useMemo` hostname block + `tenantMissing`. `tenantSlug` = `auth?.tenantId ?? null`. |
| `src/app/(auth)/login/page.tsx` | Modify (simplify) | Delete `DevPrefs`, `SHORTCUTS`, `isLocalhost`, `devTenant`, `tenantMissing` branch. Keep email/password form and role-based redirect. |
| `src/hooks/useOrdenRealtime.ts` | Verify (no change) | Already guards `if (!tenantSlug) return`. Semantics shift from "no subdomain" to "not logged in" — behavior identical. |
| `src/lib/http.ts` | Verify (no change) | `getContext()` still reads `x-tenant-slug`. |
| `src/lib/db.ts` | Verify (no change) | `withTenant()` and `schemaName()` untouched. |
| `src/lib/auth-cookie.ts` | Verify (no change) | Cookie set without `Domain` — already correct. |
| `src/lib/api/axios.ts` | Verify (no change) | Still sends `Authorization: Bearer` from localStorage. |
| `src/app/api/**` (~25 route handlers) | Verify (no change) | Header contract preserved. |
| `src/types/index.ts` | Verify (no change) | `AuthSession.tenantId` stays as `string` (normalized `__master__`). `LoginResponse.tenantId` stays as `string \| null`. |
| `src/app/setup/[token]/page.tsx` + `/api/setup/[token]` | Verify (no change) | Public path, no JWT, uses `masterDb()`. |
| `.env` / deployment config | Verify | Ensure `JWT_SECRET` is set in every environment where middleware runs. Remove any wildcard DNS / TLS configuration on the ops side (out of code scope). |

---

## 6. Test Points (for the tasks phase)

1. **Middleware — public API bypass**: `POST /api/auth/login` reaches handler with `x-tenant-slug: __master__` and no `Authorization` header required.
2. **Middleware — protected API with valid tenant JWT**: `GET /api/ordenes` with `Bearer <admin-jwt tenantId=roma>` propagates `x-tenant-slug: roma`.
3. **Middleware — protected API with superadmin JWT**: `Bearer <superadmin-jwt tenantId=null>` propagates `x-tenant-slug: __master__`.
4. **Middleware — protected API missing token**: `GET /api/ordenes` without header → 401 `{message:"Authorization header required"}`.
5. **Middleware — protected API invalid token**: tampered JWT → 401 `{message:"Invalid or expired token"}`.
6. **Middleware — page with valid cookie + role**: `GET /admin` with cookie holding an ADMIN JWT → 200 (Next.js renders).
7. **Middleware — page with valid cookie + wrong role**: `GET /admin` with a MESERO JWT → redirect `/403`.
8. **Middleware — page with tampered cookie**: cookie whose JSON says `roles:["ADMIN"]` but whose token is a MESERO JWT → redirect `/403` (proves signature is authoritative).
9. **Middleware — page with expired cookie**: expired JWT → redirect `/login?callbackUrl=...` AND `sirve_session` cleared.
10. **AuthContext**: after `login()`, `tenantSlug` equals the JWT's `tenantId` (or `__master__` for superadmin). Before login, `tenantSlug === null`.
11. **Login page**: renders on bare `localhost:3000/login` with no error screen; submits email/password; navigates to role-appropriate route.
12. **`src/lib/tenant.ts`**: file no longer exists; `tsc --noEmit` reports no missing-module errors.

---

## 7. Open Assumptions

- The current `master.usuarios` schema stores `tenant_slug` correctly for every user, including `NULL` for SUPERADMIN. Confirmed by inspection of `services/auth.ts` — no migration needed.
- `jose.jwtVerify` in the edge runtime is already imported and working (it is — used in `middleware.ts` today for API paths).
- Existing tenants continue to log in successfully with their existing credentials after the cutover; only the URL they enter changes. No data migration.
- No third-party integration parses the hostname for tenant identity (e.g., no webhook targeting `roma.tuapp.com/api/...`). This is worth a one-line grep for any external URL builders before shipping.

---

## 8. Risks Flagged for Tasks Phase

- **Cookie signature verification adds an async call in `pageMiddleware`**: the function becomes `async`. The dispatcher already awaits `middleware(req)` — safe, but tasks must ensure the `pageMiddleware` return type changes from `NextResponse` to `Promise<NextResponse>`.
- **`localStorage` and cookie must stay in lockstep**: `logout()` already clears both. Cookie-invalid-but-localStorage-valid state (edge case: cookie expired but token in storage not yet) would cause the axios interceptor to send a still-valid Bearer while page middleware redirects to login. Acceptable — user re-logs in, both are refreshed together.
- **Removing dev shortcuts changes the DX of `NEXT_PUBLIC_DEV_SHORTCUTS`**: document in the change notes so no one is surprised.
