# Proposal: UI/UX Theme Unification

## Intent

The three role surfaces (admin, mesero, cocina, superadmin) already share a coherent palette, but exploration found **5 concrete contrast bugs** that leave text unreadable in one of the two color schemes (dark or light), plus a missing `ThemeToggle` in mobile navigation for two roles. These are not stylistic preferences — they are **accessibility defects** users hit today. A follow-up phase is needed to consolidate ad-hoc Tailwind color classes into a token layer, but that requires resolving the current Tailwind v3 config + v4 CSS syntax coexistence first.

## Scope

### In Scope

**Phase 1 — Bug patches (surgical, no architecture change):**
- Fix cocina ingredient badges (`bg-emerald-900/60 text-emerald-400`) invisible in light mode
- Fix admin/usuarios role badge (`text-orange-300`) invisible on white
- Fix cocina empty state (`dark:text-slate-600`) darker than background in dark mode
- Add `ThemeToggle` to mobile nav in admin and superadmin layouts
- Unify admin modal input background token across ingredientes/productos/usuarios pages

**Phase 2 — Token system (deferred until Tailwind version audit):**
- Introduce CSS custom properties (`--surface`, `--surface-muted`, `--text`, `--text-muted`, `--border`) as the single source of truth for role-neutral surfaces
- Migrate the 5 bug-patched surfaces first, then expand outward
- Keep role-accent colors (orange/sky/emerald/indigo) as Tailwind utilities — they are intentional identity signals, not tokens

### Out of Scope
- Renaming or reassigning role-accent colors (admin=orange, mesero=sky, cocina=emerald, superadmin=indigo stay as-is)
- Redesigning any component's layout, spacing, or typography
- Introducing a new UI library or replacing Tailwind
- Building a full design system, tokens for spacing/radius/shadow, or a component gallery

## Capabilities

### New Capabilities
- None (this is a visual/accessibility fix, no user-facing capability change)

### Modified Capabilities
- None (no spec-level behavior changes; existing flows keep working identically)

## Approach

**Phase 1 — Direct patches.** Each of the 5 bugs is a class-list edit in a known file. No abstraction, no token layer, no config change. Ships as one PR, reviewable in under 100 lines. Verifies visually + `next build` + `tsc --noEmit`.

**Phase 2 — Audit-then-tokenize.** Before writing any CSS custom properties:
1. Audit whether the project is truly on Tailwind v4 (CSS-first config) or still v3 (`tailwind.config.ts`). The exploration found **both syntaxes coexisting** — this MUST be resolved before token work.
2. Once the Tailwind version is canonical, introduce `--surface*`, `--text*`, `--border` tokens in `globals.css`, mapped to `@theme` (v4) or `theme.extend.colors` (v3).
3. Migrate the 5 Phase-1 patched surfaces to use tokens (proves the pattern), then expand outward file-by-file in later chained changes.

Phase 2 is a separate SDD change — this proposal commits only to Phase 1 delivery. Phase 2 is documented here for context but must be re-proposed after the audit.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/app/cocina/page.tsx` | Modified | Fix ingredient badge + empty state contrast |
| `src/app/admin/usuarios/page.tsx` | Modified | Fix role badge contrast |
| `src/app/admin/layout.tsx` | Modified | Add ThemeToggle to mobile nav |
| `src/app/superadmin/layout.tsx` | Modified | Add ThemeToggle to mobile nav |
| `src/app/admin/ingredientes/page.tsx` | Modified | Unify modal input background token |
| `src/app/admin/productos/page.tsx` | Modified | Unify modal input background token |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Fixing "invisible" badges reveals other adjacent contrast issues once the eye can see them | Medium | Accept — Phase 2 will address systematically; do not scope-creep Phase 1 |
| Adding ThemeToggle to mobile nav breaks existing mobile layout | Low | Match the exact pattern already used in mesero and cocina layouts |
| Someone starts Phase 2 without the Tailwind v3/v4 audit | High | Explicitly gate Phase 2 behind a dedicated audit change; document this in Phase 1 archive report |
| Multi-tenant impact — none, this is pure client-side styling | — | No DB, no API, no tenant isolation surface touched |

## Rollback Plan

Phase 1 is a single PR with 6 file edits, no schema migrations, no config changes. Rollback = `git revert <commit>`. No data, no cache, no downstream service is affected. Users see the previous (buggy but stable) appearance on the next page load.

## Dependencies

- None for Phase 1
- Phase 2 depends on a completed Tailwind v3 vs v4 audit (separate SDD change)

## Success Criteria

**Phase 1 (this change):**
- [ ] All 5 identified bugs are visually verified fixed in both light and dark mode
- [ ] ThemeToggle is reachable in mobile nav for all 4 role layouts (admin, mesero, cocina, superadmin)
- [ ] `next build` passes with zero new warnings
- [ ] `tsc --noEmit` passes
- [ ] No visual regression on any surface that was NOT in the fix list (spot-check admin dashboard, mesero mesa view, cocina board, superadmin tenants)

**Phase 2 (deferred — not committed here):**
- [ ] Tailwind version is canonically v3 OR v4, not both
- [ ] `--surface*`, `--text*`, `--border` tokens exist and drive the 5 Phase-1 surfaces
- [ ] Role-accent Tailwind classes remain untouched
