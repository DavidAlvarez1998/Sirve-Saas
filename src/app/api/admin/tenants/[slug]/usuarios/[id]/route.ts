import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { masterDb } from '@/lib/db'
import { UpdateUsuarioSchema } from '@/lib/schemas'
import * as UsuariosService from '@/lib/services/usuarios'

export const runtime = 'nodejs'

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string; id: string }> }
) {
  const { user } = getContext(req)
  const { slug, id } = await ctx.params
  return handle(async () => {
    if (!user.roles.includes('SUPERADMIN')) throw new ForbiddenError()
    const numId = Number(id)
    if (!Number.isInteger(numId) || numId <= 0) throw new ValidationError('Invalid user id')
    const body = await req.json()
    const parsed = UpdateUsuarioSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')
    const sql = masterDb()
    const usuario = await UsuariosService.updateUsuarioCrossTenant(sql, numId, slug, parsed.data)
    return apiSuccess(usuario)
  })
}
