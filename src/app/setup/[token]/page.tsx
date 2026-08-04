'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSetupInfo, completarSetup } from '../../../lib/api/setup'
import type { ApiError } from '../../../types'

export default function SetupPage() {
  const params = useParams<{ token: string }>()
  const token = params.token
  const router = useRouter()

  const [tenantNombre, setTenantNombre] = useState<string | null>(null)
  const [adminEmail, setAdminEmail] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [password, setPassword] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getSetupInfo(token)
      .then((data) => {
        setTenantNombre(data.tenantNombre)
        setAdminEmail(data.adminEmail)
      })
      .catch((err: ApiError) => {
        const status = err.response?.status
        if (status === 404 || status === 410) {
          setLinkError('Este enlace no es válido o ya fue utilizado.')
        } else {
          setLinkError('Ocurrió un error inesperado. Intentá de nuevo más tarde.')
        }
      })
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)

    if (password.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmarPassword) {
      setFormError('Las contraseñas no coinciden.')
      return
    }

    setSubmitting(true)
    try {
      await completarSetup(token, { email: adminEmail, password })
      router.push('/login')
    } catch (err) {
      const apiErr = err as ApiError
      const status = apiErr.response?.status
      if (status === 409) {
        setFormError('Este email ya tiene una cuenta en este restaurante.')
      } else if (status === 410) {
        setFormError('Este enlace ya fue utilizado o expiró.')
      } else {
        setFormError(apiErr.friendlyMessage || 'Ocurrió un error inesperado.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900">
        <p className="text-slate-500 dark:text-slate-400 text-sm">Cargando...</p>
      </div>
    )
  }

  if (linkError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900">
        <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-md p-8 w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Sirva</h1>
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{linkError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900">
      <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-md p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1 text-center">
          Sirva
        </h1>
        {tenantNombre && (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">
            {tenantNombre}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={adminEmail}
              readOnly
              autoComplete="email"
              className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Confirmar contraseña
            </label>
            <input
              type="password"
              value={confirmarPassword}
              onChange={(e) => setConfirmarPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Repetí la contraseña"
            />
          </div>

          {formError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 bg-primary hover:bg-primary-hover text-primary-foreground font-semibold py-2 px-4 rounded-lg transition disabled:opacity-50"
          >
            {submitting ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  )
}
