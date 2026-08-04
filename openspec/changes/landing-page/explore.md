# Exploration: landing-page

## Current State

`src/app/page.tsx` is a one-liner: `redirect('/login')`. No marketing page exists.

The middleware runs `pageMiddleware` on all non-API routes, and `PUBLIC_PAGE_PATHS` is `['/login', '/403', '/setup']` — the root `/` is absent, so unauthenticated visits to `/` are redirected to `/login` before the page's own redirect even fires.

The login page lives at `src/app/(auth)/login/page.tsx`. The `(auth)` route group has NO `layout.tsx`. The login page is a standalone `'use client'` component: a centered card containing username + password form and a submit Button. There is no back link or logo in the top bar.

## Affected Files

- `src/app/page.tsx` — replace the `redirect` with the landing page server component
- `src/middleware.ts` — add `'/'` to `PUBLIC_PAGE_PATHS` (one-line change)
- `src/app/(auth)/login/page.tsx` — add "Ir al inicio" link above or below the form card

## Design System Available

Tailwind v4 with `@theme` tokens:

| Token | Light | Dark |
|---|---|---|
| `bg-primary` | `hsl(142 76% 36%)` (green) | `hsl(142 71% 45%)` |
| `bg-background` | `hsl(210 40% 98%)` | `hsl(224 20% 8%)` |
| `bg-surface` | white | `hsl(224 20% 11%)` |
| `text-foreground` | `hsl(222 84% 5%)` | `hsl(213 31% 93%)` |
| `text-muted-foreground` | `hsl(215 16% 47%)` | same |
| `border-border` | `hsl(214 32% 91%)` | `hsl(220 18% 18%)` |

UI primitives: `Button` (default/outline/ghost/link variants), `Card`, `Badge`, `EmptyState`. Font: Inter (global).

No logo asset — `public/` is empty. Text wordmark needed.

## Features to Highlight

Derived from actual codebase capabilities:
1. Multi-tenant restaurant management (isolated data per restaurant)
2. Role-based access: Admin, Mesero, Cocina, Superadmin
3. Product and ingredient management
4. Table management (mesas)
5. Real-time order flow (Supabase Broadcast — waiter creates, kitchen sees instantly)
6. Reports / dashboard
7. Secure JWT auth with role-gated routes

## Approach

Replace `src/app/page.tsx` directly (server component, no `'use client'`). Patch one line in middleware. Add a `<Link href="/">` styled with the `ghost` Button variant above the login form card.

No `(marketing)` route group needed yet — if more pages appear later, promote at that point.

## Risks

- No logo/brand asset — text wordmark sufficient for now
- Dark mode is default — landing must use design tokens (already in place)
- Adding `'/'` to `PUBLIC_PAGE_PATHS` has no side effect on child routes (prefix-match doesn't match `//`)
- No automated tests; manual browser verification sufficient (`strict_tdd: false`)

## Status

Ready for proposal. Scope fully bounded: 3 files, 1 middleware line.
