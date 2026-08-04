# Design — tenant-expiry

## Executive summary

Add a nullable `master.tenants.fecha_vencimiento TIMESTAMPTZ` column, expose SUPERADMIN write and ADMIN read endpoints under existing conventions, render a dismissible banner in the admin layout, and enforce expiry inline in `POST /api/ordenes` via a single `masterDb()` pre-check before `withTenant()`. All time comparisons use the DB clock (`NOW()`), all identity resolution uses the JWT `tenantSlug` propagated via `x-tenant-slug` middleware headers.

---

## Architecture approach

**Pattern**: thin route handler → domain service (pure functions over `Sql`) → `masterDb()` for master schema, `withTenant()` for tenant schema. Same shape as the rest of the codebase.

**Boundaries**:

- Master DB access lives in `TenantsService` — no route handler writes raw SQL.
- Client-side subscription state lives in a single React component (`ExpiryBanner`) mounted inside `AdminLayout`, not in a global provider.
- Order-guard is co-located inside `POST /api/ordenes` handler (not middleware — postgres.js is not Edge-compatible; not a wrapper — inline is one query and easier to read).

**Reused primitives**:

- `handle()` / `apiSuccess()` / `getContext()` from `src/lib/http.ts`.
- `masterDb()` from `src/lib/db.ts`.
- `ForbiddenError`, `ValidationError` already exist in `src/lib/errors.ts` — no error class changes needed.
- Zod schemas colocated in `src/lib/schemas/index.ts`.
- UI primitives: `Badge`, `Button`, existing modal pattern.

---

## Naming decisions (ADR-style)

### ADR-1: Endpoint path — `/api/admin/tenants/[slug]` (PATCH), NOT `/api/superadmin/tenants/[slug]`

**Decision**: Route the SUPERADMIN mutation as `PATCH /api/admin/tenants/[slug]` with an in-handler `if (!user.roles.includes('SUPERADMIN')) throw new ForbiddenError()` guard.

**Rationale**: All existing tenant CRUD lives under `src/app/api/admin/tenants/**` (`GET /api/admin/tenants`, `POST /api/admin/tenants`, `GET /api/admin/tenants/[slug]`, `PATCH /api/admin/tenants/[slug]/desactivar`, etc.), each guarded in-handler by the SUPERADMIN role. Spec text says `/api/superadmin/tenants/[slug]` but no such directory exists. Creating a parallel tree contradicts the codebase and would split SUPERADMIN tenant management across two paths.

**Rejected alternative**: Create `src/app/api/superadmin/tenants/[slug]/route.ts`. Rejected because it forks the API surface, requires duplicating the `SUPERADMIN` guard pattern, and forces a client-side migration of the existing `getTenants()` helper.

**Behavioral impact**: none — the spec scenario "Non-SUPERADMIN is rejected → 403" holds identically; the path is different from the spec draft but the observable contract is preserved.

**Client wiring**: extend `src/lib/api/tenants.ts` with `updateTenantExpiry(slug, fechaVencimiento)` calling `PATCH /admin/tenants/{slug}`.

### ADR-2: DB clock for both `diasRestantes` and the order guard

**Decision**: Compute expiry state in SQL, not in Node.

- `GET /api/me/tenant` runs a single query that returns `fecha_vencimiento`, `dias_restantes` (integer or null), and `vencida` (boolean).
- `POST /api/ordenes` guard runs `SELECT (fecha_vencimiento IS NOT NULL AND fecha_vencimiento < NOW()) AS vencida FROM master.tenants WHERE slug = $1`.

**Rationale**: Eliminates clock-skew split-brain between "banner says 3 days" and "guard rejects order". The spec explicitly requires DB-clock computation ("all computation MUST happen server-side using the DB clock").

**`diasRestantes` SQL**:
```sql
CASE
  WHEN fecha_vencimiento IS NULL THEN NULL
  ELSE FLOOR(EXTRACT(EPOCH FROM (fecha_vencimiento - NOW())) / 86400)::int
END AS dias_restantes
```

**Rejected alternative**: Node computation via `Math.floor((fechaVencimiento.getTime() - Date.now()) / 86400000)`. Rejected because Node clock differs from DB clock (especially on Vercel serverless vs Supabase), and the guard query uses `NOW()` anyway — mixing sources creates the exact bug we want to prevent.

### ADR-3: Banner dismiss uses `localStorage`, keyed per tenant

