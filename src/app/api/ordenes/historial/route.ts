import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { withTenant } from '@/lib/db'
import * as OrdenService from '@/lib/services/ordenes'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const { searchParams } = new URL(req.url)
    const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10))
    const size = Math.max(1, parseInt(searchParams.get('size') ?? '20', 10))

    const result = await withTenant(tenantSlug, (sql) =>
      OrdenService.getHistorial(sql, page, size)
    )
    return apiSuccess(result)
  })
}
