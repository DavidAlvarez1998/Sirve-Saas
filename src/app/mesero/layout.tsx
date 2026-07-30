'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { TableProperties, ClipboardList, LayoutDashboard } from 'lucide-react'
import LogoutButton from '../../components/auth/LogoutButton'
import ThemeToggle from '../../components/auth/ThemeToggle'
import { MeseroProvider } from '../../context/MeseroContext'
import { useAuth } from '../../context/AuthContext'

interface NavItem {
  href: string
  icon: React.ElementType
  label: string
  exact: boolean
}

const nav: NavItem[] = [
  { href: '/mesero', icon: TableProperties, label: 'Mesas', exact: true },
  { href: '/mesero/ordenes', icon: ClipboardList, label: 'Órdenes', exact: false },
]

export default function MeseroLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { hasRole } = useAuth()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href)

  return (
    <MeseroProvider>
      <div className="flex min-h-screen bg-white dark:bg-slate-900">
        {/* Sidebar desktop */}
        <aside className="hidden md:flex flex-col w-60 bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 fixed inset-y-0 left-0 z-30">
          <div className="px-6 py-6 border-b border-slate-200 dark:border-slate-700">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">
              Vista
            </p>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Mesero</h1>
          </div>
          <nav className="flex-1 p-4 space-y-1">
            {nav.map(item => {
              const active = isActive(item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                    active
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          {mounted && hasRole('ADMIN') && (
            <div className="px-4 pb-4">
              <Link
                href="/admin"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition"
              >
                <LayoutDashboard size={16} />
                Volver al panel
              </Link>
            </div>
          )}
          <div className="flex items-center px-4 mb-6 gap-1">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </aside>

        <main className="flex-1 md:ml-60 pb-24 md:pb-6">
          {children}
        </main>

        {/* Bottom nav mobile */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-30 flex">
          {nav.map(item => {
            const active = isActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-medium transition ${
                  active ? 'text-sky-400' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <item.icon size={20} />
                {item.label}
              </Link>
            )
          })}
          <ThemeToggle className="py-2.5" />
          <LogoutButton mobile />
        </nav>
      </div>
    </MeseroProvider>
  )
}
