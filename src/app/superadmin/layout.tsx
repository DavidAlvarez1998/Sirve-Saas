'use client'

import { Building2, PlusCircle } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from '@/components/auth/LogoutButton'
import ThemeToggle from '@/components/auth/ThemeToggle'

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
  exact?: boolean
}

const nav: NavItem[] = [
  { to: '/superadmin', icon: Building2, label: 'Tenants', exact: true },
  {
    to: '/superadmin/tenants/new',
    icon: PlusCircle,
    label: 'Nuevo Tenant',
  },
]

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to)

  return (
    <div className="flex min-h-screen bg-white dark:bg-slate-900">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-60 bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 fixed inset-y-0 left-0 z-30">
        <div className="px-6 py-6 border-b border-slate-200 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">
            Panel
          </p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            SuperAdmin
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {nav.map(({ to, icon: Icon, label, exact }) => (
            <Link
              key={to}
              href={to}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                isActive({ to, icon: Icon, label, exact })
                  ? 'bg-indigo-500 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center px-4 mb-6 gap-1">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 md:ml-60 pb-24 md:pb-6">{children}</main>

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-30 flex">
        {nav.map(({ to, icon: Icon, label, exact }) => (
          <Link
            key={to}
            href={to}
            className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-medium transition ${
              isActive({ to, icon: Icon, label, exact })
                ? 'text-indigo-400'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
