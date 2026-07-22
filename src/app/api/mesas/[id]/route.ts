import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { withTenant } from '@/lib/db'
import { MesaSchema } from '@/lib/schemas'
import { getMesa, updateMesa, deleteMesa } from '@/lib/services/mesas'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { tenantSlug } = getContext(req)
  return handle(async () => {
    const { id } = await params
    const mesa = await withTenant(tenantSlug, (sql) => getMesa(sql, Number(id)))
    return apiSuccess(mesa)
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
    const parsed = MesaSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')

    const mesa = await withTenant(tenantSlug, (sql) => updateMesa(sql, Number(id), parsed.data))
    return apiSuccess(mesa)
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
    await withTenant(tenantSlug, (sql) => deleteMesa(sql, Number(id)))
    return apiSuccess(null, 204)
  })
}
