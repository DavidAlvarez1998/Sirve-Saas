import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { withTenant } from '@/lib/db'
import { IngredienteSchema } from '@/lib/schemas'
import { listIngredientes, createIngrediente } from '@/lib/services/ingredientes'

export async function GET(req: NextRequest) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const ingredientes = await withTenant(tenantSlug, (sql) => listIngredientes(sql))
    return apiSuccess(ingredientes)
  })
}

export async function POST(req: NextRequest) {
  const { tenantSlug, user } = getContext(req)
  return handle(async () => {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenError()

    const body = await req.json()
    const parsed = IngredienteSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')

    const ingrediente = await withTenant(tenantSlug, (sql) =>
      createIngrediente(sql, {
        nombre: parsed.data.nombre,
        precio: parsed.data.precio,
        imagenUrl: parsed.data.imagenUrl,
      }),
    )
    return apiSuccess(ingrediente, 201)
  })
}
