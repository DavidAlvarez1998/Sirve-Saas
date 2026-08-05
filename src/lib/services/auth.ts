import type { Sql, TransactionSql } from 'postgres'
import { UnauthorizedError, ConflictError, AppError } from '@/lib/errors'
import { verifyPassword, hashPassword } from '@/lib/auth'
import { signJwt } from '@/lib/jwt'
import { deriveSlug, withRandomSuffix, RESERVED_SLUGS } from '@/lib/slug'

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

// ─── Register ─────────────────────────────────────────────────────────────────

interface RegisterInput {
  orgName:     string
  fullName:    string
  email:       string
  password:    string
}

interface RegisterResult {
  token:  string
  user:   { id: number; email: string; fullName: string }
  tenant: { slug: string; nombre: string }
}

/**
 * Self-serve registration:
 *  1. Check duplicate email in master.usuarios
 *  2. Derive slug (up to 3 collision retries with random suffix)
 *  3. [outside tx] INSERT master.tenants (activo=false) — orphan marker
 *  4. [outside tx] provision_tenant_schema() — DDL cannot run inside a pg tx (PgBouncer)
 *  5. [sql.begin()] flip activo=true, INSERT usuario + role
 *  6. Sign JWT, return result
 */
export async function register(
  sql: Sql,
  { orgName, fullName, email, password }: RegisterInput
): Promise<RegisterResult> {
  // ── 1. Duplicate email check ───────────────────────────────────────────────
  const existing = await sql<{ id: bigint }[]>`
    SELECT id FROM master.usuarios WHERE email = ${email} LIMIT 1
  `
  if (existing.length > 0) {
    throw new ConflictError('Email ya registrado')
  }

  // ── 2. Slug derivation with collision retries ──────────────────────────────
  let base = deriveSlug(orgName)
  if (!base || (RESERVED_SLUGS as readonly string[]).includes(base)) {
    base = withRandomSuffix(base || 'r')
  }

  let slug = base
  let attempts = 0
  const MAX_RETRIES = 3

  while (attempts < MAX_RETRIES) {
    const collision = await sql<{ id: bigint }[]>`
      SELECT id FROM master.tenants WHERE slug = ${slug} LIMIT 1
    `
    if (collision.length === 0) break
    slug = withRandomSuffix(base)
    attempts++
    if (attempts === MAX_RETRIES) {
      throw new AppError(500, 'No se pudo generar un slug único. Intentá con un nombre diferente.')
    }
  }

  // ── 3. Insert tenant as orphan (activo=false) ──────────────────────────────
  await sql`
    INSERT INTO master.tenants (slug, nombre, activo, db_schema)
    VALUES (${slug}, ${orgName}, false, ${'tenant_' + slug})
  `

  // ── 4. Provision tenant schema OUTSIDE any transaction (DDL + PgBouncer) ──
  try {
    await sql.unsafe('SELECT master.provision_tenant_schema($1)', [slug])
  } catch {
    // Orphan row (activo=false) remains for ops cleanup
    throw new AppError(500, 'Error al provisionar el tenant')
  }

  // ── 5. Inside transaction: activate tenant + create user + assign role ─────
  const passwordHash = await hashPassword(password)

  const result = await sql.begin(async (tx: TransactionSql) => {
    await tx`
      UPDATE master.tenants SET activo = true WHERE slug = ${slug}
    `

    const inserted = await tx<{ id: bigint }[]>`
      INSERT INTO master.usuarios (username, password_hash, email, tenant_slug, activo, nombre_completo)
      VALUES (${email}, ${passwordHash}, ${email}, ${slug}, true, ${fullName})
      RETURNING id
    `
    const userId = Number(inserted[0].id)

    await tx`
      INSERT INTO master.usuario_roles (usuario_id, rol)
      VALUES (${userId}, 'ADMIN')
    `

    return { userId }
  })

  // ── 6. Sign JWT ────────────────────────────────────────────────────────────
  const token = await signJwt({
    sub: email,
    tenantId: slug,
    roles: ['ADMIN'],
  })

  return {
    token,
    user: { id: result.userId, email, fullName },
    tenant: { slug, nombre: orgName },
  }
}
