# Proposal: UI/UX Mejora Profesional

**Change ID:** `ui-mejora-profesional`
**Project:** `sirve-saas`
**Status:** proposed
**Date:** 2026-07-31

---

## 1. Intent

### Problem

`sirve-saas` currently looks and feels like a working prototype, not a production SaaS product used daily by restaurant staff and owners. Concrete manifestations:

- **No brand identity.** Each role area uses a different random accent color (admin = orange-500, mesero = sky-500, superadmin = indigo-500, cocina = emerald-500, login = blue-600). There is no single "sirve" brand color.
- **No design system.** Zero design tokens. Every color, radius, spacing decision is inline Tailwind classes chosen ad-hoc per file.
- **No component primitives.** The same button className string (`bg-sky-500 hover:bg-sky-600 text-white py-3 rounded-2xl font-semibold`) is duplicated 20+ times across `mesero/ordenes/page.tsx` alone. Same for inputs, cards, list items.
- **Prototype feel from styling choices.** Buttons are visually oversized (`py-3`, `rounded-2xl`), border-radius is too soft (`rounded-xl`, `rounded-2xl` everywhere), padding is generous in a way that reads "toy app" rather than "professional tool."
- **Inconsistent form controls.** Dropdowns/`<select>` elements fall back to browser defaults or get partial styling, inputs use three different focus ring colors (emerald-400, sky-400, green-400) across files.
- **Weak interactive feedback.** Clickable rows, list items, and cards lack proper hover/active states. Many have no `cursor-pointer`, no `hover:bg-*`, no transition.
- **No information hierarchy.** Labels, values, and status badges are rendered with ad-hoc font sizes and weights. Titles mix `text-2xl font-extrabold`, `text-xl font-bold`, `text-lg font-extrabold` with no scale.
- **Duplicated layouts.** Three near-identical layout files (admin, mesero, superadmin) — 240+ lines of copy-pasted JSX with only accent color and nav items differing.

### Why now

Sirve is entering the phase where real restaurants will use it daily on shared devices (tablets in kitchen, phones for meseros, laptops for admin). Every visual inconsistency compounds into a loss of trust ("this looks unfinished — can I trust it with my orders and my staff?"). Fixing this before onboarding paying tenants is dramatically cheaper than retrofitting later.

### Success looks like

- One coherent brand identity — warm orange primary — visible across login, admin, mesero, cocina, superadmin.
- A documented, semantic token system (`bg-primary`, `bg-surface`, `text-muted-foreground`, `border-border`) — zero hardcoded `bg-slate-*` / `bg-sky-*` / `bg-emerald-*` in feature code.
- Reusable component primitives (`Button`, `Input`, `Select`, `Label`, `Badge`, `Card`, `Skeleton`, `EmptyState`) used everywhere. Feature files stop composing raw HTML with 60-char className strings.
- Buttons feel professional: `rounded-md` (not `rounded-xl`/`rounded-2xl`), tighter vertical padding (`h-9`/`h-10` sizes, not `py-3`), sharp variants (`default`, `outline`, `ghost`, `destructive`).
- Every clickable element has a visible hover state, cursor, and 150ms color transition — the app feels alive under the mouse/finger.
- Status badges follow one shared system (`ESTADO_INFO`) — no more duplicated maps between `cocina` and `mesero/ordenes`.
- A single `AppLayout` component replaces the three duplicated role layouts.
- Non-functional: zero regressions in existing flows. Every current feature still works exactly as it does today.

---

## 2. Scope

### In scope

