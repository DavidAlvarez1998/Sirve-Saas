import type { Sql } from 'postgres'
import { NotFoundError, ConflictError, ForbiddenError } from '@/lib/errors'
import { hashPassword } from '@/lib/auth'

export interface Usuario {
  id: number
  username: string
  email: string | null
  roles: string[]
  tenantSlug: string | null
  activo: boolean
  createdAt: string
}

export interface CreateUsuarioData {
  username: string
  password: string
  roles: string[]
}

export interface UpdateUsuarioData {
  username?: string
  email?: string | null
  password?: string
  roles?: string[]
  activo?: boolean
}

const ALLOWED_ROLES = new Set(['MESERO', 'COCINA'])

interface UsuarioRow {
  id: bigint
  username: string
  email: string | null
  tenant_slug: string | null
  activo: boolean
  created_at: Date
}

function toUsuario(row: UsuarioRow, roles: string[]): Usuario {
  return {
    id: Number(row.id),
    username: row.username,
    email: row.email,
    roles,
    tenantSlug: row.tenant_slug,
    activo: row.activo,
    createdAt: row.created_at.toISOString(),
  }
}

async function fetchRoles(sql: Sql, usuarioId: bigint): Promise<string[]> {
  const rows = await sql<{ rol: string }[]>`
    SELECT rol FROM master.usuario_roles WHERE usuario_id = ${Number(usuarioId)}
  `
  return rows.map((r: { rol: string }) => r.rol)
}

export async function listUsuarios(sql: Sql, tenantSlug: string): Promise<Usuario[]> {
  const rows = await sql<UsuarioRow[]>`
    SELECT id, username, email, tenant_slug, activo, created_at
    FROM master.usuarios
    WHERE tenant_slug = ${tenantSlug}
    ORDER BY created_at ASC
  `
  return Promise.all(rows.map(async (r: UsuarioRow) => toUsuario(r, await fetchRoles(sql, r.id))))
}

export async function listUsuariosByTenant(sql: Sql, tenantSlug: string): Promise<Usuario[]> {
  const rows = await sql<UsuarioRow[]>`
    SELECT id, username, email, tenant_slug, activo, created_at
    FROM master.usuarios
    WHERE tenant_slug = ${tenantSlug}
    ORDER BY created_at ASC
  `
  return Promise.all(rows.map(async (r: UsuarioRow) => {
    const roles = await sql<{ rol: string }[]>`
      SELECT rol FROM master.usuario_roles WHERE usuario_id = ${Number(r.id)}
    `
    return toUsuario(r, roles.map((x: { rol: string }) => x.rol))
  }))
}

export async function createUsuario(
  sql: Sql,
  tenantSlug: string,
  data: CreateUsuarioData
): Promise<Usuario> {
  for (const rol of data.roles) {
    if (!ALLOWED_ROLES.has(rol)) {
      throw new ForbiddenError(`Role '${rol}' is not allowed for this operation`)
    }
  }

  const existing = await sql<{ id: bigint }[]>`
    SELECT id FROM master.usuarios
    WHERE username = ${data.username} AND tenant_slug = ${tenantSlug}
    LIMIT 1
  `
  if (existing.length > 0) throw new ConflictError(`Username '${data.username}' already exists`)

  const passwordHash = await hashPassword(data.password)

  const rows = await sql<UsuarioRow[]>`
    INSERT INTO master.usuarios (username, password_hash, tenant_slug, activo)
    VALUES (${data.username}, ${passwordHash}, ${tenantSlug}, true)
    RETURNING id, username, email, tenant_slug, activo, created_at
  `
  const usuario = rows[0]

  for (const rol of data.roles) {
    await sql`
      INSERT INTO master.usuario_roles (usuario_id, rol) VALUES (${Number(usuario.id)}, ${rol})
    `
  }

  return toUsuario(usuario, data.roles)
}

