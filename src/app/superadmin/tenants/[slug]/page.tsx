'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Users, Pencil, ArrowLeft, CheckCircle, XCircle } from 'lucide-react'
import { getTenantUsuarios, updateTenantUsuario } from '@/lib/api/tenants'
import Modal from '@/components/ui/Modal'
import Toast from '@/components/ui/Toast'
import type { Usuario, UserRole, UpdateUsuarioData } from '@/types'

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLES_DISPONIBLES: UserRole[] = ['ADMIN', 'MESERO', 'COCINA']

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormState {
  username: string
  email: string
  password: string
  roles: UserRole[]
  activo: boolean
}

interface FormErrors {
  username?: string
  password?: string
  roles?: string
}

interface ToastState {
  msg: string
  type: 'success' | 'error'
}

const emptyForm: FormState = {
  username: '',
  email: '',
  password: '',
  roles: [],
  activo: true,
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TenantDetailPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const router = useRouter()

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<Usuario | null>(null)

  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)

  const [toast, setToast] = useState<ToastState | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    getTenantUsuarios(slug)
      .then(setUsuarios)
      .catch(() =>
        setToast({
          msg: 'Error al cargar usuarios del restaurante',
          type: 'error',
        })
      )
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  const openEdit = (u: Usuario) => {
    setEditingUser(u)
    setForm({
      username: u.username ?? '',
      email: u.email ?? '',
      password: '',
      roles: Array.isArray(u.roles) ? [...u.roles] : [],
      activo: u.activo,
    })
    setErrors({})
    setModalOpen(true)
  }

  const handleRolToggle = (rol: UserRole) => {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(rol)
        ? f.roles.filter((r) => r !== rol)
        : [...f.roles, rol],
    }))
  }

  const validate = (): FormErrors => {
    const e: FormErrors = {}
    if (!form.username || !form.username.trim()) e.username = 'Requerido'
    if (form.roles.length === 0) e.roles = 'Seleccioná al menos un rol'
    if (form.password && form.password.length < 6)
      e.password = 'Mínimo 6 caracteres'
    return e
  }

  const handleSave = async () => {
    const errs = validate()
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
    if (!editingUser) return

    setSaving(true)
    try {
      const payload: UpdateUsuarioData = {
        username: form.username,
        email: form.email || null,
        roles: form.roles,
        activo: form.activo,
      }
      // Only send password if user typed something
      if (form.password) payload.password = form.password

      await updateTenantUsuario(slug, editingUser.id, payload)
      setToast({ msg: 'Usuario actualizado', type: 'success' })
      setModalOpen(false)
      load()
    } catch (e) {
      const err = e as { friendlyMessage?: string }
      setToast({
        msg: err.friendlyMessage ?? 'Error al guardar usuario',
        type: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => router.push('/superadmin')}
          className="p-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 transition"
          title="Volver a restaurantes"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-3">
          <Users size={28} className="text-indigo-400" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Usuarios —{' '}
              <span className="font-mono text-indigo-400">{slug}</span>
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Gestión de usuarios del restaurante
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-slate-500 dark:text-slate-400 text-center py-12">
          Cargando...
        </p>
      ) : usuarios.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400 text-center py-12">
          No hay usuarios registrados para este restaurante.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4 text-left">Usuario</th>
                <th className="px-6 py-4 text-left">Email</th>
                <th className="px-6 py-4 text-left">Roles</th>
                <th className="px-6 py-4 text-left">Estado</th>
                <th className="px-6 py-4 text-left">Creado</th>
                <th className="px-6 py-4 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {usuarios.map((u) => (
                <tr
                  key={u.id}
                  className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                    {u.username}
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                    {u.email ?? (
                      <span className="text-slate-300 dark:text-slate-600">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(u.roles ?? []).map((r) => (
                        <span
                          key={r}
                          className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-300"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {u.activo ? (
                      <span className="flex items-center gap-1 text-green-400 text-xs font-medium">
                        <CheckCircle size={13} /> Activo
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
                        <XCircle size={13} /> Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                    {u.createdAt
                      ? new Date(u.createdAt).toLocaleDateString('es-AR')
                      : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => openEdit(u)}
                      className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Editar Usuario"
        size="sm"
      >
        <div className="space-y-4">
          {/* Username — readOnly display (original keeps it readOnly conceptually; we show it) */}
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Usuario
            </label>
            <input
              type="text"
              value={form.username}
              readOnly
              className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-sm cursor-not-allowed"
            />
            {errors.username && (
              <p className="mt-1 text-xs text-red-400">{errors.username}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Email{' '}
              <span className="text-slate-400 dark:text-slate-500 font-normal">
                (opcional)
              </span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              placeholder="usuario@restaurante.com"
              className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
          </div>

          {/* Password optional */}
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Contraseña{' '}
              <span className="text-slate-400 dark:text-slate-500 font-normal">
                (dejá vacío para no cambiarla)
              </span>
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => {
                setForm((f) => ({ ...f, password: e.target.value }))
                setErrors((ev) => ({ ...ev, password: undefined }))
              }}
              placeholder="Nueva contraseña (opcional)"
              className={`w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 border text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${
                errors.password
                  ? 'border-red-500'
                  : 'border-slate-300 dark:border-slate-600'
              }`}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-400">{errors.password}</p>
            )}
          </div>

          {/* Roles */}
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
              Roles
            </label>
            <div className="flex flex-wrap gap-3">
              {ROLES_DISPONIBLES.map((rol) => (
                <label
                  key={rol}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.roles.includes(rol)}
                    onChange={() => {
                      handleRolToggle(rol)
                      setErrors((ev) => ({ ...ev, roles: undefined }))
                    }}
                    className="w-4 h-4 rounded accent-indigo-500"
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {rol}
                  </span>
                </label>
              ))}
            </div>
            {errors.roles && (
              <p className="mt-1 text-xs text-red-400">{errors.roles}</p>
            )}
          </div>

          {/* Estado */}
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
              Estado
            </label>
            <div className="flex gap-4">
              {[
                { val: true, label: 'Activo' },
                { val: false, label: 'Inactivo' },
              ].map((opt) => (
                <label
                  key={String(opt.val)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    checked={form.activo === opt.val}
                    onChange={() =>
                      setForm((f) => ({ ...f, activo: opt.val }))
                    }
                    className="accent-indigo-500"
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => setModalOpen(false)}
            className="flex-1 py-3 rounded-2xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium text-sm transition disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </Modal>

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
