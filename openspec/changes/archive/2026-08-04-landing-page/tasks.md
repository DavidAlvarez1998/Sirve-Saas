# Tasks: landing-page

**Change**: `landing-page`
**Generated**: 2026-08-04
**Brand note**: Product wordmark visible to users is **"Sirva"**. Repo name "Sirve-Saas" is internal only.

---

## Review Workload Forecast

| Metric | Value |
|--------|-------|
| Estimated changed lines | ~130–160 |
| Files touched | 3 |
| Chained PRs recommended | No |
| 400-line budget risk | Low |
| Delivery strategy decision | Single PR — within budget, no chaining needed |

---

## Dependency Order

```
TASK-01 (middleware)
    └── TASK-02 (landing page — page.tsx rewrite)
            └── TASK-03 (login back-link)
                    └── TASK-04 (tsc check)
                            └── TASK-05 (lint check)
```

TASK-01 → TASK-02 → TASK-03 must be sequential (logical dependency).
TASK-04 and TASK-05 are verification steps; TASK-04 must precede TASK-05 (lint catches some TS-adjacent issues too, but tsc is the gate).

---

## Phase 1 — Middleware

### [x] TASK-01: Add `'/'` to `PUBLIC_PAGE_PATHS`

**File**: `src/middleware.ts`
**Line**: 33 (current value: `const PUBLIC_PAGE_PATHS = ['/login', '/403', '/setup']`)
**Change**: Insert `'/'` as the first element.

**Result after change**:
```ts
const PUBLIC_PAGE_PATHS = ['/', '/login', '/403', '/setup']
```

**Safety note**: The existing check is `pathname === p || pathname.startsWith(p + '/')`. For `p === '/'` this evaluates to `pathname === '/' || pathname.startsWith('//')`. No valid HTTP pathname starts with `//`, so no child routes are exposed.

**Satisfies**: REQ — Public Root Route (scenario: unauthenticated visit; scenario: root does not expose child routes; scenario: authenticated user visits root)

**Estimated lines changed**: 1

---

## Phase 2 — Landing Page

### [x] TASK-02: Rewrite `src/app/page.tsx` as Server Component landing page

**File**: `src/app/page.tsx`
**Change**: Full rewrite. Remove the current `redirect('/login')` stub. Replace with a static Server Component containing all required sections.

**Structure**:
- No `'use client'` directive
- No DB calls (`masterDb`, `withTenant` MUST NOT appear)
- No `cookies()` or `headers()` — statically prerenderable

**Sections in order**:

1. `<header>` — top bar
   - Left: wordmark "Sirva" (plain text, `text-xl font-bold text-foreground`)
   - Right: `<Link href="/login">` styled as primary button (`bg-primary text-primary-foreground hover:bg-primary-hover`)
   - Text label: "Ingresar"
   - Container: `max-w-6xl mx-auto px-6`, `border-b border-border`

