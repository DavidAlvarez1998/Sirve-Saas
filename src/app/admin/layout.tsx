'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, Salad, TableProperties, BarChart2, Users } from 'lucide-react'
import LogoutButton from '@/components/auth/LogoutButton'
import ThemeToggle from '@/components/auth/ThemeToggle'
import RoleSwitcher from '@/components/admin/RoleSwitcher'

const nav = [
  { to: '/admin', icon: LayoutDashboard, label: 'Inicio', exact: true },
  { to: '/admin/productos', icon: Package, label: 'Productos' },
  { to: '/admin/ingredientes', icon: Salad, label: 'Ingredientes' },
  { to: '/admin/mesas', icon: TableProperties, label: 'Mesas' },
  { to: '/admin/reportes', icon: BarChart2, label: 'Reportes' },
  { to: '/admin/usuarios', icon: Users, label: 'Usuarios' },
]

function isActive(pathname: string, to: string, exact: boolean | undefined): boolean {
  if (exact) return pathname === to
  return pathname === to || pathname.startsWith(to + '/')
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen bg-white dark:bg-slate-900">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-60 bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 fixed inset-y-0 left-0 z-30">
        <div className="px-6 py-6 border-b border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">
            Panel
          </p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Administrador</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {nav.map(({ to, icon: Icon, label, exact }) => {
            const active = isActive(pathname, to, exact)
            return (
              <Link
                key={to}
                href={to}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  active
                    ? 'bg-orange-500 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            )
          })}
        </nav>
        <RoleSwitcher variant="sidebar" />
        <div className="flex items-center px-4 mb-6 gap-1">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 md:ml-60 pb-24 md:pb-6">{children}</main>

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-30 flex">
        {nav.map(({ to, icon: Icon, label, exact }) => {
          const active = isActive(pathname, to, exact)
          return (
            <Link
              key={to}
              href={to}
              className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-medium transition ${
                active ? 'text-orange-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <Icon size={20} />
              {label}
            </Link>
          )
        })}
        <RoleSwitcher variant="bottom-nav" />
      </nav>
    </div>
  )
}
