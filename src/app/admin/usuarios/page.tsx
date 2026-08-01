'use client'

import { useEffect, useState, useCallback } from 'react'
import { getUsuarios, createUsuario, updateUsuario, deleteUsuario } from '../../../lib/api/usuarios'
import Modal from '../../../components/ui/Modal'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { toast } from 'sonner'
import { Plus, Users, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Badge } from '@/components/ui/Badge'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
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

  const load = useCallback(() => {
    setLoading(true)
    getUsuarios()
      .then(setUsuarios)
      .catch(() => toast.error('Error al cargar usuarios'))
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
        toast.success('Usuario actualizado')
      } else {
        await createUsuario({ username: form.username, password: form.password, roles: form.roles })
        toast.success('Usuario creado exitosamente')
      }
      setModalOpen(false)
      load()
    } catch (e: unknown) {
      const err = e as { friendlyMessage?: string }
      toast.error(err.friendlyMessage || 'Error al guardar usuario')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteUsuario(confirmDelete.id)
      toast.success(`Usuario "${confirmDelete.username}" eliminado`)
      load()
    } catch (e: unknown) {
      const err = e as { friendlyMessage?: string }
      toast.error(err.friendlyMessage || 'Error al eliminar usuario')
    } finally {
      setConfirmDelete(null)
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Users size={28} className="text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Usuarios</h1>
            <p className="text-muted-foreground text-sm">Gestión de usuarios del restaurante</p>
          </div>
        </div>
        <Button onClick={openNew} size="md">
          <Plus size={16} /> Nuevo Usuario
        </Button>
      </div>

      {loading ? (
        <ListSkeleton rows={5} />
      ) : usuarios.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay usuarios registrados"
          description="Creá el primer usuario para el restaurante."
          action={<Button onClick={openNew} size="sm">Nuevo Usuario</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm text-muted-foreground">
            <thead className="bg-surface text-muted-foreground uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4 text-left">Usuario</th>
                <th className="px-6 py-4 text-left">Roles</th>
                <th className="px-6 py-4 text-left">Estado</th>
                <th className="px-6 py-4 text-left">Creado</th>
                <th className="px-6 py-4 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {usuarios.map(u => (
                <tr key={u.id} className="bg-background hover:bg-surface-raised transition-colors cursor-pointer">
                  <td className="px-6 py-4 font-medium text-foreground">{u.username}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(u.roles || []).map(r => (
                        <Badge key={r} variant="default">{r}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={u.activo ? 'success' : 'destructive'}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('es-AR') : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="p-1.5 rounded-lg bg-surface hover:bg-surface-raised text-muted-foreground hover:text-foreground transition-colors"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      {u.username !== currentUser && (
                        <button
                          onClick={() => setConfirmDelete({ id: u.id, username: u.username })}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
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
          <div className="flex flex-col gap-1.5">
            <Label>Usuario</Label>
            {editingUser ? (
              <p className="px-4 py-3 rounded-xl bg-surface text-muted-foreground text-sm">
                {editingUser.username}
              </p>
            ) : (
              <>
                <Input
                  type="text"
                  value={form.username}
                  onChange={e => { setForm(f => ({ ...f, username: e.target.value })); setErrors(ev => ({ ...ev, username: undefined })) }}
                  placeholder="mesero01"
                  className={errors.username ? 'border-destructive' : ''}
                />
                {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>
              Contraseña{' '}
              {editingUser && (
                <span className="text-muted-foreground font-normal">(dejá vacío para no cambiarla)</span>
              )}
            </Label>
            <Input
              type="password"
              value={form.password}
              onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setErrors(ev => ({ ...ev, password: undefined })) }}
              placeholder={editingUser ? 'Nueva contraseña (opcional)' : 'Mínimo 6 caracteres'}
              className={errors.password ? 'border-destructive' : ''}
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          {editingUser?.username !== currentUser && (
            <div className="flex flex-col gap-2">
              <Label>Roles</Label>
              <div className="flex gap-3">
                {ROLES_DISPONIBLES.map(rol => (
                  <label key={rol} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.roles.includes(rol)}
                      onChange={() => { handleRolToggle(rol); setErrors(ev => ({ ...ev, roles: undefined })) }}
                      className="w-4 h-4 rounded accent-primary"
                    />
                    <span className="text-sm text-foreground">{rol}</span>
                  </label>
                ))}
              </div>
              {errors.roles && <p className="text-xs text-destructive">{errors.roles}</p>}
            </div>
          )}

          {editingUser && editingUser.username !== currentUser && (
            <div className="flex flex-col gap-2">
              <Label>Estado</Label>
              <div className="flex gap-4">
                {([{ val: true, label: 'Activo' }, { val: false, label: 'Inactivo' }] as const).map(opt => (
                  <label key={String(opt.val)} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={form.activo === opt.val}
                      onChange={() => setForm(f => ({ ...f, activo: opt.val }))}
                      className="accent-primary"
                    />
                    <span className="text-sm text-foreground">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            onClick={() => setModalOpen(false)}
            className="flex-1 rounded-2xl h-11"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-2xl h-11"
          >
            {saving ? 'Guardando...' : editingUser ? 'Guardar cambios' : 'Crear Usuario'}
          </Button>
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

    </div>
  )
}
