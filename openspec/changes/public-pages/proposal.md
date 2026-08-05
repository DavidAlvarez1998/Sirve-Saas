# Proposal: public-pages

**Change ID**: `public-pages`
**Project**: `sirve-saas`
**Status**: proposed
**Delivery**: 2 chained PRs (auth+legal, then landing)

---

## 1. Intent

Transform the current thin auth surface into a credible self-service SaaS entry point so restaurant owners can discover, evaluate, and onboard themselves onto Sirva without operator intervention.

**Problem today**

- The landing (`src/app/page.tsx`) is a placeholder: hero + 3 feature cards + footer, no pricing, no comparison, no FAQ, no register CTA. Not credible as a paid SaaS.
- The login page has no register link, no terms acceptance text, and no forgot-password affordance.
- Onboarding is invite-only: a SUPERADMIN must create the tenant via `POST /api/admin/tenants`, which emails a setup token. There is no public `/register` route and no `POST /api/auth/register` endpoint.
- Terms & Conditions and Privacy pages do not exist, blocking any legal footer or acceptance UX.

**Why now**

- The design system PRs (1/3, 2/3, 3/3) landed. Tokens, primitives, and page polish are ready to be leveraged for a real landing.
- Self-service signup is the gate to any organic acquisition. Without it, growth requires manual provisioning per tenant.
- Legal pages are prerequisites to charging money and to complying with terms display in the login flow.

**Success looks like**

- A prospect lands on `/`, is convinced by a full marketing page (hero, features, comparison, pricing, FAQ, footer with legal links), clicks a register CTA.
- On `/register`, they fill: nombre del restaurante, nombre completo, email, password, confirm password, and accept terms.
- On submit, the system provisions a tenant schema, creates them as ADMIN, returns a session, and lands them logged-in inside the app.
- From `/login`, they see a link to `/register` and terms acceptance text linking to `/terms`.
- Zero SUPERADMIN intervention required for a new restaurant to start using Sirva.

---

## 2. Scope

### In scope

- **New page**: `/register` — self-service signup form matching the Fuller SaaS reference (org name, full name, email, password, confirm, terms checkbox).
- **New page**: `/terms` — static Terms & Conditions legal page.
- **New page**: `/privacy` — static Privacy Policy legal page (paired with terms since middleware/footer will reference both).
- **Login update**: add "¿No tenés cuenta? Registrate" link and terms acceptance text with links to `/terms` and `/privacy`.
- **New API route**: `POST /api/auth/register` — public endpoint that validates input, auto-generates slug from restaurant name, creates tenant + provisions schema + creates ADMIN user, returns JWT session identical in shape to `POST /api/auth/login`.
- **New service**: `services/auth.register()` — encapsulates the multi-step provisioning transactionally (with the DDL call outside `sql.begin()` per existing pattern).
- **New Zod schema**: `RegisterSchema` in `src/lib/schemas/index.ts`.
- **Middleware update**: add `/register`, `/terms`, `/privacy` to `PUBLIC_PAGE_PATHS`; add `/api/auth/register` to `API_PUBLIC_PREFIXES`.
- **Landing redesign** (`src/app/page.tsx`): hero, features grid (fix `lg:grid-cols-4` vs 3 items bug), before/after comparison, trust strip, pricing, FAQ accordion, final CTA, footer with legal + register links. Brand rendered as "Sirva".

### Out of scope

