# Design: public-pages

## Technical Approach

Add a self-serve registration surface on top of the existing thin auth stack without altering middleware semantics, JWT shape, or the tenant-per-schema DB model. All new work reuses established patterns: `masterDb()` for master queries, Zod schemas in `src/lib/schemas`, thin route handlers that delegate to services, client-side cookie write via `auth-cookie.ts`, and design-token components (`Button`, `Input`, `Label`, `Card`). Registration is split from the landing redesign into two chained PRs so each stays under the 400-LOC review budget.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Slug source | Server-derives from `nombre` | User picks slug | Owners think in restaurant names; DNS-safety and reserved-word checks stay server-side. |
| Collision strategy | Deterministic slug + 4-char random suffix on conflict | Retry with counter (`-2`, `-3`) | O(1), no unbounded loops under contention, matches existing `[a-z0-9-]{1,63}` regex. |
| DDL boundary | `provision_tenant_schema()` runs OUTSIDE `sql.begin()` | Wrap all steps in one transaction | PgBouncer transaction pooling + `prepare: false` cannot ship DDL inside a client transaction reliably; matches `createTenant()` precedent in `services/tenants.ts`. |
| Orphan handling | `activo=false` marker BEFORE provisioning; flip to `true` AFTER user insert commits | Delete on failure | Non-transactional cleanup is racy; leaving `activo=false` gives ops a queryable orphan set (`WHERE activo=false AND created_at < now() - '1 hour'`). |
| JWT shape | Identical to `login()`: `{ sub: email, tenantId: slug, roles: ['ADMIN'] }` | New claim set for registration | Middleware, `AuthContext`, cookie parser, and role gates already trust this exact shape. Any divergence forces changes across auth surface. |
| Cookie write | Client-side via `setAuthCookie()` after 200 response | Server `Set-Cookie` on the API response | Existing login flow writes cookie client-side; keeping symmetry avoids double sources of truth and API-vs-page cookie edge cases. |
| Landing scope | Separate PR, no auth touch | One big PR | Marketing content churns independently; splitting keeps each PR reviewable and reverting the redesign never regresses auth. |

## Data Flow

