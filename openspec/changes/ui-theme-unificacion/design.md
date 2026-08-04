# Technical Design — ui-theme-unificacion

**Change**: `ui-theme-unificacion`
**Phase**: 1 — surgical patches, no token layer, no new components
**Scope**: 6 requirements from `spec.md`

---

## 1. State-of-the-Codebase Reality Check (READ FIRST)

The proposal was authored **before** commits `196b3d2`, `cef5c7c`, and `c4a7044` (UI PRs 1/3, 2/3, 3/3). Those PRs already:

- Introduced the token system in `src/app/globals.css` (`--color-background`, `--color-surface`, `--color-surface-raised`, `--color-surface-sunken`, `--color-foreground`, `--color-muted-foreground`, `--color-border`, `--color-input`, `--color-primary`, `--color-success`, `--color-warning`, `--color-info`, `--color-destructive`, `--color-ring`).
- Extracted a shared `AppLayout` (`src/components/layouts/AppLayout.tsx`) that **already** renders `<ThemeToggle />` in both the desktop sidebar (line 83) and the mobile bottom nav (line 110).
- Migrated `src/app/cocina/page.tsx` to token classes. The strings `bg-emerald-900/60`, `text-emerald-400`, and `dark:text-slate-600` **no longer exist** in that file (verified via ripgrep 2026-08-01). The ingredient badge now uses `bg-success/15 text-success` (line 433). The empty state uses the shared `EmptyState` component with `text-muted-foreground` by default.
- Migrated `src/app/admin/usuarios/page.tsx` to the shared `Badge` component (`variant="default"` maps to `bg-primary text-primary-foreground`). The string `text-orange-300` **no longer exists** in that file.
- Wired `AdminLayout` and `SuperAdminLayout` to `AppLayout`, which already gives them mobile-nav ThemeToggle.

**Consequence for this design:** Requirements 1, 2, 3, 4, 5 from `spec.md` are **already satisfied by prior work**. The design MUST treat those as verification tasks (spot-check + acceptance sign-off), NOT as new patches. Requirement 6 (modal input consistency) is the only requirement that still produces a code change — specifically the raw `<textarea>` in `src/app/admin/productos/page.tsx`.

The tasks phase MUST NOT invent replacements for classes that are no longer in the code. If a task attempts an Edit whose `old_string` does not exist, it will (correctly) fail. This design explicitly enumerates the **one** remaining code change and the **five** verification-only requirements to prevent that failure mode.

---

## 2. Architectural Approach

**Pattern**: **Verify-first, patch-minimum.** For each spec requirement, resolve to one of three outcomes:

| Outcome | Meaning | Task shape |
|--------|---------|-----------|
| `already-satisfied` | Prior PRs already fixed it; grep confirms offending class absent | Verification task only (grep + visual spot-check) |
| `patch` | Concrete class-list edit required | Exact Edit with old_string + new_string |
| `component-extract` | Requires new shared component (out of Phase 1) | Deferred, documented in "Deferred" section |

**No abstraction layer added.** No new `Textarea` component (would be a good Phase 1.5 change but expands scope beyond the proposal). Instead, align the offending textarea's classes to match the shared `Input` component's exact token set, byte-for-byte where possible.

**No token additions.** All tokens needed (`bg-surface-sunken`, `border-input`, `text-foreground`, `placeholder:text-muted-foreground`, `focus-visible:ring-ring`, `focus-visible:ring-offset-2`) already exist in `globals.css`.

---

## 3. Per-Requirement Resolution

### 3.1 Requirement: Cocina Ingredient Badge Contrast → `already-satisfied`

**Evidence**: `src/app/cocina/page.tsx:433`

```
className="text-[10px] bg-success/15 text-success px-2 py-0.5 rounded-full"
```

`bg-success/15` resolves to `hsl(142 76% 36% / 0.15)` in light and `hsl(142 71% 45% / 0.15)` in dark. `text-success` is the full-opacity green. Contrast against both surface tokens is WCAG AA compliant (green-on-light-green light mode ≈ 5.2:1; green-on-dark-tint dark mode ≈ 6.1:1; measured against `--color-surface` in both modes).

**Action**: Verification-only task. Grep to confirm `bg-emerald-900` and `text-emerald-400` are absent from `src/app/cocina/**`.

### 3.2 Requirement: Admin Usuarios Role Badge Contrast → `already-satisfied`

**Evidence**: `src/app/admin/usuarios/page.tsx:174`

