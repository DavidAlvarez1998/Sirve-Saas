'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../context/AuthContext'
import { resolveTenantSlug } from '../../../lib/tenant'

// ─── Dev-prefs helpers ────────────────────────────────────────────────────────

const DEV_PREFS_KEY = 'sirve_dev'
const DEV_PREFS_CAP = 5
const DEFAULT_TENANT = '__master__'

interface DevPrefs {
  lastTenant: string
  recentTenants: string[]
}

function readDevPrefs(): DevPrefs {
  try {
    const raw = localStorage.getItem(DEV_PREFS_KEY)
    if (!raw) return { lastTenant: DEFAULT_TENANT, recentTenants: [] }
    const parsed = JSON.parse(raw) as Partial<DevPrefs>
    const lastTenant =
      typeof parsed.lastTenant === 'string' && parsed.lastTenant
        ? parsed.lastTenant
        : DEFAULT_TENANT
    const recentTenants = Array.isArray(parsed.recentTenants)
      ? parsed.recentTenants
          .filter((t): t is string => typeof t === 'string' && t.length > 0)
          .slice(0, DEV_PREFS_CAP)
      : []
    return { lastTenant, recentTenants }
  } catch {
    return { lastTenant: DEFAULT_TENANT, recentTenants: [] }
  }
}

function writeDevPrefs(tenant: string, prevRecent: string[]): string[] {
  if (typeof tenant !== 'string' || !tenant) return prevRecent
  try {
    const deduped = [tenant, ...prevRecent.filter((t) => t !== tenant)].slice(0, DEV_PREFS_CAP)
    localStorage.setItem(
      DEV_PREFS_KEY,
      JSON.stringify({ lastTenant: tenant, recentTenants: deduped })
    )
    return deduped
  } catch {
    return prevRecent
  }
}

// ─── Dev shortcuts ────────────────────────────────────────────────────────────

interface DevShortcut {
  label: string
  username: string
  password: string
  tenant: string
}

function parseShortcuts(): DevShortcut[] {
  const raw = process.env.NEXT_PUBLIC_DEV_SHORTCUTS
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      console.warn('[dev-shortcuts] NEXT_PUBLIC_DEV_SHORTCUTS is not an array; ignoring')
      return []
    }
    return (parsed as Partial<DevShortcut>[]).filter((s): s is DevShortcut => {
      const ok =
        s != null &&
        typeof s.label === 'string' && s.label.length > 0 &&
        typeof s.username === 'string' && s.username.length > 0 &&
        typeof s.password === 'string' &&
        typeof s.tenant === 'string' && s.tenant.length > 0
      if (!ok) console.warn('[dev-shortcuts] dropping invalid entry', s)
      return ok
    })
  } catch (err) {
    console.warn('[dev-shortcuts] failed to parse NEXT_PUBLIC_DEV_SHORTCUTS:', (err as Error).message)
    return []
  }
}

const SHORTCUTS = parseShortcuts()

// ─── Role redirects ───────────────────────────────────────────────────────────

const ROLE_REDIRECTS = [
  { role: 'SUPERADMIN', path: '/superadmin' },
  { role: 'ADMIN',      path: '/admin' },
  { role: 'MESERO',     path: '/mesero' },
  { role: 'COCINA',     path: '/cocina' },
] as const

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { login, tenantMissing } = useAuth()
  const router = useRouter()

  // Detect dev environment
  const [isLocalhost, setIsLocalhost] = useState(false)
  const [devTenant, setDevTenant] = useState(DEFAULT_TENANT)
  const [recentTenants, setRecentTenants] = useState<string[]>([])

  useEffect(() => {
    const hostname = window.location.hostname
    const local = hostname === 'localhost' || hostname === '127.0.0.1'
    setIsLocalhost(local)
    if (local) {
      const prefs = readDevPrefs()
      setDevTenant(prefs.lastTenant)
      setRecentTenants(prefs.recentTenants)
    }
  }, [])

  const showShortcuts =
    isLocalhost &&
    process.env.NODE_ENV === 'development' &&
    Boolean(process.env.NEXT_PUBLIC_DEV_SHORTCUTS) &&
    SHORTCUTS.length > 0

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const formRef = useRef<HTMLFormElement>(null)

  const tenantSlug =
    typeof window !== 'undefined'
      ? resolveTenantSlug(window.location.hostname)
      : null

  // If tenant is missing (bare localhost without slug), show error screen
  if (tenantMissing && !isLocalhost) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-md p-8 w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Sirve</h1>
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            No se pudo determinar el local desde la URL. Accedé usando el subdominio de tu local.
          </p>
        </div>
      </div>
    )
  }

  const handleShortcutClick = (shortcut: DevShortcut) => {
    if (loading) return
    setUsername(shortcut.username)
    setPassword(shortcut.password)
    setDevTenant(shortcut.tenant)
    setTimeout(() => {
      formRef.current?.requestSubmit()
    }, 0)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // On bare localhost, use the devTenant; otherwise tenant comes from the subdomain via AuthContext
      const effectiveTenant = isLocalhost ? devTenant : (tenantSlug ?? undefined)
      const session = await login(username, password)

      if (isLocalhost && effectiveTenant) {
        const newRecent = writeDevPrefs(effectiveTenant, recentTenants)
        setRecentTenants(newRecent)
      }

      const roles = session.roles ?? []
      const redirect = ROLE_REDIRECTS.find((r) => roles.includes(r.role))
      router.replace(redirect ? redirect.path : '/login')
    } catch (err) {
      const apiErr = err as { friendlyMessage?: string }
      setError(apiErr.friendlyMessage ?? 'Credenciales inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-md p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 text-center">
          Sirve
        </h1>

        {showShortcuts && (
          <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-700 pb-3">
            <span className="w-full text-xs uppercase tracking-wide text-slate-400">
              Dev shortcuts
            </span>
            {SHORTCUTS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => handleShortcutClick(s)}
                disabled={loading}
                className="rounded-full bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600 disabled:opacity-50 transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
              Correo electrónico
            </label>
            <input
              id="username"
              name="username"
              type="text"
              inputMode="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
