# Design: landing-page

## 1. Architecture Approach

**Pattern**: Static Server Component (RSC) for the landing route. No client-side JavaScript on the page shell — the only interactive elements are `<Link>` navigations, which Next.js App Router hydrates as declarative client-side navigations without needing `'use client'` on the page.

**Layering**:
- `src/app/page.tsx` — presentation only (no service calls, no DB, no auth checks)
- `src/middleware.ts` — access control (add `/` to public paths)
- `src/app/(auth)/login/page.tsx` — augment with a single non-invasive back-link

No new module, no new component, no new dependency.

**Boundaries respected**:
- Landing page has no knowledge of tenants, sessions, or the DB layer — it is pre-auth marketing surface.
- Middleware remains the single source of truth for public vs. protected page routing.
- Login page keeps its `'use client'` boundary; the back-link is a plain `<Link>` that works fine inside a client component.

---

## 2. File-by-File Implementation Plan

### 2.1 `src/app/page.tsx` — full rewrite

**Before** (5 lines):
```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/login')
}
```

**After** (Server Component, no `'use client'` directive):

```tsx
import Link from 'next/link'
import { UtensilsCrossed, Zap, ChefHat, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">Sirve</span>
          <Link
            href="/login"
            className="inline-flex items-center justify-center h-9 px-4 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary-hover transition-colors touch-target"
          >
            Ingresar
          </Link>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="flex-1 flex items-center">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            El sistema que hace fluir tu restaurante
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Toma órdenes desde la mesa, coordina la cocina en tiempo real y cerrá el turno sin cuentas pendientes.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center h-10 px-6 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary-hover transition-colors touch-target"
            >
              Comenzar
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────── */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            Todo lo que tu operación necesita
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={<UtensilsCrossed className="h-6 w-6" />}
              title="Órdenes desde la mesa"
              description="Tus meseros toman pedidos desde el celular. Sin papel, sin errores de comanda."
            />
            <FeatureCard
              icon={<ChefHat className="h-6 w-6" />}
              title="Cocina en tiempo real"
              description="La cocina ve cada orden apenas se envía. Menos gritos, menos platos perdidos."
            />
            <FeatureCard
              icon={<Zap className="h-6 w-6" />}
              title="Rápido de verdad"
              description="Interfaz pensada para el ritmo del salón. Sin cargas, sin trabas."
            />
            <FeatureCard
              icon={<BarChart3 className="h-6 w-6" />}
              title="Cierre sin sorpresas"
              description="Ventas del turno, propinas y métodos de pago listos al final del día."
            />
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Sirve. Todos los derechos reservados.
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-6">
      <div className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-primary/10 text-primary mb-4">
        {icon}
      </div>
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}
```

**Decisions made**:

- **`Link` vs `<Button asChild>`**: our `Button` component does NOT support `asChild`. Wrapping a `<Link>` around a `<Button>` produces invalid `<a><button>` markup. Therefore CTAs are `<Link>` elements with the button variant classes inlined. This duplicates a small class string in two places — acceptable trade-off vs. introducing `asChild` in this PR. If we want to remove duplication later, that is a separate refactor of `Button` (out of scope).
- **`FeatureCard` — plain `<div>` vs `Card` primitive**: `Card` uses `bg-surface`, which is also the background of the surrounding features section. Reusing `Card` would give zero contrast. The feature card must sit on `bg-background` (inverted from section) to visually pop. So we use a plain `<div>` with `bg-background border border-border`. Justification: `Card` primitive is not a hard requirement — it is a token-styled convenience. When tokens conflict with layout intent, use tokens directly.
- **Icon color chip**: `bg-primary/10 text-primary` — soft green chip behind Lucide icon. Reinforces brand green (`hsl(142 76% 36%)`) without shouting.
- **Wordmark**: `Sirve` (matches the proposal and current spelling used across the app UI in newer files). Existing login page shows `Sirva` — flagged as a separate spelling inconsistency; NOT fixing it in this PR to keep the diff scoped. Raise it as a follow-up.
- **`min-h-screen flex flex-col`** + `flex-1` on hero: guarantees the footer sits at the bottom even on tall viewports without content pushing it up.
- **`max-w-6xl` / `max-w-4xl` / `max-w-2xl`**: hierarchy — chrome (header, footer, features) at 6xl, hero headline block at 4xl, hero paragraph at 2xl for readability.
- **Header CTA + hero CTA**: both point to `/login`. Two entry points, one destination — standard SaaS landing pattern.

### 2.2 `src/middleware.ts` — one-line change

