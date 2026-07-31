# Design: UI/UX Mejora Profesional

## Technical Approach

Tailwind v4 `@theme` block in `globals.css` publishes semantic HSL tokens as first-class utility
classes (`bg-primary`, `text-muted-foreground`). The existing `tailwind.config.ts` is stripped to a
content-only file (v4 is CSS-first; `theme.extend.colors` is ignored). Dark-mode overrides live
inside `@variant dark { @theme { ... } }` — the correct v4 form that integrates with the existing
`@custom-variant dark (&:where(.dark, .dark *))` declaration. A `cn()` helper composes classes;
primitives under `src/components/ui/` expose stable variant/size props via plain lookup maps (no
CVA). One `AppLayout` replaces the three duplicated role layouts. Cocina keeps a slim custom shell.
Sonner is adopted for toast feedback (see Decision 6 — scope deviation from proposal §11).

---

## Architecture Decisions

### Decision 1: Tailwind v4 `@theme` in CSS, drop `tailwind.config.ts` colors

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `@theme {}` in globals.css | v4-native, auto-generates utilities, single source of truth | **Chosen** |
| Mirror in `tailwind.config.ts theme.extend.colors` | v3 pattern; v4 ignores it when `@theme` present | Rejected |
| `:root { --color-x }` + arbitrary `bg-[hsl(var(--...))]` | Works but loses clean utility names | Rejected |

**Rationale**: `--color-primary` inside `@theme` auto-generates `bg-primary`, `text-primary`,
`border-primary`, `ring-primary`. This is the only v4-native path for clean utilities. The
`tailwind.config.ts` file is reduced to `content` only — v4 does not read `darkMode` or
`theme.extend` from the config when `@theme` is declared in CSS.

---

### Decision 2: Dark-mode token overrides via `@variant dark { @theme { ... } }`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `@variant dark { @theme { ... } }` | Correct v4 form; integrates with existing `@custom-variant dark` | **Chosen** |
| `.dark { --color-*: ... }` naked CSS vars | Works if tokens were plain CSS vars, but `@theme` vars are managed by v4 | Rejected |
| Separate `.dark` class with arbitrary values in markup | Defeats the token system entirely | Rejected |

**Rationale**: `@custom-variant dark (&:where(.dark, .dark *))` is already declared in globals.css.
`@variant dark { @theme { ... } }` tells Tailwind to emit the override values scoped to that
variant's selector. This means `next-themes` flipping `class="dark"` on `<html>` switches all
semantic tokens automatically — no component-level dark overrides needed.

---

### Decision 3: `cn()` = clsx + tailwind-merge, no CVA

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `clsx` + `tailwind-merge` | Two small deps, deduplicates conflicting utilities | **Chosen** |
| `class-variance-authority` (CVA) | Third dep + DSL for 8 tiny components | Rejected |
| Hand-rolled string concat | Breaks when consumers pass conflicting classes | Rejected |

**Rationale**: `tailwind-merge` handles class conflict resolution (last wins). Variant maps are
10 lines of TS per component. CVA would be appropriate if any component exceeds 4 variants × 3
sizes with compound rules — revisit then.

---

### Decision 4: AppLayout wraps; cocina keeps its own shell

| Option | Tradeoff | Decision |
|--------|----------|----------|
| AppLayout for admin/mesero/superadmin; cocina keeps slim shell | Clean separation of chrome shapes | **Chosen** |
| `sidebar={false}` prop on AppLayout | Bloats API; leaves empty aside/nav in DOM for cocina | Rejected |
| Force cocina into AppLayout with empty navItems | Empty aside rendered, semantically wrong | Rejected |

**Rationale**: `AppLayout` models one specific chrome: sidebar + main + mobile bottom-nav. Cocina
is a full-bleed kanban board — different chrome. Two shells sharing tokens is cleaner than one
shell with escape hatches. `MeseroProvider` stays in `mesero/layout.tsx` (wraps AppLayout from
outside) because it depends on route context; AppLayout is role-agnostic.

---

