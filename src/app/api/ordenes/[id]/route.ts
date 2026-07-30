import { NextResponse, type NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ValidationError } from '@/lib/errors'
import { withTenant } from '@/lib/db'
import { broadcastOrden } from '@/lib/realtime'
import * as OrdenService from '@/lib/services/ordenes'

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const { id } = await params
    const ordenId = parseInt(id, 10)
    if (isNaN(ordenId)) throw new ValidationError('ID inválido')

    const orden = await withTenant(tenantSlug, (sql) => OrdenService.getOrdenById(sql, ordenId))
    return apiSuccess(orden)
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const { id } = await params
    const ordenId = parseInt(id, 10)
    if (isNaN(ordenId)) throw new ValidationError('ID inválido')

    const body = await req.json()

    const orden = await withTenant(tenantSlug, (sql) =>
      OrdenService.updateOrden(sql, ordenId, {
        nombreCliente: body.nombreCliente ?? body.nombre_cliente,
        telefonoCliente: body.telefonoCliente ?? body.telefono_cliente,
        direccionEntrega: body.direccionEntrega ?? body.direccion_entrega,
      })
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const { id } = await params
    const ordenId = parseInt(id, 10)
    if (isNaN(ordenId)) throw new ValidationError('ID inválido')

    await withTenant(tenantSlug, (sql) => OrdenService.deleteOrden(sql, ordenId))
    return new NextResponse(null, { status: 204 })
  })
}
