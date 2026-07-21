'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle } from 'lucide-react'
import { createTenant } from '@/lib/api/tenants'
import Toast from '@/components/ui/Toast'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormState {
  nombre: string
  slug: string
  adminEmail: string
}

interface FormErrors {
  nombre?: string
  slug?: string
  adminEmail?: string
}

interface ToastState {
  msg: string
  type: 'success' | 'error'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,62}$/

function toSlug(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove accent marks
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 63)
}

// ─── Field component ─────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  error?: string
  placeholder?: string
  hint?: string
  type?: string
}

function Field({
  label,
  name,
  value,
  onChange,
  error,
  placeholder,
  hint,
  type = 'text',
}: FieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 border text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${
          error
            ? 'border-red-500'
            : 'border-slate-300 dark:border-slate-600 focus:border-indigo-500'
        }`}
      />
      {hint && !error && (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateTenantPage() {
  const router = useRouter()

  const [form, setForm] = useState<FormState>({
    nombre: '',
    slug: '',
    adminEmail: '',
  })
  const [slugEditado, setSlugEditado] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [setupUrl, setSetupUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const validate = (): FormErrors => {
    const e: FormErrors = {}
    if (!form.slug.trim()) {
      e.slug = 'Requerido'
    } else if (!SLUG_REGEX.test(form.slug)) {
      e.slug = 'Solo letras minúsculas, números y guiones (mín. 2 chars)'
    }
    if (!form.nombre.trim()) e.nombre = 'Requerido'
    if (!form.adminEmail.trim()) {
      e.adminEmail = 'Requerido'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) {
      e.adminEmail = 'Email inválido'
    }
    return e
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    if (name === 'nombre') {
      setForm((f) => ({
        ...f,
        nombre: value,
        slug: slugEditado ? f.slug : toSlug(value),
      }))
    } else if (name === 'slug') {
      setSlugEditado(true)
      setForm((f) => ({ ...f, slug: value }))
    } else {
      setForm((f) => ({ ...f, [name]: value }))
    }
    if (errors[name as keyof FormErrors]) {
      setErrors((ev) => ({ ...ev, [name]: undefined }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }

    setSaving(true)
    try {
      const result = await createTenant({
        slug: form.slug,
        nombre: form.nombre,
        adminEmail: form.adminEmail,
      })
      setSetupUrl(result.setupUrl ?? null)
      setToast({
        msg: `Tenant "${form.slug}" creado exitosamente`,
        type: 'success',
      })
      setForm({ slug: '', nombre: '', adminEmail: '' })
      setSlugEditado(false)
    } catch (err) {
      const apiErr = err as {
        response?: { status: number }
        friendlyMessage?: string
      }
      if (apiErr?.response?.status === 409) {
        setErrors((ev) => ({ ...ev, slug: 'Slug ya existe' }))
        setToast({ msg: 'El slug ya está en uso', type: 'error' })
      } else {
        setToast({
          msg: apiErr.friendlyMessage ?? 'Error al crear el tenant',
          type: 'error',
        })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-xl">
      <div className="flex items-center gap-3 mb-8">
        <PlusCircle size={28} className="text-indigo-400" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Nuevo Tenant
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Crear un restaurante en la plataforma
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          label="Nombre del restaurante"
          name="nombre"
          value={form.nombre}
          onChange={handleChange}
          error={errors.nombre}
          placeholder="Restaurante Roma"
        />
        <Field
          label="Subdominio (slug)"
          name="slug"
          value={form.slug}
          onChange={handleChange}
          error={errors.slug}
          placeholder="restaurante-roma"
          hint={
            form.slug
              ? `URL: ${form.slug}.comanda.app`
              : 'Se genera automáticamente desde el nombre'
          }
        />
        <Field
          label="Email del Admin"
          name="adminEmail"
          type="email"
          value={form.adminEmail}
          onChange={handleChange}
          error={errors.adminEmail}
          placeholder="admin@restaurante.com"
          hint="Se enviará un enlace de configuración a este email"
        />

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push('/superadmin')}
            className="flex-1 py-3 rounded-2xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium text-sm transition disabled:opacity-50"
          >
            {saving ? 'Creando...' : 'Crear Tenant'}
          </button>
        </div>
      </form>

      {/* Setup URL display — stays visible until user navigates */}
      {setupUrl && (
        <div className="mt-6 p-4 rounded-2xl bg-green-500/10 border border-green-500/30">
          <p className="text-green-400 text-sm font-medium mb-2">
            Tenant creado exitosamente
          </p>
          <p className="text-slate-400 text-xs mb-2">
            Enlace de configuración:
          </p>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-green-300 text-xs break-all">
              {setupUrl}
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(setupUrl)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-300 text-xs font-medium transition"
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <button
            onClick={() => router.push('/superadmin')}
            className="mt-3 text-xs text-slate-400 hover:text-slate-300 transition"
          >
            Ver lista de tenants
          </button>
        </div>
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
