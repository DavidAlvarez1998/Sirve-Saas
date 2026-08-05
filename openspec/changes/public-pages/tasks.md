# Tasks: public-pages

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~430 (PR #1 ~260 + PR #2 ~170) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR #1 (auth + legal) → PR #2 (landing redesign) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Auth funnel + legal pages | PR #1 | Base: main; self-serve registration end-to-end |
| 2 | Landing redesign | PR #2 | Base: main (after PR #1 merges); zero coupling to PR #1 |

---

## PR #1 — Auth + Legal (~260 LOC)

### Phase 1: Foundation

- [x] **TASK-01** — DB migration: add `nombre_completo` column to `master.usuarios`
  - File: `supabase/migrations/20260805120000_add_nombre_completo_usuarios.sql`
  - `ALTER TABLE master.usuarios ADD COLUMN IF NOT EXISTS nombre_completo TEXT NOT NULL DEFAULT '';`
  - Criterion: migration runs without error; column visible in `\d master.usuarios`

- [x] **TASK-02** — Add `RegisterSchema` and `RegisterInput` type to schemas
  - File: `src/lib/schemas/index.ts`
  - Add `RegisterSchema` with fields `orgName`, `fullName`, `email`, `password`, `confirmPassword` (`.superRefine`), `acceptTerms` (`.refine(v => v === true)`). Export `RegisterInput = z.infer<typeof RegisterSchema>`.
  - Criterion: `RegisterSchema.safeParse` rejects mismatched passwords with error path `confirmPassword`; rejects `acceptTerms: false`

- [x] **TASK-03** — Create `src/lib/slug.ts` with `deriveSlug`, `withRandomSuffix`, `RESERVED_SLUGS`
  - File: `src/lib/slug.ts` (new)
  - Pure functions, no DB. `RESERVED_SLUGS = ['master','admin','www','api','app','sirva','superadmin','login','setup']`. `deriveSlug` normalizes NFD, replaces non-alphanumeric with `-`, strips leading/trailing dashes, slices to 58 chars. `withRandomSuffix` appends `-` + 4-char random alphanumeric.
  - Criterion: functions implemented correctly — no test runner available

### Phase 2: Core Implementation

- [x] **TASK-04** — Add `register()` service function to `src/lib/services/auth.ts`
  - File: `src/lib/services/auth.ts`
  - Steps: derive slug (max 3 collision retries against `master.tenants`) → INSERT tenant `activo=false` → `sql.unsafe('SELECT master.provision_tenant_schema($1)', [slug])` OUTSIDE tx → `sql.begin()`: flip `activo=true`, INSERT `master.usuarios` (including `nombre_completo`), INSERT `master.usuario_roles('ADMIN')` → `signJwt({ sub: email, tenantId: slug, roles: ['ADMIN'] })` → return `{ token, user: { id, email, fullName }, tenant: { slug, nombre } }`.
  - Criterion: happy path returns correct shape; duplicate email throws with message `Email ya registrado`; DDL failure leaves `activo=false` row, no user row inserted

- [x] **TASK-05** — Create `POST /api/auth/register` route handler
  - File: `src/app/api/auth/register/route.ts` (new)
  - Thin: parse body → `RegisterSchema.safeParse` (400 on fail) → `masterDb()` → `register()` → 201 `{ token, user, tenant }`. Catch duplicate-email as 409; provision failure as 500. All errors return `{ message: string }` flat (never nested).
  - Criterion: 201 shape matches; 400 on missing field; 409 on duplicate email; no nested `{ error: { message } }`

- [x] **TASK-06** — Update `src/middleware.ts` to allowlist new public paths
  - File: `src/middleware.ts`
  - Add `/register`, `/terms`, `/privacy` to `PUBLIC_PAGE_PATHS`. Add `/api/auth/register` to `API_PUBLIC_PREFIXES`.
  - Criterion: unauthenticated GET `/register` returns 200 (not redirect to `/login`); unauthenticated POST `/api/auth/register` is not rejected with 401

### Phase 3: Pages

- [x] **TASK-07** — Create `(marketing)` route group and `/terms` page
  - Files: `src/app/(marketing)/layout.tsx` (minimal passthrough), `src/app/(marketing)/terms/page.tsx`
  - Static server component. `<h1>Términos de Servicio</h1>`. Placeholder body. Link to `/privacy` in footer area.
  - Criterion: GET `/terms` returns 200; no auth redirect; link to `/privacy` present

- [x] **TASK-08** — Create `/privacy` page
  - File: `src/app/(marketing)/privacy/page.tsx` (new)
  - Static server component. `<h1>Política de Privacidad</h1>`. Placeholder body. Link to `/terms` in footer area.
  - Criterion: GET `/privacy` returns 200; no auth redirect; link to `/terms` present

- [x] **TASK-09** — Create `/register` client form page
  - File: `src/app/(auth)/register/page.tsx` (new)
  - `'use client'`. Six inputs: Org Name (`orgName`), Full Name (`fullName`), Email, Password, Confirm Password, terms checkbox (label links to `/terms`). Client-side `RegisterSchema` validation. On submit: POST `/api/auth/register`; on success call `setAuthCookie(session)`, write `sirve_auth` to localStorage, `router.replace('/admin')`. API errors shown inline above submit. Submit disabled while in-flight. Link to `/login` ("¿Ya tenés cuenta?").
  - Criterion: submit blocked when terms unchecked; 409 error shown inline; on 201 redirects to `/admin`; form stays filled on error

- [x] **TASK-10** — Update login page: register link + terms notice
  - File: `src/app/(auth)/login/page.tsx`
  - Add `<Link href="/register">Registrate</Link>` visibly on the page. Add brief notice below submit referencing `/terms` and `/privacy`.
  - Criterion: link to `/register` visible; text referencing `/terms` and `/privacy` visible

### Phase 4: Tests (PR #1)

- [~] **TASK-11** — Unit tests for `src/lib/slug.ts` — SKIPPED (no test runner)
- [~] **TASK-12** — Unit tests for `RegisterSchema` — SKIPPED (no test runner)
- [~] **TASK-13** — Integration tests for `register()` service — SKIPPED (no test runner)

---

## PR #2 — Landing Redesign (~170 LOC)

### Phase 1: Implementation

- [ ] **TASK-14** — Full landing page redesign
  - File: `src/app/page.tsx`
  - Rewrite with 8 ordered sections: Hero (primary CTA `<Button>` → `/register`), Features (3 items, `md:grid-cols-3`), Comparison, Trust strip, Pricing, FAQ (min 3 Q&A), Final CTA (→ `/register`), Footer (links to `/terms` and `/privacy`, brand "Sirva"). Fix `lg:grid-cols-4` → `md:grid-cols-3`. All CTAs use `<Button>` primitive — no raw `slate-*` or `gray-*` color classes.
  - Criterion: ≥2 elements link to `/register`; footer has `/terms` and `/privacy` links; no `grid-cols-4` on 3-item grid; no raw `slate-` / `gray-` on CTAs; brand reads "Sirva" everywhere

### Phase 2: Manual Smoke Check

- [ ] **TASK-15** — Manual smoke check (PR #2)
  - No file change
  - Run `pnpm dev`, visit `/`. Verify: all 8 sections render, features grid is 3 cols on large viewport, both CTA buttons reach `/register`, footer legal links work, brand reads "Sirva" throughout, no console errors.
  - Criterion: all above checks pass in browser