```
Register form (client)
      │  POST /api/auth/register  { nombre, fullName, email, password }
      ▼
Route handler ──► RegisterSchema.safeParse ──► masterDb() ──► services/auth.register
      │
      ├─ [outside tx] deriveSlug(nombre) → collision check → append suffix if needed
      ├─ [outside tx] INSERT master.tenants (activo=false)
      ├─ [outside tx] SELECT master.provision_tenant_schema(slug)  ◄── DDL
      └─ [sql.begin] UPDATE master.tenants SET activo=true
                     INSERT master.usuarios (tenant_slug=slug, activo=true)
                     INSERT master.usuario_roles ('ADMIN')
                     signJwt({ sub: email, tenantId: slug, roles: ['ADMIN'] })

Response { token, user, tenant }
      ▼
Client: localStorage.setItem('sirve_auth', session) + setAuthCookie(session)
      ▼
router.replace('/admin')  ── middleware sees signed JWT + ADMIN role ✔
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/app/(auth)/register/page.tsx` | Create | Client form (nombre, fullName, email, password, confirm, terms). Mirrors `login/page.tsx` design-token usage. |
| `src/app/(marketing)/terms/page.tsx` | Create | Static server component, MDX-free markdown-in-JSX. |
| `src/app/(marketing)/privacy/page.tsx` | Create | Static server component. |
| `src/app/api/auth/register/route.ts` | Create | Thin: `validate → masterDb() → register() → apiSuccess`. |
| `src/lib/services/auth.ts` | Modify | Add `register()`; keep `login()` untouched. |
| `src/lib/schemas/index.ts` | Modify | Add `RegisterSchema` + `type RegisterInput = z.infer<...>`. |
| `src/lib/slug.ts` | Create | `deriveSlug(name)` + `RESERVED_SLUGS` constant. Pure, unit-testable. |
| `src/middleware.ts` | Modify | Add `/register`, `/terms`, `/privacy` to `PUBLIC_PAGE_PATHS`; add `/api/auth/register` to `API_PUBLIC_PREFIXES`. |
| `src/app/(auth)/login/page.tsx` | Modify | Add "¿No tenés cuenta? Registrate" link + terms footnote. |
| `src/app/page.tsx` | Modify (PR #2) | Full landing redesign: header → hero (dual CTA) → features (fix `lg:grid-cols-4` → `md:grid-cols-3`) → comparison → trust strip → pricing (display-only) → FAQ → CTA → footer. |

## Interfaces / Contracts

```ts
// src/lib/schemas/index.ts
export const RegisterSchema = z.object({
  nombre:   z.string().trim().min(2).max(100),   // restaurant/org name
  fullName: z.string().trim().min(2).max(100),
  email:    z.string().email().max(255),
  password: z.string().min(8).max(128),
  terms:    z.literal(true),                     // checkbox must be true
})

// src/lib/services/auth.ts
interface RegisterResult {
  token: string
  user: { email: string; fullName: string; roles: ['ADMIN'] }
  tenant: { slug: string; nombre: string }
}
export async function register(sql: Sql, input: RegisterInput): Promise<RegisterResult>

// src/lib/slug.ts
export const RESERVED_SLUGS = ['master','admin','www','api','app','sirva'] as const
export function deriveSlug(name: string): string  // normalize + validate; throws ValidationError if empty
export function withRandomSuffix(base: string): string  // base + '-' + 4 char base36
```

### Slug derivation (pseudo-code)

```
deriveSlug(name):
  s = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  s = s.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
  s = s.slice(0, 58)                            // reserve 5 chars for '-xxxx' suffix
  if (!s || RESERVED_SLUGS.includes(s)) s = withRandomSuffix(s || 'r')
  return s                                       // caller re-suffixes on DB collision
```

Route order in `register()`:
1. `deriveSlug(nombre)`; loop max 3 times: `SELECT 1 FROM master.tenants WHERE slug=$1` → if hit, `withRandomSuffix(base)`.
2. Outside `sql.begin`: `INSERT master.tenants (slug, nombre, activo=false, db_schema)`.
3. Outside `sql.begin`: `sql.unsafe('SELECT master.provision_tenant_schema($1)', [slug])`.
4. Inside `sql.begin(tx => { ... })`: `UPDATE master.tenants SET activo=true`, `INSERT master.usuarios (email, password_hash, tenant_slug, activo=true)`, `INSERT master.usuario_roles (usuario_id, rol='ADMIN')`.
5. `signJwt({ sub: email, tenantId: slug, roles: ['ADMIN'] })`.

Failure modes:
- Steps 1-2 fail → nothing to clean up (or a `activo=false` row a sweeper can drop).
- Step 3 fails → tenant row remains `activo=false`; ops query surfaces it.
- Step 4 (inside tx) fails → transaction rolls back user/roles/activate; tenant + schema remain but `activo=false` marks it as orphan. Safe to retry with same email because no `usuarios` row exists yet.

### Middleware additions

```ts
const PUBLIC_PAGE_PATHS = ['/', '/login', '/register', '/terms', '/privacy', '/403', '/setup']
const API_PUBLIC_PREFIXES = ['/api/auth/login', '/api/auth/register', '/api/setup/']
```

Existing matcher uses `pathname === p || pathname.startsWith(p + '/')`, so `/register` opens `/register`, `/register/anything`. Acceptable — no nested register routes planned; if added later they are intentionally public.

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit | `deriveSlug`, `withRandomSuffix`, `RESERVED_SLUGS` behavior, NFD accents, empty/whitespace, length cap | Vitest, no DB |
| Unit | `RegisterSchema` accepts/rejects (weak password, missing terms, invalid email, oversize nombre) | Vitest |
| Integration | `register()` service happy path + slug collision + orphan-on-DDL-failure | Vitest with test DB or mocked `Sql` per project convention |
| Route | `POST /api/auth/register` → 200 shape matches login; 400 on schema fail; 409 semantics if we surface duplicate email (see Open Questions) | Vitest + Next Route Handler harness |
| Manual | Register → auto-login → land on `/admin` → refresh keeps session | Local smoke |

## Migration / Rollout

No DB migration required — `master.tenants`, `master.usuarios`, `master.usuario_roles`, `master.provision_tenant_schema()` already exist. Ship PR #1 (auth + legal + middleware), verify in prod, then ship PR #2 (landing redesign). No feature flag — public routes are additive; existing users unaffected.

## PR Split

- **PR #1 (~250 LOC)**: `slug.ts`, `RegisterSchema`, `services/auth.register`, `api/auth/register/route.ts`, `register/page.tsx`, `terms/page.tsx`, `privacy/page.tsx`, middleware allowlist, login page link. Ships a complete self-serve funnel end-to-end.
- **PR #2 (~150 LOC)**: `app/page.tsx` redesign only. Zero coupling to PR #1; can be reverted without breaking registration.

Ordering: auth-first because the landing's new CTAs point at `/register` — shipping the landing before the endpoint would 404 the primary conversion path.

## Open Questions

- [ ] Duplicate-email response: 409 with `{ message: 'Email ya registrado' }` (leaks existence) vs generic 400 (safer, worse UX)? Recommend 409 for MVP — this is an owner sign-up, not a consumer app, enumeration risk is low.
- [ ] Rate-limit `/api/auth/register`? Not in scope for this change; note in risks.
