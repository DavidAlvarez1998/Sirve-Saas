# Tasks: UI/UX Mejora Profesional

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950–1050 (additions + deletions) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Foundation + Primitives → PR 2: Sonner + AppLayout + Layouts → PR 3: Page token cleanup + shared cleanup |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Why it's High

25 files touched: 8 new primitives (~200 lines added), globals.css @theme block (~80 lines), AppLayout (~100 lines), 3 layouts shrunk (−210 lines), 5 pages with Toast→sonner + token rewrites (~220 lines changed), plus delete of Toast.tsx. Additions ~560, deletions ~420.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Foundation: tokens, cn(), constants, primitives | PR 1 | Zero consumer changes; build must pass; no visible UI change |
| 2 | Sonner + AppLayout + 3 layout migrations | PR 2 | Base: PR 1 branch. First visible layout change; smoke-test all 3 roles |
| 3 | Page token cleanup + cocina + shared cleanup | PR 3 | Base: PR 2 branch. Removes Toast.tsx last; all pages verified in dark mode |

---

## Phase 1: Foundation (PR 1)

- [x] TASK-01 — `package.json`: add `clsx`, `tailwind-merge`, `sonner` as dependencies; run install.
- [x] TASK-02 — `src/app/globals.css`: add full `@theme {}` block (all light tokens) + `@variant dark { @theme { ... } }` block (all dark overrides) + `.touch-target` utility; keep existing body/scrollbar rules.
- [x] TASK-03 — `tailwind.config.ts`: remove `theme.extend.colors` entirely; keep `content` array only.
- [x] TASK-04 — `src/lib/utils.ts`: create; export `cn(...inputs)` using `clsx` + `tailwind-merge`.
- [x] TASK-05 — `src/lib/constants/estado-orden.ts`: create; export `ESTADO_INFO` mapping `EstadoOrden → { label, variant: BadgeVariant }` using the 7 states from design. (created as src/lib/estado-orden.ts — exports ESTADO_LABEL + ESTADO_VARIANT)

**Verification:** `pnpm build` passes with no type errors. No visible UI change.

---

## Phase 2: UI Primitives (PR 1, continued)

- [x] TASK-06 — `src/components/ui/Button.tsx`: create with `ButtonVariant` + `ButtonSize` variant maps; base classes per design; `forwardRef`; no CVA.
- [x] TASK-07 — `src/components/ui/Input.tsx`: create; `h-9 rounded-md border-input bg-surface-sunken`; `focus-visible:ring-ring`; `forwardRef`.
- [x] TASK-08 — `src/components/ui/Select.tsx`: create; native `<select>` + `appearance-none` + absolute `ChevronDown`; same h-9 base as Input.
- [x] TASK-09 — `src/components/ui/Label.tsx`: create; renders semantic `<label>` with `text-sm font-medium text-foreground`.
- [x] TASK-10 — `src/components/ui/Badge.tsx`: create; `BadgeVariant` map; `inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium`.
- [x] TASK-11 — `src/components/ui/Card.tsx`: create; `rounded-lg border border-border bg-surface shadow-sm` wrapper. (done in PR 2)
- [x] TASK-12 — `src/components/ui/Skeleton.tsx`: create; export `Skeleton` base + `CardSkeleton` + `ListSkeleton` using `animate-pulse rounded-md bg-muted`.
- [x] TASK-13 — `src/components/ui/EmptyState.tsx`: create; props `{ icon: LucideIcon; title: string; description?: string; action?: ReactNode }`.

**Verification:** Each file imports cleanly (`tsc --noEmit`). No page imports them yet — zero runtime risk.

---

## Phase 3: Sonner + AppLayout + Layout Migrations (PR 2)

- [x] TASK-14 — `src/app/layout.tsx`: import `{ Toaster } from 'sonner'`; mount `<Toaster position="top-center" richColors />` inside `<ThemeProvider>`; change body class from `bg-white dark:bg-slate-900` to `bg-background text-foreground`.
- [x] TASK-15 — `src/components/layouts/AppLayout.tsx`: create; props `{ panelLabel, panelKicker?, navItems, sidebarFooter?, mobileNavExtra?, children }`; sidebar + main + mobile-bottom-nav; active link uses `bg-primary text-primary-foreground`; hover uses `hover:bg-surface-raised`. (done in PR 2)
- [x] TASK-16 — `src/app/admin/layout.tsx`: collapse to thin wrapper (~25 lines); pass nav items + `sidebarFooter={<RoleSwitcher variant="sidebar" />}` + `mobileNavExtra={<RoleSwitcher variant="bottom-nav" />}` to `<AppLayout>`. (done in PR 2)
- [x] TASK-17 — `src/app/mesero/layout.tsx`: collapse to thin wrapper; `MeseroProvider` wraps `AppLayout` from outside; role-switch link passed via `sidebarFooter` slot only if `hasRole('ADMIN')`. (done in PR 2)
- [x] TASK-18 — `src/app/superadmin/layout.tsx`: collapse to thin wrapper; no role-switcher slot needed. (done in PR 2)

