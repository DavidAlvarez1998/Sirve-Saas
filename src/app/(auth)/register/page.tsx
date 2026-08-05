'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { RegisterSchema } from '@/lib/schemas'
import { setAuthCookie } from '@/lib/auth-cookie'
import type { AuthSession } from '@/types'

interface RegisterApiResponse {
  token:  string
  user:   { id: number; email: string; fullName: string }
  tenant: { slug: string; nombre: string }
}

const STORAGE_KEY = 'sirve_auth'

export default function RegisterPage() {
  const router = useRouter()

  const [orgName,         setOrgName]         = useState('')
  const [fullName,        setFullName]         = useState('')
  const [email,           setEmail]            = useState('')
  const [password,        setPassword]         = useState('')
  const [confirmPassword, setConfirmPassword]  = useState('')
  const [acceptTerms,     setAcceptTerms]      = useState(false)

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [apiError,    setApiError]    = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)

  function validateForm(): boolean {
    const result = RegisterSchema.safeParse({
      orgName, fullName, email, password, confirmPassword, acceptTerms,
    })

    if (!result.success) {
      const errs: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0] as string
        if (key && !errs[key]) errs[key] = issue.message
      }
      setFieldErrors(errs)
      return false
    }

    setFieldErrors({})
    return true
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setApiError(null)

    if (!validateForm()) return

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgName, fullName, email, password, confirmPassword, acceptTerms }),
      })

      const data = await res.json() as RegisterApiResponse & { message?: string }

      if (!res.ok) {
        setApiError(data.message ?? 'Ocurrió un error. Intentá de nuevo.')
        return
      }

      // Build AuthSession from register response
      const session: AuthSession = {
        token:    data.token,
        username: data.user.email,
        roles:    ['ADMIN'],
        tenantId: data.tenant.slug,
      }

      // 1. localStorage — for Axios interceptor (same key as AuthContext)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
      // 2. Cookie — for middleware edge check
      setAuthCookie(session)

      router.replace('/admin')
    } catch {
      setApiError('Error de conexión. Verificá tu internet e intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 py-12">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Ir al inicio
      </Link>

      <div className="bg-surface rounded-2xl shadow-md p-8 w-full max-w-sm border border-border">
        <h1 className="text-2xl font-bold text-foreground mb-1 text-center">Sirva</h1>
        <p className="text-sm text-muted-foreground text-center mb-6">Creá tu cuenta gratis</p>

        {apiError && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-4">
            {apiError}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Org Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="orgName">Nombre del restaurante</Label>
            <Input
              id="orgName"
              name="orgName"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              autoFocus
              placeholder="Mi Restaurante"
            />
            {fieldErrors.orgName && (
              <p className="text-xs text-destructive">{fieldErrors.orgName}</p>
            )}
          </div>

          {/* Full Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fullName">Tu nombre completo</Label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Juan García"
            />
            {fieldErrors.fullName && (
              <p className="text-xs text-destructive">{fieldErrors.fullName}</p>
            )}
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="vos@restaurante.com"
            />
            {fieldErrors.email && (
              <p className="text-xs text-destructive">{fieldErrors.email}</p>
            )}
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
            />
            {fieldErrors.password && (
              <p className="text-xs text-destructive">{fieldErrors.password}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">Repetí la contraseña</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="••••••••"
            />
            {fieldErrors.confirmPassword && (
              <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          {/* Terms checkbox */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border accent-foreground"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
              />
              <span className="text-sm text-muted-foreground">
                Acepto los{' '}
                <Link
                  href="/terms"
                  target="_blank"
                  className="text-foreground underline underline-offset-2 hover:text-foreground/70"
                >
                  Términos de Servicio
                </Link>{' '}
                y la{' '}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="text-foreground underline underline-offset-2 hover:text-foreground/70"
                >
                  Política de Privacidad
                </Link>
              </span>
            </label>
            {fieldErrors.acceptTerms && (
              <p className="text-xs text-destructive">{fieldErrors.acceptTerms}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading}
            size="lg"
            className="mt-2 w-full rounded-lg"
          >
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </Button>
        </form>

        <p className="text-sm text-muted-foreground text-center mt-4">
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="text-foreground underline underline-offset-2 hover:text-foreground/70">
            Ingresá
          </Link>
        </p>
      </div>
    </div>
  )
}
