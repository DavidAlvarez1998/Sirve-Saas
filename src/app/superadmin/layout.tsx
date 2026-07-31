'use client'

import { Building2, PlusCircle } from 'lucide-react'
import AppLayout from '@/components/layouts/AppLayout'

const navItems = [
  { href: '/superadmin', icon: <Building2 size={18} />, label: 'Restaurantes', exact: true },
  { href: '/superadmin/tenants/new', icon: <PlusCircle size={18} />, label: 'Nuevo Restaurante' },
]

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout
      panelKicker="Panel"
      panelLabel="SuperAdmin"
      navItems={navItems}
    >
      {children}
    </AppLayout>
  )
}
