import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ValidationError } from '@/lib/errors'
import { withTenant } from '@/lib/db'
import { broadcastOrden } from '@/lib/realtime'
import { UpdateEstadoSchema } from '@/lib/schemas'
import * as OrdenService from '@/lib/services/ordenes'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const { id } = await params
    const ordenId = parseInt(id, 10)
    if (isNaN(ordenId)) throw new ValidationError('ID inválido')

    const body = await req.json()
    const parsed = UpdateEstadoSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')

    const orden = await withTenant(tenantSlug, (sql) =>
      OrdenService.updateEstado(sql, ordenId, parsed.data.estado)
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