**Decision**: `localStorage` key `sirve_banner_dismissed_{tenantSlug}` set on dismiss, checked on mount. NOT `sessionStorage`, NOT a session-wide key.

**Rationale**: The spec explicitly names `localStorage` with a tenant-keyed suffix. Session-wide dismissal is wrong for multi-tenant browsers (a superadmin impersonating tenant A should not silence tenant B's banner).

**Trade-off**: persists across sessions. If ADMIN dismisses today and expiry gets closer tomorrow, banner stays dismissed until they clear storage. Accepted: the spec's dismissal semantics are explicit; refinement (e.g. re-show when `diasRestantes` drops below the previous dismissed value) is out of scope.

**Note**: the launch prompt suggested `sessionStorage` per-session. That contradicts the spec (which is authoritative). Following the spec.

### ADR-4: Banner is a client component rendered inside `AdminLayout`, above `AppLayout`'s `<main>`

**Decision**: `src/app/admin/layout.tsx` stays a client component (already is — `'use client'` at top). Add a new `<ExpiryBanner />` client component. Render inside `AppLayout` by prepending it to `children`:

```tsx
<AppLayout ...>
  <ExpiryBanner />
  {children}
</AppLayout>
```

The banner renders as a full-width bar at the top of the main content area (inside `<main>` in `AppLayout`), scrolls with content.

**Rationale**: `AppLayout` accepts `{children}` and puts them inside `<main className="flex-1 md:ml-60 pb-24 md:pb-6">`. The banner needs to sit above page content but respect the sidebar offset — placing it as the first child of the layout's children slot achieves both without modifying `AppLayout`.

**Rejected alternative**: Add a `header` prop to `AppLayout` for the banner slot. Rejected — that couples `AppLayout` (used by MESERO and COCINA too) to a subscription concept that only exists for ADMIN. Prepending in the admin-specific layout is scoped correctly.

**Rejected alternative**: Render as a fixed-position bar over the viewport. Rejected — obscures top-of-page UI on mobile and duplicates work the sidebar already does.

### ADR-5: Order guard is inline in `POST /api/ordenes`, one extra `masterDb()` query

**Decision**: At the top of the POST handler, run `SELECT fecha_vencimiento < NOW() AS vencida FROM master.tenants WHERE slug = $1`. If `vencida === true`, throw `ForbiddenError('Suscripción vencida. No es posible crear órdenes.')`.

**Rationale**: The order-creation path already opens two connections (auth via master, order write via tenant). Adding one small master-query is <5ms overhead and reads at the site where enforcement is needed. A wrapper (`withExpiryGuard`) would obscure the logic without meaningful reuse — the guard applies to exactly one route.

**Rejected alternatives**:
- Middleware-level check: Edge runtime cannot run postgres.js. Would require a fetch to a Node route or a KV cache. More moving parts than a single `SELECT`.
- Read expiry from JWT: expiry can change between login and NOW(); JWT would need to be re-issued on every SUPERADMIN change. Not worth it.
- Cache expiry in-process: introduces staleness (SUPERADMIN sets expiry → mesero still creates orders until cache expires). Rejected.

### ADR-6: SUPERADMIN modal uses `type="date"`, interprets as end-of-day UTC

**Decision**: Modal shows `<input type="date" value={YYYY-MM-DD}>`. On save, transform to `YYYY-MM-DDT23:59:59.999Z` (end-of-day UTC) before PATCH.

**Rationale**: `type="date"` returns `YYYY-MM-DD` with no timezone. Storing midnight UTC would expire the tenant 3-9 hours earlier than intended for AR/CL/BR admins. End-of-day UTC gives the tenant the full calendar day chosen by the SUPERADMIN, regardless of viewing timezone. Documented in the modal helper text: "El vencimiento se aplica al final del día (UTC)".

**Rejected alternative**: Use `type="datetime-local"`. Rejected — SUPERADMIN thinks in "the subscription ends on Aug 31", not "at 23:59 on Aug 31". Simpler input, deterministic transform.

---

## Component map

### 1. Migration — `supabase/migrations/20260804130000_tenant_expiry.sql`

```sql
ALTER TABLE master.tenants
  ADD COLUMN IF NOT EXISTS fecha_vencimiento TIMESTAMPTZ NULL DEFAULT NULL;
```

- No index — the column is queried by PK/slug lookup only, never scanned.
- No backfill — NULL means "no expiry" and is the correct default for every existing row.
- Rollback: `ALTER TABLE master.tenants DROP COLUMN fecha_vencimiento`.

### 2. Types — `src/types/index.ts`

Extend `Tenant`:
```ts
export interface Tenant {
  id: number
  nombre: string
  slug: string
  activo: boolean
  setupUrl?: string | null
  createdAt?: string | null
  fechaVencimiento?: string | null  // ISO 8601 or null
}
```

New DTO for the ADMIN self-read endpoint:
```ts
export interface TenantExpiryState {
  fechaVencimiento: string | null
  diasRestantes: number | null
  vencida: boolean
}
```

### 3. Service layer — `src/lib/services/tenants.ts`

Extend `TenantRow` and `toTenant`:
```ts
interface TenantRow {
  id: bigint
  slug: string
  nombre: string
  activo: boolean
  db_schema: string
  created_at: Date
  fecha_vencimiento: Date | null
}

function toTenant(row: TenantRow, setupUrl?: string): Tenant {
  return {
    id: Number(row.id),
    slug: row.slug,
    nombre: row.nombre,
    activo: row.activo,
    dbSchema: row.db_schema,
    createdAt: row.created_at.toISOString(),
    fechaVencimiento: row.fecha_vencimiento ? row.fecha_vencimiento.toISOString() : null,
    ...(setupUrl !== undefined ? { setupUrl } : {}),
  }
}
```

Update the SELECT column list in `listTenants`, `getTenant`, `createTenant` (RETURNING), `desactivarTenant` (RETURNING) to include `fecha_vencimiento`.

New functions:

```ts
export async function updateTenantExpiry(
  sql: Sql,
  slug: string,
  fechaVencimiento: Date | null
): Promise<Tenant> {
  const rows = await sql<TenantRow[]>`
    UPDATE master.tenants
    SET fecha_vencimiento = ${fechaVencimiento}
    WHERE slug = ${slug}
    RETURNING id, slug, nombre, activo, db_schema, created_at, fecha_vencimiento
  `
  if (rows.length === 0) throw new NotFoundError(`Tenant '${slug}' not found`)
  return toTenant(rows[0])
}

export interface TenantExpiryStateRow {
  fecha_vencimiento: Date | null
  dias_restantes: number | null
  vencida: boolean
}

export async function getTenantExpiryState(
  sql: Sql,
  slug: string
): Promise<{ fechaVencimiento: string | null; diasRestantes: number | null; vencida: boolean }> {
  const rows = await sql<TenantExpiryStateRow[]>`
    SELECT
      fecha_vencimiento,
      CASE
        WHEN fecha_vencimiento IS NULL THEN NULL
        ELSE FLOOR(EXTRACT(EPOCH FROM (fecha_vencimiento - NOW())) / 86400)::int
      END AS dias_restantes,
      (fecha_vencimiento IS NOT NULL AND fecha_vencimiento < NOW()) AS vencida
    FROM master.tenants
    WHERE slug = ${slug}
    LIMIT 1
  `
  if (rows.length === 0) throw new NotFoundError(`Tenant '${slug}' not found`)
  const r = rows[0]
  return {
    fechaVencimiento: r.fecha_vencimiento ? r.fecha_vencimiento.toISOString() : null,
    diasRestantes: r.dias_restantes,
    vencida: r.vencida,
  }
}

export async function isTenantExpired(sql: Sql, slug: string): Promise<boolean> {
  const rows = await sql<{ vencida: boolean }[]>`
    SELECT (fecha_vencimiento IS NOT NULL AND fecha_vencimiento < NOW()) AS vencida
    FROM master.tenants
    WHERE slug = ${slug}
    LIMIT 1
  `
  return rows.length > 0 && rows[0].vencida === true
}
```

### 4. Zod schema — `src/lib/schemas/index.ts`

```ts
export const UpdateTenantExpirySchema = z.object({
  fechaVencimiento: z.string().datetime().nullable(),
})
```

`z.string().datetime()` accepts ISO 8601 with a `Z` or explicit offset — matches the spec's "valid ISO 8601 string" and rejects `"not-a-date"` with 400.

### 5. PATCH endpoint — `src/app/api/admin/tenants/[slug]/route.ts` (extend existing file)

Add a PATCH handler alongside the existing GET:

```ts
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { user } = getContext(req)
  const { slug } = await ctx.params
  return handle(async () => {
    if (!user.roles.includes('SUPERADMIN')) throw new ForbiddenError()
    const body = await req.json()
    const parsed = UpdateTenantExpirySchema.safeParse(body)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')
    }
    const sql = masterDb()
    const fecha = parsed.data.fechaVencimiento
      ? new Date(parsed.data.fechaVencimiento)
      : null
    const tenant = await TenantsService.updateTenantExpiry(sql, slug, fecha)
    return apiSuccess(tenant)
  })
}
```

- Order of checks: role → parse → service call — matches existing POST pattern.
- `NotFoundError` from the service surfaces as 404 via `handle()`.

### 6. GET /api/me/tenant — new file `src/app/api/me/tenant/route.ts`

```ts
import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { masterDb } from '@/lib/db'
import * as TenantsService from '@/lib/services/tenants'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { user, tenantSlug } = getContext(req)
  return handle(async () => {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenError()
    if (!tenantSlug || tenantSlug === '__master__') {
      throw new ValidationError('Tenant context required')
    }
    const sql = masterDb()
    const state = await TenantsService.getTenantExpiryState(sql, tenantSlug)
    return apiSuccess(state)
  })
}
```

- `tenantSlug` is authoritative from the signed JWT via `x-tenant-slug` middleware header — cannot be spoofed.
- Non-ADMIN → 403; missing tenant context → 400; unknown slug → 404 from service.
- Response shape: `{ fechaVencimiento, diasRestantes, vencida }` matches spec.

### 7. Order guard — extend `src/app/api/ordenes/route.ts` POST

Insert at the top of the POST handler, BEFORE `parsed`:

```ts
export async function POST(req: NextRequest) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    // Expiry guard — reject if the tenant's subscription has lapsed
    const masterSql = masterDb()
    const expired = await OrdenService_or_TenantsService.isTenantExpired(masterSql, tenantSlug)
    if (expired) {
      throw new ForbiddenError('Suscripción vencida. No es posible crear órdenes.')
    }

    const body = await req.json()
    // ... existing logic unchanged
  })
}
```

- Uses `TenantsService.isTenantExpired` (defined in section 3), not a new duplicate query.
- Single extra round-trip; runs before Zod parse so we fail fast without parsing.
- Explicit `ForbiddenError` message — the axios interceptor already prefers `data.message` over the fallback (`axios.ts:42`), so the message reaches the UI unchanged.
- Only added to POST; GET is unaffected (spec: "other routes unaffected").

### 8. Client API helper — extend `src/lib/api/tenants.ts`

```ts
export const updateTenantExpiry = (
  slug: string,
  fechaVencimiento: string | null
): Promise<Tenant> =>
  api
    .patch<Tenant>(`/admin/tenants/${slug}`, { fechaVencimiento })
    .then(r => r.data)

export const getMyTenantExpiry = (): Promise<TenantExpiryState> =>
  api.get<TenantExpiryState>('/me/tenant').then(r => r.data)
```

### 9. Superadmin UI — `src/app/superadmin/page.tsx`

Extend the existing table:

**Column**: add "Vencimiento" between "Setup pendiente" and "Creado".

**Badge component** (inline helper inside the page file):
```tsx
function ExpiryBadge({ fechaVencimiento }: { fechaVencimiento: string | null | undefined }) {
  if (!fechaVencimiento) {
    return <Badge variant="secondary">Sin vencimiento</Badge>
  }
  const dias = Math.floor(
    (new Date(fechaVencimiento).getTime() - Date.now()) / 86400000
  )
  if (dias < 0) return <Badge variant="destructive">Vencida</Badge>
  if (dias <= 5) return <Badge variant="warning">Vence en {dias} d</Badge>
  return <Badge variant="secondary">{new Date(fechaVencimiento).toLocaleDateString('es-AR')}</Badge>
}
```

Note: badge uses client-time for display polish, but the source of truth (block/allow, `vencida` boolean) always comes from server. The badge showing "vence en 4 d" when server would say "3 d" is a display-only difference of <24h and matches user expectations.

**Action button**: add "Editar vencimiento" to the actions column, opens `<ExpiryModal>`.

**`ExpiryModal` component** — new file `src/components/superadmin/ExpiryModal.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { updateTenantExpiry } from '@/lib/api/tenants'
import { toast } from 'sonner'
import type { Tenant } from '@/types'

interface Props {
  tenant: Tenant
  onSaved: (updated: Tenant) => void
  onClose: () => void
}

export default function ExpiryModal({ tenant, onSaved, onClose }: Props) {
  const initial = tenant.fechaVencimiento
    ? new Date(tenant.fechaVencimiento).toISOString().slice(0, 10)
    : ''
  const [date, setDate] = useState(initial)
  const [saving, setSaving] = useState(false)

  const save = async (value: string | null) => {
    setSaving(true)
    try {
      // Transform YYYY-MM-DD → YYYY-MM-DDT23:59:59.999Z (end-of-day UTC)
      const iso = value ? `${value}T23:59:59.999Z` : null
      const updated = await updateTenantExpiry(tenant.slug, iso)
      toast.success('Vencimiento actualizado')
      onSaved(updated)
    } catch (e) {
      const err = e as { friendlyMessage?: string }
      toast.error(err.friendlyMessage ?? 'Error al actualizar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-2xl p-6 w-96 space-y-4">
        <h2 className="text-lg font-bold text-foreground">
          Vencimiento — {tenant.nombre}
        </h2>
        <p className="text-xs text-muted-foreground">
          Se aplica al final del día (UTC).
        </p>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-foreground"
        />
        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={saving || !tenant.fechaVencimiento}
            onClick={() => save(null)}
          >
            Quitar vencimiento
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={saving || !date}
              onClick={() => save(date)}
            >
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Page state**: on save, `onSaved(updated)` replaces the tenant in the list state:
```ts
setTenants(prev => prev.map(t => t.slug === updated.slug ? updated : t))
```

No full reload — matches spec ("list updates in-place").

### 10. Admin banner — new file `src/components/admin/ExpiryBanner.tsx`

```tsx
'use client'
import { useEffect, useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { getMyTenantExpiry } from '@/lib/api/tenants'
import type { TenantExpiryState } from '@/types'

interface Props {
  tenantSlug: string
}

export default function ExpiryBanner({ tenantSlug }: Props) {
  const [state, setState] = useState<TenantExpiryState | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const key = `sirve_banner_dismissed_${tenantSlug}`
    if (typeof window !== 'undefined' && localStorage.getItem(key) === '1') {
      setDismissed(true)
    }
    getMyTenantExpiry().then(setState).catch(() => setState(null))
  }, [tenantSlug])

  if (!state || dismissed) return null
  if (!state.vencida && (state.diasRestantes === null || state.diasRestantes > 5)) {
    return null
  }

  const isExpired = state.vencida
  const bg = isExpired
    ? 'bg-destructive/10 border-destructive text-destructive'
    : 'bg-warning/10 border-warning text-warning'
  const msg = isExpired
    ? 'Tu suscripción ha vencido. La creación de órdenes está bloqueada.'
    : `Tu suscripción vence en ${state.diasRestantes} días. Contactá al administrador.`

  const dismiss = () => {
    localStorage.setItem(`sirve_banner_dismissed_${tenantSlug}`, '1')
    setDismissed(true)
  }

  return (
    <div className={`flex items-center gap-3 px-6 py-3 border-b ${bg}`}>
      <AlertTriangle size={16} className="shrink-0" />
      <p className="flex-1 text-sm">{msg}</p>
      <button
        onClick={dismiss}
        className="shrink-0 p-1 rounded hover:bg-black/10"
        aria-label="Cerrar aviso"
      >
        <X size={14} />
      </button>
    </div>
  )
}
```

**Wiring into `src/app/admin/layout.tsx`**:

The layout is already a client component. It needs the `tenantSlug` for the localStorage key. Read from `localStorage` (already present as `sirve_auth`) or accept that the banner reads it itself. Simpler: banner reads it itself from `sirve_auth`:

```tsx
// inside ExpiryBanner useEffect
const raw = localStorage.getItem('sirve_auth')
const tenantSlug = raw ? (JSON.parse(raw) as AuthSession).tenantId : ''
```

Then `AdminLayout` becomes:

```tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout
      panelKicker="Panel"
      panelLabel="Administrador"
      navItems={navItems}
      sidebarFooter={<RoleSwitcher variant="sidebar" />}
    >
      <ExpiryBanner />
      {children}
    </AppLayout>
  )
}
```

Banner reads `tenantSlug` internally — no prop needed, no change to `AppLayout`.

### 11. Client interceptor — no change needed

`src/lib/api/axios.ts:42`:
```ts
let friendlyMessage = data?.mensaje ?? data?.message ?? data?.error
```

Server-returned `message` (from `ForbiddenError` via `handle()`) is preferred over the generic 403 fallback on line 46. Spec scenario "403 message shown to client" is already satisfied by the existing interceptor. No change.

---

## Data flow diagrams

### SUPERADMIN sets expiry

```
Superadmin UI (page.tsx)
  → ExpiryModal.save(date)
  → api.patch('/admin/tenants/{slug}', { fechaVencimiento: 'YYYY-MM-DDT23:59:59.999Z' })
  → middleware.ts (JWT verified, x-user + x-tenant-slug set)
  → PATCH /api/admin/tenants/[slug]
      → user.roles includes SUPERADMIN? no → 403
      → UpdateTenantExpirySchema.parse
      → masterDb() → TenantsService.updateTenantExpiry
      → UPDATE master.tenants SET fecha_vencimiento = $1 WHERE slug = $2
      → toTenant(row) → 200 { …tenant, fechaVencimiento }
  ← ExpiryModal.onSaved(updated) → setTenants(replace by slug)
