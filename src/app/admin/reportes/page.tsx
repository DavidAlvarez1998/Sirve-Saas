'use client'

import { useState } from 'react'
import { getReporte } from '../../../lib/api/cocina'
import { BarChart2, TrendingUp, CreditCard, Banknote, Smartphone, ShoppingBag } from 'lucide-react'
import { formatCurrency } from '../../../lib/format'
import type { ReporteVentas } from '../../../types'

type StatCard = {
  label: string
  value: string
  icon: React.ElementType
  color: string
}

export default function AdminReportes() {
  const today = new Date().toISOString().split('T')[0]
  const [fechaInicio, setFechaInicio] = useState(today)
  const [fechaFin, setFechaFin] = useState(today)
  const [reporte, setReporte] = useState<ReporteVentas | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const buscar = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await getReporte(fechaInicio, fechaFin)
      setReporte(r)
    } catch (e: unknown) {
      const err = e as { friendlyMessage?: string }
      setError(err.friendlyMessage || 'Error al cargar reporte')
    } finally {
      setLoading(false)
    }
  }

  const stats: StatCard[] = reporte
    ? [
        { label: 'Total ventas', value: formatCurrency(reporte.totalVentas), icon: TrendingUp, color: 'text-orange-400 bg-orange-500/20' },
        { label: 'Propinas', value: formatCurrency(reporte.totalPropinas), icon: BarChart2, color: 'text-violet-400 bg-violet-500/20' },
        { label: 'Efectivo', value: formatCurrency(reporte.totalEfectivo), icon: Banknote, color: 'text-green-400 bg-green-500/20' },
        { label: 'Tarjeta', value: formatCurrency(reporte.totalTarjeta), icon: CreditCard, color: 'text-primary bg-primary/20' },
        { label: 'Transferencia', value: formatCurrency(reporte.totalTransferencia), icon: Smartphone, color: 'text-indigo-400 bg-indigo-500/20' },
        { label: 'Órdenes', value: String(reporte.cantidadOrdenes), icon: ShoppingBag, color: 'text-amber-400 bg-amber-500/20' },
      ]
    : []

  return (
    <div className="p-5">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Reportes</h1>
        <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">Consulta ventas por rango de fechas</p>
      </div>

      <div className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 mb-5">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Desde</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={e => setFechaInicio(e.target.value)}
              className="mt-1 w-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Hasta</label>
            <input
              type="date"
              value={fechaFin}
              onChange={e => setFechaFin(e.target.value)}
              className="mt-1 w-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        </div>
        <button
          onClick={buscar}
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white py-3 rounded-2xl font-semibold text-sm transition"
        >
          {loading ? 'Consultando...' : 'Ver reporte'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-2xl p-4 mb-4">
          {error}
        </div>
      )}

      {reporte && (
        <div className="grid grid-cols-2 gap-3">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-4 shadow-sm border border-slate-200 dark:border-slate-700"
            >
              <div className={`w-10 h-10 rounded-2xl ${color} flex items-center justify-center mb-2`}>
                <Icon size={18} />
              </div>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white">{value}</p>
              <p className="text-slate-500 dark:text-slate-400 text-xs">{label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