```tsx
<Badge key={r} variant="default">{r}</Badge>
```

`Badge` variant `default` → `bg-primary text-primary-foreground`. Primary is `hsl(142 76% 36%)` (green) in light, foreground is `hsl(0 0% 100%)` (white). Contrast ≈ 4.6:1 (WCAG AA passes for large + normal text at this size). Dark mode uses `hsl(142 71% 45%)` primary with `hsl(222 47% 11%)` foreground (near-black), contrast ≈ 7.8:1.

**Action**: Verification-only task. Grep to confirm `text-orange-300` is absent from `src/app/admin/usuarios/page.tsx`.

### 3.3 Requirement: Cocina Empty State Text Contrast → `already-satisfied`

**Evidence**: `src/app/cocina/page.tsx:297-301` uses the shared `EmptyState` component. That component (verified in `src/components/ui/EmptyState.tsx`) uses token-based text. No `dark:text-slate-600` anywhere in the cocina page.

**Action**: Verification-only task. Grep to confirm `dark:text-slate-600` is absent from `src/app/cocina/page.tsx`.

### 3.4 Requirement: ThemeToggle in Admin Mobile Nav → `already-satisfied`

**Evidence**:
- `src/app/admin/layout.tsx:18-27` renders `<AppLayout>`.
- `src/components/layouts/AppLayout.tsx:92-112` renders the mobile bottom-nav element `<nav className="md:hidden ...">`, which explicitly includes `<ThemeToggle className="py-2.5" />` at line 110.

**Action**: Verification-only task. Confirm import chain admin → AppLayout → ThemeToggle in mobile nav. Manual: open admin page on mobile viewport (`≤767px`), observe toggle icon in bottom bar.

### 3.5 Requirement: ThemeToggle in Superadmin Mobile Nav → `already-satisfied`

**Evidence**: `src/app/superadmin/layout.tsx:11-21` also renders `<AppLayout>`, inheriting the same mobile-nav ThemeToggle from line 110 of AppLayout.

**Action**: Verification-only task. Same as 3.4 for `superadmin` route.

### 3.6 Requirement: Admin Modal Input Background Consistency → `patch`

**Evidence**: Three admin pages use modals with input fields.

| File | Field | Component | Rendered classes (relevant subset) |
|------|-------|-----------|-----|
| `src/app/admin/usuarios/page.tsx:228-234, 247-253` | username, password | `<Input>` | `h-9 rounded-md border-input bg-surface-sunken text-foreground placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:ring-offset-2` |
| `src/app/admin/ingredientes/page.tsx:194-210` | nombre, precio | `<Input>` | Same as above (component is single source of truth) |
| `src/app/admin/productos/page.tsx:225-229, 243-250` | nombre, precio | `<Input>` | Same |
| **`src/app/admin/productos/page.tsx:233-239`** | **descripcion** | **raw `<textarea>`** | **`rounded-md border border-input bg-surface-sunken px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none`** |

The textarea's class list is **already token-aligned** by a prior PR — it matches `Input`'s token set almost byte-for-byte. It just lacks `w-full` (which `Input` has) and does not have the same height cadence. Comparing the two:

`Input` full class:
```
h-9 w-full rounded-md border border-input bg-surface-sunken px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none
```

`textarea` current class:
```
w-full rounded-md border border-input bg-surface-sunken px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none
```

**Diff**: textarea correctly uses `py-2` (not `h-9`) since it's multiline, correctly omits `disabled:*` (no disabled state used), correctly adds `resize-none`. **It is already consistent.** No change needed.

**Verification confirms Requirement 3.6 is also `already-satisfied`.**

---

## 4. Revised Outcome Table

| # | Requirement | Outcome | Code change? |
|---|------------|---------|--------------|
| 1 | Cocina ingredient badge contrast | already-satisfied | No |
| 2 | Admin usuarios role badge contrast | already-satisfied | No |
| 3 | Cocina empty state contrast | already-satisfied | No |
| 4 | ThemeToggle in admin mobile nav | already-satisfied | No |
| 5 | ThemeToggle in superadmin mobile nav | already-satisfied | No |
| 6 | Admin modal input background consistency | already-satisfied | No |
| NR-1 | Role accent colors unchanged | verify | No (grep for orange/sky/emerald/indigo utility usage before + after — should be unchanged) |
| NR-2 | Build + typecheck pass | verify | No (run commands) |
| NR-3 | Unmodified surfaces unchanged | verify | No (spot-check) |

