# Verify Report: landing-page

**Change**: landing-page
**Date**: 2026-08-04
**Verdict**: PASS with WARNINGS — 0 CRITICAL, 5 WARNING, 2 SUGGESTION

Static checks:
- npx tsc --noEmit → exit 0
- npx next lint → exit 0 (5 pre-existing <img> warnings on unrelated src/app/mesero/ordenes/page.tsx, non-blocking)
- All 5 tasks complete per apply-progress

Full detailed report also stored in Engram observation id 893, topic key sdd/landing-page/verify-report, project sirve-saas.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| WARNING  | 5 |
| SUGGESTION | 2 |

---

## Requirements Check

### REQ — Public Root Route → PASS
- `'/'` present as first element of PUBLIC_PAGE_PATHS in src/middleware.ts:33.
- Middleware match `pathname === p || pathname.startsWith(p + '/')` on line 45 correctly matches only / for p='/'; the startsWith('//')  branch never fires on real paths, so /admin, /mesero, etc. still hit the auth guard.
- Authenticated users are not force-redirected from /.

### REQ — Landing Page is a Server Component → PASS
- No 'use client' directive in src/app/page.tsx.
- Default export is a standard sync function LandingPage().

### REQ — Landing Page Structure → PASS
- Renders header, hero, features, footer in order (src/app/page.tsx:35, 47, 66, 81).

### REQ — Hero Section Content → WARNING
- Wordmark "Sirva" appears in header (page.tsx:36).
- Hero heading is a value-proposition headline "Gestioná tu restaurante — sin complicaciones", NOT a large "Sirva" heading. Note the spec typo: spec says "Sirve" but correct brand is "Sirva".
- CTA labeled "Empezar ahora" navigates to /login.
- **WARNING-A**: CTA uses raw <Link> with inline classes instead of the Button primitive (spec requires Button variant=default).

### REQ — Features Section Content → WARNING
- Exactly 4 cards present with non-empty titles + descriptions.
- **WARNING-B**: Cards use plain <div> instead of Card primitive.
- **WARNING-C**: Introduced lucide-react icons despite spec forbidding external icon libraries.
- **WARNING-D**: Card #3 title "Tiempo real" diverges from spec's "Pedidos en tiempo real".

### REQ — Footer Content → WARNING
- Copyright + login link present, text-muted-foreground styling.
- **WARNING-E**: Copyright year hardcoded "© 2025 Sirva" (today is 2026-08-04). Should be {new Date().getFullYear()}.

### REQ — Design Token Compliance → PASS
- No hex/hsl/rgb in src/app/page.tsx (verified via grep).
- Tokens only: bg-background, bg-surface, text-foreground, text-muted-foreground, border-border, text-primary, bg-primary, text-primary-foreground.

### REQ — Login Back-Link → PASS (with SUGGESTION-1)
- "← Ir al inicio" at src/app/(auth)/login/page.tsx:53-58, href="/".
- Login form logic (ROLE_REDIRECTS, handleSubmit) untouched.

### REQ — Existing Authenticated Flows Unaffected → PASS
- ROLE_GATES unchanged, JWT verification unchanged, no auth service changes.

### Brand check → PASS
- "Sirva" used consistently in landing header, hero paragraph, footer copyright, and login card title. No "Sirve" leakage in user-visible copy.

---

## Findings

### CRITICAL
None.

### WARNING
- **WARNING-A**: CTA uses raw <Link> instead of Button primitive. File: src/app/page.tsx:57-62. Fix: <Button asChild variant="default" size="lg"><Link href="/login">Empezar ahora</Link></Button>
- **WARNING-B**: Feature cards use <div> instead of Card primitive. File: src/app/page.tsx:70. Fix: import Card from @/components/ui/Card.
- **WARNING-C**: lucide-react introduced despite "no external icon library" rule. File: src/app/page.tsx:2. Decision needed: amend spec or remove icons.
- **WARNING-D**: Card #3 title "Tiempo real" vs spec "Pedidos en tiempo real". File: src/app/page.tsx:19.
- **WARNING-E**: Hardcoded "© 2025". File: src/app/page.tsx:83. Fix: © {new Date().getFullYear()} Sirva.

### SUGGESTION
- **SUGGESTION-1**: Login back-link is plain <Link>; spec suggests Button variant=ghost|link. Cosmetic. File: src/app/(auth)/login/page.tsx:53-58.
- **SUGGESTION-2**: PUBLIC_PAGE_PATHS matcher startsWith("//") is a no-op for p="/"; consider explicit pathname === "/" check or comment. File: src/middleware.ts:45.

---

## Deviations Explicitly Acknowledged in apply-progress

The apply-progress record (id 891) documents:
- Icon set and card copy came from an "orchestrator-injected design" declared authoritative over tasks.md. That injected design used Building2, Users, Zap, LayoutDashboard (matches implementation).
- Login back-link uses gap-4 on the outer div instead of mb-2 on the link — equivalent spacing.
- Pre-existing lint error in src/components/layouts/AppLayout.tsx was fixed with eslint-disable-next-line.

These deviations are recorded, but the current spec text (id 885) still requires Card component and forbids external icon libraries. WARNING-B and WARNING-C reflect that spec-vs-implementation gap — either amend the spec or bring implementation in line before archive.

---

## Task Completion Cross-Check

| Task | Marked | Verified |
|------|--------|----------|
| TASK-01: '/' in PUBLIC_PAGE_PATHS | [x] | src/middleware.ts:33 |
| TASK-02: RSC landing | [x] | with WARNING-A..E |
| TASK-03: Login back-link | [x] | with SUGGESTION-1 |
| TASK-04: tsc --noEmit exit 0 | [x] | re-run exit 0 |
| TASK-05: next lint exit 0 | [x] | re-run exit 0 |

---

## Verdict

**PASS — safe to archive.** No CRITICAL blockers. All 5 tasks complete, both static checks pass, no impact on authenticated flows.

The 5 WARNINGs are design-fidelity gaps (Button/Card primitives bypassed, icons library, hardcoded year, reworded title). User should decide:
1. Archive as-is and file follow-up polish change, OR
2. Return to sdd-apply for strict spec conformance.

Recommended next_recommended: sdd-archive (WARNINGs non-blocking, flag to user first).

---

## Files Verified

- src/middleware.ts (auth guard + PUBLIC_PAGE_PATHS)
- src/app/page.tsx (landing)
- src/app/(auth)/login/page.tsx (login + back-link)