**Verification:** Navigate all 3 roles in browser; confirm active nav uses primary token; confirm mobile bottom nav works; dark mode switch works end-to-end.

---

## Phase 4: Login + Cocina Page (PR 3)

- [ ] TASK-19 — `src/app/(auth)/login/page.tsx`: replace raw inputs with `<Input>` + `<Label>`; replace submit button with `<Button>`; replace `bg-white dark:bg-slate-900` with token classes; replace `focus:ring-blue-500` with `focus-visible:ring-ring`.
- [ ] TASK-20 — `src/app/cocina/page.tsx`: replace `Toast` import + `useState<ToastState>` with `toast.success/error` from sonner; replace `ESTADO_COLOR` local map with `ESTADO_INFO` from constants; replace `font-extrabold` with `font-semibold`; replace `bg-emerald-500` header icon with `bg-primary`; add `<ListSkeleton>` for loading state; add `<EmptyState>` for empty ordenes.

---

## Phase 5: Admin Feature Pages (PR 3, continued)

- [ ] TASK-21 — `src/app/admin/productos/page.tsx`: replace `Toast` + `useState<ToastState>` with sonner; replace `<button>` Nuevo with `<Button variant="default">`; replace raw `<input>` fields in modal with `<Input>` + `<Label>`; replace `bg-orange-500` badge with `<Badge variant="info">`/`<Badge variant="warning">`; replace loading text with `<CardSkeleton>`; replace empty state div with `<EmptyState>`.
- [ ] TASK-22 — `src/app/admin/ingredientes/page.tsx`: same pattern as TASK-21; replace `bg-emerald-500` button with `<Button variant="default">`; replace `focus:ring-emerald-400` inputs with `<Input>`; replace loading/empty with `<Skeleton>`/`<EmptyState>`; sonner for toasts.
- [ ] TASK-23 — `src/app/admin/usuarios/page.tsx`: replace `Toast` + local toast state with sonner; replace `bg-orange-500` button with `<Button variant="default">`; replace raw inputs with `<Input>` + `<Label>`; replace role badge spans with `<Badge>`; replace loading text with `<ListSkeleton>`; replace "no hay usuarios" text with `<EmptyState>`.

---

## Phase 6: Mesero Ordenes Page (PR 3, continued)

- [ ] TASK-24 — `src/app/mesero/ordenes/page.tsx`: remove local `ESTADO_INFO` definition; import from `src/lib/constants/estado-orden.ts`; replace `Toast` import + toast state with sonner; replace `bg-sky-500` tab buttons with token classes (`bg-primary`); add `cursor-pointer transition-colors hover:bg-surface-raised` to `OrdenListItem` button; replace `font-extrabold` instances with `font-semibold`; replace `bg-green-500` Cobrar button with `<Button variant="default">`.

---

## Phase 7: Shared Cleanup (PR 3, continued)

- [ ] TASK-25 — `src/components/ui/StatusBadge.tsx`: rewrite as thin wrapper over `<Badge>`; map legacy `status` prop → `variant` via `ESTADO_INFO`; keep same public API for backward compat.
- [ ] TASK-26 — `src/components/ui/Modal.tsx`: replace any `dark:bg-slate-*` hardcoded classes with token classes (`bg-surface`, `border-border`); no functional changes.
- [ ] TASK-27 — `src/components/ui/ConfirmDialog.tsx`: same token cleanup as Modal; replace button classes with `<Button>` primitives.
- [ ] TASK-28 — `src/components/ui/Toast.tsx`: delete file. Confirm zero imports remain (grep `from.*components/ui/Toast`).

**Verification (PR 3):**
- `pnpm build` passes.
- `grep -r "bg-orange-\|bg-sky-\|bg-emerald-\|bg-indigo-\|bg-blue-" src/app src/components --include="*.tsx"` returns only allowed exceptions (urgency badges in cocina, ingredient chip bg).
- `grep -r "font-extrabold" src/` returns zero matches.
- `grep -r "from.*components/ui/Toast" src/` returns zero matches.
- Light + dark mode manual smoke test across all 4 roles.
