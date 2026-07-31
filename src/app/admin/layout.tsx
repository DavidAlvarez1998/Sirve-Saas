'use client'

import { LayoutDashboard, Package, Salad, TableProperties, BarChart2, Users } from 'lucide-react'
import AppLayout from '@/components/layouts/AppLayout'
import RoleSwitcher from '@/components/admin/RoleSwitcher'

const navItems = [
  { href: '/admin', icon: <LayoutDashboard size={18} />, label: 'Inicio', exact: true },
  { href: '/admin/productos', icon: <Package size={18} />, label: 'Productos' },
  { href: '/admin/ingredientes', icon: <Salad size={18} />, label: 'Ingredientes' },
  { href: '/admin/mesas', icon: <TableProperties size={18} />, label: 'Mesas' },
  { href: '/admin/reportes', icon: <BarChart2 size={18} />, label: 'Reportes' },
  { href: '/admin/usuarios', icon: <Users size={18} />, label: 'Usuarios' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout
      panelKicker="Panel"
      panelLabel="Administrador"
      navItems={navItems}
      sidebarFooter={<RoleSwitcher variant="sidebar" />}
      mobileNavExtra={<RoleSwitcher variant="bottom-nav" />}
    >
      {children}
    </AppLayout>
  )
}