### Decision 5: Badge is domain-free; ESTADO_INFO lives in constants

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `Badge` takes visual variant; domain map in constants file | Clean separation, single source of truth | **Chosen** |
| `<Badge state="EN_PREPARACION" />` | Couples primitive to domain — not reusable | Rejected |
| Duplicate mapping per page | Current bug; no single source of truth | Rejected |

**Rationale**: `ESTADO_INFO` as a shared constant eliminates the drift between `cocina/page.tsx`
(uses `ESTADO_COLOR`) and `mesero/ordenes/page.tsx` (has its own map). Badge stays importable in
any non-order context.

---

### Decision 6: Sonner — scope deviation from proposal §11

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Add `sonner` | Removes 10x `useState<ToastState>` + conditional render; handles stacking/queueing | **Chosen** |
| Restyle custom Toast.tsx | Keeps 10 duplicated state hooks alive; fixes looks only | Rejected |
| Radix Toast primitive | Heavier; still needs a custom state store | Rejected |

**Rationale**: Requested explicitly in this design brief. The approved proposal says "No sonner
migration" (§2 / §11). This design overrides that; the deviation is documented here for auditing.
Confirm before `sdd-apply` or amend the proposal. Cost: +~8kb gzipped.

---

### Decision 7: Skeleton via `animate-pulse`, no custom shimmer

**Choice**: `<div className={cn("animate-pulse rounded-md bg-muted", className)} />`.

**Rationale**: Tailwind ships `animate-pulse` (opacity keyframes). Shimmer requires a custom
keyframe + gradient per surface color. Extra CSS for a rarely-seen loading state is not worth it.

---

## Token Architecture — Exact `@theme` Block

The following is the authoritative token block for `src/app/globals.css`.
It REPLACES the current empty state of the file's token section. Keep the existing
`@import "tailwindcss"`, `@custom-variant dark`, `@layer base`, `scrollbar-hide`,
`fadeInDown`, and `animate-fadeInDown` — add the blocks below after `@custom-variant dark`.

```css
@theme {
  /* ── Backgrounds ── */
  --color-background:     hsl(30 20% 98%);
  --color-foreground:     hsl(24 10% 10%);
  --color-surface:        hsl(0 0% 100%);
  --color-surface-raised: hsl(30 15% 96%);
  --color-surface-sunken: hsl(30 15% 94%);

  /* ── Brand ── */
  --color-primary:            hsl(22 92% 50%);
  --color-primary-foreground: hsl(0 0% 100%);
  --color-primary-hover:      hsl(22 92% 45%);

  /* ── Secondary / Muted / Accent ── */
  --color-secondary:            hsl(30 10% 92%);
  --color-secondary-foreground: hsl(24 10% 15%);
  --color-muted:                hsl(30 10% 94%);
  --color-muted-foreground:     hsl(24 6% 45%);
  --color-accent:               hsl(22 92% 96%);
  --color-accent-foreground:    hsl(22 92% 30%);

  /* ── Borders / Controls ── */
  --color-border: hsl(30 10% 88%);
  --color-input:  hsl(30 10% 88%);
  --color-ring:   hsl(22 92% 50%);

  /* ── Semantic ── */
  --color-destructive:            hsl(0 84% 55%);
  --color-destructive-foreground: hsl(0 0% 100%);
  --color-success:                hsl(142 70% 40%);
  --color-warning:                hsl(35 92% 50%);
  --color-info:                   hsl(210 85% 50%);

  /* ── Radius ── */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
}

/* Dark overrides — integrates with @custom-variant dark (&:where(.dark, .dark *)) */
@variant dark {
  @theme {
    --color-background:     hsl(24 10% 8%);
    --color-foreground:     hsl(30 15% 96%);
    --color-surface:        hsl(24 10% 11%);
    --color-surface-raised: hsl(24 8% 15%);
    --color-surface-sunken: hsl(24 10% 6%);

    --color-primary:            hsl(22 92% 55%);
    --color-primary-foreground: hsl(0 0% 100%);
    --color-primary-hover:      hsl(22 92% 60%);

    --color-secondary:            hsl(24 8% 20%);
    --color-secondary-foreground: hsl(30 15% 90%);
    --color-muted:                hsl(24 8% 18%);
    --color-muted-foreground:     hsl(30 8% 65%);
    --color-accent:               hsl(22 40% 20%);
    --color-accent-foreground:    hsl(22 92% 80%);

    --color-border: hsl(24 8% 22%);
    --color-input:  hsl(24 8% 24%);
    --color-ring:   hsl(22 92% 55%);

    --color-destructive:            hsl(0 75% 55%);
    --color-destructive-foreground: hsl(0 0% 100%);
    --color-success:                hsl(142 65% 50%);
    --color-warning:                hsl(35 92% 58%);
    --color-info:                   hsl(210 85% 60%);
  }
}

/* Touch target utility */
@layer utilities {
  .touch-target {
    min-height: 2.75rem; /* 44px */
  }
}
```

