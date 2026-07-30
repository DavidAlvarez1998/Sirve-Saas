import type { Sql, TransactionSql } from 'postgres'
import { NotFoundError, ConflictError } from '@/lib/errors'
import { hashPassword } from '@/lib/auth'

interface InvitacionInfo {
  tenantNombre: string
  adminEmail: string
  expiresAt: Date
}

interface CompletarSetupInput {
  email: string
  password: string
}

interface InvitacionRow {
  id: bigint
  tenant_slug: string
  email: string
  usado: boolean
  expires_at: Date
}

interface TenantRow {
  nombre: string
}

export async function getInvitacion(sql: Sql, token: string): Promise<InvitacionInfo> {
  const rows = await sql<InvitacionRow[]>`
    SELECT id, tenant_slug, email, usado, expires_at
    FROM master.invitaciones
    WHERE token = ${token}::uuid
    LIMIT 1
  `

  const inv = rows[0]
  if (!inv) throw new NotFoundError('Invitación no encontrada')
  if (inv.usado) throw new ConflictError('Invitación ya utilizada')
  if (new Date(inv.expires_at) < new Date()) throw new ConflictError('Invitación expirada')

  const tenants = await sql<TenantRow[]>`
    SELECT nombre
    FROM master.tenants
    WHERE slug = ${inv.tenant_slug}
    LIMIT 1
  `

  const tenant = tenants[0]
  if (!tenant) throw new NotFoundError('Tenant no encontrado')

  return {
    tenantNombre: tenant.nombre,
    adminEmail: inv.email,
    expiresAt: new Date(inv.expires_at),
  }
}

export async function completarSetup(
  sql: Sql,
  token: string,
  { email, password }: CompletarSetupInput,
): Promise<void> {
  await sql.begin(async (tx: TransactionSql) => {
    const rows = await tx<InvitacionRow[]>`
      SELECT id, tenant_slug, email, usado, expires_at
      FROM master.invitaciones
      WHERE token = ${token}::uuid
      FOR UPDATE
      LIMIT 1
    `

    const inv = rows[0]
    if (!inv) throw new NotFoundError('Invitación no encontrada')
    if (inv.usado) throw new ConflictError('Invitación ya utilizada')
    if (new Date(inv.expires_at) < new Date()) throw new ConflictError('Invitación expirada')

    const existing = await tx`
      SELECT id
      FROM master.usuarios
      WHERE username = ${email}
        AND tenant_slug = ${inv.tenant_slug}
      LIMIT 1
    `
    if (existing.length > 0) throw new ConflictError('El username ya existe en este tenant')

    const passwordHash = await hashPassword(password)

    const inserted = await tx<{ id: bigint }[]>`
      INSERT INTO master.usuarios (username, password_hash, email, tenant_slug, activo)
      VALUES (${email}, ${passwordHash}, ${email}, ${inv.tenant_slug}, TRUE)
      RETURNING id
    `

    await tx`
      INSERT INTO master.usuario_roles (usuario_id, rol)
      VALUES
        (${Number(inserted[0].id)}, 'ADMIN'),
        (${Number(inserted[0].id)}, 'MESERO'),
        (${Number(inserted[0].id)}, 'COCINA')
    `

    await tx`
      UPDATE master.invitaciones
      SET usado = TRUE
      WHERE id = ${Number(inv.id)}
    `
  })
}
