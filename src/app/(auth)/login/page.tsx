'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../../../context/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'

// ─── Role redirects ───────────────────────────────────────────────────────────

const ROLE_REDIRECTS = [
  { role: 'SUPERADMIN', path: '/superadmin' },
  { role: 'ADMIN',      path: '/admin' },
  { role: 'MESERO',     path: '/mesero' },
  { role: 'COCINA',     path: '/cocina' },
] as const

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { login } = useAuth()
  const router = useRouter()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const formRef = useRef<HTMLFormElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const session = await login(username, password)
      const roles = session.roles ?? []
      const redirect = ROLE_REDIRECTS.find((r) => roles.includes(r.role))
      router.replace(redirect ? redirect.path : '/login')
    } catch (err) {
      const apiErr = err as { friendlyMessage?: string }
      setError(apiErr.friendlyMessage ?? 'Credenciales inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Ir al inicio
      </Link>
      <div className="bg-surface rounded-2xl shadow-md p-8 w-full max-w-sm border border-border">
        <h1 className="text-2xl font-bold text-foreground mb-6 text-center">
          Sirva
        </h1>

        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">Correo electrónico</Label>
            <Input
              id="username"
              name="username"
              type="text"
              inputMode="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              placeholder="tu@email.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <Button
            type="submit"
            disabled={loading}
            size="lg"
            className="mt-2 w-full rounded-lg"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </Button>

          <p className="text-xs text-muted-foreground text-center pt-1">
            Al ingresar, aceptás nuestros{' '}
            <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
              Términos
            </Link>{' '}
            y{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              Política de Privacidad
            </Link>
            .
          </p>
        </form>

        <p className="text-sm text-muted-foreground text-center mt-4">
          ¿No tenés cuenta?{' '}
          <Link href="/register" className="text-foreground underline underline-offset-2 hover:text-foreground/70">
            Registrate
          </Link>
        </p>
      </div>
    </div>
  )
}
