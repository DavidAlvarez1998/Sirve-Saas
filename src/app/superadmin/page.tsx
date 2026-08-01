'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  CheckCircle,
  XCircle,
  Link as LinkIcon,
  Copy,
  Check,
  Users,
} from 'lucide-react'
import { getTenants, desactivarTenant } from '@/lib/api/tenants'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { toast } from 'sonner'
import type { Tenant } from '@/types'

interface ConfirmState {
  id: number
  slug: string
}

export default function TenantListPage() {
  const router = useRouter()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const copyUrl = (id: number, url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const load = useCallback(() => {
    setLoading(true)
    getTenants()
      .then(setTenants)
      .catch(() => toast.error('Error al cargar restaurantes'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleDesactivar = async (id: number, slug: string) => {
    try {
      await desactivarTenant(id)
      toast.success(`Restaurante "${slug}" desactivado`)
      load()
    } catch (e) {
      const err = e as { friendlyMessage?: string }
      toast.error(err.friendlyMessage ?? 'Error al desactivar')
    } finally {
      setConfirm(null)
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-8">
        <Building2 size={28} className="text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Restaurantes
          </h1>
          <p className="text-muted-foreground text-sm">
            Restaurantes registrados en la plataforma
          </p>
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={5} />
      ) : tenants.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No hay restaurantes registrados"
          description="Creá el primer restaurante en la plataforma."
          action={
            <Button onClick={() => router.push('/superadmin/tenants/new')} size="sm">
              Nuevo restaurante
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm text-muted-foreground">
            <thead className="bg-surface text-muted-foreground uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4 text-left">Slug</th>
                <th className="px-6 py-4 text-left">Nombre</th>
                <th className="px-6 py-4 text-left">Estado</th>
                <th className="px-6 py-4 text-left">Setup pendiente</th>
                <th className="px-6 py-4 text-left">Creado</th>
                <th className="px-6 py-4 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tenants.map((t) => (
                <tr
                  key={t.id}
                  className="bg-background hover:bg-surface-raised transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 font-mono text-primary">
                    {t.slug}
                  </td>
                  <td className="px-6 py-4 font-medium text-foreground">
                    {t.nombre}
                  </td>
                  <td className="px-6 py-4">
                    {t.activo ? (
                      <Badge variant="success">
                        <CheckCircle size={12} /> Activo
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <XCircle size={12} /> Inactivo
                      </Badge>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {t.setupUrl ? (
                      <div className="flex items-center gap-2 max-w-xs">
                        <LinkIcon
                          size={13}
                          className="shrink-0 text-warning"
                        />
                        <span
                          className="text-warning text-xs truncate flex-1"
                          title={t.setupUrl}
                        >
                          {t.setupUrl}
                        </span>
                        <button
                          onClick={() => copyUrl(t.id, t.setupUrl!)}
                          className="shrink-0 p-1 rounded hover:bg-surface-raised text-muted-foreground hover:text-foreground transition-colors"
                          title="Copiar enlace"
                        >
                          {copiedId === t.id ? (
                            <Check size={13} className="text-success" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {t.createdAt
                      ? new Date(t.createdAt).toLocaleDateString('es-AR')
                      : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/superadmin/tenants/${t.slug}`)}
                        title="Ver usuarios del restaurante"
                      >
                        <Users size={13} /> Ver detalle
                      </Button>
                      {t.activo && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setConfirm({ id: t.id, slug: t.slug })}
                        >
                          Desactivar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          open
          title="Desactivar restaurante"
          message={`¿Seguro que querés desactivar "${confirm.slug}"? Los usuarios de ese restaurante no podrán acceder.`}
          onConfirm={() => handleDesactivar(confirm.id, confirm.slug)}
          onCancel={() => setConfirm(null)}
        />
      )}

    </div>
  )
}
