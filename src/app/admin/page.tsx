'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, Salad, TableProperties, ShoppingBag } from 'lucide-react'
import { getProductos } from '@/lib/api/productos'
import { getIngredientes } from '@/lib/api/ingredientes'
import { getMesas } from '@/lib/api/mesas'
import { getOrdenes } from '@/lib/api/ordenes'

interface Stats {
  productos: number
  ingredientes: number
  mesas: number
  ordenes: number
}

export default function AdminDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats>({ productos: 0, ingredientes: 0, mesas: 0, ordenes: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getProductos(), getIngredientes(), getMesas(), getOrdenes()])
      .then(([p, i, m, o]) =>
        setStats({ productos: p.length, ingredientes: i.length, mesas: m.length, ordenes: o.length })
      )
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const cards = [
    { label: 'Productos', value: stats.productos, icon: Package, color: 'bg-orange-500', path: '/admin/productos' },
    { label: 'Ingredientes', value: stats.ingredientes, icon: Salad, color: 'bg-emerald-500', path: '/admin/ingredientes' },
    { label: 'Mesas', value: stats.mesas, icon: TableProperties, color: 'bg-primary', path: '/admin/mesas' },
    { label: 'Órdenes hoy', value: stats.ordenes, icon: ShoppingBag, color: 'bg-violet-500', path: '/admin/reportes' },
  ]

  return (
    <div className="p-5">
      <div className="mb-6">
        <p className="text-slate-400 dark:text-slate-500 text-sm">Bienvenido de vuelta 👋</p>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Dashboard</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400 dark:text-slate-500 text-sm">
          Cargando...
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {cards.map(({ label, value, icon: Icon, color, path }) => (
            <button
              key={label}
              onClick={() => router.push(path)}
              className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 text-left cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 active:scale-[0.97] transition-all"
            >
              <div className={`w-11 h-11 rounded-2xl ${color} flex items-center justify-center mb-3`}>
                <Icon size={20} className="text-white" />
              </div>
              <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{value}</p>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{label}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
