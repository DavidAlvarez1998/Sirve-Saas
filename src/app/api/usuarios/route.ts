import type { NextRequest } from 'next/server'
import { handle, apiSuccess, getContext } from '@/lib/http'
import { ForbiddenError, ValidationError } from '@/lib/errors'
import { masterDb } from '@/lib/db'
import { CreateUsuarioSchema } from '@/lib/schemas'
import * as UsuariosService from '@/lib/services/usuarios'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { tenantSlug, user } = getContext(req)
  return handle(async () => {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenError()
    const sql = masterDb()
    const usuarios = await UsuariosService.listUsuarios(sql, tenantSlug)
    return apiSuccess(usuarios)
  })
}

export async function POST(req: NextRequest) {
  const { tenantSlug, user } = getContext(req)
  return handle(async () => {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenError()
    const body = await req.json()
    const parsed = CreateUsuarioSchema.safeParse(body)
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? 'Invalid input')
    const sql = masterDb()
    const usuario = await UsuariosService.createUsuario(sql, tenantSlug, {
      username: parsed.data.username,
      password: parsed.data.password,
      roles: parsed.data.roles,
    })
    return apiSuccess(usuario, 201)
  })
}
