# Proposal: landing-page

## 1. Intent

**Problem.** Today `/` unconditionally redirects to `/login`. Any visitor — a prospect evaluating the product, a returning admin who forgot the URL, a link shared on social media — lands on a bare authentication form with zero context about what Sirva is or why they'd use it. For a multi-tenant SaaS aiming to onboard restaurants, this is a self-inflicted conversion problem: the front door of the product is a locked service entrance.

**Why now.** The UI theme, primitives, and design tokens were unified in the last three PRs (`b51e805`, `c4a7044`, `cef5c7c`, `196b3d2`). We finally have a coherent design system (`Button`, `Card`, `Badge`, `@theme` tokens with light/dark support) that a landing page can reuse without introducing one-off styling. Building the landing now is cheap; delaying it means either continuing to lose the first-touch narrative or later paying to re-skin ad-hoc marketing markup.

**Success looks like.**
- Unauthenticated visitors to `/` see a static marketing page describing Sirva.
- The page has a single clear CTA that leads to `/login`.
- The login page exposes a "Ir al inicio" link back to `/`.
- No new dependencies, no new route groups, no impact on authenticated flows.
- Fully static Server Component — zero hydration cost, SEO-ready.

## 2. Scope

### In scope (3 files touched)

1. **`src/app/page.tsx`** — replace the `redirect('/login')` one-liner with a Server Component that renders the landing page (hero, features grid, footer).
2. **`src/middleware.ts`** — add `'/'` to `PUBLIC_PAGE_PATHS` so unauthenticated visitors reach the page instead of being redirected to `/login` by the auth guard. One-line change.
3. **`src/app/(auth)/login/page.tsx`** — add an "Ir al inicio" link above the login card, styled with the existing `Button` `ghost` (or `link`) variant, so users who arrived at the login form can navigate back.

### Out of scope

- **Pricing page, blog, docs, about, contact** — no additional marketing routes. If needed later, a `(marketing)` route group can be introduced.
- **Logo / brand asset design** — we use a text wordmark ("Sirve") only. No SVG creation, no image assets.
- **Auth flow changes** — login, session cookie, JWT, role gates: untouched.
- **Multi-tenant behavior** — landing is a single global page, not per-tenant. No subdomain rewrites, no tenant lookup.
- **i18n / multi-language** — copy is Spanish (matches the rest of the product).
- **Analytics, tracking, cookie banner** — not part of this change.
- **Signup / self-service tenant creation** — the "Ingresar" CTA points to `/login`, not to a signup form. Tenant provisioning remains manual.
- **Contact form, lead capture, email collection** — no forms on the landing.

## 3. Landing Page Structure

Single scrollable page, three sections, no top navigation bar (no other public routes to navigate to yet).

### 3.1 Hero (top of page)

- **Wordmark**: text `Sirve` as a large heading, using the brand primary green token (`text-primary`).
- **Tagline**: one sentence describing the product — proposed copy: *"El sistema de gestión para tu restaurante — pedidos, cocina y mesas en tiempo real."*
- **Sub-tagline** (smaller, `text-muted-foreground`): *"Multi-tenant, seguro, y hecho para operar rápido."*
- **CTA**: `Button` primary variant, size `lg`, labeled *"Ingresar"*, wrapped in `<Link href="/login">`.
- Vertically centered in the viewport (`min-h-screen` container with flex centering) for the hero, so the first fold is clean.

### 3.2 Features section

Four `Card` components in a responsive grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`), each with a short title and one-line description. The four features:

1. **Multi-tenant** — *"Cada restaurante con sus datos aislados. Un solo despliegue, todos tus locales."*
2. **Roles y permisos** — *"Admin, mesero, cocina y superadmin. Cada uno ve lo que necesita, nada más."*
3. **Pedidos en tiempo real** — *"El mesero toma la orden, la cocina la ve al instante. Sin recargas."*
4. **Productos, ingredientes y mesas** — *"Gestioná el menú, el stock y el salón desde un solo panel."*

Cards use the existing `Card` primitive with default surface/border tokens. No icons for now (avoids introducing an icon library dependency for the landing alone).

### 3.3 Footer

Minimal, single row, `text-sm text-muted-foreground`:
- Left: `© {currentYear} Sirve` (year computed at render time — Server Component, no client JS).
- Right: `<Link href="/login">Ingresar</Link>` as a secondary way to reach the login without scrolling back up.

### 3.4 What is deliberately NOT in the landing

- No navigation bar (nothing else to navigate to).
- No testimonials, no logos-of-customers strip, no pricing table.
- No screenshots or product images (we don't have any prepared, and building them is out of scope).
- No dark-mode toggle on the landing itself — the existing `ThemeProvider` in root layout handles theming globally.

## 4. Login Page Change

Add a single "Ir al inicio" link **above** the login card, not inside it, so the login form itself is untouched.

- Element: `<Link href="/">` wrapped in a `Button` variant `ghost` (or `link` if we want it to look less button-like).
- Placement: centered above the existing form card, with modest bottom margin (`mb-4` or similar).
- Copy: *"← Ir al inicio"* (with a left-pointing arrow character or icon in the string, no icon library needed).
- Behavior: standard client-side navigation to `/`.

Rationale for placement: the login card is the primary action for returning users; the back-link is a secondary escape hatch. Placing it above and outside the card keeps the form visually intact while making the escape hatch discoverable.

## 5. Middleware Change

Current line 33:
```ts
const PUBLIC_PAGE_PATHS = ['/login', '/403', '/setup']
```

New line 33:
```ts
const PUBLIC_PAGE_PATHS = ['/login', '/403', '/setup', '/']
```

**Why.** The `pageMiddleware` function (line 42) checks `PUBLIC_PAGE_PATHS` first and returns `NextResponse.next()` for public paths. Without `'/'` in the list, an unauthenticated visitor to `/` triggers the session cookie check (line 49), finds no session, and gets redirected to `/login?callbackUrl=/`. Adding `'/'` lets the request through so `src/app/page.tsx` can render.

**Safety.** The public-path check on line 45 uses `pathname === p || pathname.startsWith(p + '/')`. For `p = '/'`, `startsWith('/' + '/')` requires a path starting with `//`, which Next.js normalizes away — so `'/'` only matches the exact root, not every route. No accidental exposure of child routes.

