import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { masterDb } from '@/lib/db'
import { CreateTenantSchema } from '@/lib/schemas'
import * as TenantsService from '@/lib/services/tenants'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { user } = getContext(req)
  return handle(async () => {
    if (!user.roles.includes('SUPERADMIN')) throw new ForbiddenError()
    const sql = masterDb()
    const tenants = await TenantsService.listTenants(sql)
    return apiSuccess(tenants)
  })
}

export async function POST(req: NextRequest) {
  const { user } = getContext(req)
  return handle(async () => {
    if (!user.roles.includes('SUPERADMIN')) throw new ForbiddenError()
    const body = await req.json()
    const parsed = CreateTenantSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')
    const sql = masterDb()
    const tenant = await TenantsService.createTenant(sql, {
      nombre: parsed.data.nombre,
      slug: parsed.data.slug,
      adminEmail: parsed.data.adminEmail,
    })
    return apiSuccess(tenant, 201)
  })
}
