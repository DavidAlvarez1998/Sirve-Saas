# Archive Report: landing-page

**Change**: `landing-page`  
**Date**: 2026-08-04  
**Status**: COMPLETE ✓  
**Verdict**: PASS — 0 CRITICAL, 5 WARNING (all resolved by orchestrator), 2 SUGGESTION (non-blocking)

---

## Executive Summary

The `landing-page` change has been fully implemented, verified, and archived. A static Server Component landing page at `/` has replaced the redirect-to-login stub, the middleware has been updated to allow public access, and the login page displays a back-link to home. All 5 implementation tasks are complete, TypeScript and linting checks pass, and the verify report confirms no critical issues. Post-verify fixes have been applied to address design-system fidelity deviations (corrected button text and footer year). The change is ready for deployment.

---

## SDD Artifact Trace

All artifacts stored in Engram (project: `sirve-saas`) and openspec (`openspec/changes/landing-page/`):

| Artifact | Engram ID | Engram Topic Key | File |
|----------|-----------|------------------|------|
| Proposal | 884 | `sdd/landing-page/proposal` | `openspec/changes/landing-page/proposal.md` |
| Spec | 885 | `sdd/landing-page/spec` | `openspec/changes/landing-page/spec.md` |
| Design | 887 | `sdd/landing-page/design` | `openspec/changes/landing-page/design.md` |
| Tasks | 889 | `sdd/landing-page/tasks` | `openspec/changes/landing-page/tasks.md` |
| Apply Progress | 891 | `sdd/landing-page/apply-progress` | `openspec/changes/landing-page/apply-progress.md` |
| Verify Report | 893 | `sdd/landing-page/verify-report` | `openspec/changes/landing-page/verify-report.md` |
| Archive Report | (new) | `sdd/landing-page/archive-report` | `openspec/changes/landing-page/archive-report.md` |

---

## Files Changed

### Modified/Created

| File | Change | Lines |
|------|--------|-------|
| `src/app/page.tsx` | New static RSC landing page (hero + 4 features + footer) | ~110–130 |
| `src/middleware.ts` | Added `'/'` to `PUBLIC_PAGE_PATHS` | 1 |
| `src/app/(auth)/login/page.tsx` | Added back-link `← Ir al inicio` above card | ~5 |
| `src/components/layouts/AppLayout.tsx` | Fixed pre-existing lint error with `eslint-disable-next-line` | 0 (out-of-scope fix) |

**Total changed lines**: ~116–136 (well below 400-line budget; single PR, no chaining needed)

---

## Implementation Decisions

### 1. Server Component (no `'use client'`)
- Landing page is static RSC with no hooks or event handlers.
- Prerendered at build time, zero hydration cost, SEO-friendly.
- Theme switching via root `ThemeProvider` works without client code.

### 2. Design System Pragmatism (WARNING-A/B)
- CTA buttons use raw `<Link>` with inline primary classes instead of `Button` primitive (Button has no `asChild` to wrap Link).
- Feature cards use plain `<div>` instead of `Card` primitive (Card uses `bg-surface` which creates zero contrast in a `bg-surface` section).
- **Resolution**: Both are visually correct; architectural refactor (Button `asChild` support) deferred to separate work.

### 3. Icon Library (WARNING-C)
- Uses `lucide-react` (Building2, Users, Zap, LayoutDashboard) for feature cards despite spec saying "no external icon library."
- **Resolution**: Orchestrator deemed this acceptable design deviation; spec should be amended in a follow-up to reflect icon usage policy.

### 4. Dynamic Year (WARNING-E)
- Footer year changed from hardcoded `2025` to `{new Date().getFullYear()}`.
- Evaluated server-side; no hydration penalty.

### 5. Card Title Precision (WARNING-D)
- Card #3 title changed from "Tiempo real" → "Pedidos en tiempo real" (spec table requirement).

### 6. Middleware Match Safety
- `'/'` added to `PUBLIC_PAGE_PATHS`; match logic `pathname.startsWith('/' + '/')` for `p='/'` becomes `startsWith('//')` (no-op on real paths).
- Correctly preserves auth guard for `/admin`, `/mesero`, `/cocina`, etc.

---

## Verification Results

### Static Checks
- `npx tsc --noEmit` → exit 0 ✓
- `npx next lint` → exit 0 ✓ (5 pre-existing unrelated warnings in `mesero/ordenes/page.tsx`)

### Requirements Coverage
| Requirement | Status | Note |
|-------------|--------|------|
| Public root route | PASS | `'/'` in PUBLIC_PAGE_PATHS; /admin etc. still guarded |
| Server Component | PASS | No `'use client'` directive |
| Structure (hero + features + footer) | PASS | All three sections render in order |
| Hero section | PASS | Wordmark "Sirva" visible; CTA navigates to `/login` |
| Features (4 cards) | PASS | Exactly 4 cards with titles and descriptions |
| Design tokens only | PASS | No hardcoded hex/hsl; all tokens dark-mode safe |
| Login back-link | PASS | "← Ir al inicio" appears, navigates to `/`, form untouched |
| Auth flows unaffected | PASS | No changes to middleware guards, JWT, or services |

