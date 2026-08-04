import type { Sql } from 'postgres'
import { ConflictError, NotFoundError } from '@/lib/errors'
import { sendInvitationEmail } from '@/lib/email'
import type { TenantExpiryState } from '@/types'

export interface Tenant {
  id: number
  slug: string
  nombre: string
  activo: boolean
  dbSchema: string
  createdAt: string
  setupUrl?: string
  fechaVencimiento?: string | null
}

export interface CreateTenantData {
  nombre: string
  slug: string
  adminEmail: string
}

interface TenantRow {
  id: bigint
  slug: string
  nombre: string
  activo: boolean
  db_schema: string
  created_at: Date
  fecha_vencimiento: Date | null
}

function toTenant(row: TenantRow, setupUrl?: string): Tenant {
  return {
    id: Number(row.id),
    slug: row.slug,
    nombre: row.nombre,
    activo: row.activo,
    dbSchema: row.db_schema,
    createdAt: row.created_at.toISOString(),
    fechaVencimiento: row.fecha_vencimiento ? row.fecha_vencimiento.toISOString() : null,
    ...(setupUrl !== undefined ? { setupUrl } : {}),
  }
}

export async function listTenants(sql: Sql): Promise<Tenant[]> {
  const rows = await sql<TenantRow[]>`
    SELECT id, slug, nombre, activo, db_schema, created_at, fecha_vencimiento
    FROM master.tenants
    ORDER BY created_at DESC
  `
  return rows.map(r => toTenant(r))
}

export async function getTenant(sql: Sql, slug: string): Promise<Tenant> {
  const rows = await sql<TenantRow[]>`
    SELECT id, slug, nombre, activo, db_schema, created_at, fecha_vencimiento
    FROM master.tenants
    WHERE slug = ${slug}
    LIMIT 1
  `
  if (rows.length === 0) throw new NotFoundError(`Tenant '${slug}' not found`)
  return toTenant(rows[0])
}

export async function createTenant(sql: Sql, data: CreateTenantData): Promise<Tenant> {
  const existing = await sql<{ id: bigint }[]>`
    SELECT id FROM master.tenants WHERE slug = ${data.slug} LIMIT 1
  `
  if (existing.length > 0) throw new ConflictError(`Tenant '${data.slug}' already exists`)

  const rows = await sql<TenantRow[]>`
    INSERT INTO master.tenants (slug, nombre, activo, db_schema)
    VALUES (${data.slug}, ${data.nombre}, true, ${'tenant_' + data.slug})
    RETURNING id, slug, nombre, activo, db_schema, created_at, fecha_vencimiento
  `
  const tenant = rows[0]

  await sql.unsafe(`SELECT master.provision_tenant_schema($1)`, [data.slug])

  const tokenRows = await sql<{ token: string }[]>`
    INSERT INTO master.invitaciones (tenant_slug, email, expires_at)
    VALUES (${data.slug}, ${data.adminEmail}, NOW() + INTERVAL '7 days')
    RETURNING token::text
  `
  const token = tokenRows[0].token
  const baseUrl = process.env.INVITATION_BASE_URL ?? 'http://localhost:3000'
  const setupUrl = `${baseUrl}/setup/${token}`

  try {
    await sendInvitationEmail({ to: data.adminEmail, tenantNombre: data.nombre, setupUrl })
  } catch (err) {
    await sql`UPDATE master.tenants SET activo = false WHERE slug = ${data.slug}`
    throw err
  }

  return toTenant(tenant, setupUrl)
}

export async function desactivarTenant(sql: Sql, id: number): Promise<Tenant> {
  const rows = await sql<TenantRow[]>`
    UPDATE master.tenants SET activo = false
    WHERE id = ${id}
    RETURNING id, slug, nombre, activo, db_schema, created_at, fecha_vencimiento
  `
  if (rows.length === 0) throw new NotFoundError(`Tenant id=${id} not found`)
  return toTenant(rows[0])
}

export async function updateTenantExpiry(
  sql: Sql,
  slug: string,
  fecha: Date | null
): Promise<Tenant> {
  const rows = await sql<TenantRow[]>`
    UPDATE master.tenants
    SET fecha_vencimiento = ${fecha}
    WHERE slug = ${slug}
    RETURNING id, slug, nombre, activo, db_schema, created_at, fecha_vencimiento
  `
  if (rows.length === 0) throw new NotFoundError(`Tenant '${slug}' not found`)
  return toTenant(rows[0])
}

export async function getTenantExpiryState(
  sql: Sql,
  slug: string
): Promise<TenantExpiryState> {
  const rows = await sql<{
    fecha_vencimiento: Date | null
    dias_restantes: number | null
    vencida: boolean
  }[]>`
    SELECT
      fecha_vencimiento,
      CASE
        WHEN fecha_vencimiento IS NULL THEN NULL
        ELSE FLOOR(EXTRACT(EPOCH FROM (fecha_vencimiento - NOW())) / 86400)::int
      END AS dias_restantes,
      (fecha_vencimiento IS NOT NULL AND fecha_vencimiento < NOW()) AS vencida
    FROM master.tenants
    WHERE slug = ${slug}
    LIMIT 1
  `
  if (rows.length === 0) throw new NotFoundError(`Tenant '${slug}' not found`)
  const row = rows[0]
  return {
    fechaVencimiento: row.fecha_vencimiento ? row.fecha_vencimiento.toISOString() : null,
    diasRestantes: row.dias_restantes,
    vencida: row.vencida,
  }
}

export async function isTenantExpired(sql: Sql, slug: string): Promise<boolean> {
  const rows = await sql<{ vencida: boolean }[]>`
    SELECT (fecha_vencimiento IS NOT NULL AND fecha_vencimiento < NOW()) AS vencida
    FROM master.tenants
    WHERE slug = ${slug}
    LIMIT 1
  `
  if (rows.length === 0) return false
  return rows[0].vencida
}
