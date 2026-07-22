import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { masterDb } from '@/lib/db'
import * as TenantsService from '@/lib/services/tenants'

export const runtime = 'nodejs'

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { user } = getContext(req)
  const { slug } = await ctx.params
  return handle(async () => {
    if (!user.roles.includes('SUPERADMIN')) throw new ForbiddenError()
    const numId = Number(slug)
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError('Invalid tenant id')
    const sql = masterDb()
    const tenant = await TenantsService.desactivarTenant(sql, numId)
    return apiSuccess(tenant)
  })
}
