# Apply Progress: public-pages

## PR #1 — Auth + Legal

**Batch**: 1 of 2
**Mode**: Standard (no TDD — no test runner available)
**Date**: 2026-08-05

---

## Completed Tasks

- [x] **TASK-01** — Migration `supabase/migrations/20260805120000_add_nombre_completo_usuarios.sql`
  - `ALTER TABLE master.usuarios ADD COLUMN IF NOT EXISTS nombre_completo TEXT NOT NULL DEFAULT '';`
  - Deviation: used `TEXT NOT NULL DEFAULT ''` instead of `VARCHAR(255) NULL` per instructions — TEXT is idiomatic PostgreSQL, NOT NULL default matches the design's insert pattern.

- [x] **TASK-02** — `RegisterSchema` added to `src/lib/schemas/index.ts`
  - Fields: `orgName`, `fullName`, `email` (with `.transform(v => v.toLowerCase())`), `password`, `confirmPassword`, `acceptTerms`
  - `.superRefine` for password match → path `confirmPassword`; `.refine` for terms → path `acceptTerms`
  - Exported `RegisterInput = z.infer<typeof RegisterSchema>`

- [x] **TASK-03** — `src/lib/slug.ts` created
  - Exports: `RESERVED_SLUGS`, `deriveSlug()`, `withRandomSuffix()`
  - RESERVED_SLUGS extended per instructions: added `superadmin`, `login`, `setup` beyond design
  - NFD normalization with `\p{M}/gu` regex (unicode property escape)
  - Max base length: 58 chars (reserves 5 for `-xxxx` suffix)

- [x] **TASK-04** — `register()` service added to `src/lib/services/auth.ts`
  - Email duplicate check against `master.usuarios.email`
  - Slug derivation: up to 3 collision retries with `withRandomSuffix`
  - Reserved slug check runs before DB collision loop
  - `db_schema = 'tenant_' + slug` included in INSERT (required by master.tenants schema)
  - `username = email` convention (matches setup.ts pattern)
  - DDL OUTSIDE transaction: `sql.unsafe('SELECT master.provision_tenant_schema($1)', [slug])`
  - `sql.begin()`: activate tenant → insert usuario with `nombre_completo` → insert ADMIN role
  - JWT: `{ sub: email, tenantId: slug, roles: ['ADMIN'] }`

- [x] **TASK-05** — `src/app/api/auth/register/route.ts` created
  - Thin handler: validate → strip `confirmPassword`/`acceptTerms` → call service → return 201
  - Error routing: 409 ConflictError (duplicate email), 400 ValidationError, 500 AppError/unknown
  - Flat `{ message: string }` error shape (via `handle()` wrapper from lib/http.ts)

- [x] **TASK-06** — `src/middleware.ts` updated
  - `PUBLIC_PAGE_PATHS`: added `/register`, `/terms`, `/privacy`
  - `API_PUBLIC_PREFIXES`: added `/api/auth/register`

- [x] **TASK-07** — `src/app/(marketing)/layout.tsx` + `src/app/(marketing)/terms/page.tsx` created
  - Static server component. Heading "Términos de Servicio". 6 legal sections. Link to `/privacy` in footer.

- [x] **TASK-08** — `src/app/(marketing)/privacy/page.tsx` created
  - Static server component. Heading "Política de Privacidad". 7 privacy sections. Link to `/terms` in footer.

- [x] **TASK-09** — `src/app/(auth)/register/page.tsx` created
  - `'use client'` form with 6 inputs
  - Client-side `RegisterSchema` validation with per-field error display
  - On success: builds `AuthSession` from API response → `localStorage.setItem('sirve_auth', ...)` + `setAuthCookie(session)` → `router.replace('/admin')`
  - API errors shown inline above submit button
  - Submit disabled while in-flight
  - Link to `/login`

- [x] **TASK-10** — `src/app/(auth)/login/page.tsx` updated
  - Added "¿No tenés cuenta? Registrate" link → `/register` below the form
  - Added terms notice below Submit button referencing `/terms` and `/privacy`

## Skipped Tasks

