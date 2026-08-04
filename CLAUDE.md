# Sirve-Saas — Project Instructions

## SDD Defaults (do NOT ask the user — use these automatically)

- **Artifact store**: `hybrid` (Engram + OpenSpec files). Never ask which store to use.
- **Execution mode**: `interactive`. Never ask which mode to use.
- **Delivery strategy**: `ask-on-risk`.
- **Project name** (for Engram): `sirve-saas`

SDD init has been run. Init context is at Engram topic key `sdd-init/sirve-saas`.
OpenSpec config is at `openspec/config.yaml`.

## Architecture

- Next.js 15 App Router — single repo, no external backend.
- Multi-tenant: schema-per-tenant PostgreSQL. `master` schema for global tables, `tenant_{slug}` per restaurant.
- `masterDb()` for `master.*` queries. `withTenant(slug, fn)` for tenant-scoped queries.
- **Always prefix master schema tables with `master.`** (e.g. `master.tenants`, `master.usuarios`). The connection has no search_path set (PgBouncer constraint).
- Middleware (`src/middleware.ts`) resolves tenant from subdomain + validates JWT.
- Page routes: cookie `sirva_session`. API routes: `Authorization: Bearer <token>`.

## Critical Constraints

- `prepare: false` on postgres.js — required for PgBouncer transaction mode.
- Never add `connection: { search_path }` startup param to postgres.js pools.
- `withTenant()` sets search_path per connection reservation via `SET search_path TO tenant_{slug}` — safe with PgBouncer transaction mode.
- API errors return `{ message: string }` flat — never nested `{ error: { message } }`.
- `masterDb()` max 5 connections, tenant pool max 10.

## Key Files

- `src/lib/db.ts` — DB pools and withTenant()
- `src/lib/services/` — business logic (pure functions receiving Sql + params)
- `src/app/api/` — Route Handlers (thin: validate → call service → return)
- `src/middleware.ts` — tenant + JWT guard
- `src/lib/schemas/index.ts` — Zod schemas
- `supabase/migrations/` — SQL migrations (must be run manually against Supabase)
