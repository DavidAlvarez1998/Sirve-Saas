import postgres, { type Sql } from 'postgres'
import { ValidationError } from './errors'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL environment variable is required')

const POOL_CONFIG = {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 30,
  prepare: false, // required for PgBouncer compatibility
} as const

// Singleton master pool — queries use explicit master.* schema prefix
let _master: Sql | null = null
export function masterDb(): Sql {
  if (!_master) {
    _master = postgres(url!, { ...POOL_CONFIG, max: 5 })
  }
  return _master
}

// Shared tenant pool — search_path is set per-connection reservation
let _tenantPool: Sql | null = null
function tenantPool(): Sql {
  if (!_tenantPool) {
    _tenantPool = postgres(url!, POOL_CONFIG)
  }
  return _tenantPool
}

/**
 * Reserve a connection, apply tenant search_path, execute fn, always release.
 * Every tenant-scoped query MUST go through this to prevent data leakage between tenants.
 */
export async function withTenant<T>(
  slug: string,
  fn: (sql: Sql) => Promise<T>
): Promise<T> {
  const schema = schemaName(slug)
  const reserved = await tenantPool().reserve()
  try {
    await reserved.unsafe(`SET search_path TO ${schema}, public`)
    return await fn(reserved as unknown as Sql)
  } finally {
    reserved.release()
  }
}

/**
 * Validate and return the quoted schema name for a tenant slug.
 * Throws ValidationError if slug contains disallowed characters — prevents SET search_path injection.
 */
export function schemaName(slug: string): string {
  if (!/^[a-z0-9-]{1,63}$/.test(slug)) {
    throw new ValidationError('Invalid tenant slug format')
  }
  return `"tenant_${slug}"`
}