**Compatibility notes:**
- `@variant dark { @theme { ... } }` is the v4 way to override tokens per variant. It works
  because `@custom-variant dark` is declared first and registers the selector context.
- `tailwind.config.ts`: remove `theme.extend.colors`. Keep only `content: ['./src/**/*.{js,ts,jsx,tsx,mdx}']`.
  The `darkMode: 'class'` key does nothing in v4 (dark is now a CSS-first variant) but is harmless;
  removing it is cleaner.
- Existing `bg-slate-*` classes in un-migrated files continue to work — Tailwind's built-in palette
  is not removed.

---

## Component Architecture

### File Structure

```
src/
  lib/
    utils.ts                          ← cn() helper
    constants/
      estado-orden.ts                 ← ESTADO_INFO shared map
  components/
    ui/
      Button.tsx
      Input.tsx
      Select.tsx
      Label.tsx
      Badge.tsx
      Card.tsx                        ← Card + CardHeader + CardBody + CardFooter
      Skeleton.tsx                    ← Skeleton + CardSkeleton + ListSkeleton
      EmptyState.tsx
      Toast.tsx                       ← DELETE (replaced by sonner)
      StatusBadge.tsx                 ← MODIFY (thin re-export → <Badge>)
      Modal.tsx                       ← MODIFY (slate → tokens)
      ConfirmDialog.tsx               ← MODIFY (use Button)
      ImageUpload.tsx                 ← NO CHANGE
    layouts/
      AppLayout.tsx                   ← NEW shared shell
    auth/
      LogoutButton.tsx                ← NO CHANGE
      ThemeToggle.tsx                 ← NO CHANGE
    admin/
      RoleSwitcher.tsx                ← NO CHANGE (consumed by AppLayout via slot)
```

### `src/lib/utils.ts`

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### `src/lib/constants/estado-orden.ts`

```ts
import type { LucideIcon } from 'lucide-react'
import type { BadgeVariant } from '@/components/ui/Badge'

export type EstadoOrden =
  | 'ABIERTA' | 'EN_PREPARACION' | 'LISTA'
  | 'EN_CAMINO' | 'ENTREGADA' | 'PAGADA' | 'CANCELADA'

export interface EstadoInfo {
  label: string
  variant: BadgeVariant
  icon?: LucideIcon
}

export const ESTADO_INFO: Record<EstadoOrden, EstadoInfo> = {
  ABIERTA:        { label: 'Abierta',        variant: 'info' },
  EN_PREPARACION: { label: 'En preparación', variant: 'warning' },
  LISTA:          { label: 'Lista',          variant: 'success' },
  EN_CAMINO:      { label: 'En camino',      variant: 'info' },
  ENTREGADA:      { label: 'Entregada',      variant: 'success' },
  PAGADA:         { label: 'Pagada',         variant: 'muted' },
  CANCELADA:      { label: 'Cancelada',      variant: 'destructive' },
}

// Extracted from cocina/page.tsx — eliminates duplicate
export function getNextEstado(estado: EstadoOrden): EstadoOrden | null {
  const flow: Partial<Record<EstadoOrden, EstadoOrden>> = {
    ABIERTA:        'EN_PREPARACION',
    EN_PREPARACION: 'LISTA',
    LISTA:          'EN_CAMINO',
    EN_CAMINO:      'ENTREGADA',
  }
  return flow[estado] ?? null
}
```

