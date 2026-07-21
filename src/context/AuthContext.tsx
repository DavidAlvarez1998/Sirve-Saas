'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import api from '@/lib/api/axios'
import { resolveTenantSlug } from '@/lib/tenant'
import { setAuthCookie, clearAuthCookie } from '@/lib/auth-cookie'
import type { AuthSession, UserRole, LoginResponse } from '@/types'

interface AuthContextValue {
  user: string | null
  token: string | null
  roles: UserRole[]
  tenantSlug: string | null
  tenantMissing: boolean
  isAuthenticated: boolean
  hasRole: (r: string) => boolean
  login: (username: string, password: string) => Promise<AuthSession>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = 'restaurant_auth'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthSession | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as AuthSession) : null
    } catch {
      return null
    }
  })

  // Tenant derived exclusively from the URL — single source of truth (ADR-7)
  const tenantSlug = useMemo(
    () =>
      typeof window !== 'undefined'
        ? resolveTenantSlug(window.location.hostname)
        : null,
    []
  )
  const tenantMissing = tenantSlug === null

  const login = useCallback(async (username: string, password: string): Promise<AuthSession> => {
    const { data } = await api.post<LoginResponse>('/auth/login', { username, password })
    // SUPERADMIN has tenantId null in JWT — normalize to '__master__'
    const session: AuthSession = {
      token: data.token,
      username: data.username,
      roles: data.roles,
      tenantId: data.tenantId ?? '__master__',
    }
    // 1. localStorage — for Axios interceptor
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    // 2. Cookie — for middleware edge check
    setAuthCookie(session)
    setAuth(session)
    return session
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    clearAuthCookie()
    setAuth(null)
    window.location.replace('/login')
  }, [])

  // BFCache: when browser restores page from cache, re-validate localStorage
  // so a logged-out session doesn't reappear on back navigation.
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted && !localStorage.getItem(STORAGE_KEY)) {
        setAuth(null)
      }
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  const value = useMemo(
    () => ({
      user: auth?.username ?? null,
      token: auth?.token ?? null,
      roles: (auth?.roles ?? []) as UserRole[],
      tenantSlug,
      tenantMissing,
      isAuthenticated: !!auth?.token,
      hasRole: (r: string) => (auth?.roles ?? []).includes(r as UserRole),
      login,
      logout,
    }),
    [auth, tenantSlug, tenantMissing, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
