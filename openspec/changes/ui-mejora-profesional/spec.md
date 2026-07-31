# Spec: UI/UX Mejora Profesional

**Change ID:** `ui-mejora-profesional`
**Status:** specced
**Artifact store:** hybrid

---

## Purpose

Define what MUST be true in the sirve-saas UI layer after this change lands. Covers design tokens, UI primitives, shared layout, interactive states, notifications, and dark mode. No functional or API behavior changes.

---

## Requirements

### Requirement: Design Token System

The application MUST define all visual decisions (color, radius, ring) as semantic Tailwind v4 `@theme` tokens in `src/app/globals.css`. Every token MUST exist in both light and dark variants via `.dark` override block.

The following semantic color tokens MUST be defined: `background`, `foreground`, `surface`, `surface-raised`, `surface-sunken`, `primary`, `primary-foreground`, `primary-hover`, `secondary`, `muted`, `muted-foreground`, `accent`, `border`, `input`, `ring`, `destructive`, `success`, `warning`, `info`.

Radius tokens MUST include: `sm` (4px), `md` (6px), `lg` (8px), `xl` (12px).

Component JSX files MUST NOT contain raw Tailwind color classes: `bg-orange-*`, `bg-sky-*`, `bg-blue-*`, `bg-emerald-*`, `bg-indigo-*`, `text-orange-*`, `text-sky-*`, `text-blue-*`, `text-emerald-*`, `text-indigo-*`, `ring-emerald-*`, `ring-sky-*`, `ring-green-*`.

A `.touch-target` utility MUST be defined in `globals.css` that enforces `min-height: 44px`.

#### Scenario: Token drives primary color

- GIVEN the `@theme` block defines `--color-primary: hsl(22 92% 50%)`
- WHEN a developer writes `bg-primary` in any component
- THEN the rendered background matches the warm orange brand color in light mode
- AND in dark mode (`.dark` active) the background uses the dark variant `hsl(22 92% 55%)`

#### Scenario: No raw color classes in JSX

- GIVEN any file under `src/app/` or `src/components/`
- WHEN searched with `grep -r "bg-orange-\|bg-sky-\|bg-blue-\|bg-emerald-\|bg-indigo-"` across `.tsx` files
- THEN zero matches are returned in component JSX (globals.css and config files are exempt)

#### Scenario: Radius token usage

- GIVEN a Button component rendered with default size
- WHEN inspected in browser DevTools
- THEN border-radius resolves to 6px (rounded-md)

---

### Requirement: cn() Utility

The file `src/lib/utils.ts` MUST exist and MUST export a function named `cn` that merges Tailwind class strings without conflicts.

#### Scenario: cn() resolves conflicting classes

- GIVEN a call `cn("bg-primary", "bg-destructive")`
- WHEN the return value is applied to a DOM element
- THEN only `bg-destructive` is applied (last-wins merge)

---

### Requirement: Button Component

`src/components/ui/Button.tsx` MUST exist and be the single source of truth for all button rendering across the application.

Button MUST support these variants: `default`, `outline`, `ghost`, `destructive`, `secondary`, `link`.

Button MUST support these sizes: `sm` (h-8), `md` (h-9, default), `lg` (h-10), `icon` (h-9 w-9).

Button MUST use `rounded-md` on ALL variants and sizes. `rounded-xl`, `rounded-2xl`, and `rounded-full` MUST NOT appear on button elements.

Button MUST apply `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` on keyboard focus.

Button MUST apply `disabled:opacity-50 disabled:pointer-events-none` when disabled.

On mobile viewports, Button touch target MUST be at least 44px tall (via `.touch-target` utility or `min-h-11`).

At most ONE `default` (primary) variant button MUST appear per screen. All secondary actions MUST use `outline`, `ghost`, or `secondary` variants.

#### Scenario: Default button renders correctly

- GIVEN a `<Button>` with no variant prop
- WHEN rendered in light mode
- THEN it shows `bg-primary text-primary-foreground` styles, `h-9` height, `rounded-md` radius

#### Scenario: Disabled state