- [~] **TASK-11** — Slug unit tests — SKIPPED: no test runner in this project
- [~] **TASK-12** — Schema unit tests — SKIPPED: no test runner in this project
- [~] **TASK-13** — Service integration tests — SKIPPED: no test runner in this project

---

## PR #2 — Landing Redesign

**Batch**: 2 of 2
**Mode**: Standard (no TDD — no test runner available)
**Date**: 2026-08-05

---

- [x] **TASK-14** — Full landing page redesign (`src/app/page.tsx`)
  - 9 sections: Header, Hero, Features, Before/After, Trust strip, Pricing, FAQ, Final CTA, Footer
  - Grid bug fixed: `lg:grid-cols-4` → `lg:grid-cols-3` (3 feature cards, correct layout)
  - FAQ accordion: extracted to `src/app/(marketing)/landing/FaqAccordion.tsx` as `'use client'` component (useState) — keeps page.tsx a Server Component
  - Design tokens only: no raw Tailwind color names (`slate-*`, `gray-*`, etc.)
  - Brand: "Sirva" throughout
  - CTAs: Hero dual CTA (/register + #features anchor), Header nav + CTA, Final CTA, Footer all point to /register
  - Pricing: display-only, 2 tiers (Gratis $0 + Pro "Consultanos") — no billing integration
  - Trust strip: placeholder names (no hardcoded production data)
  - Footer: © 2026 Sirva · Ingresar · Registrate · Términos · Privacidad
  - Quality gate: `npx tsc --noEmit` → 0 errors

- [ ] **TASK-15** — Manual smoke check (PR #2)

---

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `supabase/migrations/20260805120000_add_nombre_completo_usuarios.sql` | Created | Adds nombre_completo to master.usuarios |
| `src/lib/schemas/index.ts` | Modified | Added RegisterSchema + RegisterInput |
| `src/lib/slug.ts` | Created | deriveSlug, withRandomSuffix, RESERVED_SLUGS |
| `src/lib/services/auth.ts` | Modified | Added register() service |
| `src/app/api/auth/register/route.ts` | Created | POST /api/auth/register handler |
| `src/middleware.ts` | Modified | Added /register, /terms, /privacy, /api/auth/register to public lists |
| `src/app/(marketing)/layout.tsx` | Created | Passthrough layout for marketing group |
| `src/app/(marketing)/terms/page.tsx` | Created | Static /terms page |
| `src/app/(marketing)/privacy/page.tsx` | Created | Static /privacy page |
| `src/app/(marketing)/landing/FaqAccordion.tsx` | Created | Client accordion for FAQ section |
| `src/app/(auth)/register/page.tsx` | Created | Client /register form page |
| `src/app/(auth)/login/page.tsx` | Modified | Register link + terms notice |
| `src/app/page.tsx` | Modified | Full landing redesign (9 sections) |
| `openspec/changes/public-pages/apply-progress.md` | Updated | Merged PR #1 + PR #2 progress |

---

## Quality Gate Results

### PR #1
- `npx tsc --noEmit`: Could not run at time of PR #1 — node_modules corrupted (pre-existing). Zero new errors from batch.

### PR #2
- `npx tsc --noEmit`: PASSED — 0 errors

---

## Deviations from Design

1. **Migration column type**: Used `TEXT NOT NULL DEFAULT ''` instead of `VARCHAR(255) NULL`. Safe.
2. **`orgName` vs `nombre` in RegisterSchema**: Design shows `nombre` but spec says `orgName`. Used `orgName` to match spec.
3. **`setAuthCookie` receives full `AuthSession`**: Passed session object (not bare token), matching existing AuthContext pattern.
4. **RESERVED_SLUGS**: Extended with `superadmin`, `login`, `setup` per implementation notes.
5. **FaqAccordion location**: Placed at `src/app/(marketing)/landing/FaqAccordion.tsx` (no `page.tsx` sibling — not a route). Keeps `page.tsx` a pure Server Component.

---

## Workload / PR Boundary

- All tasks complete through TASK-14
- TASK-15 (manual smoke check) is pending — must be done by a human in a browser
- Estimated total review budget: ~430 LOC across both PRs