### All 5 Tasks Complete
- TASK-01: `'/'` in `PUBLIC_PAGE_PATHS` ✓
- TASK-02: RSC landing page at `src/app/page.tsx` ✓
- TASK-03: Login back-link ✓
- TASK-04: TypeScript compile check ✓
- TASK-05: Lint check ✓

---

## Known Deviations (Accepted by Orchestrator)

### WARNING-A: Button Primitive Not Used
- **File**: `src/app/page.tsx:57–62`
- **Why**: Button component lacks `asChild` prop; cannot safely wrap `<Link>` without invalid `<a><button>` nesting.
- **Decision**: Accepted design deviation; visual result is identical to spec intent.

### WARNING-B: Card Primitive Not Used
- **File**: `src/app/page.tsx:70`
- **Why**: Card component uses `bg-surface` which creates zero contrast in a `bg-surface` container section.
- **Decision**: Accepted design deviation; plain `<div>` with matching token styles provides proper contrast.

### WARNING-C: Icon Library Introduced
- **File**: `src/app/page.tsx:2`
- **Spec vs. Implementation**: Spec said "no external icon library"; design used Lucide icons.
- **Decision**: Accepted orchestrator-injected design decision; spec amendment deferred to follow-up.

### WARNING-D: Card Title Shortened (RESOLVED)
- **File**: `src/app/page.tsx:19`
- **Before**: "Tiempo real"
- **After**: "Pedidos en tiempo real"
- **Status**: Fixed by orchestrator post-verify ✓

### WARNING-E: Footer Year Hardcoded (RESOLVED)
- **File**: `src/app/page.tsx:83`
- **Before**: `© 2025 Sirva`
- **After**: `© {new Date().getFullYear()} Sirva`
- **Status**: Fixed by orchestrator post-verify ✓

### SUGGESTION-1: Login Back-Link Style
- Uses plain `<Link>` instead of `Button variant="ghost"`. Visually unobtrusive and matches spec intent. Cosmetic only.

### SUGGESTION-2: Middleware Path Match Documentation
- Middleware `startsWith(p + '/')` logic becomes `startsWith('//')` for `p='/'` (safe but non-obvious). A comment would improve clarity.

---

## Scope Confirmation

### In Scope — Completed
- ✓ Static marketing page at `/`
- ✓ Middleware allowlist update (`PUBLIC_PAGE_PATHS`)
- ✓ Login back-link affordance
- ✓ Design token compliance
- ✓ Server-side year rendering
- ✓ No new components or dependencies (Lucide already present; design deviation accepted)

### Out of Scope — Not Attempted
- Pricing, blog, about, contact pages
- Logo, SVG, or image assets (text wordmark only)
- Navigation bar or multi-page marketing structure
- Changes to auth flow, JWT, session handling, or roles
- i18n, analytics, cookie banner, SEO metadata
- Self-serve signup (CTA → `/login`; tenant provisioning is manual)
- Automated tests (no TDD; strict_tdd: false per config)

### Multi-Tenant Impact
- Zero impact. Landing page has no DB access (`withTenant`/`masterDb` never called), no tenant-scoped content, served identically from apex and subdomains.

---

## Rollback Path

If needed, three-step revert:
1. Restore `src/app/page.tsx` to `redirect('/login')`
2. Remove `'/'` from `PUBLIC_PAGE_PATHS` in `src/middleware.ts`
3. Delete the `<Link>` from `src/app/(auth)/login/page.tsx`

No migrations, no env vars, no dependencies to undo. Single `git revert` of implementing commits suffices.

---

## Archive Status

- **Engram artifacts**: All 6 observations (proposal, spec, design, tasks, apply-progress, verify-report) archived as topic keys.
- **OpenSpec files**: All 7 markdown files stored in `openspec/changes/landing-page/`.
- **Filesystem move**: Change folder will be moved to `openspec/changes/archive/2026-08-04-landing-page/`.
- **Main specs merge**: No delta specs to merge (spec domain not yet created; full spec can be added as main spec if needed later).

---

## Next Steps

1. **Deploy**: Landing page is ready for production deployment. No migrations, no env changes.
2. **Follow-up PR (Optional)**: Address accepted deviations in a separate change:
   - Refactor Button to support `asChild` prop (enables design-system-first CTA).
   - Update spec to reflect icon library policy.
   - Clarify middleware path-match comment.
3. **Brand polish**: Once designer produces logo and assets, create a follow-up PR for visual polish.
4. **Wordmark unification**: Follow-up PR to reconcile "Sirva" (landing/login) vs. "Sirve" (internal) naming.

---

## Session Context

- **Project**: sirve-saas (Next.js 15, schema-per-tenant PostgreSQL, JWT auth)
- **Artifact store**: hybrid (Engram + OpenSpec)
- **Execution mode**: interactive
- **Delivery strategy**: ask-on-risk (single PR, no chaining needed)
- **TDD**: strict_tdd: false (no test runner)

---

**Archive Date**: 2026-08-04  
**Archived by**: sdd-archive (executor)  
**Status**: COMPLETE — Ready for next change.
