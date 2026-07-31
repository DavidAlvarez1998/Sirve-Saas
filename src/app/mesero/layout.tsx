'use client'

import { useState, useEffect } from 'react'
import { TableProperties, ClipboardList, LayoutDashboard } from 'lucide-react'
import Link from 'next/link'
import AppLayout from '@/components/layouts/AppLayout'
import { MeseroProvider } from '@/context/MeseroContext'
import { useAuth } from '@/context/AuthContext'

const navItems = [
  { href: '/mesero', icon: <TableProperties size={18} />, label: 'Mesas', exact: true },
  { href: '/mesero/ordenes', icon: <ClipboardList size={18} />, label: 'Órdenes' },
]

function MeseroSidebarFooter() {
  const { hasRole } = useAuth()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted || !hasRole('ADMIN')) return null

  return (
    <div className="px-4 pb-4">
      <Link
        href="/admin"
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-raised hover:text-foreground transition-colors duration-150"
      >
        <LayoutDashboard size={16} />
        Volver al panel
      </Link>
    </div>
  )
}

export default function MeseroLayout({ children }: { children: React.ReactNode }) {
  return (
    <MeseroProvider>
      <AppLayout
        panelKicker="Vista"
        panelLabel="Mesero"
        navItems={navItems}
        sidebarFooter={<MeseroSidebarFooter />}
      >
        {children}
      </AppLayout>
    </MeseroProvider>
  )
}
