'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import LogoutButton from '@/components/auth/LogoutButton'
import ThemeToggle from '@/components/auth/ThemeToggle'

export interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  exact?: boolean
}

interface AppLayoutProps {
  panelLabel: string
  panelKicker?: string
  navItems: NavItem[]
  /** Slot rendered at the bottom of the sidebar (e.g. RoleSwitcher). */
  sidebarFooter?: React.ReactNode
  /** Slot rendered in the mobile bottom-nav bar after the nav links. */
  mobileNavExtra?: React.ReactNode
  children: React.ReactNode
}

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

export function AppLayout({
  panelLabel,
  panelKicker,
  navItems,
  sidebarFooter,
  mobileNavExtra,
  children,
}: AppLayoutProps) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex flex-col w-60 bg-surface border-r border-border fixed inset-y-0 left-0 z-30">
        {/* Header */}
        <div className="px-6 py-6 border-b border-border">
          {panelKicker && (
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
              {panelKicker}
            </p>
          )}
          <h1 className="text-xl font-semibold text-foreground">{panelLabel}</h1>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href, item.exact)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors duration-150',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-surface-raised hover:text-foreground',
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Optional sidebar footer slot (e.g. RoleSwitcher) */}
        {sidebarFooter}

        {/* Theme toggle + logout */}
        <div className="flex items-center px-4 mb-6 gap-1">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 md:ml-60 pb-24 md:pb-6">{children}</main>

      {/* Bottom nav — mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-30 flex">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-medium transition-colors duration-150',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}
        {mobileNavExtra}
        <ThemeToggle className="py-2.5" />
        <LogoutButton mobile />
      </nav>
    </div>
  )
}

export default AppLayout