### `Button.tsx` — Full Props Interface + Exact Class Recipes

```ts
type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary' | 'link'
type ButtonSize    = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant  // default: 'default'
  size?: ButtonSize         // default: 'md'
}

const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-md transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background ' +
  'disabled:opacity-50 disabled:pointer-events-none'

const variants: Record<ButtonVariant, string> = {
  default:     'bg-primary text-primary-foreground hover:bg-primary-hover',
  outline:     'border border-input bg-transparent text-foreground hover:bg-surface-raised',
  ghost:       'bg-transparent text-foreground hover:bg-surface-raised',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  secondary:   'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  link:        'bg-transparent text-primary underline-offset-4 hover:underline p-0 h-auto',
}

const sizes: Record<ButtonSize, string> = {
  sm:   'h-8 px-3 text-sm',
  md:   'h-9 px-4 text-sm',   // DEFAULT — was py-3 (~48px); now 36px
  lg:   'h-10 px-5 text-base',
  icon: 'h-9 w-9',
}
```

Hierarchy rule: at most ONE `variant="default"` button per screen. Everything else `outline` /
`ghost` / `secondary`.

### `Input.tsx` — Class Recipe

```ts
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-surface-sunken px-3 py-1 text-sm ' +
  'text-foreground placeholder:text-muted-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'
```

### `Select.tsx` — Class Recipe + Structure

```tsx
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string   // optional — renders <Label> above
}

// Render:
<div className="relative">
  <select
    className={cn(
      'flex h-9 w-full appearance-none rounded-md border border-input bg-surface-sunken ' +
      'pl-3 pr-8 text-sm text-foreground ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
      'disabled:opacity-50',
      className
    )}
    {...props}
  />
  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
</div>
```

### `Badge.tsx` — Variant Map + Estado Mapping

```ts
export type BadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'info' | 'muted'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant  // default: 'default'
}

const base = 'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium'

const variants: Record<BadgeVariant, string> = {
  default:     'bg-secondary text-secondary-foreground',
  success:     'bg-success/15 text-success',
  warning:     'bg-warning/15 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
  info:        'bg-info/15 text-info',
  muted:       'bg-muted text-muted-foreground',
}
```

Estado → Badge variant mapping (via `ESTADO_INFO`):

| EstadoOrden     | BadgeVariant  |
|-----------------|---------------|
| ABIERTA         | `info`        |
| EN_PREPARACION  | `warning`     |
| LISTA           | `success`     |
| EN_CAMINO       | `info`        |
| ENTREGADA       | `success`     |
| PAGADA          | `muted`       |
| CANCELADA       | `destructive` |

### `Skeleton.tsx`

```ts
// Skeleton — base
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}

// CardSkeleton — composed
function CardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  )
}

// ListSkeleton — N rows
function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full rounded-md" />
      ))}
    </div>
  )
}
```

### `EmptyState.tsx`

```ts
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode   // typically <Button variant="default">
}
// Layout: flex-col items-center gap-3 py-16 text-center
// Icon: h-10 w-10 text-muted-foreground
// title: text-base font-semibold text-foreground
// description: text-sm text-muted-foreground
```

---

## AppLayout Architecture

### Props Interface

```ts
interface AppNavItem {
  href: string
  icon: LucideIcon
  label: string
  exact?: boolean
}

interface AppLayoutProps {
  panelLabel: string              // "Administrador" | "Mesero" | "SuperAdmin"
  panelKicker?: string            // "Panel" (default) | "Vista"
  navItems: AppNavItem[]
  sidebarFooter?: React.ReactNode // RoleSwitcher (admin), "Volver al panel" link (mesero)
  mobileNavExtra?: React.ReactNode// RoleSwitcher bottom-nav variant (admin only)
  children: React.ReactNode
}
```

