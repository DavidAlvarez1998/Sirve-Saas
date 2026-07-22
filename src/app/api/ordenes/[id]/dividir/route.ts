import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ValidationError } from '@/lib/errors'
import { withTenant } from '@/lib/db'
import { broadcastOrden } from '@/lib/realtime'
import { DividirOrdenSchema } from '@/lib/schemas'
import * as OrdenService from '@/lib/services/ordenes'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const { id } = await params
    const ordenId = parseInt(id, 10)
    if (isNaN(ordenId)) throw new ValidationError('ID inválido')

    const body = await req.json()
    const parsed = DividirOrdenSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')

    const { ordenOriginal, ordenNueva } = await withTenant(tenantSlug, (sql) =>
      OrdenService.dividirOrden(sql, ordenId, { items: parsed.data.items })
    )

    broadcastOrden(tenantSlug, {
      tipo: 'ACTUALIZADA',
      ordenId: ordenOriginal.id,
      estado: ordenOriginal.estado,
      pagada: ordenOriginal.pagada,
    })

    broadcastOrden(tenantSlug, {
      tipo: 'CREADA',
      ordenId: ordenNueva.id,
      estado: ordenNueva.estado,
      pagada: ordenNueva.pagada,
    })

    return apiSuccess({ original: ordenOriginal, nueva: ordenNueva })
  })
}