- GIVEN a `<Button disabled>`
- WHEN rendered
- THEN it shows `opacity-50` and does not respond to click events

#### Scenario: Focus ring on keyboard navigation

- GIVEN any Button variant
- WHEN focused via keyboard (Tab key)
- THEN a 2px ring using `--color-ring` token is visible around the button

---

### Requirement: Input and Select Components

`src/components/ui/Input.tsx` MUST exist. `src/components/ui/Select.tsx` MUST exist.

Both MUST share base styles: `h-9 rounded-md border border-input bg-surface-sunken px-3 text-sm`.

Both MUST apply `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` on focus — using `--color-ring` (primary orange), not emerald, sky, or green.

Select MUST suppress the native browser arrow via `appearance-none` and render a custom `ChevronDown` icon.

Both MUST apply `disabled:opacity-50 disabled:pointer-events-none` when disabled.

`src/components/ui/Label.tsx` MUST exist and render semantic `<label>` with `text-sm font-medium text-foreground`.

#### Scenario: Input focus uses brand ring

- GIVEN an `<Input>` component
- WHEN the user clicks into it
- THEN the focus ring color matches `--color-ring` (warm orange), not any other color

#### Scenario: Select hides native arrow

- GIVEN a `<Select>` component rendered in any browser
- WHEN inspected visually
- THEN no native OS dropdown arrow is visible; a custom ChevronDown icon appears on the right

---

### Requirement: Badge and StatusBadge

`src/components/ui/Badge.tsx` MUST exist and support variants: `default`, `success`, `warning`, `destructive`, `info`, `muted`.

Badge MUST use shape: `inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium`.

`src/components/ui/StatusBadge.tsx` MUST remain as a thin re-export wrapper over `Badge` for backward compatibility, mapping legacy `status` prop to the correct `variant`.

`src/lib/constants/estado-orden.ts` MUST be the single source of truth for order state metadata (`ESTADO_INFO`). Both `src/app/cocina/page.tsx` and `src/app/mesero/ordenes/page.tsx` MUST import from this file. Neither page MUST define its own local `ESTADO_INFO` map.

#### Scenario: StatusBadge backward compat

- GIVEN existing code that renders `<StatusBadge status="pendiente" />`
- WHEN rendered after the change
- THEN it renders identically to `<Badge variant="warning">Pendiente</Badge>`

#### Scenario: ESTADO_INFO single source

- GIVEN a grep for `ESTADO_INFO` across `src/app/`
- WHEN executed
- THEN zero local definitions are found; only imports from `src/lib/constants/estado-orden.ts`

---

### Requirement: Skeleton and EmptyState Components

`src/components/ui/Skeleton.tsx` MUST exist and export: `Skeleton` (base), `CardSkeleton`, `ListSkeleton`.

`src/components/ui/EmptyState.tsx` MUST exist and accept `title`, `description`, and optional `action` props.

Every list or async data section in the app MUST render `<ListSkeleton>` or `<CardSkeleton>` while data is loading.

Every list that can return zero results MUST render `<EmptyState>` when the result is empty.

#### Scenario: List loading state

- GIVEN a page that fetches data asynchronously (e.g., admin/ingredientes)
- WHEN the data fetch is pending
- THEN a skeleton placeholder is visible — not a blank screen or spinner-only state

#### Scenario: Empty result

- GIVEN a page whose data fetch returns an empty array
- WHEN rendered
- THEN an `<EmptyState>` component is visible with a non-empty `title`

---

### Requirement: AppLayout Shared Component

`src/components/layouts/AppLayout.tsx` MUST exist and accept nav items, role label, and user info as props.

`src/app/admin/layout.tsx`, `src/app/mesero/layout.tsx`, and `src/app/superadmin/layout.tsx` MUST each collapse to a thin wrapper that passes props to `<AppLayout>` — they MUST NOT duplicate nav/header/mobile-drawer markup.

Active nav item highlight MUST be driven by the `--color-primary` token, not any hardcoded class (`bg-orange-600`, `bg-sky-600`, etc.).

