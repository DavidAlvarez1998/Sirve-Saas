import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { withTenant } from '@/lib/db'
import { MesaSchema } from '@/lib/schemas'
import { listMesas, createMesa } from '@/lib/services/mesas'

export async function GET(req: NextRequest) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const mesas = await withTenant(tenantSlug, (sql) => listMesas(sql))
    return apiSuccess(mesas)
  })
}

export async function POST(req: NextRequest) {
  const { tenantSlug, user } = getContext(req)
  return handle(async () => {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenError()

    const body = await req.json()
    const parsed = MesaSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')

    const mesa = await withTenant(tenantSlug, (sql) => createMesa(sql, parsed.data))
    return apiSuccess(mesa, 201)
  })
}
