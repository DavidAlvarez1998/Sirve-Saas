import type { AuthSession } from '@/types'

const COOKIE_NAME = 'sirve_session'

/**
 * Writes the auth session to the sirve_session cookie.
 * Browser-only — guards with typeof window check.
 */
export function setAuthCookie(session: AuthSession): void {
  if (typeof window === 'undefined') return
  const encoded = encodeURIComponent(JSON.stringify(session))
  document.cookie = `${COOKIE_NAME}=${encoded}; SameSite=Lax; Path=/; Max-Age=86400`
}

/**
 * Clears the sirve_session cookie.
 * Browser-only — guards with typeof window check.
 */
export function clearAuthCookie(): void {
  if (typeof window === 'undefined') return
  document.cookie = `${COOKIE_NAME}=; SameSite=Lax; Path=/; Max-Age=0`
}

/**
 * Reads and parses the sirve_session cookie.
 * Returns null if not present or invalid JSON.
 * Browser-only — guards with typeof window check.
 */
export function readAuthCookie(): AuthSession | null {
  if (typeof window === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`))
  if (!match) return null
  try {
    return JSON.parse(decodeURIComponent(match[1])) as AuthSession
  } catch {
    return null
  }
}