`AppLayout` is `'use client'`. It calls `usePathname()` for active state computation. `LogoutButton`
and `ThemeToggle` are always rendered in fixed positions — they are universal to all roles using
this layout.

### Sidebar tokens (replacing current slate/role-color hardcodes)

```
bg-surface border-r border-border       ← sidebar panel
bg-primary text-primary-foreground      ← active nav link (was role-specific color)
text-muted-foreground hover:bg-surface-raised hover:text-foreground  ← inactive link
rounded-md                              ← link shape (was rounded-xl)
```

### MeseroProvider preservation

`MeseroProvider` wraps `AppLayout` from OUTSIDE, in `mesero/layout.tsx`:

```tsx
// src/app/mesero/layout.tsx
export default function MeseroLayout({ children }: { children: React.ReactNode }) {
  return (
    <MeseroProvider>
      <AppLayout panelLabel="Mesero" panelKicker="Vista" navItems={meseroNav}>
        {children}
      </AppLayout>
    </MeseroProvider>
  )
}
```

`AppLayout` receives and renders `children` — `MeseroProvider` context is available to all
descendants without `AppLayout` knowing about it.

### RoleSwitcher integration (admin only)

```tsx
// src/app/admin/layout.tsx
import RoleSwitcher from '@/components/admin/RoleSwitcher'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout
      panelLabel="Administrador"
      navItems={adminNav}
      sidebarFooter={<RoleSwitcher variant="sidebar" />}
      mobileNavExtra={<RoleSwitcher variant="bottom-nav" />}
    >
      {children}
    </AppLayout>
  )
}
```

`AppLayout` renders `sidebarFooter` above `LogoutButton`/`ThemeToggle` in sidebar.
`mobileNavExtra` renders after the nav links in the mobile bottom bar.

### Cocina (no sidebar) — handled WITHOUT AppLayout

Cocina has no layout.tsx. Its header is inline in `page.tsx`. Migration plan:

1. Restyle header `<div>` from `bg-white dark:bg-slate-800 border-b border-slate-200` to
   `bg-surface border-b border-border`.
2. Replace `ESTADO_COLOR` map + raw `className` with `<Badge variant={ESTADO_INFO[e].variant}>`.
3. Replace `<Toast />` + `setToast` state with `toast.success()` / `toast.error()`.
4. Title classes: `text-2xl font-semibold text-foreground` (remove `font-extrabold`).

No `AppLayout` involvement. If cocina ever needs a sidebar (future change), create a dedicated
`cocina/layout.tsx` at that time.

---

## Sonner Migration

### Mount point

```tsx
// src/app/layout.tsx
import { Toaster } from 'sonner'

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AuthProvider>
            {children}
          </AuthProvider>
          <Toaster
            richColors
            position="top-center"
            toastOptions={{
              classNames: {
                toast: 'rounded-md border border-border bg-surface text-foreground shadow-md',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
```

Note: `body` classes change from `bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100`
to `bg-background text-foreground` (token-driven).

### Replacing existing toast patterns

Every page currently uses one of these two patterns:

```ts
// Pattern A — state + render (most common, ~10 pages)
const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
// ... in JSX:
{toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

// Pattern B — cocina (same)
const [toastState, setToastState] = useState<ToastState | null>(null)
```

Migration: remove the `useState`, remove the JSX render, replace all `setToast({...})` calls with:

```ts
import { toast } from 'sonner'
toast.success('Orden creada')
toast.error(err.friendlyMessage ?? 'Error inesperado')
```

`Toast.tsx` is deleted after all imports are removed. `ImageUpload.tsx` does not use Toast —
no change needed.

---

## Data Flow

