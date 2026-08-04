# Delta Spec — ui-theme-unificacion

**Change**: `ui-theme-unificacion`
**Phase**: 1 (accessibility fixes + ThemeToggle parity)
**Status**: ready

---

## Scope

6 surgical edits across role surfaces. No new domains — all are ADDED requirements on existing UI surfaces that currently have no formal spec.

---

## Requirements

### Requirement: Cocina Ingredient Badge Contrast

The ingredient badge in `src/app/cocina/page.tsx` MUST render with sufficient contrast in both light and dark mode.

In light mode, the badge background MUST NOT be darker than the page background unless text contrast ratio meets WCAG AA (≥4.5:1). In dark mode, text MUST be visible against the badge background.

#### Scenario: Badge visible in light mode

- GIVEN the user is on the cocina page in light mode
- WHEN an order card displays ingredient badges
- THEN the badge text is readable (contrast ratio ≥4.5:1 against its background)

#### Scenario: Badge visible in dark mode

- GIVEN the user is on the cocina page in dark mode
- WHEN an order card displays ingredient badges
- THEN the badge text is readable (contrast ratio ≥4.5:1 against its background)

---

### Requirement: Admin Usuarios Role Badge Contrast

The role badge in `src/app/admin/usuarios/page.tsx` MUST render with legible text in light mode.

The text color MUST NOT be `text-orange-300` or any value that falls below WCAG AA contrast on a white/light background.

#### Scenario: Role badge readable on light background

- GIVEN the user is on the admin usuarios page in light mode
- WHEN a user row displays a role badge (e.g. "Admin", "Mesero")
- THEN the badge text color has ≥4.5:1 contrast ratio against the badge or page background

#### Scenario: Role badge readable in dark mode

- GIVEN the user is on the admin usuarios page in dark mode
- WHEN a user row displays a role badge
- THEN the badge text remains readable (no regression from current dark mode rendering)

---

### Requirement: Cocina Empty State Text Contrast

The empty state message in `src/app/cocina/page.tsx` MUST be lighter than the page background in dark mode, not darker.

The class `dark:text-slate-600` (or any equivalent value darker than the dark-mode surface) MUST NOT be used for the empty state text.

#### Scenario: Empty state visible in dark mode

- GIVEN the user is on the cocina page in dark mode
- WHEN there are no active orders
- THEN the empty state text is visually distinguishable from the background (text is lighter than background)

#### Scenario: Empty state visible in light mode

- GIVEN the user is on the cocina page in light mode
- WHEN there are no active orders
- THEN the empty state text is visible (no regression)

---

### Requirement: ThemeToggle in Admin Mobile Nav

The admin layout (`src/app/admin/layout.tsx`) MUST expose the ThemeToggle component in the mobile navigation menu.

The ThemeToggle MUST be reachable without scrolling when the mobile nav is open.

#### Scenario: ThemeToggle present in mobile nav

- GIVEN an authenticated admin user on a mobile viewport (width <768px)
- WHEN the mobile navigation menu is opened
- THEN a ThemeToggle control is visible and interactive within the nav

#### Scenario: ThemeToggle functional

- GIVEN the ThemeToggle is visible in the admin mobile nav
- WHEN the user activates it
- THEN the color scheme switches between light and dark and persists on reload

---

### Requirement: ThemeToggle in Superadmin Mobile Nav

The superadmin layout (`src/app/superadmin/layout.tsx`) MUST expose the ThemeToggle component in the mobile navigation menu, identical in placement and behavior to the admin mobile nav.

#### Scenario: ThemeToggle present in superadmin mobile nav

- GIVEN an authenticated superadmin user on a mobile viewport (width <768px)
- WHEN the mobile navigation menu is opened
- THEN a ThemeToggle control is visible and interactive within the nav

#### Scenario: ThemeToggle parity across roles

- GIVEN both admin and superadmin layouts
- WHEN viewed on mobile
- THEN both expose a ThemeToggle in the mobile nav (same element, consistent placement)

---

### Requirement: Admin Modal Input Background Consistency

Modal input fields across `src/app/admin/ingredientes/page.tsx`, `src/app/admin/productos/page.tsx`, and `src/app/admin/usuarios/page.tsx` MUST use the same background token in both light and dark mode.

No modal input field in these three pages SHALL differ in background appearance from the others (e.g. one appears white while another appears transparent or gray).

#### Scenario: Inputs visually consistent across admin modals

- GIVEN the admin user opens any of the three admin modals (ingredientes, productos, usuarios)
- WHEN viewing input fields in either light or dark mode
- THEN all inputs share the same visual background style

#### Scenario: Consistent in dark mode

- GIVEN dark mode is active
- WHEN the admin user opens each admin modal in sequence
- THEN input backgrounds are identical across all three modals

---

## Non-Regression Requirements

### Requirement: Role Accent Colors Unchanged

The role accent color palette (admin=orange, mesero=sky, cocina=emerald, superadmin=indigo) MUST NOT change as part of this fix. Only contrast-failing values within those palettes are corrected.

#### Scenario: Accent hues preserved

- GIVEN any role surface after the change
- WHEN inspecting role-branded UI elements (nav highlights, badges, headers)
- THEN the hue family matches the pre-change design (orange/sky/emerald/indigo respectively)

---

### Requirement: Build and Type Check Pass

After all 6 edits, `next build` MUST complete with zero new warnings or errors. `tsc --noEmit` MUST pass with zero new errors.

#### Scenario: Clean build

- GIVEN all 6 files modified
- WHEN `next build` is run
- THEN exit code is 0 and no new warnings appear in the output

#### Scenario: Clean type check

- GIVEN all 6 files modified
- WHEN `tsc --noEmit` is run
- THEN exit code is 0

---

### Requirement: Unmodified Surfaces Unchanged

UI surfaces NOT in the fix list (mesero pages, cocina order cards beyond badges, superadmin data tables, etc.) MUST NOT change visually or structurally.

#### Scenario: No visual regression on out-of-scope pages

- GIVEN a page not in the 6-file fix list
- WHEN viewed in light or dark mode after the change
- THEN its appearance is identical to pre-change baseline
