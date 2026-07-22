import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ValidationError } from '@/lib/errors'
import { withTenant } from '@/lib/db'
import { broadcastOrden } from '@/lib/realtime'
import * as OrdenService from '@/lib/services/ordenes'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const { id, itemId } = await params
    const ordenId = parseInt(id, 10)
    const itemIdNum = parseInt(itemId, 10)
    if (isNaN(ordenId) || isNaN(itemIdNum)) throw new ValidationError('ID inválido')

    const orden = await withTenant(tenantSlug, (sql) =>
      OrdenService.separarItem(sql, ordenId, itemIdNum)
    )

    broadcastOrden(tenantSlug, {
      tipo: 'ACTUALIZADA',
      ordenId: orden.id,
      estado: orden.estado,
      pagada: orden.pagada,
    })

    return apiSuccess(orden)
  })
}
