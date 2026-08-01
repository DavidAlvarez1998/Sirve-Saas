import { Badge } from '@/components/ui/Badge'
import { ESTADO_LABEL, ESTADO_VARIANT } from '@/lib/estado-orden'
import type { EstadoOrden } from '../../types'

interface StatusBadgeProps {
  estado: EstadoOrden
  pagada?: boolean
}

export default function StatusBadge({ estado, pagada }: StatusBadgeProps) {
  const label = ESTADO_LABEL[estado] ?? estado
  const variant = ESTADO_VARIANT[estado] ?? 'muted'

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <Badge variant={variant}>{label}</Badge>
      {pagada && (
        <Badge variant="success">Pagada</Badge>
      )}
    </span>
  )
}
