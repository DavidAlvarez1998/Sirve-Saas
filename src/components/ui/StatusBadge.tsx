import type { EstadoOrden } from '../../types'

interface StatusBadgeProps {
  estado: EstadoOrden
  pagada?: boolean
}

const ESTADO_MAP: Record<EstadoOrden, { label: string; cls: string }> = {
  ABIERTA:        { label: 'Abierta',        cls: 'bg-blue-500/20 text-blue-400' },
  EN_PREPARACION: { label: 'En preparación', cls: 'bg-yellow-500/20 text-yellow-400' },
  LISTA:          { label: 'Lista',          cls: 'bg-green-500/20 text-green-400' },
  EN_CAMINO:      { label: 'En camino',      cls: 'bg-indigo-500/20 text-indigo-400' },
  ENTREGADA:      { label: 'Entregada',      cls: 'bg-purple-500/20 text-purple-400' },
  PAGADA:         { label: 'Pagada',         cls: 'bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-400' },
  CANCELADA:      { label: 'Cancelada',      cls: 'bg-red-500/20 text-red-400' },
}

const FALLBACK = { label: '', cls: 'bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-400' }

export default function StatusBadge({ estado, pagada }: StatusBadgeProps) {
  const { label, cls } = ESTADO_MAP[estado] ?? { ...FALLBACK, label: estado }

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
        {label}
      </span>
      {pagada && (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400">
          Pagada
        </span>
      )}
    </span>
  )
}
