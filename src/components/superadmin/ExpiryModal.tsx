'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { updateTenantExpiry } from '@/lib/api/tenants'
import type { Tenant } from '@/types'

interface ExpiryModalProps {
  tenant: Tenant
  open: boolean
  onClose: () => void
  onSuccess: (updated: Tenant) => void
}

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  // YYYY-MM-DD from ISO string
  return iso.slice(0, 10)
}

export default function ExpiryModal({ tenant, open, onClose, onSuccess }: ExpiryModalProps) {
  const [editDate, setEditDate] = useState<string>(() => isoToDateInput(tenant.fechaVencimiento))
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const handleSave = async () => {
    if (!editDate) return
    setSaving(true)
    try {
      // Transform YYYY-MM-DD to end-of-day UTC so SUPERADMIN thinks in "ends on date X"
      const iso = `${editDate}T23:59:59.999Z`
      const updated = await updateTenantExpiry(tenant.slug, iso)
      onSuccess(updated)
      onClose()
    } catch (e) {
      const err = e as { friendlyMessage?: string }
      toast.error(err.friendlyMessage ?? 'Error al actualizar vencimiento')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    try {
      const updated = await updateTenantExpiry(tenant.slug, null)
      onSuccess(updated)
      onClose()
    } catch (e) {
      const err = e as { friendlyMessage?: string }
      toast.error(err.friendlyMessage ?? 'Error al quitar vencimiento')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-2xl shadow-lg p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-foreground mb-1">
          Editar vencimiento
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {tenant.nombre} ({tenant.slug})
        </p>

        <label className="block text-sm font-medium text-foreground mb-1">
          Fecha de vencimiento
        </label>
        <input
          type="date"
          value={editDate}
          onChange={e => setEditDate(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary mb-4"
          disabled={saving}
        />

        <div className="flex items-center gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={saving}
          >
            Quitar vencimiento
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !editDate}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
