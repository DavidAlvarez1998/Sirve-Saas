'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Users, Pencil, ArrowLeft, CheckCircle, XCircle } from 'lucide-react'
import { getTenantUsuarios, updateTenantUsuario } from '@/lib/api/tenants'
import Modal from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Badge } from '@/components/ui/Badge'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { toast } from 'sonner'
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

  const load = useCallback(() => {
    setLoading(true)
    getTenantUsuarios(slug)
      .then(setUsuarios)
      .catch(() => toast.error('Error al cargar usuarios del restaurante'))
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
      toast.success('Usuario actualizado')
      setModalOpen(false)
      load()
    } catch (e) {
      const err = e as { friendlyMessage?: string }
      toast.error(err.friendlyMessage ?? 'Error al guardar usuario')
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
          className="p-2 rounded-xl bg-surface hover:bg-surface-raised text-muted-foreground transition-colors"
          title="Volver a restaurantes"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-3">
          <Users size={28} className="text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Usuarios —{' '}
              <span className="font-mono text-primary">{slug}</span>
            </h1>
            <p className="text-muted-foreground text-sm">
              Gestión de usuarios del restaurante
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <ListSkeleton rows={5} />
      ) : usuarios.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay usuarios registrados para este restaurante"
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm text-muted-foreground">
            <thead className="bg-surface text-muted-foreground uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4 text-left">Usuario</th>
                <th className="px-6 py-4 text-left">Email</th>
                <th className="px-6 py-4 text-left">Roles</th>
                <th className="px-6 py-4 text-left">Estado</th>
                <th className="px-6 py-4 text-left">Creado</th>
                <th className="px-6 py-4 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {usuarios.map((u) => (
                <tr
                  key={u.id}
                  className="bg-background hover:bg-surface-raised transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 font-medium text-foreground">
                    {u.username}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {u.email ?? (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(u.roles ?? []).map((r) => (
                        <Badge key={r} variant="default">{r}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {u.activo ? (
                      <Badge variant="success">
                        <CheckCircle size={12} /> Activo
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <XCircle size={12} /> Inactivo
                      </Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {u.createdAt
                      ? new Date(u.createdAt).toLocaleDateString('es-AR')
                      : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => openEdit(u)}
                      className="p-1.5 rounded-lg bg-surface hover:bg-surface-raised text-muted-foreground hover:text-foreground transition-colors"
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
          {/* Username — readOnly display */}
          <div className="flex flex-col gap-1.5">
            <Label>Usuario</Label>
            <Input
              type="text"
              value={form.username}
              readOnly
              className="cursor-not-allowed opacity-60"
            />
            {errors.username && (
              <p className="text-xs text-destructive">{errors.username}</p>
            )}
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <Label>
              Email{' '}
              <span className="text-muted-foreground font-normal">
                (opcional)
              </span>
            </Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              placeholder="usuario@restaurante.com"
            />
          </div>

          {/* Password optional */}
          <div className="flex flex-col gap-1.5">
            <Label>
              Contraseña{' '}
              <span className="text-muted-foreground font-normal">
                (dejá vacío para no cambiarla)
              </span>
            </Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => {
                setForm((f) => ({ ...f, password: e.target.value }))
                setErrors((ev) => ({ ...ev, password: undefined }))
              }}
              placeholder="Nueva contraseña (opcional)"
              className={errors.password ? 'border-destructive' : ''}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password}</p>
            )}
          </div>

          {/* Roles */}
          <div className="flex flex-col gap-2">
            <Label>Roles</Label>
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
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <span className="text-sm text-foreground">
                    {rol}
                  </span>
                </label>
              ))}
            </div>
            {errors.roles && (
              <p className="text-xs text-destructive">{errors.roles}</p>
            )}
          </div>

          {/* Estado */}
          <div className="flex flex-col gap-2">
            <Label>Estado</Label>
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
                    className="accent-primary"
                  />
                  <span className="text-sm text-foreground">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
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
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </Modal>

    </div>
  )
}
