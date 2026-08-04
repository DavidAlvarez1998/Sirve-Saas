'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '../../context/AuthContext'

const ROLE_HOME: Record<string, string> = {
  SUPERADMIN: '/superadmin',
  ADMIN: '/admin',
  MESERO: '/mesero',
  COCINA: '/cocina',
}

export default function ForbiddenPage() {
  const router = useRouter()
  const { roles, isAuthenticated } = useAuth()

  const handleBack = () => {
    if (!isAuthenticated) {
      router.replace('/login')
      return
    }
    const home = roles.map((r) => ROLE_HOME[r]).find(Boolean)
    router.replace(home ?? '/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-900">
      <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl shadow-md p-10 text-center max-w-sm w-full">
        <p className="text-6xl font-bold text-red-500 mb-4">403</p>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Acceso denegado
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-6">
          No tenés permiso para ver esta página.
        </p>
        <button
          onClick={handleBack}
          className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold py-2 px-6 rounded-lg transition"
        >
          Volver al inicio
        </button>
      </div>
    </div>
  )
}
