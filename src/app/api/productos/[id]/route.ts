import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { withTenant } from '@/lib/db'
import { ProductoSchema } from '@/lib/schemas'
import { getProducto, updateProducto, deleteProducto } from '@/lib/services/productos'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const { id } = await params
    const producto = await withTenant(tenantSlug, (sql) => getProducto(sql, Number(id)))
    return apiSuccess(producto)
  })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { tenantSlug, user } = getContext(req)
  return handle(async () => {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenError()

    const { id } = await params
    const body = await req.json()
    const parsed = ProductoSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')

    const producto = await withTenant(tenantSlug, (sql) =>
      updateProducto(sql, Number(id), {
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion,
        precio: parsed.data.precio,
        tipo: parsed.data.tipo,
        imagenUrl: parsed.data.imagenUrl,
      }),
    )
    return apiSuccess(producto)
  })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { tenantSlug, user } = getContext(req)
  return handle(async () => {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenError()

    const { id } = await params
    await withTenant(tenantSlug, (sql) => deleteProducto(sql, Number(id)))
    return apiSuccess(null, 204)
  })
}