- **Design token layer.** Add a Tailwind v4 `@theme` block in `globals.css` with the full semantic token set (colors, radii, focus ring). Full light + dark parity.
- **Brand color decision.** Warm orange primary (food-forward) codified once, consumed via `bg-primary` / `text-primary` / `ring-primary` everywhere.
- **Component primitives** (new files under `src/components/ui/`):
  - `Button` — variants `default | outline | ghost | destructive | link`, sizes `sm | md | lg | icon`
  - `Input` — text/number/email/password with consistent focus ring
  - `Select` — styled wrapper over native `<select>` matching Input, plus chevron affordance
  - `Label` — form label with required-asterisk support
  - `Badge` — semantic variants (`default | success | warning | destructive | info | muted`)
  - `Card` — surface container with `CardHeader`, `CardBody`, `CardFooter`
  - `Skeleton` — plus `CardSkeleton`, `ListSkeleton` presets
  - `EmptyState` — icon + title + description + optional action slot
- **Shared utilities:**
  - `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
  - `src/lib/constants/estado-orden.ts` — single source of truth for `ESTADO_INFO` / `ESTADO_COLOR` (extract from `cocina/page.tsx` and `mesero/ordenes/page.tsx`)
- **Shared layout:**
  - `src/components/layouts/AppLayout.tsx` — receives `navItems`, `user`, `roleLabel`; replaces the three role layouts
  - `src/app/admin/layout.tsx`, `mesero/layout.tsx`, `superadmin/layout.tsx` collapse to thin wrappers passing role-specific props
- **Interactive polish pass:** every clickable row/card/list item gets `hover:bg-surface-raised cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`.
- **Typography scale:** `text-page-title` / `text-section-title` / `text-card-title` / `text-label` / `text-value` semantic classes defined in `@theme`.
- **Login page rebrand:** replace `bg-blue-600` button with `<Button>`, apply brand color, sharpen visual identity.
- **Cocina header consistency:** align with `AppLayout` header pattern (currently inline & inconsistent).

### Out of scope (explicit)

- **No functional changes.** No new pages, no removed pages, no new API endpoints, no changed API contracts, no changed request/response shapes.
- **No database changes.** Zero migrations. Zero schema edits under `supabase/migrations/`.
- **No auth changes.** JWT, cookie `sirve_session`, tenant middleware — untouched.
- **No route changes.** Every URL keeps working exactly as today.
- **No new external UI library.** Not adopting shadcn/ui, not adopting Radix, not adopting Headless UI. Build the primitives directly against Tailwind v4 tokens.
- **No toast library swap in this change.** Custom `Toast` gets restyled to use tokens; migration to `sonner` deferred to a follow-up change.
- **No form validation library adoption.** `react-hook-form` + `zod` migration deferred.
- **No animation framework.** No `motion` / Framer Motion. Only Tailwind transitions.
- **No i18n changes.** Copy stays as-is (Spanish).
- **No accessibility audit as a separate deliverable** — we hit the obvious wins (focus-visible, aria-current, aria-label on icon buttons, touch-target sizing) but a full WCAG audit is a future change.
- **No mobile-nav rework** beyond what falls out of `AppLayout` extraction.

---

## 3. Approach

**Chosen approach: Approach C from exploration — Tailwind v4 `@theme` tokens + extracted primitives.**

### Why not the alternatives

- **Approach A (minimal polish only):** solves inconsistency but leaves us without a real design system. Six months from now we're back in the same hole for the next feature. Not a foundation.
- **Approach B (adopt shadcn/ui):** highest ceiling but introduces a dependency whose Tailwind v4 support is still maturing, and we'd be replacing working custom components (`Modal`, `ConfirmDialog`, `Toast`) with equivalents just to get the primitives. Wrong cost/benefit right now.
- **Approach C (tokens + hand-built primitives):** delivers ~80% of shadcn's polish with zero framework lock-in, works cleanly with Tailwind v4's native `@theme` system, and the components we build become project-owned assets we can evolve without waiting on upstream.

### Execution shape

1. **Tokens first.** Define the entire `@theme` block in `globals.css` — every downstream file consumes it. No component work starts until the token layer is committed and verified in both themes.
2. **Utilities second.** `cn()` and shared constants land next — needed by every primitive.
3. **Primitives third.** Build `Button`, `Input`, `Select`, `Label`, `Badge`, `Card`, `Skeleton`, `EmptyState` in dependency order (Button before Card, since Card uses it for actions).
4. **Layout fourth.** `AppLayout` extraction — collapses the three role layouts.
5. **Migration last.** Replace inline classNames in feature files with primitives, page by page. Each page migration is an isolated, reviewable unit.

Every step is behaviorally invisible — a user cannot tell which order things happened in, only that the app looks progressively more polished.

---

## 4. Color Palette

Warm orange primary — food/restaurant-forward, distinct from every competitor's blue/green, works as a single brand color across all roles (no more per-role accents).

### Semantic token table

| Token | Light HSL | Dark HSL | Purpose |
|-------|-----------|----------|---------|
| `--color-background` | `30 20% 98%` | `24 10% 8%` | App background |
| `--color-foreground` | `24 10% 10%` | `30 15% 96%` | Primary text |
| `--color-surface` | `0 0% 100%` | `24 10% 11%` | Cards, panels |
| `--color-surface-raised` | `30 15% 96%` | `24 8% 15%` | Hover state on rows, dropdown menus |
| `--color-surface-sunken` | `30 15% 94%` | `24 10% 6%` | Input backgrounds, code blocks |
| `--color-primary` | `22 92% 50%` | `22 92% 55%` | Brand — warm orange |
| `--color-primary-foreground` | `0 0% 100%` | `0 0% 100%` | Text on primary |
| `--color-primary-hover` | `22 92% 45%` | `22 92% 60%` | Primary button hover |
| `--color-secondary` | `30 10% 92%` | `24 8% 20%` | Secondary buttons/badges |
| `--color-secondary-foreground` | `24 10% 15%` | `30 15% 92%` | Text on secondary |
| `--color-muted` | `30 10% 94%` | `24 8% 18%` | Muted surface |
| `--color-muted-foreground` | `24 6% 45%` | `30 8% 65%` | Secondary/hint text |
| `--color-accent` | `22 92% 96%` | `22 40% 20%` | Subtle brand tint (selected states) |
| `--color-accent-foreground` | `22 92% 30%` | `22 92% 85%` | Text on accent |
| `--color-border` | `30 10% 88%` | `24 8% 22%` | Default borders |
| `--color-input` | `30 10% 88%` | `24 8% 24%` | Input borders |
| `--color-ring` | `22 92% 50%` | `22 92% 55%` | Focus ring |
| `--color-destructive` | `0 84% 55%` | `0 75% 55%` | Errors, destructive actions |
| `--color-destructive-foreground` | `0 0% 100%` | `0 0% 100%` | Text on destructive |
| `--color-success` | `142 70% 40%` | `142 65% 50%` | Confirmed states |
| `--color-warning` | `35 92% 50%` | `35 92% 58%` | Warnings |
| `--color-info` | `210 85% 50%` | `210 85% 60%` | Informational |

### Radius scale

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `4px` | Badges, tags |
| `--radius-md` | `6px` | Buttons, inputs, selects (default) |
| `--radius-lg` | `8px` | Cards, dialogs |
| `--radius-xl` | `12px` | Large surfaces (rare) |

Note: current app uses `rounded-xl` and `rounded-2xl` liberally. The new default for interactive controls is `rounded-md` (6px).

---

## 5. Button Design Direction

Buttons today feel prototype-ish: `py-3 rounded-2xl font-semibold` reads as "chunky app for kids." Professional SaaS buttons are tighter and sharper.

### Sizing

| Size | Height | Padding X | Font | Icon size |
|------|--------|-----------|------|-----------|
| `sm` | `h-8` (32px) | `px-3` | `text-sm` | 14px |
| `md` (default) | `h-9` (36px) | `px-4` | `text-sm font-medium` | 16px |
| `lg` | `h-10` (40px) | `px-5` | `text-base font-medium` | 18px |
| `icon` | `h-9 w-9` | — | — | 16-18px |

Compare to current: `py-3` renders ~48px tall — 33% too big for a professional feel. New `md` is 36px.

### Radius

All buttons: `rounded-md` (6px). Never `rounded-xl` or `rounded-2xl`. Never `rounded-full` except the dedicated `icon` variant with `aria-label`.

### Variants

| Variant | Background | Text | Border | Hover |
|---------|-----------|------|--------|-------|
| `default` (primary) | `bg-primary` | `text-primary-foreground` | none | `bg-primary-hover` |
| `outline` | `bg-transparent` | `text-foreground` | `border border-input` | `bg-surface-raised` |
| `ghost` | `bg-transparent` | `text-foreground` | none | `bg-surface-raised` |
| `destructive` | `bg-destructive` | `text-destructive-foreground` | none | brightness -8% |
| `secondary` | `bg-secondary` | `text-secondary-foreground` | none | `bg-surface-raised` |
| `link` | `bg-transparent` | `text-primary underline-offset-4` | none | `underline` |

All variants share: `inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none`.

### Hierarchy rule

Any screen should have at most **one** `default` (primary) button — the main action. Everything else is `outline`, `ghost`, or `secondary`. Currently every button on the mesero screen screams for attention with the same solid green — this fixes that.

---

## 6. Dropdown / Select

Native `<select>` elements today either look like unstyled browser defaults or get partial Tailwind styling that doesn't match adjacent Inputs. The new `Select` primitive:

- Wraps native `<select>` (accessibility + zero JS complexity, works on mobile).
- Applies the **exact same base styles as `Input`**: `h-9 rounded-md border border-input bg-surface-sunken px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`.
- Adds a `ChevronDown` icon absolutely positioned on the right (with `appearance-none` on the select to hide the native arrow), `pr-8` on the select for chevron room.
- Dark mode inherits from tokens — no dark-mode-specific overrides in the component.
- Disabled state: `opacity-50 pointer-events-none`.
- Optional `<Label>` above the select, using `<Label htmlFor={...}>`.

Whenever a richer dropdown is needed (search, multi-select, async options), that's a future component — out of scope here. The base `Select` covers 95% of current usage (status filter, tenant selector, role selector).

---

## 7. Clickable Elements — Hover & Active States

Rule: every element that responds to a click MUST visually communicate that it does. Today many rows and cards silently accept clicks with zero feedback.

### Base recipe for clickable rows/cards/list items

```
cursor-pointer
transition-colors duration-150
hover:bg-surface-raised
active:bg-surface-sunken
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-ring
focus-visible:ring-offset-2
focus-visible:ring-offset-background
```

Applied to: order rows in `mesero/ordenes`, ticket cards in `cocina`, tenant list rows in `superadmin`, user list rows in `admin/usuarios`, ingredient rows in `admin/ingredientes`, product rows in `admin/productos`.

### Touch target enforcement

Minimum `min-h-11` (44px) for any interactive row on mobile — Apple/Google HIG guideline. Enforced via a `.touch-target` utility class defined once in `globals.css`.

### Cursor discipline

- `cursor-pointer` on clickable non-button elements.
- Never `cursor-pointer` on labels, values, or decorative elements.
- Never `cursor-not-allowed` — use `disabled` attribute + `disabled:opacity-50 disabled:pointer-events-none`.

---

## 8. Information Display — Hierarchy & Badges

### Label / value hierarchy

Introduce two semantic patterns used everywhere data is displayed (order details, ingredient rows, product cards, tenant info):

- **Label:** `text-xs font-medium text-muted-foreground uppercase tracking-wide` — the "what."
- **Value:** `text-sm font-medium text-foreground` (default) or `text-base font-semibold text-foreground` (emphasized) — the "value."

Never render a value without a label. Never render both at the same weight/color.

### Status badge system

Single `<Badge>` component with semantic variants — replaces the ad-hoc `bg-emerald-500` / `bg-amber-500` / `bg-sky-500` scattered across `cocina` and `mesero/ordenes`.

| Variant | Background | Text | Usage |
|---------|-----------|------|-------|
| `default` | `bg-secondary` | `text-secondary-foreground` | Neutral tags |
| `success` | `bg-success/15` | `text-success` | Confirmed, delivered, paid |
| `warning` | `bg-warning/15` | `text-warning` | Pending, in-progress |
| `destructive` | `bg-destructive/15` | `text-destructive` | Cancelled, error |
| `info` | `bg-info/15` | `text-info` | Informational states |
| `muted` | `bg-muted` | `text-muted-foreground` | Inactive, archived |

Shared shape: `inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium`.

`ESTADO_INFO` gets extracted to `src/lib/constants/estado-orden.ts` and maps each order state to `{ label, icon, badgeVariant }`. Both `cocina` and `mesero/ordenes` import from there — no more drift.

### Page/section title scale

- **Page title:** `text-2xl font-semibold text-foreground` (not `font-extrabold`).
- **Section title:** `text-lg font-semibold text-foreground`.
- **Card title:** `text-base font-semibold text-foreground`.
- **Card subtitle / description:** `text-sm text-muted-foreground`.

`font-extrabold` disappears from the codebase — it's the visual equivalent of shouting.

---

## 9. Component & File Inventory

### New files (created in this change)

- `src/lib/utils.ts` — `cn()` (clsx + tailwind-merge)
- `src/lib/constants/estado-orden.ts` — shared `ESTADO_INFO` map
- `src/components/ui/Button.tsx` — variant + size CVA-style API
- `src/components/ui/Input.tsx` — text/number/email/password/tel
- `src/components/ui/Select.tsx` — styled native select
- `src/components/ui/Label.tsx` — form label
- `src/components/ui/Badge.tsx` — semantic variant badge
- `src/components/ui/Card.tsx` — Card + CardHeader + CardBody + CardFooter
- `src/components/ui/Skeleton.tsx` — Skeleton + CardSkeleton + ListSkeleton
- `src/components/ui/EmptyState.tsx` — icon + title + description + action
- `src/components/layouts/AppLayout.tsx` — shared role layout

### Modified files

- `src/app/globals.css` — add `@theme` token block, `.touch-target`, focus-visible utilities
- `src/app/(auth)/login/page.tsx` — use `<Button>` + brand identity
- `src/app/admin/layout.tsx` — collapse to `<AppLayout>` wrapper
- `src/app/mesero/layout.tsx` — collapse to `<AppLayout>` wrapper
- `src/app/superadmin/layout.tsx` — collapse to `<AppLayout>` wrapper
- `src/app/cocina/page.tsx` — use `<AppLayout>` header pattern, use shared `ESTADO_INFO`, `<Badge>`, `<Card>`
- `src/app/admin/ingredientes/page.tsx` — migrate to `<Button>` / `<Input>` / `<Card>` / `<EmptyState>`
- `src/app/admin/productos/page.tsx` — migrate to `<Button>` / `<Input>` / `<Card>` / `<EmptyState>`
- `src/app/admin/usuarios/page.tsx` — migrate to `<Button>` / `<Input>` / `<Select>` / `<Card>`
- `src/app/mesero/ordenes/page.tsx` — migrate to `<Button>` / `<Input>` / `<Badge>` / `<Card>` + shared `ESTADO_INFO`
- `src/app/superadmin/page.tsx` — migrate to `<Card>` / `<EmptyState>`
- `src/app/superadmin/tenants/new/page.tsx` — migrate to `<Button>` / `<Input>` / `<Select>` / `<Label>`
- `src/app/superadmin/tenants/[slug]/page.tsx` — migrate to `<Card>` / `<Button>` / `<Badge>`
- `src/components/ui/Toast.tsx` — restyle to use tokens (migration to `sonner` deferred)
- `src/components/ui/Modal.tsx` — swap hardcoded slate for tokens
- `src/components/ui/ConfirmDialog.tsx` — use `<Button>` internally
- `src/components/ui/StatusBadge.tsx` — thin re-export over new `<Badge>` for backward-compat during migration

### Deleted files (after migration completes)

None in this change. Existing components stay as re-exports if any external code depends on them; deletions get scheduled once every consumer is migrated.

---

## 10. Risks

- **Tailwind v4 `@theme` semantics.** In v4, tokens defined inside `@theme {}` become Tailwind utility classes directly (`--color-primary` → `bg-primary`, `text-primary`, `ring-primary`). This needs to be verified against v4 docs before authoring the token block — a wrong assumption here breaks every downstream class name.
- **`next-themes` + Tailwind v4 `@custom-variant dark`.** Current setup uses `@custom-variant dark (&:where(.dark, .dark *))` — this is the correct v4 approach and `next-themes` toggles the `dark` class on `<html>`. Combination works but every token must have a `.dark` override defined in the `@theme` block for dark mode to actually flip.
- **Migration blast radius.** Touching almost every page file. Mitigation: strict discipline that primitives land first (behaviorally invisible), page migrations happen last, one page per commit for reviewability. Every page migration is reversible.
- **Custom `Toast` restyle risk.** The custom Toast is conditionally rendered per-page — restyling to tokens is safe, but any pixel-perfect layout dependency on the current styling breaks. Mitigation: keep the API identical, only swap className strings.
- **`StatusBadge` back-compat.** Existing imports of `StatusBadge` must keep working through the migration. Solution: `StatusBadge` becomes a thin wrapper mapping legacy props to `<Badge variant={...}>`.
- **Design bikeshedding on the exact orange.** `22 92% 50%` is proposed; the final HSL may shift ±5% during implementation review. Not a blocker — the token layer means one CSS edit updates the entire app.
- **Cocina layout divergence.** `cocina/page.tsx` currently owns its own header/LogoutButton. Migrating to `AppLayout` requires either extending `AppLayout` to support a "no sidebar, header only" mode, or accepting that cocina keeps a slim custom shell that just uses the shared tokens. Decision deferred to `sdd-design`.
- **Touch target enforcement.** Adding `min-h-11` to list rows may visibly increase vertical spacing on dense screens (mesero orders list). Acceptable tradeoff — accessibility wins — but flagged for design review.
- **No automated visual regression testing.** We rely on manual review per page. Mitigation: keep each page's migration in its own commit so any regression is easy to bisect.

---

## 11. Explicit Out-of-Scope (repeated for clarity)

- **No functionality changes** — no new features, no removed features, no behavior changes.
- **No database changes** — zero migrations, zero SQL edits.
- **No API changes** — every route handler stays identical in signature and response shape.
- **No auth changes** — JWT flow, cookie strategy, middleware, tenant resolution — untouched.
- **No route changes** — every URL preserved.
- **No new external dependencies** for UI (no shadcn, no Radix, no Headless UI, no Framer Motion).
- **No `sonner` toast migration** (deferred).
- **No `react-hook-form` / `zod` form migration** (deferred).
- **No i18n / copy changes.**
- **No WCAG-level accessibility audit** (baseline improvements only).
- **No mobile navigation redesign** beyond `AppLayout` extraction.
- **No performance work** (bundle analysis, code-splitting) — separate concern.

---

## Next Steps

Proceed in parallel:
- `sdd-spec` — formalize behavior spec (what the token system guarantees, what each primitive's API must expose, non-functional invariants like "no hardcoded colors in feature files").
- `sdd-design` — design decisions: exact `@theme` block structure, `AppLayout` prop API, `Button` CVA schema, `cocina` layout resolution (extend AppLayout vs. slim shell), migration ordering strategy.

Then: `sdd-tasks` (dependency-ordered task list), `sdd-apply`, `sdd-verify`, `sdd-archive`.