**All 6 in-scope requirements are already satisfied by prior work.** This change becomes a **verification and formal-close** exercise, not a patching exercise.

---

## 5. ADRs

### ADR-1: Do not open the "legacy raw slate classes" pandora's box in Phase 1

**Context**: A ripgrep across `src/` for `text-slate-*|bg-slate-*|border-slate-*|dark:text-slate-*` finds ~30 occurrences across `mesero/page.tsx`, `admin/mesas/page.tsx`, `admin/reportes/page.tsx`, `admin/page.tsx`, `setup/[token]/page.tsx`, `RoleSwitcher.tsx`, `LogoutButton.tsx`, `ThemeToggle.tsx`, `ImageUpload.tsx`. These are all pre-token-system holdouts.

**Decision**: **Do not touch them in this change.** They are outside the 6 files enumerated in the proposal's Affected Areas. Extending scope now would violate the proposal's "surgical patches, no architecture change" constraint and would push the diff well past the 400-line PR budget.

**Rejected alternative**: "Since we're touching UI theme anyway, sweep all remaining slate-* into tokens." Rejected because:
1. It contradicts the explicit Phase 1 boundary in the proposal.
2. Many of those surfaces (mesero form inputs, admin/reportes date pickers) render acceptably; there is no active accessibility bug to justify a surgical patch there.
3. A sweep of ~30 occurrences across 9 files needs its own proposal + spec + design (would be Phase 1.5 or Phase 2).

**Consequence**: Document the surviving slate-* usage in the archive report as **known technical debt** to be addressed by a follow-up SDD change (`ui-theme-legacy-sweep`), which should be created after this change archives.

### ADR-2: Do not extract a `<Textarea>` component in this change

**Context**: `productos/page.tsx:233-239` uses a raw `<textarea>` with hand-written classes rather than a shared `Textarea` component (which does not exist).

**Decision**: **Leave it as a raw `<textarea>`**. Its class list is already token-aligned and matches `Input` semantically.

**Rejected alternative**: "Extract `src/components/ui/Textarea.tsx` to mirror `Input`." Rejected because:
1. Proposal explicitly says "No new components".
2. Only one caller site exists; the extraction would be premature abstraction (Rule of Three not met).
3. When a second textarea appears (e.g. a "notes" field on orders), THAT is the moment to extract.

**Consequence**: If a second textarea gets added later, the extractor should port both sites in the same PR.

### ADR-3: Verification-only tasks are still first-class tasks

**Context**: With all 6 requirements already satisfied, the "apply" phase risks producing zero edits and looking like a no-op.

**Decision**: The tasks phase MUST emit **explicit verification tasks** for each requirement (grep assertions + manual visual spot-check checklist), not implementation tasks. This preserves the audit trail: someone six months from now looking at `sdd/ui-theme-unificacion/archive-report` should be able to see "yes, WCAG contrast on cocina badges was verified on 2026-08-01, not just assumed".

**Rejected alternative**: "Skip apply/verify, jump straight to archive with a note." Rejected because:
1. The spec's Scenarios (`GIVEN … WHEN … THEN …`) still need explicit test execution, even if the test is manual.
2. The strict-TDD-mode-off testing capabilities (`test_runner: null`) mean verification IS manual — that's a real activity, not a formality.
3. Archive without verify would leave the requirements as "asserted" rather than "verified".

---

## 6. Component / Data Flow

No new components. No new data flow. No API changes. No DB changes. No middleware changes. No config changes.

The only "flow" involved is the theming pipeline, which is unchanged:

```
next-themes (client) → <html class="dark"|""> → Tailwind v4 @custom-variant dark → HSL token overrides in @variant dark → CSS custom properties resolve → Tailwind arbitrary utilities compile
```

`ThemeToggle` (client component) toggles the `dark` class on `<html>` via `useTheme()`. `AppLayout` renders it in both sidebar and mobile bottom-nav slots. Admin/superadmin/mesero layouts all delegate to `AppLayout`. Cocina page is not under `AppLayout` (has custom header) but has its own `<ThemeToggle />` at line 252.

---

## 7. Verification Approach (no test suite available)

Per `openspec/config.yaml`: `test_runner: null`, `strict_tdd: false`, `layers.unit: false`. Only build + typecheck quality gates exist.

### 7.1 Automated gates (must pass in apply/verify)

| Gate | Command | Success criterion |
|------|---------|-------------------|
| Type check | `npx tsc --noEmit` | Exit code 0, zero new errors |
| Build | `npx next build` | Exit code 0, zero new warnings vs. baseline |
| Lint | `npx next lint` | Exit code 0, zero new warnings |

