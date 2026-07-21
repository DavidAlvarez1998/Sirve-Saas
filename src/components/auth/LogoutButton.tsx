'use client'

import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import ConfirmDialog from '../ui/ConfirmDialog'

interface LogoutButtonProps {
  mobile?: boolean
}

export default function LogoutButton({ mobile = false }: LogoutButtonProps) {
  const { logout } = useAuth()
  const [confirm, setConfirm] = useState(false)

  if (mobile) {
    return (
      <>
        <button
          onClick={() => setConfirm(true)}
          className="flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-medium text-slate-400 dark:text-slate-500"
        >
          <LogOut size={20} />
          Salir
        </button>
        <ConfirmDialog
          open={confirm}
          title="Cerrar sesión"
          message="¿Seguro que querés salir?"
          onConfirm={logout}
          onCancel={() => setConfirm(false)}
        />
      </>
    )
  }

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white text-sm font-medium transition"
      >
        <LogOut size={18} />
        Salir
      </button>
      <ConfirmDialog
        open={confirm}
        title="Cerrar sesión"
        message="¿Seguro que querés salir?"
        onConfirm={logout}
        onCancel={() => setConfirm(false)}
      />
    </>
  )
}
