import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError } from '@/lib/errors'
import { withTenant } from '@/lib/db'
import * as CocinaService from '@/lib/services/cocina'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { tenantSlug, user } = getContext(req)
  return handle(async () => {
    if (!user.roles.some(r => r === 'COCINA' || r === 'ADMIN')) {
      throw new ForbiddenError()
    }
    const ordenes = await withTenant(tenantSlug, (sql) => CocinaService.getPendientes(sql))
    return apiSuccess(ordenes)
  })
}