```
ThemeProvider (class="dark" on <html>)
    │
    └─→ @custom-variant dark (&:where(.dark, .dark *))
            │
            └─→ @variant dark { @theme { --color-*: ... } }  ← tokens switch

User action ─┐
             ├─→ toast.success("...")  ─→ <Toaster /> (root layout)
             │
             ├─→ <Button variant="default">
             │       └─ variants[v] + sizes[s] → cn() → merged className
             │
             └─→ <Badge variant={ESTADO_INFO[estado].variant}>
                         └── ESTADO_INFO  (src/lib/constants/estado-orden.ts)
                                 └── single source of truth for cocina + mesero

AppLayout ──┐
            ├─→ sidebar (desktop): bg-surface, border-border, active=bg-primary
            ├─→ main: flex-1 md:ml-60
            └─→ bottom-nav (mobile): bg-surface, border-t border-border
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/app/globals.css` | Modify | Add `@theme {}` (light) + `@variant dark { @theme {} }` (dark) + `.touch-target` utility. Keep existing `@custom-variant dark`, `@layer base`, `scrollbar-hide`, `fadeInDown`. |
| `tailwind.config.ts` | Modify | Remove `theme.extend.colors`. Keep `content` only. |
| `package.json` | Modify | Add `clsx`, `tailwind-merge`, `sonner`. |
| `src/lib/utils.ts` | Create | `cn()` helper. |
| `src/lib/constants/estado-orden.ts` | Create | `EstadoOrden` type, `ESTADO_INFO`, `getNextEstado()`. |
| `src/components/ui/Button.tsx` | Create | Variants × sizes via lookup maps. |
| `src/components/ui/Input.tsx` | Create | Styled `<input>` wrapper. |
| `src/components/ui/Select.tsx` | Create | Native `<select>` + absolute ChevronDown. |
| `src/components/ui/Label.tsx` | Create | `<label>` with `text-sm font-medium text-foreground`. |
| `src/components/ui/Badge.tsx` | Create | 6 variants via lookup map. |
| `src/components/ui/Card.tsx` | Create | `Card`, `CardHeader`, `CardBody`, `CardFooter`. |
| `src/components/ui/Skeleton.tsx` | Create | `Skeleton`, `CardSkeleton`, `ListSkeleton`. |
| `src/components/ui/EmptyState.tsx` | Create | `{ icon, title, description?, action? }`. |
| `src/components/layouts/AppLayout.tsx` | Create | Shared sidebar + main + mobile-nav shell. |
| `src/app/layout.tsx` | Modify | Add `<Toaster />` (sonner); change body classes to tokens. |
| `src/app/admin/layout.tsx` | Modify | Collapse to `<AppLayout>` call with `sidebarFooter`/`mobileNavExtra`. |
| `src/app/mesero/layout.tsx` | Modify | `<MeseroProvider>` wraps `<AppLayout>`. |
| `src/app/superadmin/layout.tsx` | Modify | Collapse to `<AppLayout>` call. |
| `src/app/cocina/page.tsx` | Modify | Header token classes; import `ESTADO_INFO`; `<Badge>`; sonner. NOT ported to AppLayout. |
| `src/app/(auth)/login/page.tsx` | Modify | `<Input>`, `<Label>`, `<Button>`; token classes; brand primary. |
| `src/app/admin/ingredientes/page.tsx` | Modify | Button/Input/Card/EmptyState + sonner. |
| `src/app/admin/productos/page.tsx` | Modify | Button/Input/Card/EmptyState + sonner. |
| `src/app/admin/usuarios/page.tsx` | Modify | Button/Input/Select/Card + sonner. |
| `src/app/admin/mesas/page.tsx` | Modify | Token classes + sonner. |
| `src/app/mesero/page.tsx` | Modify | Token classes + sonner (if Toast is present). |
| `src/app/mesero/ordenes/page.tsx` | Modify | Button/Badge/Card + shared `ESTADO_INFO` + sonner. |
| `src/app/superadmin/page.tsx` | Modify | Card/EmptyState + sonner. |
| `src/app/superadmin/tenants/new/page.tsx` | Modify | Input/Select/Label/Button + sonner. |
| `src/app/superadmin/tenants/[slug]/page.tsx` | Modify | Card/Button/Badge + sonner. |
| `src/components/ui/Modal.tsx` | Modify | Replace `slate-*` classes with tokens. |
| `src/components/ui/ConfirmDialog.tsx` | Modify | Use `<Button>` primitive. |
| `src/components/ui/StatusBadge.tsx` | Modify | Thin re-export: map `estado` → `<Badge variant={ESTADO_INFO[estado].variant}>`. |
| `src/components/ui/Toast.tsx` | Delete | Replaced by sonner. Delete after grep confirms zero imports. |

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Build | `tsc --noEmit` + `next build` pass | Run after each phase step. |
| Visual | No `bg-slate-` / `bg-orange-` / `bg-sky-` / `bg-indigo-` / `bg-emerald-` in migrated pages | `rg "bg-(slate|orange|sky|indigo|emerald)-" src/app/` before/after. |
| Functional | Toast shows and auto-dismisses per role scenario | Manual smoke: login → create/advance order → confirm sonner toast. |
| Keyboard | `focus-visible:ring` visible on Tab through login + one admin form | Manual keyboard test. |

