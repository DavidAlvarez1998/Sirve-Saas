import type { Sql } from 'postgres'
import { UnauthorizedError } from '@/lib/errors'
import { verifyPassword } from '@/lib/auth'
import { signJwt } from '@/lib/jwt'

interface LoginInput {
  username: string
  password: string
}

interface LoginResult {
  token: string
  username: string
  roles: string[]
  tenantId: string | null
}

interface UsuarioRow {
  id: bigint
  username: string
  password_hash: string
  tenant_slug: string | null
  activo: boolean
}

interface RolRow {
  rol: string
}

export async function login(sql: Sql, { username, password }: LoginInput): Promise<LoginResult> {
  const INVALID = 'Credenciales inválidas'

  const rows = await sql<UsuarioRow[]>`
    SELECT id, username, password_hash, tenant_slug, activo
    FROM master.usuarios
    WHERE username = ${username}
    LIMIT 1
  `

  const usuario = rows[0]
  if (!usuario) throw new UnauthorizedError(INVALID)

  const valid = await verifyPassword(password, usuario.password_hash)
  if (!valid) throw new UnauthorizedError(INVALID)

  if (!usuario.activo) throw new UnauthorizedError(INVALID)

  const rolRows = await sql<RolRow[]>`
    SELECT rol
    FROM master.usuario_roles
    WHERE usuario_id = ${Number(usuario.id)}
  `

  const roles = rolRows.map((r: RolRow) => r.rol)

  const token = await signJwt({
    sub: usuario.username,
    tenantId: usuario.tenant_slug,
    roles,
  })

  return { token, username: usuario.username, roles, tenantId: usuario.tenant_slug }
}