**Before** (line 33):
```ts
const PUBLIC_PAGE_PATHS = ['/login', '/403', '/setup']
```

**After**:
```ts
const PUBLIC_PAGE_PATHS = ['/', '/login', '/403', '/setup']
```

**Prefix-match safety analysis** (line 45):

```ts
PUBLIC_PAGE_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
```

For `p = '/'`:
- `pathname === '/'` matches ONLY the root — good.
- `pathname.startsWith('/' + '/')` = `pathname.startsWith('//')` — no legitimate route starts with `//`, so this check is effectively a no-op. Next.js normalizes double slashes.

Conclusion: adding `'/'` is safe. It does NOT accidentally expose `/admin`, `/mesero`, or any other child route, because the second condition becomes `startsWith('//')` which never matches a valid pathname. Every existing protected route continues to fall through to the JWT check.

### 2.3 `src/app/(auth)/login/page.tsx` — add back-link

**Insertion point**: the current root is:

```tsx
<div className="min-h-screen flex items-center justify-center bg-background">
  <div className="bg-surface rounded-2xl shadow-md p-8 w-full max-w-sm border border-border">
    ...
  </div>
</div>
```

Wrap the card in a vertical stack so the back-link sits ABOVE the card, still centered:

**Change**: replace the outer wrapper's classes from `flex items-center justify-center` to `flex flex-col items-center justify-center gap-4`, then insert the link right before the card.

```tsx
<div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
  <Link
    href="/"
    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    ← Ir al inicio
  </Link>

  <div className="bg-surface rounded-2xl shadow-md p-8 w-full max-w-sm border border-border">
    ...
  </div>
</div>
```

Add the import:
```ts
import Link from 'next/link'
```

**Decisions made**:

- **Ghost/link style vs Button**: the primary CTA on this page is the green "Ingresar" button inside the card. A second Button — even ghost — near it competes for attention. A bare underlined-on-hover text link is the correct visual weight: present but demoted. This matches the proposal's "ghost-styled" intent (Button `ghost` variant is `bg-transparent text-foreground hover:bg-surface-raised`, which would draw a hover box near the card border — noisier than a plain text link).
- **Position above the card**: back-navigation belongs OUTSIDE the form container so it is not visually tied to the login flow. Keeping it above (not below) matches the reading order — user's eye lands on it before the form.
- **No `mt-*` on the card**: the parent `gap-4` handles spacing consistently.
- **Arrow character**: `←` (U+2190) — no icon library needed for one glyph.

---

## 3. Component Imports Summary

| File | Import | From |
|------|--------|------|
| `src/app/page.tsx` | `Link` | `next/link` |
| `src/app/page.tsx` | `UtensilsCrossed, Zap, ChefHat, BarChart3` | `lucide-react` |
| `src/app/page.tsx` | `Button` | `@/components/ui/Button` — imported but note: CTAs use raw `<Link>`. If we drop Button (see decision), remove this import. **Final: DO NOT import Button** — CTAs are styled `<Link>` elements. |
| `src/app/(auth)/login/page.tsx` | `Link` (new) | `next/link` |

**Final import list for `src/app/page.tsx`**:
```ts
import Link from 'next/link'
import { UtensilsCrossed, Zap, ChefHat, BarChart3 } from 'lucide-react'
```

Lucide is already a dependency (`lucide-react: ^0.525.0` in `package.json`) — no install needed.

**No new components created.** Reuse-only.

---

## 4. Styling Approach

### Token map by section

| Section | Background | Text | Border |
|---------|-----------|------|--------|
| Page root | `bg-background` | `text-foreground` | — |
| Header | (inherits `bg-background`) | `text-foreground` | `border-b border-border` |
| Hero | (inherits `bg-background`) | `text-foreground` for h1, `text-muted-foreground` for lead | — |
| Features section | `bg-surface` | — | `border-t border-border` |
| Feature card | `bg-background` (contrast against `bg-surface` parent) | `text-foreground` title, `text-muted-foreground` body | `border border-border` |
| Icon chip | `bg-primary/10 text-primary` | — | — |
| Footer | (inherits `bg-background`) | `text-muted-foreground` | `border-t border-border` |
| Primary CTA | `bg-primary text-primary-foreground hover:bg-primary-hover` | — | — |

### Responsive breakpoints (mobile-first)

- Base: single-column stack, `text-4xl` hero, `grid-cols-1`
- `md:` (≥768px): `text-6xl` hero, `grid-cols-2` features, CTA row becomes `flex-row`
- `lg:` (≥1024px): `grid-cols-4` features