No test runner is configured — Standard Mode per `openspec/config.yaml`. Quality gates:
`next lint` + `tsc --noEmit` + `next build`.

---

## Migration Order

Each step MUST leave the app in a runnable state. No broken intermediate commits.

| Step | Work | Commit scope |
|------|------|--------------|
| 1 | Install `clsx`, `tailwind-merge`, `sonner`. Write `@theme` block. Strip `tailwind.config.ts`. Create `src/lib/utils.ts`. | 1 commit — verify `next build` passes. |
| 2 | Create `src/lib/constants/estado-orden.ts`. No consumers yet. | 1 commit — additive only. |
| 3 | Create all 8 UI primitives (`Button` → `EmptyState`). No consumers yet. | 1 commit per primitive, or batch. |
| 4 | Create `AppLayout`. Mount `<Toaster />` in root `layout.tsx`. Change body classes. | 1 commit — verify all pages still render. |
| 5 | Login page — swap to `<Input>`, `<Label>`, `<Button>`. | 1 commit — lowest risk first page. |
| 6 | Admin layout — collapse to `AppLayout`. | 1 commit. |
| 7 | Mesero layout — `MeseroProvider` + `AppLayout`. | 1 commit. |
| 8 | SuperAdmin layout — `AppLayout`. | 1 commit. |
| 9 | Cocina page — header tokens, `ESTADO_INFO`, `<Badge>`, sonner. | 1 commit. |
| 10 | Feature pages (one commit each): `admin/ingredientes`, `admin/productos`, `admin/usuarios`, `admin/mesas`, `mesero/page`, `mesero/ordenes`, `superadmin/page`, `superadmin/tenants/new`, `superadmin/tenants/[slug]`. | 9 commits. |
| 11 | Cleanup: update `Modal`, `ConfirmDialog`, `StatusBadge`. Delete `Toast.tsx` after `rg "Toast" src/` returns zero hits. | 1–2 commits. |

Rollback per commit is trivial (`git revert`). Each page migration is self-contained.

---

## Open Questions

- [ ] **Sonner scope deviation** — proposal §11 explicitly excludes sonner. This design includes it
  per the design brief request. Confirm with stakeholder before `sdd-apply` or amend proposal.
- [ ] **`tailwind.config.ts` — delete vs. keep minimal** — v4 does not need it at all. Lean toward
  keeping with `content` only for editor plugin compatibility. Decision can be deferred to apply.
- [ ] **`@variant dark { @theme { ... } }` v4 availability** — verify this syntax is available in
  `tailwindcss@^4.2.2`. If not, fallback is a CSS layer override with the `dark` class selector
  scoped to `@custom-variant dark`.
- [ ] **RoleSwitcher mobile variant in AppLayout** — confirm `mobileNavExtra` slot renders correctly
  after the nav links (same DOM position as current `<RoleSwitcher variant="bottom-nav" />`).
