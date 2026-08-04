import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError } from '@/lib/errors'
import { masterDb } from '@/lib/db'
import * as TenantsService from '@/lib/services/tenants'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { user, tenantSlug } = getContext(req)
  return handle(async () => {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenError()
    if (!tenantSlug || tenantSlug === '__master__') throw new ForbiddenError()
    const sql = masterDb()
    const state = await TenantsService.getTenantExpiryState(sql, tenantSlug)
    return apiSuccess(state)
  })
}
