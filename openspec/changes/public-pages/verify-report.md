# Verify Report: public-pages (FULL — PR #1 + PR #2)

**Date**: 2026-08-05
**Scope**: TASK-01 through TASK-14 (TASK-11/12/13 skipped — no test runner; TASK-15 PENDING-HUMAN)
**Verdict**: **PASS**
**Counts (cumulative)**: `CRITICAL: 0, WARNING: 3, SUGGESTION: 3`

---

## Summary by PR

| PR | Scope | Verdict | New CRITICAL | New WARNING | New SUGGESTION |
|---|---|---|---|---|---|
| PR #1 | TASK-01..TASK-10 (Auth + Legal) | PASS | 0 | 2 | 3 |
| PR #2 | TASK-14 (Landing redesign) | PASS | 0 | 1 | 0 |
| TASK-15 | Manual smoke check | PENDING-HUMAN | — | — | — |
| **TOTAL** | — | **PASS** | **0** | **3** | **3** |

---

## PR #2 — Landing Redesign — PASS

**Files audited**:
- `src/app/page.tsx` (333 LOC, Server Component)
- `src/app/(marketing)/landing/FaqAccordion.tsx` (58 LOC, `'use client'`)

### Quality Gates

| Gate | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | PASS | Zero output = zero errors |
| Server Component check | PASS | No `'use client'` on `page.tsx`; no `useAuth`/`AuthContext`/`useSession` imports |
| Design tokens only | PASS | `grep '(slate|gray|zinc|neutral|blue)-\d+'` in both files → zero matches |
| Brand name "Sirva" | PASS | `grep Sirve` in both files → zero matches |
| Pricing display-only | PASS | `grep -i 'stripe|mercadopago|paypal|checkout|billing|payment'` → zero matches |

### 9 Required Sections (in order) — ALL PRESENT

| # | Section | Lines | Notes |
|---|---|---|---|
| 1 | Header | 92-123 | Brand "Sirva", nav anchors (#features, #pricing, #faq), Ingresar + Registrate CTAs |
| 2 | Hero | 128-152 | Headline, subheadline, **dual CTA** (`/register` primary, `#features` secondary) |
| 3 | Features | 155-171 | 3 cards. `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` — **grid bug FIXED** |
| 4 | Comparison (Before/After) | 174-207 | 4 pairs with X/Check icons using `text-destructive` + `text-primary` |
| 5 | Trust strip | 210-225 | 4 restaurant name pills |
| 6 | Pricing | 228-282 | 2 tiers (Gratis + Pro). Display-only. Pro CTA is `mailto:hola@sirva.app`. Disclaimer line 279 |
| 7 | FAQ | 285-290 | Uses client accordion (5 Q/A) — no external library |
| 8 | Final CTA | 293-306 | `/register` on inverted `bg-primary` section |
| 9 | Footer | 311-329 | Ingresar (`/login`), Registrate (`/register`), Términos (`/terms`), Privacidad (`/privacy`) |

### Spec Scenarios (Requirement #8 Landing Page)

- **Register CTA is present and linked** — PASS. Hero, header, pricing (Gratis), final CTA, footer all link to `/register`.
- **Footer legal links** — PASS. `/terms` (line 321) and `/privacy` (line 324) present.
- **Grid column bug fixed** — PASS. Features uses `lg:grid-cols-3` for 3 items.
- **Brand name consistency** — PASS. "Sirva" only.

### FAQ Accordion

- `useState<number|null>` single-open toggle.
- `aria-expanded` set per button.
- `focus-visible:ring-2 focus-visible:ring-ring` — token-based focus ring.
- `ChevronDown` icon rotates via `rotate-180` when open.
- No accordion library dependency (no headlessui, no radix).

---

## Findings

### CRITICAL (0)
None across both PRs. Ship-ready.

### WARNING (3 cumulative)

**W1 (PR #1) — `AppError.code` dropped by `handle()`.**
`ConflictError`/`ValidationError` carry `code: 'CONFLICT'`/`'VALIDATION'` but `handle()` only forwards `message`. Client can only match strings. Non-regression; login() same behavior. Non-blocking.

**W2 (PR #1) — No rate limiting on `/api/auth/register`.**
Public endpoint creates DB rows + provisions a PG schema per request. Flagged in design as open. Add before high-traffic launch.

**W3 (PR #2) — React key on Fragment shorthand in Before/After map.**
File: `src/app/page.tsx:189-204`
```tsx
{BEFORE_AFTER.map(({ before, after }, i) => (
  <>                                    {/* shorthand cannot take key */}
    <div key={`before-${i}`} ...>
    <div key={`after-${i}`} ...>
  </>
))}
```
Keys must be on the top-level element returned by the map callback; the shorthand fragment does not accept a `key` prop. React logs a "each child in a list should have a unique key" warning in dev. Fix: `<React.Fragment key={i}>...</React.Fragment>`. Dev-console noise only; no runtime bug. Non-blocking.

### SUGGESTION (3 cumulative — all from PR #1, none new in PR #2)

**S1 (PR #1) — Cookie Max-Age (24h) outlives JWT (8h).**
Middleware `jwtVerify` fails and force-redirects, deleting cookie. Cosmetic UX inconsistency.

**S2 (PR #1) — Orphan-tenant sweeper not implemented.**
`activo=false` rows on provision failure need an ops sweep. Track as follow-up.

**S3 (PR #1) — `deriveSlug` fallback identifier `'r'` is fragile.**
`register.ts:104` uses `'r'` when input yields empty slug. Consider `'org'`.

---

## Deviations from Spec/Design (PR #2)

None. Landing composition matches Requirement #8 exactly. Design tokens strictly obeyed. Brand name aligned with `sirve_session → sirva_session` rename decision.

---

## Tasks State

| Task | Status | Notes |
|---|---|---|
| TASK-01..TASK-10 | done | Verified in PR #1 pass |
| TASK-11..TASK-13 | skipped | No test runner (Standard Mode) |
| TASK-14 | **done** | Verified this pass |
| TASK-15 | **PENDING-HUMAN** | Manual smoke check — requires browser navigation across /, /register, /login, /terms, /privacy, mobile viewport, FAQ toggle |

---

## Verdict FULL: PASS — public-pages ready for archive

- 0 CRITICAL issues across both PRs.
- All 8 spec requirements met.
- All architecture constraints preserved.
- TypeScript clean.
- 3 non-blocking WARNINGs, 3 non-blocking SUGGESTIONs.
- TASK-15 is a human smoke pass, not an automated gate — recommend running it before archive but not a blocker for `sdd-archive`.

**Next recommended**: `sdd-archive` (once human runs TASK-15). W3 is a nice 3-line follow-up.

---

## Artifacts
- Engram: `sdd/public-pages/verify-report` (upserted)
- File: `openspec/changes/public-pages/verify-report.md` (this file)

## skill_resolution
`none` — no compact rules were provided in the invocation message.
