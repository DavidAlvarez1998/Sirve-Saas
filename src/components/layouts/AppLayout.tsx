'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import LogoutButton from '@/components/auth/LogoutButton'
import ThemeToggle from '@/components/auth/ThemeToggle'

export interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  exact?: boolean
  /** If true, the item only appears in the drawer — not in the mobile bottom nav. */
  mobileHidden?: boolean
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

function DrawerThemeRow() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = mounted && theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-raised hover:text-foreground transition-colors duration-150"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
      {isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    </button>
  )
}

export function AppLayout({
  panelLabel,
  panelKicker,
  navItems,
  sidebarFooter,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  mobileNavExtra,
  children,
}: AppLayoutProps) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => { setDrawerOpen(false) }, [pathname])

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Desktop sidebar ──────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-60 bg-surface border-r border-border fixed inset-y-0 left-0 z-30">
        <div className="px-6 py-6 border-b border-border flex items-center justify-between">
          <div>
            {panelKicker && (
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
                {panelKicker}
              </p>
            )}
            <h1 className="text-xl font-semibold text-foreground">{panelLabel}</h1>
          </div>
          <ThemeToggle />
        </div>

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

        {sidebarFooter}

        <div className="flex items-center px-4 mb-6">
          <LogoutButton />
        </div>
      </aside>

      {/* ── Mobile drawer overlay ────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile drawer ────────────────────────────────────────── */}
      <aside
        className={cn(
          'md:hidden fixed top-0 left-0 h-full w-64 bg-surface flex flex-col z-50 transition-transform duration-300 ease-in-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            {panelKicker && (
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
                {panelKicker}
              </p>
            )}
            <h2 className="text-base font-semibold text-foreground">{panelLabel}</h2>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-raised transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href, item.exact)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
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

        {sidebarFooter}

        <div className="p-4 border-t border-border space-y-1">
          <DrawerThemeRow />
          <LogoutButton />
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="flex-1 md:ml-60 pb-24 md:pb-6">{children}</main>

      {/* ── Mobile bottom nav ────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-30 flex">
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex-1 flex flex-col items-center py-2.5 gap-0.5 text-[10px] font-medium text-muted-foreground"
        >
          <Menu size={20} />
          Menú
        </button>
        {navItems.filter((item) => !item.mobileHidden).map((item) => {
          const active = isActive(pathname, item.href, item.exact)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (active) window.dispatchEvent(new CustomEvent('nav:reselect', { detail: item.href }))
              }}
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
      </nav>
    </div>
  )
}

export default AppLayout