```

### ADMIN loads /admin/*

```
AdminLayout (client)
  → <ExpiryBanner /> mounts
      → localStorage.getItem('sirve_banner_dismissed_{slug}') → dismissed?
      → api.get('/me/tenant')
          → middleware verifies JWT → x-tenant-slug = 'restaurant-a'
          → user.roles includes ADMIN? no → 403
          → masterDb() → getTenantExpiryState('restaurant-a')
          → SELECT fecha_vencimiento, dias_restantes, vencida
          → 200 { fechaVencimiento, diasRestantes, vencida }
      → decide render:
          - dismissed → null
          - no expiry → null
          - > 5 days → null
          - 0..5 days → yellow warning banner
          - vencida → red banner
```

### MESERO creates order (blocked path)

```
POST /api/ordenes
  → getContext(req) → tenantSlug = 'restaurant-a'
  → handle(async () => {
      const expired = await TenantsService.isTenantExpired(masterDb(), 'restaurant-a')
      if (expired) throw new ForbiddenError('Suscripción vencida. No es posible crear órdenes.')
      // rest of existing POST logic
    })
  → handle catches ForbiddenError → 403 { message: 'Suscripción vencida...' }
  ← axios interceptor → friendlyMessage = data.message
  ← UI toast shows server message
```

Note: withTenant() is NEVER called on the blocked path — no tenant schema connection is reserved for a blocked order.

---

## Migration and rollout

1. Apply migration to Supabase: `supabase/migrations/20260804130000_tenant_expiry.sql`. Idempotent (`IF NOT EXISTS`).
2. Deploy code — existing tenants have `fecha_vencimiento = NULL` → all guards pass, no behavior change.
3. SUPERADMIN begins setting expiry dates via the modal.

**Rollback**: revert the code deploy; `fecha_vencimiento` column can be left in place (harmless) or dropped via `ALTER TABLE master.tenants DROP COLUMN fecha_vencimiento`.

---

## Risks and open questions

- **Banner staleness across expiry midnight**: an ADMIN keeping a tab open across the expiry instant sees stale banner state until they navigate. Accepted for v1 (proposal already flagged). A periodic refetch (`setInterval(..., 60_000)`) can be added later.

- **Guard adds one round-trip to every `POST /api/ordenes`**: `masterDb()` uses `prepare: false` and `max: 5` — under sustained order load this could become a contention point. Mitigation: the query is trivial (single-row PK-like lookup by slug). If needed later, add a `LISTEN/NOTIFY` invalidated in-process cache. Not addressing in v1.

- **`fechaVencimiento` UTC end-of-day**: SUPERADMIN in AR (UTC-3) picking "2026-08-31" gets expiry at 2026-08-31T23:59:59.999Z = 2026-08-31T20:59:59 AR. This means the tenant is blocked at 8:59 PM AR on their "last day", not midnight local. Acceptable trade-off documented in the modal helper text. If SUPERADMIN needs local-EOD semantics later, add a timezone selector to the modal.

- **`z.string().datetime()` strictness**: rejects offsets without `Z` or `±HH:MM`. If a client ever sends a non-Z ISO string without offset, it errors. Our modal always sends `Z`-suffixed strings, so safe for v1.

- **No audit trail**: setting/clearing expiry leaves no record of who/when. Deferred (proposal already flagged).

---

## Out-of-scope reminders

Anything not in Component Map §1–§11 stays untouched:

- No billing integration, no scheduled reminder emails.
- Guard only on `POST /api/ordenes` — GET, PATCH, item add, pago, etc. all remain unaffected.
- No middleware-level enforcement.
- No new error classes (`ForbiddenError` already exists).
- No `AppLayout` prop changes.
- No changes to MESERO or COCINA layouts.
