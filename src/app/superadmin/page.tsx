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
import Toast from '@/components/ui/Toast'
import type { Tenant } from '@/types'

interface ToastState {
  msg: string
  type: 'success' | 'error'
}

interface ConfirmState {
  id: number
  slug: string
}

export default function TenantListPage() {
  const router = useRouter()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
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
      .catch(() =>
        setToast({ msg: 'Error al cargar restaurantes', type: 'error' })
      )
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleDesactivar = async (id: number, slug: string) => {
    try {
      await desactivarTenant(id)
      setToast({ msg: `Restaurante "${slug}" desactivado`, type: 'success' })
      load()
    } catch (e) {
      const err = e as { friendlyMessage?: string }
      setToast({
        msg: err.friendlyMessage ?? 'Error al desactivar',
        type: 'error',
      })
    } finally {
      setConfirm(null)
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-8">
        <Building2 size={28} className="text-indigo-400" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Restaurantes
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Restaurantes registrados en la plataforma
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500 dark:text-slate-400 text-center py-12">
          Cargando...
        </p>
      ) : tenants.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400 text-center py-12">
          No hay restaurantes registrados.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4 text-left">Slug</th>
                <th className="px-6 py-4 text-left">Nombre</th>
                <th className="px-6 py-4 text-left">Estado</th>
                <th className="px-6 py-4 text-left">Setup pendiente</th>
                <th className="px-6 py-4 text-left">Creado</th>
                <th className="px-6 py-4 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {tenants.map((t) => (
                <tr
                  key={t.id}
                  className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <td className="px-6 py-4 font-mono text-indigo-300">
                    {t.slug}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                    {t.nombre}
                  </td>
                  <td className="px-6 py-4">
                    {t.activo ? (
                      <span className="flex items-center gap-1 text-green-400">
                        <CheckCircle size={14} /> Activo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-400">
                        <XCircle size={14} /> Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {t.setupUrl ? (
                      <div className="flex items-center gap-2 max-w-xs">
                        <LinkIcon
                          size={13}
                          className="shrink-0 text-amber-400"
                        />
                        <span
                          className="text-amber-300 text-xs truncate flex-1"
                          title={t.setupUrl}
                        >
                          {t.setupUrl}
                        </span>
                        <button
                          onClick={() => copyUrl(t.id, t.setupUrl!)}
                          className="shrink-0 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                          title="Copiar enlace"
                        >
                          {copiedId === t.id ? (
                            <Check size={13} className="text-green-400" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600 text-xs">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                    {t.createdAt
                      ? new Date(t.createdAt).toLocaleDateString('es-AR')
                      : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          router.push(`/superadmin/tenants/${t.slug}`)
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 text-xs font-medium transition"
                        title="Ver usuarios del restaurante"
                      >
                        <Users size={13} /> Ver detalle
                      </button>
                      {t.activo && (
                        <button
                          onClick={() =>
                            setConfirm({ id: t.id, slug: t.slug })
                          }
                          className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition"
                        >
                          Desactivar
                        </button>
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

      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
