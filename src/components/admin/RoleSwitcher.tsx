'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { UtensilsCrossed, ChefHat } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

interface RoleSwitcherProps {
  variant: 'sidebar' | 'bottom-nav'
}

export default function RoleSwitcher({ variant }: RoleSwitcherProps) {
  const { hasRole } = useAuth()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const hasMesero = hasRole('MESERO')
  const hasCocina = hasRole('COCINA')

  if (!mounted || (!hasMesero && !hasCocina)) return null

  if (variant === 'sidebar') {
    return (
      <div className="px-4 pb-4 border-t border-slate-200 dark:border-slate-700 pt-4">
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">
          Cambiar vista
        </p>
        <div className="space-y-1">
          {hasMesero && (
            <Link
              href="/mesero"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition"
            >
              <UtensilsCrossed size={18} />
              Vista Mesero
            </Link>
          )}
          {hasCocina && (
            <Link
              href="/cocina"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition"
            >
              <ChefHat size={18} />
              Vista Cocina
            </Link>
          )}
        </div>
      </div>
    )
  }

  // variant === 'bottom-nav'
  return (
    <>
      {hasMesero && (
        <Link
          href="/mesero"
          className="flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-medium text-slate-400 dark:text-slate-500 transition"
        >
          <UtensilsCrossed size={20} />
          Mesero
        </Link>
      )}
      {hasCocina && (
        <Link
          href="/cocina"
          className="flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-medium text-slate-400 dark:text-slate-500 transition"
        >
          <ChefHat size={20} />
          Cocina
        </Link>
      )}
    </>
  )
}
