# Proposal — tenant-expiry

## Intent

### Problem

Sirve-Saas today has no notion of a subscription lifecycle at the tenant level. Every tenant provisioned in `master.tenants` is effectively perpetual: there is no expiry date, no way for SUPERADMIN to set one, no visibility for the tenant ADMIN, and no runtime enforcement that blocks operations when a subscription lapses.

For a commercial SaaS this is a hard gap:

- Billing and access are decoupled — a tenant that stops paying keeps operating indefinitely.
- SUPERADMIN has no lever to end access short of deleting the tenant, which is destructive and loses data.
- Tenant ADMINs have no warning before losing access, which produces support tickets instead of renewals.

### Why now

The multi-tenant baseline (schema-per-tenant, JWT with `tenantSlug`, `masterDb()` / `withTenant()` split, superadmin UI) is stable and the recent UI unification (PRs 1–3) landed the primitives we need to render a banner in the admin layout without theming friction. This is the right moment to add the commercial control layer on top of the technical multi-tenancy that already works.

### Success

- SUPERADMIN can set, change, or clear an expiry date for any tenant from `/superadmin`.
- Tenant ADMINs see a clear, non-blocking warning banner in the admin layout starting 5 days before expiry, and a blocking-tone banner once the subscription is vencida.
- Order creation (`POST /api/ordenes`), which is the single revenue-critical write path, is rejected with a clear `403` when the tenant is expired. All other read/UI paths keep working so the ADMIN can still see historical data and renew.
- NULL `fecha_vencimiento` continues to mean "no expiry" — existing tenants keep working with zero migration risk.

## Scope

### In-scope

1. **Schema change on `master.tenants`**: add nullable `fecha_vencimiento TIMESTAMPTZ`. NULL = infinite subscription (backward-compatible default for every existing row).
2. **SUPERADMIN write endpoint**: `PATCH /api/superadmin/tenants/[slug]` accepting `{ fechaVencimiento: string | null }`, guarded by SUPERADMIN role.
3. **Tenant self-read endpoint**: `GET /api/me/tenant` returning `{ fechaVencimiento, diasRestantes, vencida }` for the caller's own tenant (resolved from the JWT `tenantSlug`, ADMIN role).
4. **Superadmin UI**: "Editar" modal in `/superadmin/page.tsx` with a date input for `fecha_vencimiento`, plus an expiry badge in the tenant list (OK / vence en N días / vencida).
5. **Admin layout banner**: banner slot added to `src/app/admin/layout.tsx`. Warning (yellow) when ≤5 days remain, expired (red) when vencida. Sourced from `/api/me/tenant`.
6. **Order-creation guard**: in `POST /api/ordenes`, before `withTenant()`, `masterDb()` reads `fecha_vencimiento` for the caller's tenant; if expired, throw `ForbiddenError('Suscripción vencida')` which serializes as `403 { message: "Suscripción vencida" }`.

### Out-of-scope (explicit)

- **Billing integration** — no Stripe, no invoicing, no automatic renewal. Expiry is set by SUPERADMIN manually.
- **Grace periods, dunning, reminder emails** — no scheduled jobs, no Resend flows tied to expiry. Only in-app banners.
- **Read-only mode across all endpoints** — we only block `POST /api/ordenes`. Other writes (menu edits, staff management, etc.) remain available so the ADMIN can prepare for a clean renewal.
- **Middleware-level enforcement** — middleware runs on Edge Runtime and postgres.js is incompatible with it. Enforcement lives in the Node.js route handlers only.
- **Per-plan feature gating or entitlements** — expiry is a single boolean gate, not a plan matrix.
- **Audit log of expiry changes** — not tracked in this change; can be layered later.
- **Cross-tenant analytics for SUPERADMIN** (churn, expiring-soon dashboards) — not in this change.

## Approach

**Approach B — API guard + client alert.**

### High-level shape

```
master.tenants
  └─ fecha_vencimiento TIMESTAMPTZ NULL

SUPERADMIN → /superadmin → PATCH /api/superadmin/tenants/[slug]
                                 └─ masterDb UPDATE master.tenants

ADMIN     → /admin/*    → banner → GET /api/me/tenant
                                     └─ masterDb SELECT (by JWT tenantSlug)

Mesero    → POST /api/ordenes
              ├─ masterDb SELECT fecha_vencimiento     ← guard
              │   └─ if vencida → 403 ForbiddenError
              └─ withTenant(slug, insert orden…)       ← normal path
```

### Rationale for the six pieces

1. **Nullable column, TIMESTAMPTZ** — TIMESTAMPTZ matches the rest of the schema and stores an unambiguous instant. NULL as "no expiry" avoids a data migration for existing tenants and keeps the semantics simple: "if the value is set and in the past, block". No default value, no backfill.

