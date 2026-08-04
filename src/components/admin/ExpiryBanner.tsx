'use client'
import { useEffect, useState } from 'react'
import type { TenantExpiryState } from '@/types'
import { getMyTenantExpiry } from '@/lib/api/tenants'

const STORAGE_KEY = 'sirve_auth'

function getTenantSlugFromStorage(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { tenantId?: string }
    return parsed.tenantId ?? ''
  } catch {
    return ''
  }
}

export default function ExpiryBanner() {
  const [expiry, setExpiry] = useState<TenantExpiryState | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const tenantSlug = getTenantSlugFromStorage()
    const dismissKey = `sirve_banner_dismissed_${tenantSlug}`
    if (localStorage.getItem(dismissKey)) {
      setDismissed(true)
      return
    }
    getMyTenantExpiry()
      .then(data => setExpiry(data))
      .catch(() => {})
  }, [])

  const dismiss = () => {
    const tenantSlug = getTenantSlugFromStorage()
    const dismissKey = `sirve_banner_dismissed_${tenantSlug}`
    localStorage.setItem(dismissKey, '1')
    setDismissed(true)
  }

  if (dismissed || !expiry) return null
  if (!expiry.vencida && (expiry.diasRestantes === null || expiry.diasRestantes > 5)) return null

  const isExpired = expiry.vencida

  return (
    <div
      className={`flex items-center justify-between px-4 py-2.5 text-sm font-medium ${
        isExpired
          ? 'bg-destructive/15 text-destructive border-b border-destructive/30'
          : 'bg-warning/15 text-warning border-b border-warning/30'
      }`}
    >
      <span>
        {isExpired
          ? 'Tu suscripción ha vencido. La creación de órdenes está bloqueada.'
          : `Tu suscripción vence en ${expiry.diasRestantes} día${expiry.diasRestantes === 1 ? '' : 's'}. Contactá al administrador.`}
      </span>
      <button
        onClick={dismiss}
        className="ml-4 text-xs opacity-70 hover:opacity-100 transition-opacity"
        aria-label="Cerrar aviso"
      >
        Cerrar
      </button>
    </div>
  )
}
