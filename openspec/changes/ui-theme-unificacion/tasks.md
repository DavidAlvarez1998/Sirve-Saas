# Tasks: ui-theme-unificacion

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~0 (no code edits) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (verification artifacts only) |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Run all grep assertions + build gates + visual spot-check | PR 1 | Verification-only; no code edits |

---

## Phase 1: Grep Assertions — Negative (Offending Classes Must Be Absent)

- [x] 1.1 [VERIFY] Req 1 — cocina ingredient badge: `rg "bg-emerald-900|text-emerald-400" src/app/cocina/` MUST return zero matches
- [x] 1.2 [VERIFY] Req 2 — admin usuarios role badge: `rg "text-orange-300" src/app/admin/usuarios/` MUST return zero matches
- [x] 1.3 [VERIFY] Req 3 — cocina empty state: `rg "dark:text-slate-600" src/app/cocina/` MUST return zero matches
- [x] 1.4 [VERIFY] Req 6 — admin modal inputs (hardcoded backgrounds): `rg "bg-white|bg-slate-100|bg-slate-800" src/app/admin/ingredientes/page.tsx src/app/admin/productos/page.tsx src/app/admin/usuarios/page.tsx` MUST return zero matches inside input/textarea JSX

## Phase 2: Grep Assertions — Positive (Required Tokens Must Be Present)

- [x] 2.1 [VERIFY] Req 1 — cocina badge uses token: `rg "bg-success" src/app/cocina/page.tsx` MUST return ≥1 match at ingredient badge context
- [x] 2.2 [VERIFY] Req 2 — usuarios badge uses `<Badge`: `rg "<Badge" src/app/admin/usuarios/page.tsx` MUST return ≥1 match
- [x] 2.3 [VERIFY] Req 4 — admin layout wires AppLayout: `rg "AppLayout" src/app/admin/layout.tsx` MUST return ≥1 match
- [x] 2.4 [VERIFY] Req 5 — superadmin layout wires AppLayout: `rg "AppLayout" src/app/superadmin/layout.tsx` MUST return ≥1 match
- [x] 2.5 [VERIFY] Req 6 — productos textarea is token-aligned: `rg "bg-\[var|bg-input|border-input" src/app/admin/productos/page.tsx` MUST return ≥1 match in textarea context

## Phase 3: Automated Build Gates

- [x] 3.1 [VERIFY] Type check: `npx tsc --noEmit` exits with code 0 and zero new errors
- [x] 3.2 [VERIFY] Production build: `npx next build` exits with code 0 and zero new warnings
- [x] 3.3 [VERIFY] Lint: `npx next lint` exits with code 0

## Phase 4: Manual Visual Spot-Check (Light + Dark Mode)

- [ ] 4.1 [PENDING_MANUAL] Req 1 light — cocina page: ingredient badge text is readable against badge background (no dark blob on light page)
- [ ] 4.2 [PENDING_MANUAL] Req 1 dark — cocina page: ingredient badge text is visible against badge background in dark mode
- [ ] 4.3 [PENDING_MANUAL] Req 3 light — cocina page empty state: text is visible when no orders exist
- [ ] 4.4 [PENDING_MANUAL] Req 3 dark — cocina page empty state: text is lighter than the dark background (not invisible)
- [ ] 4.5 [PENDING_MANUAL] Req 2 light — admin/usuarios: role badge text is legible on light background (not washed-out orange)
- [ ] 4.6 [PENDING_MANUAL] Req 2 dark — admin/usuarios: role badge text remains readable in dark mode
- [ ] 4.7 [PENDING_MANUAL] Req 4 — admin mobile nav (viewport <768px): ThemeToggle is visible and interactive without scrolling
- [ ] 4.8 [PENDING_MANUAL] Req 5 — superadmin mobile nav (viewport <768px): ThemeToggle is visible and interactive without scrolling
- [ ] 4.9 [PENDING_MANUAL] Req 6 light — open ingredientes, productos, usuarios modals in sequence: input/textarea backgrounds look identical
- [ ] 4.10 [PENDING_MANUAL] Req 6 dark — same three modals in dark mode: input/textarea backgrounds look identical
- [ ] 4.11 [PENDING_MANUAL] Non-regression — mesero page: appearance unchanged (light + dark)
- [ ] 4.12 [PENDING_MANUAL] Non-regression — admin dashboard (`/admin`): appearance unchanged (light + dark)
- [ ] 4.13 [PENDING_MANUAL] Non-regression — role accent hues: orange (admin), sky (mesero), emerald (cocina), indigo (superadmin) all present and correct
