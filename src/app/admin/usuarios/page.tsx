'use client'

import { useEffect, useState, useCallback } from 'react'
import { getUsuarios, createUsuario, updateUsuario, deleteUsuario } from '../../../lib/api/usuarios'
import Modal from '../../../components/ui/Modal'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import Toast from '../../../components/ui/Toast'
import { Plus, Users, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import type { Usuario, UserRole } from '../../../types'

const ROLES_DISPONIBLES: UserRole[] = ['MESERO', 'COCINA']

interface UserForm {
  username: string
  password: string
  roles: UserRole[]
  activo: boolean
}

interface FormErrors {
  username?: string
  password?: string
  roles?: string
}

const emptyForm: UserForm = { username: '', password: '', roles: [], activo: true }

export default function AdminUsuarios() {
  const { user: currentUser } = useAuth()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<Usuario | null>(null)

  const [form, setForm] = useState<UserForm>(emptyForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState<{ id: number; username: string } | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    getUsuarios()
      .then(setUsuarios)
      .catch(() => setToast({ msg: 'Error al cargar usuarios', type: 'error' }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setEditingUser(null)
    setForm(emptyForm)
    setErrors({})
    setModalOpen(true)
  }

  const openEdit = (u: Usuario) => {
    setEditingUser(u)
    setForm({ username: u.username, password: '', roles: [...u.roles], activo: u.activo })
    setErrors({})
    setModalOpen(true)
  }

  const handleRolToggle = (rol: UserRole) => {
    setForm(f => ({
      ...f,
      roles: f.roles.includes(rol) ? f.roles.filter(r => r !== rol) : [...f.roles, rol],
    }))
  }

  const validate = (): FormErrors => {
    const e: FormErrors = {}
    if (!editingUser && (!form.username || !form.username.trim())) e.username = 'Requerido'
    if (!editingUser && (!form.password || form.password.length < 6)) e.password = 'Mínimo 6 caracteres'
    if (editingUser && form.password && form.password.length < 6) e.password = 'Mínimo 6 caracteres'
    if (form.roles.length === 0) e.roles = 'Seleccioná al menos un rol'
    return e
  }

  const handleSave = async () => {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      if (editingUser) {
        const payload: { roles: UserRole[]; activo: boolean; password?: string } = {
          roles: form.roles,
          activo: form.activo,
        }
        if (form.password) payload.password = form.password
        await updateUsuario(editingUser.id, payload)
        setToast({ msg: 'Usuario actualizado', type: 'success' })
      } else {
        await createUsuario({ username: form.username, password: form.password, roles: form.roles })
        setToast({ msg: 'Usuario creado exitosamente', type: 'success' })
      }
      setModalOpen(false)
      load()
    } catch (e: unknown) {
      const err = e as { friendlyMessage?: string }
      setToast({ msg: err.friendlyMessage || 'Error al guardar usuario', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteUsuario(confirmDelete.id)
      setToast({ msg: `Usuario "${confirmDelete.username}" eliminado`, type: 'success' })
      load()
    } catch (e: unknown) {
      const err = e as { friendlyMessage?: string }
      setToast({ msg: err.friendlyMessage || 'Error al eliminar usuario', type: 'error' })
    } finally {
      setConfirmDelete(null)
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Users size={28} className="text-orange-400" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Usuarios</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Gestión de usuarios del restaurante</p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition"
        >
          <Plus size={16} /> Nuevo Usuario
        </button>
      </div>

      {loading ? (
        <p className="text-slate-500 dark:text-slate-400 text-center py-12">Cargando...</p>
      ) : usuarios.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400 text-center py-12">No hay usuarios registrados.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4 text-left">Usuario</th>
                <th className="px-6 py-4 text-left">Roles</th>
                <th className="px-6 py-4 text-left">Estado</th>
                <th className="px-6 py-4 text-left">Creado</th>
                <th className="px-6 py-4 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {usuarios.map(u => (
                <tr key={u.id} className="bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{u.username}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(u.roles || []).map(r => (
                        <span key={r} className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/20 text-orange-300">
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-medium ${u.activo ? 'text-green-400' : 'text-red-400'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('es-AR') : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      {u.username !== currentUser && (
                        <button
                          onClick={() => setConfirmDelete({ id: u.id, username: u.username })}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Usuario</label>
            {editingUser ? (
              <p className="px-4 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-sm">
                {editingUser.username}
              </p>
            ) : (
              <>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => { setForm(f => ({ ...f, username: e.target.value })); setErrors(ev => ({ ...ev, username: undefined })) }}
                  placeholder="mesero01"
                  className={`w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 border text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition ${errors.username ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'}`}
                />
                {errors.username && <p className="mt-1 text-xs text-red-400">{errors.username}</p>}
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Contraseña{' '}
              {editingUser && (
                <span className="text-slate-400 dark:text-slate-500 font-normal">(dejá vacío para no cambiarla)</span>
              )}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setErrors(ev => ({ ...ev, password: undefined })) }}
              placeholder={editingUser ? 'Nueva contraseña (opcional)' : 'Mínimo 6 caracteres'}
              className={`w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 border text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition ${errors.password ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'}`}
            />
            {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password}</p>}
          </div>

          {editingUser?.username !== currentUser && (
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Roles</label>
              <div className="flex gap-3">
                {ROLES_DISPONIBLES.map(rol => (
                  <label key={rol} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.roles.includes(rol)}
                      onChange={() => { handleRolToggle(rol); setErrors(ev => ({ ...ev, roles: undefined })) }}
                      className="w-4 h-4 rounded accent-orange-500"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-300">{rol}</span>
                  </label>
                ))}
              </div>
              {errors.roles && <p className="mt-1 text-xs text-red-400">{errors.roles}</p>}
            </div>
          )}

          {editingUser && editingUser.username !== currentUser && (
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Estado</label>
              <div className="flex gap-4">
                {([{ val: true, label: 'Activo' }, { val: false, label: 'Inactivo' }] as const).map(opt => (
                  <label key={String(opt.val)} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={form.activo === opt.val}
                      onChange={() => setForm(f => ({ ...f, activo: opt.val }))}
                      className="accent-orange-500"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-300">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
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
            className="flex-1 py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm transition disabled:opacity-50"
          >
            {saving ? 'Guardando...' : editingUser ? 'Guardar cambios' : 'Crear Usuario'}
          </button>
        </div>
      </Modal>

      {confirmDelete && (
        <ConfirmDialog
          open
          title="Eliminar usuario"
          message={`¿Seguro que querés eliminar a "${confirmDelete.username}"? Esta acción no se puede deshacer.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {toast && (
        <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
