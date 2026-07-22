import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError } from '@/lib/errors'
import { withTenant } from '@/lib/db'
import * as ReportesService from '@/lib/services/reportes'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { tenantSlug, user } = getContext(req)
  return handle(async () => {
    if (!user.roles.includes('ADMIN')) {
      throw new ForbiddenError()
    }
    const { searchParams } = req.nextUrl
    const fechaInicio = searchParams.get('fechaInicio') ?? undefined
    const fechaFin = searchParams.get('fechaFin') ?? undefined

    const reporte = await withTenant(tenantSlug, (sql) =>
      ReportesService.getReporteVentas(sql, fechaInicio, fechaFin)
    )
    return apiSuccess(reporte)
  })
}
