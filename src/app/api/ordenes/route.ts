import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ValidationError } from '@/lib/errors'
import { withTenant } from '@/lib/db'
import { broadcastOrden } from '@/lib/realtime'
import { CreateOrdenSchema } from '@/lib/schemas'
import * as OrdenService from '@/lib/services/ordenes'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const ordenes = await withTenant(tenantSlug, (sql) => OrdenService.getOrdenes(sql))
    return apiSuccess(ordenes)
  })
}

export async function POST(req: NextRequest) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const body = await req.json()
    const parsed = CreateOrdenSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')

    const orden = await withTenant(tenantSlug, (sql) =>
      OrdenService.createOrden(sql, {
        tipoOrden: parsed.data.tipoOrden,
        mesaId: parsed.data.mesaId,
        nombreCliente: parsed.data.nombreCliente,
        telefonoCliente: parsed.data.telefonoCliente,
        direccionEntrega: parsed.data.direccionEntrega,
      })
    )

    broadcastOrden(tenantSlug, {
      tipo: 'CREADA',
      ordenId: orden.id,
      estado: orden.estado,
      pagada: orden.pagada,
    })

    return apiSuccess(orden, 201)
  })
}