- **Email confirmation / verification flow** on register. MVP returns a session immediately; verification is a future change.
- **Forgot password / password reset** flow. Separate change.
- **Billing / subscription management**. Pricing on the landing is display-only; the register flow creates a free-tier tenant. Payment integration is a separate change.
- **Non-admin staff self-registration**. Only the ADMIN role is created on self-service signup; mesero/cocina staff are added later via the admin panel (unlike the existing invite-based setup flow which grants ADMIN+MESERO+COCINA).
- **Slug editing UX**. The slug is auto-derived server-side from the restaurant name and never exposed at registration time.
- **Setup page (`/setup/[token]`) design token cleanup**. Noted in exploration but tracked separately — not blocking.
- **Internationalization**. Copy is Spanish (Rioplatense) only for this change.
- **Marketing site CMS / dynamic content**. Landing is a static Next.js page; copy lives in the component.
- **Analytics / conversion tracking** on the funnel. Can be layered on top later.
- **Refactor of `sirve_auth` localStorage + client-written cookie architecture**. That is a known PgBouncer-driven decision (documented in CLAUDE.md); this change reuses it as-is.

---

## 3. Approach

### 3.1 Delivery split — two chained PRs

**PR #1 — auth + legal (~250 LOC)**
The functional core. Once this ships, self-service onboarding works end-to-end even against the existing thin landing.

- New: `/register` page, `/terms` page, `/privacy` page.
- Update: `/login` page (register link, terms text).
- New: `POST /api/auth/register` route + `services/auth.register()` + `RegisterSchema`.
- Update: `src/middleware.ts` (PUBLIC_PAGE_PATHS + API_PUBLIC_PREFIXES).

**PR #2 — landing redesign (~150 LOC)**
Pure marketing surface, no auth logic touched.

- Rewrite `src/app/page.tsx`: hero, features grid (fixed), comparison, trust strip, pricing, FAQ accordion, final CTA, footer with legal links.
- Reuse design tokens and primitives (`Button`, `Card`) from the landed design system PRs.

Rationale for the split: auth pages are self-contained and unblock the user journey immediately; landing redesign is content/design-driven and would inflate PR #1 with cosmetic churn. Splitting also keeps each PR reviewable (<400 LOC guideline). PR #2 depends on PR #1 only for the register link target existing.

### 3.2 Registration flow — server-side sequencing

Follow the existing `services/tenants.createTenant()` pattern exactly to avoid DDL-in-transaction pitfalls with PgBouncer:

1. **Validate** via `RegisterSchema` (Zod) — nombre_restaurante, nombre_completo, email, password, terms=true. `confirmPassword` is client-only.
2. **Derive slug** server-side: lowercase, strip accents, spaces → hyphens, max 63 chars. On collision with `master.tenants.slug`, append a short random suffix (e.g. `-a1b2`).
3. **Insert tenant** row into `master.tenants` (activo=false as a cleanup marker until provisioning succeeds).
4. **Provision schema** — call `sql.unsafe('SELECT master.provision_tenant_schema($1)', [slug])` OUTSIDE `sql.begin()`. This mirrors `createTenant` and avoids the DDL-inside-transaction concern. On failure, tenant row remains with `activo=false` as forensic breadcrumb.
5. **Flip tenant to active** and **create admin user** inside `sql.begin()`: insert into `master.usuarios`, insert single row into `master.usuario_roles` with role ADMIN.
6. **Issue JWT** with `{ sub: email, tenantId: slug, roles: ['ADMIN'] }` — identical shape to `login()` output.
7. **Return** `{ token, user, tenant }` — client writes `sirva_session` cookie + `sirve_auth` localStorage exactly like the login flow.

Post-registration, the client redirects to the app root; the tenant subdomain resolution happens at middleware boundary as with any authenticated request.

### 3.3 Middleware

- `PUBLIC_PAGE_PATHS`: append `'/register'`, `'/terms'`, `'/privacy'`. Prefix-match behavior (already documented in exploration risks) is accepted — same as existing `/setup` treatment.
- `API_PUBLIC_PREFIXES`: append `'/api/auth/register'`.

### 3.4 Landing structure (PR #2)

Sections in vertical order, all using design tokens:

1. **Header** — brand "Sirva" + nav (Features, Precio, FAQ) + "Ingresar" + "Registrate" CTA.
2. **Hero** — H1, subtitle, dual CTA (primary: "Empezar gratis" → `/register`, secondary: "Ya tengo cuenta" → `/login`).
3. **Features grid** — 3-4 cards, fix `lg:grid-cols-4` to `lg:grid-cols-3` or add a fourth card.
4. **Before/after comparison** — two-column visual contrast (con Sirva vs sin Sirva).
5. **Trust strip** — logos/testimonial placeholders (copy TBD; render as neutral placeholders if no real customers yet).
6. **Pricing** — 2-3 tiers, display-only, "Empezar" CTA on each → `/register`.
7. **FAQ accordion** — 5-8 common questions.
8. **Final CTA** — repeat register CTA.
9. **Footer** — copyright + links to `/terms`, `/privacy`, `/login`, `/register`.

Brand: "Sirva" everywhere user-facing. Repo name "Sirve-Saas" is internal only.

### 3.5 Reuse and consistency

- Use `Button`, `Input`, `Label`, `Card` primitives from `@/components/ui/`.
- Use `bg-surface`, `bg-background`, `text-foreground`, etc. — no raw slate/gray Tailwind classes.
- Form validation, error display, and loading state mirror the login page conventions.
- Cookie writing uses the existing `auth-cookie.ts` helper.

---

## 4. Delivery

- **Strategy**: `ask-on-risk` → both PRs are within the ~400 LOC guideline, so no exception expected. If PR #2 landing content bloats beyond the budget, split further into landing-structure + landing-content.
- **Order**: PR #1 first (auth + legal), PR #2 after (landing).
- **Rollout**: no feature flag needed. New public routes are additive; existing invite-based flow (`/setup/[token]`) is not touched and continues to work in parallel.
- **Migration**: no DB migrations required. `master.tenants`, `master.usuarios`, `master.usuario_roles`, and `master.provision_tenant_schema()` already exist.

---

## 5. Risks & open questions

### Risks

- **DDL in transaction**: `provision_tenant_schema()` MUST be called outside `sql.begin()` (per existing `createTenant` pattern and the `prepare: false` + PgBouncer transaction-mode constraint). Deviating breaks provisioning silently.
- **Prefix middleware matching**: adding `/register` to `PUBLIC_PAGE_PATHS` also opens `/register/*`. Accepted for consistency with existing `/setup` behavior; documented, not fixed in this change.
- **Slug collision**: auto-generated slug can collide with existing tenants or reserved words (`master`, `admin`, `www`). Mitigation: post-slugify collision check + random suffix; keep a small deny-list.
- **Orphan tenant rows** on provisioning failure: tenant row remains with `activo=false`. Requires a cleanup job or manual reap eventually — out of scope here, but noted.
- **No email verification**: a malicious actor can spam-register with fake emails and squat slugs. Acceptable for MVP; verification is a follow-up change.
- **Cookie is client-written / not httpOnly**: known architectural constraint (PgBouncer). Not changed here. XSS surface unchanged.
- **Landing copy quality**: pricing tiers, testimonials, and FAQ content need business sign-off. If unavailable, use honest placeholders rather than fabricated social proof.

### Open questions

- **Pricing tiers**: how many, at what price points, and what limits per tier? If undecided at PR #2 time, ship with "Free" only and a "Contactanos" CTA for other tiers.
- **Post-registration destination**: land on `/` (tenant app root) or a dedicated `/bienvenida` onboarding page? Default assumption: app root.
- **Privacy page content**: full policy text needed. If unavailable, ship a minimal placeholder marked as draft with a legal-review TODO.
- **Terms acceptance persistence**: do we need to store `terms_accepted_at` on the user row for audit? Not in `master.usuarios` today. Default: log acceptance in registration payload metadata but do not schema-migrate in this change.

---

## 6. Next phase

- `sdd-spec` — behavioral spec for register endpoint, register page, terms page, login updates, and middleware changes.
- `sdd-design` — technical design covering slug derivation algorithm, transaction boundaries for provisioning, JWT issuance parity with login, and landing component composition.

`sdd-spec` and `sdd-design` can run in parallel.