2. **Dedicated PATCH endpoint under `/api/superadmin`** — there is no existing tenant-metadata PATCH, so a narrow endpoint scoped to SUPERADMIN is safer than overloading a POST or adding fields to an unrelated route. Body is a single field (`fechaVencimiento: string | null`), validated with Zod, updated with `masterDb()`.

3. **`GET /api/me/tenant`** — the banner needs `fechaVencimiento`, `diasRestantes`, and `vencida`. Computing `diasRestantes` server-side avoids clock-skew bugs on the client and keeps the banner's decision surface trivial. This endpoint reads `master.tenants` by `tenantSlug` extracted from the JWT — no tenant schema access needed, so it is fast and cheap.

4. **Superadmin UI (modal + badge)** — the existing `/superadmin/page.tsx` already lists tenants; adding an "Editar" action that opens a modal with a date input is the minimum surface area. The badge in the list surfaces state at a glance ("Vence en 3 días", "Vencida") without opening the modal.

5. **Admin banner** — a client component in `src/app/admin/layout.tsx` fetches `/api/me/tenant` once on mount and renders nothing when `fechaVencimiento` is NULL or > 5 days away. This keeps the layout server-rendered by default and pays the client cost only when a banner is actually needed. Yellow warning at ≤5 days, red vencida banner when expired.

6. **Order-creation guard in the Node route handler** — enforcement CANNOT live in middleware because middleware runs on the Edge Runtime and postgres.js is incompatible. Middleware would need `fetch` to a Node route or a separate KV, which is more moving parts than the problem needs. Doing the check inline in `POST /api/ordenes` (one small `masterDb()` query before `withTenant()`) keeps the enforcement co-located with the operation it protects, which is easy to reason about and easy to remove if the model changes.

### Why block only `POST /api/ordenes`

Orders are the single revenue-critical write path for a restaurant SaaS: a tenant that cannot open new orders effectively cannot operate service, which is the correct commercial signal for a lapsed subscription. Blocking every write is heavier than needed and would prevent the ADMIN from viewing history, exporting data, or fixing settings before renewing. Blocking only order creation gives the ADMIN a functional read/admin surface plus a very clear "you need to renew to serve" pressure point.

### Migration and rollback

- Migration is a single `ALTER TABLE master.tenants ADD COLUMN fecha_vencimiento TIMESTAMPTZ NULL`. Non-destructive, no defaults, no backfill. Safe to run against Supabase live.
- Rollback is `ALTER TABLE master.tenants DROP COLUMN fecha_vencimiento`. Because no other table references it and the guard treats missing/NULL as "no expiry", dropping the column plus reverting the route/UI code fully undoes the change with no data loss beyond the expiry dates themselves.

### Multi-tenant impact

- Only `master.tenants` is touched. No tenant schema (`tenant_{slug}`) is modified.
- The guard uses `masterDb()` (max 5 connections) with `prepare: false` — consistent with existing patterns.
- The `/api/me/tenant` and the order guard resolve tenant identity from the JWT `tenantSlug`, not from headers or subdomain, so they cannot be spoofed by an authenticated user of a different tenant.

## Risks and open questions

- **Clock skew between DB and app** — `diasRestantes` is computed server-side against `NOW()` in the DB (or `new Date()` in Node, we should pick one in `sdd-design`). Small skew is acceptable for a day-granularity banner but the guard on `POST /api/ordenes` should use the DB clock to avoid inconsistencies with the visible banner.
- **In-flight orders at the moment of expiry** — a mesero could have an open order UI when the tenant expires at midnight. The next `POST /api/ordenes` returns 403. The client should surface a friendly toast rather than a crash. This is a UX detail for `sdd-spec` / `sdd-design`.
- **PgBouncer + `masterDb()` extra query per order** — adds one round-trip per order creation. `masterDb()` is already used elsewhere in the request path for auth, so the marginal cost is small, but worth measuring under load.
- **Timezone of expiry** — SUPERADMIN picks a date; is "2026-08-31" interpreted as end-of-day in the tenant's local timezone or UTC? Needs a decision in `sdd-design`. Recommendation: end-of-day UTC, documented clearly in the superadmin modal.
- **Banner refresh** — `/api/me/tenant` is called on layout mount. If the ADMIN keeps a tab open across the expiry instant, the banner is stale until they navigate. Acceptable for v1; a periodic refetch can be added later.
- **`vencida` computed client-side vs server-side** — the API returns the boolean already computed; the client only renders. This avoids the classic "banner says OK, API says 403" split-brain.

## Non-goals restated

This change delivers the minimum viable subscription-expiry control loop: SUPERADMIN sets a date, ADMIN sees it, orders stop when it passes. Billing, automation, plans, and audit trails are explicitly deferred.
