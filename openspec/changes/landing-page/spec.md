# Landing Page Specification

## Purpose

Spec for the `landing-page` change. Covers three behavioral additions: (1) a static marketing page at `/`, (2) the middleware allowlist update that makes `/` publicly reachable, and (3) the back-link affordance on the login page. No existing spec exists for this domain — this is a full spec.

---

## Requirements

### Requirement: Public Root Route

The root route `/` MUST be publicly accessible without authentication. The middleware MUST NOT redirect unauthenticated users away from `/`. `'/'` MUST be present in `PUBLIC_PAGE_PATHS` in `src/middleware.ts`.

#### Scenario: Unauthenticated visit to root

- GIVEN a user has no `sirve_session` cookie
- WHEN the user navigates to `/`
- THEN the middleware passes the request through without redirect
- AND the landing page renders

#### Scenario: Root path does not expose child routes

- GIVEN `'/'` is added to `PUBLIC_PAGE_PATHS`
- WHEN the middleware checks a path like `/admin` or `/mesero`
- THEN those paths are NOT matched by the `'/'` allowlist entry
- AND the normal auth guard applies to them

#### Scenario: Authenticated user visits root

- GIVEN a user has a valid `sirve_session` cookie
- WHEN the user navigates to `/`
- THEN the landing page renders (no forced redirect to a dashboard)

---

### Requirement: Landing Page is a Server Component

`src/app/page.tsx` MUST be a Next.js Server Component. The file MUST NOT contain a `'use client'` directive. The component MUST have no runtime client-side hydration.

#### Scenario: Page exports a default async/sync function without 'use client'

- GIVEN the file `src/app/page.tsx`
- WHEN a developer reads the file
- THEN no `'use client'` directive is present at the top
- AND the default export is a standard function component (not wrapped in a Client Component)

---

### Requirement: Landing Page Structure

The landing page MUST render three sections in order: hero, features, footer. No other top-level navigation bar is required.

#### Scenario: All required sections are present

- GIVEN an unauthenticated user visits `/`
- WHEN the page renders
- THEN a hero section is visible
- AND a features section is visible
- AND a footer is visible

---

### Requirement: Hero Section Content

The hero section MUST contain: the wordmark "Sirve" rendered as a prominent heading, a tagline, and a CTA button that navigates to `/login`. The CTA MUST use the `Button` component with `variant="default"` (primary green).

#### Scenario: Hero renders with CTA

- GIVEN a user visits `/`
- WHEN the hero section renders
- THEN the text "Sirve" appears as a large heading
- AND a tagline is visible
- AND a button labeled "Ingresar" (or equivalent CTA label) is present
- AND clicking the button navigates to `/login`

---

### Requirement: Features Section Content

The features section MUST contain exactly 4 feature cards. Each card MUST use the `Card` component and MUST include a title and a description. No external icon library MAY be introduced.

The 4 cards are:

| # | Title | Description coverage |
|---|-------|----------------------|
| 1 | Multi-restaurante | Isolated data per restaurant, single deployment |
| 2 | Roles y permisos | Admin, Mesero, Cocina, Superadmin — each sees only what they need |
| 3 | Pedidos en tiempo real | Waiter creates order, kitchen sees it instantly, no page reload |
| 4 | Gestión completa | Products, ingredients, and tables from one panel |

#### Scenario: Exactly 4 feature cards render

- GIVEN a user visits `/`
- WHEN the features section renders
- THEN exactly 4 cards are present in the features grid
- AND each card has a non-empty title and a non-empty description

#### Scenario: No missing card

- GIVEN the features section renders
- WHEN a developer inspects the DOM
- THEN cards for multi-tenant isolation, role-based access, real-time orders, and product/table management are all present

---

### Requirement: Footer Content

The footer MUST contain at minimum: a copyright notice including the current year and "Sirve", and a link to `/login`. The footer MUST use `text-muted-foreground` styling.

#### Scenario: Footer renders with copyright and login link

- GIVEN a user visits `/`
- WHEN the footer renders
- THEN a copyright text including the current server-side year and "Sirve" is visible
- AND a link navigating to `/login` is present in the footer

---

### Requirement: Design Token Compliance

The landing page MUST use only design tokens from the project `@theme` block. No hardcoded hex or `hsl()` color values MAY appear in the component. The page MUST render correctly in both light and dark mode.

Permitted tokens: `bg-background`, `bg-surface`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-primary`, `bg-primary`.

#### Scenario: Dark mode correctness

- GIVEN the system or user preference is dark mode
- WHEN a user visits `/`
- THEN all text is legible and backgrounds are not inverted
- AND the primary green CTA button retains its brand color

#### Scenario: Light mode correctness

- GIVEN the system or user preference is light mode
- WHEN a user visits `/`
- THEN all text is legible against the light background
- AND the primary green CTA button retains its brand color

---

### Requirement: Login Back-Link

The login page (`src/app/(auth)/login/page.tsx`) MUST display a "← Ir al inicio" link positioned above the login form card. The link MUST navigate to `/`. The link MUST use `Button` with `variant="ghost"` or `variant="link"` (unobtrusive). The existing login form markup MUST NOT be modified.

#### Scenario: Back-link is visible on login page

- GIVEN a user is on `/login`
- WHEN the page renders
- THEN a "← Ir al inicio" link appears above the login card
- AND clicking it navigates to `/`

#### Scenario: Back-link does not alter login form

- GIVEN the back-link is added above the form card
- WHEN a developer inspects `src/app/(auth)/login/page.tsx`
- THEN the login form markup is unchanged from before the `landing-page` change

---

### Requirement: Existing Authenticated Flows Unaffected

The `landing-page` change MUST NOT affect the behavior of any authenticated route (`/mesero`, `/admin`, `/cocina`, etc.). The middleware auth guard for all routes not in `PUBLIC_PAGE_PATHS` MUST remain in effect.

#### Scenario: Authenticated routes still require a session

- GIVEN a user has no `sirve_session` cookie
- WHEN the user navigates to `/mesero/ordenes`
- THEN the middleware redirects to `/login`

#### Scenario: Authenticated user can still reach their dashboard

- GIVEN a user has a valid `sirve_session` cookie for a mesero role
- WHEN the user navigates to `/mesero/ordenes`
- THEN the page renders normally (no regression)

---

## Out of Scope

- Pricing page, blog, about page, or any other marketing route
- Logo, SVG, or image asset creation (text wordmark only)
- Navigation bar or multi-page marketing structure
- Changes to auth flow, JWT logic, or session handling
- i18n, analytics, cookie banner
- Self-serve signup (tenant provisioning is manual; CTA targets `/login`)
- Automated tests (no test runner; verification is manual)

---

## Multi-Tenant Impact

None. The landing page has no DB access (`withTenant` and `masterDb` MUST NOT be called from `src/app/page.tsx`). No tenant-scoped content. Served identically from apex and any subdomain.
