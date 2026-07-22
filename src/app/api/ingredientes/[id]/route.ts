import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { withTenant } from '@/lib/db'
import { IngredienteSchema } from '@/lib/schemas'
import { getIngrediente, updateIngrediente, deleteIngrediente } from '@/lib/services/ingredientes'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const { id } = await params
    const ingrediente = await withTenant(tenantSlug, (sql) => getIngrediente(sql, Number(id)))
    return apiSuccess(ingrediente)
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
    const parsed = IngredienteSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')

    const ingrediente = await withTenant(tenantSlug, (sql) =>
      updateIngrediente(sql, Number(id), {
        nombre: parsed.data.nombre,
        precio: parsed.data.precio,
        imagenUrl: parsed.data.imagenUrl,
      }),
    )
    return apiSuccess(ingrediente)
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
    await withTenant(tenantSlug, (sql) => deleteIngrediente(sql, Number(id)))
    return apiSuccess(null, 204)
  })
}
