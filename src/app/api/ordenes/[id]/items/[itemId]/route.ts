import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ValidationError } from '@/lib/errors'
import { withTenant } from '@/lib/db'
import { broadcastOrden } from '@/lib/realtime'
import { UpdateItemSchema } from '@/lib/schemas'
import * as OrdenService from '@/lib/services/ordenes'

export const runtime = 'nodejs'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const { id, itemId } = await params
    const ordenId = parseInt(id, 10)
    const itemIdNum = parseInt(itemId, 10)
    if (isNaN(ordenId) || isNaN(itemIdNum)) throw new ValidationError('ID inválido')

    const body = await req.json()
    const parsed = UpdateItemSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')

    const orden = await withTenant(tenantSlug, (sql) =>
      OrdenService.updateItem(sql, ordenId, itemIdNum, {
        productoId: parsed.data.productoId,
        cantidad: parsed.data.cantidad,
        notas: parsed.data.notas,
        ingredientes: parsed.data.ingredientes,
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

export async function DELETE(
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
      OrdenService.removeItem(sql, ordenId, itemIdNum)
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
