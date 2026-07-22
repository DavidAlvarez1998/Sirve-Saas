import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { withTenant } from '@/lib/db'
import { ProductoSchema } from '@/lib/schemas'
import { listProductos, createProducto } from '@/lib/services/productos'

export async function GET(req: NextRequest) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const productos = await withTenant(tenantSlug, (sql) => listProductos(sql))
    return apiSuccess(productos)
  })
}

export async function POST(req: NextRequest) {
  const { tenantSlug, user } = getContext(req)
  return handle(async () => {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenError()

    const body = await req.json()
    const parsed = ProductoSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')

    const producto = await withTenant(tenantSlug, (sql) =>
      createProducto(sql, {
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion,
        precio: parsed.data.precio,
        tipo: parsed.data.tipo,
        imagenUrl: parsed.data.imagenUrl,
      }),
    )
    return apiSuccess(producto, 201)
  })
}