2. `<main>` — two sub-sections

   a. Hero sub-section (`bg-background`)
   - Container `max-w-4xl mx-auto px-6 py-24 text-center`
   - H1: "El sistema que hace fluir tu restaurante" — `text-4xl md:text-6xl font-bold text-foreground`
   - Lead paragraph (max-w-2xl, centered): "Toma órdenes desde la mesa, coordina la cocina en tiempo real y cerrá el turno sin cuentas pendientes." — `text-lg text-muted-foreground`
   - CTA group (flex, gap-4, centered, wraps on mobile):
     - Primary CTA `<Link href="/login">` styled `bg-primary text-primary-foreground hover:bg-primary-hover` — label "Comenzar"
     - Secondary CTA `<Link href="/login">` styled `border border-border text-foreground hover:bg-surface` — label "Ingresar"

   b. Features sub-section (`bg-surface border-t border-border`)
   - Container `max-w-6xl mx-auto px-6 py-20`
   - H2: "Todo lo que tu operación necesita" — `text-3xl font-bold text-foreground text-center mb-12`
   - Grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6`
   - 4 feature cards (plain `<div>`, NOT `<Card>` primitive):
     - Card shell: `bg-background border border-border rounded-lg p-6 flex flex-col gap-3`
     - Icon chip: `w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center` with Lucide icon `text-primary`
     - Card title: `font-semibold text-foreground`
     - Card description: `text-sm text-muted-foreground`

   **4 cards** (order matters — must match spec exactly):

   | # | Icon (Lucide) | Title | Description |
   |---|---------------|-------|-------------|
   | 1 | `UtensilsCrossed` | Órdenes desde la mesa | Tus meseros toman pedidos desde el celular. Sin papel, sin errores de comanda. |
   | 2 | `Zap` | Cocina en tiempo real | La cocina ve cada orden apenas se envía. Menos gritos, menos platos perdidos. |
   | 3 | `ChefHat` | Rápido de verdad | Interfaz pensada para el ritmo del salón. Sin cargas, sin trabas. |
   | 4 | `BarChart3` | Cierre sin sorpresas | Ventas del turno, propinas y métodos de pago listos al final del día. |

3. `<footer>` — bottom bar
   - `bg-background border-t border-border text-muted-foreground`
   - Container `max-w-6xl mx-auto px-6 py-8 flex items-center justify-between`
   - Left: `© {new Date().getFullYear()} Sirva. Todos los derechos reservados.`
   - Right: `<Link href="/login">` styled `hover:text-foreground transition-colors` — label "Ingresar"

**Imports needed**:
```ts
import Link from 'next/link'
import { UtensilsCrossed, Zap, ChefHat, BarChart3 } from 'lucide-react'
```

**Satisfies**: REQ — Landing Page is a Server Component; REQ — Landing Page Structure; REQ — Hero Section Content; REQ — Features Section Content; REQ — Footer Content; REQ — Design Token Compliance

**Estimated lines changed**: ~110–130 (full rewrite of 5-line file)

---

## Phase 3 — Login Back-Link

### [x] TASK-03: Add "← Ir al inicio" link to login page

**File**: `src/app/(auth)/login/page.tsx`
**Constraint**: The existing login form markup MUST NOT be modified — only the outer wrapper and a new element above the card are touched.

**Current outer wrapper** (line 51):
```tsx
<div className="min-h-screen flex items-center justify-center bg-background">
```

**Change**: Add `flex-col gap-4` to the outer wrapper, then insert a `<Link>` element above the card `<div>`.

**Result**:
```tsx
<div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
  <Link
    href="/"
    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    ← Ir al inicio
  </Link>
  <div className="bg-surface rounded-2xl shadow-md p-8 w-full max-w-sm border border-border">
    {/* existing form — unchanged */}
  </div>
</div>
```

**Import to add** (line 8, after existing imports):
```ts
import Link from 'next/link'
```

**Satisfies**: REQ — Login Back-Link (both scenarios)

**Estimated lines changed**: ~5 (1 import + 1 class change + 3 link lines)

---

## Phase 4 — Verification

### [x] TASK-04: TypeScript compile check

**Command**: `npx tsc --noEmit`
**Pass condition**: exit code 0, zero errors
**Blocks**: TASK-05

**Checks for**:
- Correct Lucide named imports (all 4 icons exist in lucide-react ^0.525.0)
- `Link` imported from `next/link` in both files
- No type errors introduced

### [x] TASK-05: Lint check

**Command**: `npx next lint`
**Pass condition**: exit code 0, zero errors or warnings
**Depends on**: TASK-04 passing

**Checks for**:
- No `<a>` inside `<Link>` (no invalid HTML nesting)
- No unused imports

---

## Parallel Opportunities

None meaningful — the change is small enough (3 files) that sequential execution in a single apply pass is optimal. TASK-01 and TASK-02 are logically independent but both must land before TASK-03. All three can be written in a single apply pass, followed by the two verification commands.

---

## Spec Requirements Coverage

| Requirement | Satisfied by |
|-------------|--------------|
| Public Root Route | TASK-01 |
| Landing Page is a Server Component | TASK-02 |
| Landing Page Structure | TASK-02 |
| Hero Section Content | TASK-02 |
| Features Section Content (4 cards, correct titles/descriptions) | TASK-02 |
| Footer Content | TASK-02 |
| Design Token Compliance | TASK-02 (tokens only, no hardcoded colors) |
| Login Back-Link | TASK-03 |
| Existing Authenticated Flows Unaffected | TASK-01 (safe allowlist check) + no-op for other routes |

---

## Known Constraints / Gotchas

1. **Button `asChild` not available** — CTAs use raw `<Link>` with inlined Tailwind button classes. Do not wrap `<Button>` inside `<Link>` (invalid HTML: `<a><button>`).
2. **Card primitive uses `bg-surface`** — feature cards MUST be plain `<div>` with `bg-background`. Using `<Card>` inside the `bg-surface` section kills contrast.
3. **`bg-primary-hover` token** — used by existing `<Button>` so it must exist in the theme; verify visually during sdd-verify.
4. **Login page is `'use client'`** — adding `<Link>` inside is valid (Link is not a server-only component). No directive change needed.
5. **Wordmark**: use "Sirva" everywhere in visible copy. The repo name "Sirve-Saas" is internal only.
6. **`new Date().getFullYear()` in footer** — RSC renders at request time (development) or build time (production static). For a static site `next build`, the year is baked at build time — acceptable for a marketing footer.