## 6. Design Decisions

### 6.1 Server Component (no `'use client'`)

The landing is fully static: no state, no event handlers, no browser APIs. Rendering it as an RSC:
- Eliminates hydration cost — zero JS shipped for the page body.
- Better SEO — HTML is fully rendered on the server, immediately crawlable.
- Better Time-to-First-Byte for prospects landing from a shared link.
- Consistent with Next.js 15 App Router defaults.

The one client-side concern — theme switching — is already handled globally by `ThemeProvider` in the root layout; the landing inherits it without needing `'use client'` itself.

### 6.2 Token-only styling (no ad-hoc colors)

Every color reference uses existing Tailwind `@theme` tokens: `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-surface`, `border-border`, `text-primary`, `bg-primary`. No hex codes, no `hsl(...)` in JSX. This ensures the landing looks correct in both light and dark modes (`defaultTheme="dark"` in root layout) automatically.

### 6.3 Reuse existing primitives

Only `Button` (for the CTA) and `Card` (for the features grid). No new UI components. No icon library. No image assets. This keeps the change surface tiny and consistent with the recently unified design system.

### 6.4 No route group for one page

An `(marketing)` route group would be premature for a single page. If a second marketing route appears later (pricing, docs), the route group can be introduced then with negligible refactor cost — move `src/app/page.tsx` into `src/app/(marketing)/page.tsx`.

### 6.5 CTA points to `/login`, not `/signup`

Sirva provisions tenants manually today (no self-service signup route exists). The CTA reflects reality: existing customers log in. When self-serve signup is built, the CTA copy and target can be updated in a follow-up change.

## 7. Multi-Tenant Impact

**None.** The landing page:
- Is not tenant-scoped (no `withTenant`, no `masterDb` calls, no DB access at all).
- Is served from the apex domain and any subdomain identically — the middleware doesn't touch it.
- Has no user-specific content, no personalization, no cookies read or written.
- Is safe to cache aggressively (though we won't add explicit cache headers in this change).

## 8. Rollback Plan

Trivial three-step revert:

1. Restore `src/app/page.tsx` to its previous single line: `import { redirect } from 'next/navigation'; export default function Home() { redirect('/login') }`.
2. Remove `'/'` from `PUBLIC_PAGE_PATHS` in `src/middleware.ts` (restore to `['/login', '/403', '/setup']`).
3. Remove the "Ir al inicio" `<Link>` from `src/app/(auth)/login/page.tsx`.

No database migrations, no environment variables, no dependency changes to undo. A single `git revert` of the implementing commits suffices.

## 9. Risks and Open Questions

- **Copy quality** — the proposed Spanish taglines are a first draft. During spec/design, product owner should confirm or replace them. Not a blocker for the technical change.
- **Missing brand assets** — no logo, no product screenshots. We ship with a text wordmark; visual polish can be a follow-up when a designer produces assets. Explicitly accepted, not deferred.
- **No tests** — the project has no test suite (`strict_tdd: false` per init context). Verification is manual: visit `/` unauthenticated, verify page renders; visit `/login`, verify back-link works; log in, verify authenticated flows unchanged.
- **Middleware matcher already covers `/`** — the regex `/((?!_next/static|_next/image|favicon.ico|api).*)` intercepts `/`. This is expected; the fix is the `PUBLIC_PAGE_PATHS` addition, not a matcher change.

## 10. Change Sizing and Delivery

Estimated diff size: ~120–180 changed lines total (landing page markup dominates; middleware and login are one-liners each). Well under the 400-line chained-PR threshold — single PR is appropriate.

Delivery: single PR, one commit per work unit:
1. `feat(landing): página de bienvenida en /` — `src/app/page.tsx`
2. `feat(middleware): permitir acceso público a /` — `src/middleware.ts`
3. `feat(login): link "Ir al inicio"` — `src/app/(auth)/login/page.tsx`

PR must be linked to the tracking issue and carry exactly one `type:feat` label per project standards.