### Dark mode

All classes used are token-based (`bg-background`, `bg-surface`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary`). These tokens flip automatically via the `.dark` class on `<html>` (managed by `next-themes`, `defaultTheme="dark"` per project setup). NO extra `dark:` classes needed. `bg-primary/10` also works in both modes because it derives from the primary token.

---

## 5. Final Copy (Spanish, Rioplatense-friendly)

- **Wordmark**: `Sirve`
- **Header CTA**: `Ingresar`
- **Hero H1**: `El sistema que hace fluir tu restaurante`
- **Hero lead**: `Toma órdenes desde la mesa, coordina la cocina en tiempo real y cerrá el turno sin cuentas pendientes.`
- **Hero CTA**: `Comenzar`
- **Features H2**: `Todo lo que tu operación necesita`
- **Feature 1**: `Órdenes desde la mesa` — `Tus meseros toman pedidos desde el celular. Sin papel, sin errores de comanda.`
- **Feature 2**: `Cocina en tiempo real` — `La cocina ve cada orden apenas se envía. Menos gritos, menos platos perdidos.`
- **Feature 3**: `Rápido de verdad` — `Interfaz pensada para el ritmo del salón. Sin cargas, sin trabas.`
- **Feature 4**: `Cierre sin sorpresas` — `Ventas del turno, propinas y métodos de pago listos al final del día.`
- **Footer**: `© {year} Sirve. Todos los derechos reservados.` (year computed at render via `new Date().getFullYear()` — safe in RSC)
- **Login back-link**: `← Ir al inicio`

---

## 6. Server Component Justification

**Why RSC for `src/app/page.tsx`**:
1. **SEO**: landing is the primary indexable surface. Pre-rendered HTML is served immediately, no client JS blocking First Contentful Paint.
2. **Zero hydration cost**: no `useState`, no `useEffect`, no event handlers on the page. Even the CTAs are `<Link>` elements — Next.js handles client-side navigation via its runtime, not per-page hydration.
3. **Static by default**: with no dynamic APIs (`cookies()`, `headers()`) called on this route, Next.js will statically prerender it at build time. Fastest possible response.
4. **No `'use client'` directive**: the file has no client-only APIs, so we do not need it.

**What this excludes** (must NOT be added to `page.tsx`):
- `useState`, `useEffect`, `useRef`, any React hook
- `onClick`, `onChange`, or any event handler prop
- Browser-only APIs (`window`, `document`, `localStorage`)
- Any import from a `'use client'` module that itself requires client-only APIs

The `Button` primitive is client-safe (it uses `forwardRef` and no hooks in the render), but since we chose `<Link>` for CTAs we don't import it here.

**Login page stays `'use client'`**: it has form state and event handlers. Adding a `<Link>` inside it is fine — `next/link` works in both client and server components.

---

## 7. Sequence / Data Flow

### Anonymous visitor loading `/`

1. Browser requests `GET /` on the app domain.
2. `middleware.ts` runs (matcher covers `/`).
3. `pageMiddleware(req)` reads `pathname === '/'`.
4. `PUBLIC_PAGE_PATHS.some(p => pathname === p || ...)` — matches on `p === '/'` via strict equality.
5. Middleware returns `NextResponse.next()` — no cookie check, no JWT verify, no tenant resolution.
6. Next.js serves the prerendered landing HTML.
7. Browser paints. No client JS beyond the Next.js router runtime for `<Link>` navigation.

**No DB calls. No auth checks. No tenant lookup.** The landing page is a pre-tenant surface.

### Visitor clicks "Ingresar" or "Comenzar" (both → `/login`)

1. Next.js `<Link>` intercepts click, performs client-side navigation to `/login`.
2. `pageMiddleware` matches `pathname === '/login'` — public — passes through.
3. Login page renders (client component, form ready).

### Logged-in user hits `/` directly

1. Same flow as anonymous — middleware passes `/` through without cookie inspection.
2. Landing renders normally.
3. User sees the "Ingresar" CTA. Clicking it takes them to `/login`, where their session cookie will already trigger the client-side auth redirect logic (existing behavior). **Note**: we do NOT add server-side "if logged in, redirect to /admin from /" logic. Rationale: (a) middleware for `/` would need to inspect the cookie, breaking the "public means public" simplicity; (b) many marketing pages let signed-in users browse the landing — this is normal and expected.

### User on `/login` clicks "← Ir al inicio"

1. `<Link href="/">` performs client-side nav.
2. Same middleware pass-through.
3. Landing renders.

---

## 8. ADR-Style Decisions

### ADR-1: CTAs are styled `<Link>` elements, not `<Button>` wrapped in `<Link>`

- **Context**: Landing needs primary green CTAs pointing to `/login`. `Button` component does not support `asChild`.
- **Decision**: Use `<Link>` directly with button variant classes inlined.
- **Rejected**: (a) `<Link><Button>...</Button></Link>` — produces invalid nested interactive elements. (b) Extend `Button` with `asChild` via Radix Slot — larger refactor, out of scope for a landing PR. (c) Create a `<LinkButton>` primitive — premature abstraction for two call sites.
- **Consequence**: Small class-string duplication accepted. `Button` refactor to `asChild` can be a future PR that also updates the landing.

### ADR-2: Feature cards use plain `<div>`, not `Card` primitive

- **Context**: The features section sits on `bg-surface`. `Card` also uses `bg-surface` — reusing it inside its own background would give zero contrast.
- **Decision**: Plain `<div>` styled with `bg-background border border-border rounded-lg p-6`.
- **Rejected**: `Card` primitive — visually flat against parent. Overriding `Card`'s `bg-surface` with `bg-background` via className works, but at that point we're fighting the primitive.
- **Consequence**: When landing sections alternate background tokens, use raw div + tokens.

### ADR-3: `/` is fully public in middleware; no "if logged in redirect to app" behavior

- **Context**: Some SaaS apps auto-redirect signed-in users from `/` to `/dashboard`. This requires middleware to inspect the session cookie for a public route.
- **Decision**: Keep `/` truly public. Signed-in users see the landing like anyone else and click through if they want the app.
- **Rejected**: Server-side redirect based on cookie — adds cookie-parsing to a public route, complicates the "PUBLIC_PAGE_PATHS = no checks" invariant, and forces the page to be dynamic (killing static prerender).
- **Consequence**: Signed-in users get one extra click to reach `/login` (which itself has redirect logic). Acceptable trade-off for simpler, faster landing.

### ADR-4: Back-link is a text link, not a ghost Button

- **Context**: Login page has a green primary CTA inside a card. A ghost Button above the card would introduce a bordered/hover-highlighted rectangle competing with the card edge.
- **Decision**: Bare `text-sm text-muted-foreground hover:text-foreground` link with an arrow glyph.
- **Rejected**: `<Button variant="ghost">` — the ghost hover `bg-surface-raised` creates a rectangle on hover that visually clashes with the adjacent card.
- **Consequence**: Consistent visual hierarchy: form CTA dominates, back-link is understated.

### ADR-5: Wordmark spelling is `Sirve` (not `Sirva`)

- **Context**: Existing login page shows `Sirva`. Proposal and product name are `Sirve`. There is a real inconsistency in the codebase.
- **Decision**: Use `Sirve` on the landing page. Do NOT change the login page wordmark in this PR.
- **Rejected**: (a) Match existing `Sirva` — perpetuates the inconsistency; (b) Fix both — scope creep, one-line change in a different feature area, deserves its own tiny PR.
- **Consequence**: Landing header says `Sirve`, login card says `Sirva`. Follow-up PR to unify (out of scope here — flag in verify).

---

## 9. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| CSS token missing (`bg-primary-hover`, `bg-surface-raised`) | LOW | Both are referenced by existing `Button` component and used elsewhere; verified present in the design system per proposal. `sdd-verify` should re-check. |
| `Sirve` vs `Sirva` visible inconsistency between landing and login | LOW | Flagged as follow-up in ADR-5. |
| Lucide icons bundle size | NEGLIGIBLE | Tree-shakeable named imports; four icons add ~1-2KB gzipped. |
| Static prerender broken if any dynamic API sneaks in | LOW | Enforced by keeping `page.tsx` free of `cookies()`, `headers()`, `fetch(..., { cache: 'no-store' })`. |
| Users bookmarking `/login` do not benefit from back-link | ACCEPTED | Not a defect — back-link helps in-app flow, bookmarks work as before. |

---

## 10. Not in Scope

- Analytics / conversion tracking on landing
- Pricing page, features detail pages, testimonials
- SEO metadata (`export const metadata`) — separate concern, can follow if the change requests it; not required for the proposal's acceptance criteria
- Auto-redirect for authenticated users from `/` to their role home
- Fixing `Sirva` → `Sirve` in login page
- Adding `asChild` to `Button` primitive

Each of the above is an intentional future PR — noted here so `sdd-verify` doesn't flag their absence as a defect.
