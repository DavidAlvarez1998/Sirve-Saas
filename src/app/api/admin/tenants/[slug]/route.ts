import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { masterDb } from '@/lib/db'
import * as TenantsService from '@/lib/services/tenants'
import { UpdateTenantExpirySchema } from '@/lib/schemas'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { user } = getContext(req)
  const { slug } = await ctx.params
  return handle(async () => {
    if (!user.roles.includes('SUPERADMIN')) throw new ForbiddenError()
    const sql = masterDb()
    const tenant = await TenantsService.getTenant(sql, slug)
    return apiSuccess(tenant)
  })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { user } = getContext(req)
  const { slug } = await ctx.params
  return handle(async () => {
    if (!user.roles.includes('SUPERADMIN')) throw new ForbiddenError()
    const body = await req.json()
    const parsed = UpdateTenantExpirySchema.safeParse(body)
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')
    }
    const { fechaVencimiento } = parsed.data
    const fecha = fechaVencimiento !== null ? new Date(fechaVencimiento) : null
    const sql = masterDb()
    const tenant = await TenantsService.updateTenantExpiry(sql, slug, fecha)
    return apiSuccess(tenant)
  })
}