export async function updateUsuario(
  sql: Sql,
  id: number,
  tenantSlug: string,
  data: UpdateUsuarioData,
  callerUsername: string
): Promise<Usuario> {
  const rows = await sql<UsuarioRow[]>`
    SELECT id, username, email, tenant_slug, activo, created_at
    FROM master.usuarios
    WHERE id = ${id}
    LIMIT 1
  `
  if (rows.length === 0 || rows[0].tenant_slug !== tenantSlug) {
    throw new NotFoundError(`Usuario ${id} not found`)
  }
  if (rows[0].username === callerUsername) {
    if (data.roles !== undefined) throw new ForbiddenError('No podés cambiar tus propios roles')
    if (data.activo === false) throw new ForbiddenError('No podés desactivar tu propia cuenta')
  }

  const current = rows[0]
  const passwordHash = data.password ? await hashPassword(data.password) : null

  if (passwordHash) {
    await sql`
      UPDATE master.usuarios
      SET
        username      = ${data.username ?? current.username},
        email         = ${data.email !== undefined ? data.email : current.email},
        password_hash = ${passwordHash},
        activo        = ${data.activo !== undefined ? data.activo : current.activo}
      WHERE id = ${id}
    `
  } else {
    await sql`
      UPDATE master.usuarios
      SET
        username = ${data.username ?? current.username},
        email    = ${data.email !== undefined ? data.email : current.email},
        activo   = ${data.activo !== undefined ? data.activo : current.activo}
      WHERE id = ${id}
    `
  }

  if (data.roles) {
    await sql`DELETE FROM master.usuario_roles WHERE usuario_id = ${id}`
    for (const rol of data.roles) {
      await sql`
        INSERT INTO master.usuario_roles (usuario_id, rol) VALUES (${id}, ${rol})
      `
    }
  }

  const currentRoles = data.roles ?? await fetchRoles(sql, current.id)
  const updatedRows = await sql<UsuarioRow[]>`
    SELECT id, username, email, tenant_slug, activo, created_at
    FROM master.usuarios WHERE id = ${id} LIMIT 1
  `
  return toUsuario(updatedRows[0], currentRoles)
}

export async function deleteUsuario(sql: Sql, id: number, tenantSlug: string, callerUsername: string): Promise<void> {
  const rows = await sql<{ id: bigint; tenant_slug: string | null; username: string }[]>`
    SELECT id, tenant_slug, username FROM master.usuarios WHERE id = ${id} LIMIT 1
  `
  if (rows.length === 0 || rows[0].tenant_slug !== tenantSlug) {
    throw new NotFoundError(`Usuario ${id} not found`)
  }
  if (rows[0].username === callerUsername) {
    throw new ForbiddenError('No podés eliminarte a vos mismo')
  }
  await sql`DELETE FROM master.usuarios WHERE id = ${id}`
}

export async function updateUsuarioCrossTenant(
  sql: Sql,
  id: number,
  tenantSlug: string,
  data: UpdateUsuarioData
): Promise<Usuario> {
  const rows = await sql<UsuarioRow[]>`
    SELECT id, username, email, tenant_slug, activo, created_at
    FROM master.usuarios
    WHERE id = ${id}
    LIMIT 1
  `
  if (rows.length === 0 || rows[0].tenant_slug !== tenantSlug) {
    throw new NotFoundError(`Usuario ${id} not found`)
  }

  const current = rows[0]
  const passwordHash = data.password ? await hashPassword(data.password) : null

  if (passwordHash) {
    await sql`
      UPDATE master.usuarios
      SET
        username      = ${data.username ?? current.username},
        email         = ${data.email !== undefined ? data.email : current.email},
        password_hash = ${passwordHash},
        activo        = ${data.activo !== undefined ? data.activo : current.activo}
      WHERE id = ${id}
    `
  } else {
    await sql`
      UPDATE master.usuarios
      SET
        username = ${data.username ?? current.username},
        email    = ${data.email !== undefined ? data.email : current.email},
        activo   = ${data.activo !== undefined ? data.activo : current.activo}
      WHERE id = ${id}
    `
  }

  if (data.roles) {
    await sql`DELETE FROM master.usuario_roles WHERE usuario_id = ${id}`
    for (const rol of data.roles) {
      await sql`
        INSERT INTO master.usuario_roles (usuario_id, rol) VALUES (${id}, ${rol})
      `
    }
  }

  const currentRoles = data.roles ?? await (async () => {
    const r = await sql<{ rol: string }[]>`
      SELECT rol FROM master.usuario_roles WHERE usuario_id = ${id}
    `
    return r.map(x => x.rol)
  })()

  const updatedRows = await sql<UsuarioRow[]>`
    SELECT id, username, email, tenant_slug, activo, created_at
    FROM master.usuarios WHERE id = ${id} LIMIT 1
  `
  return toUsuario(updatedRows[0], currentRoles)
}
