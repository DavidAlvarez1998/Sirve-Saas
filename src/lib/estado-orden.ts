import type { BadgeVariant } from '@/components/ui/Badge'

export type EstadoOrden =
  | 'ABIERTA'
  | 'EN_PREPARACION'
  | 'LISTA'
  | 'EN_CAMINO'
  | 'ENTREGADA'
  | 'PAGADA'
  | 'CANCELADA'

export const ESTADO_LABEL: Record<string, string> = {
  ABIERTA:        'Abierta',
  EN_PREPARACION: 'En preparación',
  LISTA:          'Lista',
  EN_CAMINO:      'En camino',
  ENTREGADA:      'Entregada',
  PAGADA:         'Pagada',
  CANCELADA:      'Cancelada',
}

export const ESTADO_VARIANT: Record<string, BadgeVariant> = {
  ABIERTA:        'info',
  EN_PREPARACION: 'warning',
  LISTA:          'success',
  EN_CAMINO:      'info',
  ENTREGADA:      'success',
  PAGADA:         'muted',
  CANCELADA:      'destructive',
}