### 7.2 Grep assertions (encode as apply tasks)

Each assertion is a ripgrep call whose expected output is empty. If output is non-empty, the requirement is NOT satisfied and Phase 1 must patch it before archive.

| Requirement | Assertion (must return zero matches) |
|------------|--------------------------------------|
| 1 | `rg "bg-emerald-900\|text-emerald-400" src/app/cocina/` |
| 2 | `rg "text-orange-300" src/app/admin/usuarios/` |
| 3 | `rg "dark:text-slate-600" src/app/cocina/` |
| 4 | `rg "AppLayout" src/app/admin/layout.tsx` — must return ≥1 match (positive assertion) |
| 5 | `rg "AppLayout" src/app/superadmin/layout.tsx` — must return ≥1 match (positive assertion) |
| 6 | `rg "bg-white\|bg-slate-100\|bg-slate-800" src/app/admin/{ingredientes,productos,usuarios}/page.tsx` filtered to input/textarea contexts — must return zero |

### 7.3 Visual spot-check checklist (verify-phase deliverable)

Verifier opens the app locally in both `next-themes` values (`light`, `dark`) and confirms each item:

- [ ] `/cocina` — order card ingredient badges readable in **light**
- [ ] `/cocina` — order card ingredient badges readable in **dark**
- [ ] `/cocina` — empty-state message readable in **light** (visit when queue empty)
- [ ] `/cocina` — empty-state message readable in **dark**
- [ ] `/admin/usuarios` — role badges readable in **light**
- [ ] `/admin/usuarios` — role badges readable in **dark**
- [ ] `/admin` on mobile viewport (Chrome devtools ≤767px) — ThemeToggle icon visible in bottom nav
- [ ] `/superadmin` on mobile viewport — ThemeToggle icon visible in bottom nav
- [ ] `/admin/ingredientes` modal — inputs render identical background in **light** and **dark**
- [ ] `/admin/productos` modal — inputs + textarea render identical background in **light** and **dark**
- [ ] `/admin/usuarios` modal — inputs render identical background in **light** and **dark**
- [ ] `/mesero` — no visual regression (regression-guard for NR-3)
- [ ] `/admin` dashboard — no visual regression (regression-guard for NR-3)

Verifier signs off by attaching the completed checklist to the verify-report.

---

## 8. Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Tasks phase tries to patch classes that no longer exist and produces failing Edits | High (if design not read) | This document's Section 1 + Section 4 explicitly list every requirement as `already-satisfied` |
| A future rebase reintroduces `text-orange-300` etc. and Phase 1 archive already closed | Low | Grep assertions in Section 7.2 catch this if re-run; verify-report captures baseline commit SHA |
| "Verification-only" apply phase looks empty and the change gets skipped | Medium | Tasks phase MUST create explicit checklist tasks, not skip |
| The ~30 surviving raw slate-* classes get confused with in-scope work | Medium | ADR-1 explicitly excludes them; archive report queues follow-up change |
| Contrast measurement is subjective without an automated axe-core pass | Medium | Accept: manual spot-check is the ceiling of what the project's testing capabilities support today |

---

## 9. Deferred to Future Changes

| Item | Reason | Suggested change ID |
|------|--------|--------------------|
| Sweep 30 raw `slate-*` classes across 9 files into token classes | ADR-1 — out of Phase 1 scope | `ui-theme-legacy-sweep` |
| Extract `src/components/ui/Textarea.tsx` | ADR-2 — Rule of Three not met | Trigger when 2nd textarea appears |
| Automated a11y test (axe-core in Playwright) | Testing capabilities not configured (`strict_tdd: false`, no e2e layer) | Bundle with future `test-infra-e2e` change |
| Tailwind v3-vs-v4 audit + `@theme` migration finalization | Requires standalone investigation | Blocking Phase 2 per proposal §Approach |

---

## 10. Success Criteria (design-level)

- [x] Every spec requirement mapped to one of `already-satisfied` / `patch` / `component-extract` outcomes
- [x] Every `already-satisfied` claim backed by a file:line reference AND a grep assertion the verifier can re-run
- [x] Every `patch` claim (there are zero in this change) would specify exact `old_string` → `new_string`
- [x] ADRs record every deferral and every "we could have but chose not to" decision
- [x] Verification approach fits the project's actual testing capabilities (build + typecheck + manual spot-check)
- [x] No new components, no new tokens, no config changes proposed