`src/app/cocina/page.tsx` MUST use AppLayout in header-only mode OR a shared header shell — it MUST NOT maintain its own duplicated header implementation.

#### Scenario: Nav active state uses token

- GIVEN the mesero layout renders with the current path matching a nav item
- WHEN the active nav item is inspected
- THEN its background resolves to the `--color-primary` token value, not a hardcoded orange/sky/indigo class

#### Scenario: Three layouts collapse

- GIVEN a grep for `mobile.*drawer\|MobileDrawer\|mobile-nav` in admin, mesero, superadmin layout files
- WHEN executed after the change
- THEN each layout file is under 30 lines and delegates to `<AppLayout>`

---

### Requirement: Toast / Notifications

`sonner` MUST be installed and its `<Toaster>` MUST be mounted in the root layout (`src/app/layout.tsx`).

All toast calls in the application MUST use the `sonner` `toast()` API.

The old custom `Toast` component (`src/components/ui/Toast.tsx`) MUST be removed. No file in the codebase MUST import from it after the change.

#### Scenario: Sonner Toaster present

- GIVEN the root layout file
- WHEN searched for `<Toaster`
- THEN exactly one `<Toaster>` import from `sonner` is found

#### Scenario: No legacy Toast imports

- GIVEN a grep for `from.*components/ui/Toast` across all `.tsx` files
- WHEN executed
- THEN zero matches are returned

---

### Requirement: Interactive Element States

Every clickable list row, card, and interactive surface MUST apply: `cursor-pointer transition-colors duration-150 hover:bg-surface-raised active:bg-surface-sunken`.

Every interactive element MUST have a keyboard-accessible `focus-visible` ring using `--color-ring`.

`cursor-not-allowed` MUST NOT appear in the codebase — disabled state MUST use the `disabled` HTML attribute.

#### Scenario: Order row hover

- GIVEN the mesero orders list
- WHEN the user hovers over an order row
- THEN the row background transitions to `surface-raised` within 150ms

#### Scenario: Touch target size

- GIVEN any interactive row on mobile viewport (375px wide)
- WHEN measured
- THEN the clickable area is at least 44px tall

---

### Requirement: Typography Scale

`font-extrabold` MUST NOT appear in any component or page file after this change.

Page titles MUST use `text-2xl font-semibold`. Section titles MUST use `text-lg font-semibold`. Card titles MUST use `text-base font-semibold`. Descriptions MUST use `text-sm text-muted-foreground`.

#### Scenario: No font-extrabold

- GIVEN a grep for `font-extrabold` across `src/app/` and `src/components/`
- WHEN executed
- THEN zero matches are returned

---

### Requirement: Dark Mode Token Coverage

Every new component introduced by this change MUST render correctly in both light and dark themes using only semantic tokens.

No new component file MUST contain `dark:bg-slate-*`, `dark:text-slate-*`, `dark:bg-gray-*`, `dark:text-gray-*` or any other hardcoded dark-mode override — all dark variants MUST be covered by the `.dark` `@theme` token block.

#### Scenario: Dark mode surface renders correctly

- GIVEN any new UI primitive (Button, Input, Select, Badge, Card, Skeleton, EmptyState)
- WHEN rendered with `class="dark"` on `<html>`
- THEN background and text colors invert correctly using token values, with no unreadable contrast

#### Scenario: No hardcoded dark overrides in new components

- GIVEN a grep for `dark:bg-slate\|dark:text-slate\|dark:bg-gray\|dark:text-gray` in `src/components/ui/`
- WHEN executed
- THEN zero matches are returned

---

## Out of Scope (Non-Requirements)

The following MUST NOT be introduced by this change:

- No functional changes to any page's data fetching, mutations, or routing
- No API contract changes (`src/app/api/`)
- No database schema changes or migrations
- No authentication or middleware changes
- No external UI library additions (no shadcn, no Radix, no Headless UI, no Framer Motion)
- No react-hook-form or zod migration
- No i18n or copy changes
- No full WCAG audit
- No mobile-nav redesign beyond AppLayout extraction
- No performance optimization work
