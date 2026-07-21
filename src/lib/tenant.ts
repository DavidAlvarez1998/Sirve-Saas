/**
 * Extracts the tenant slug from a hostname.
 * Same regex as the backend HOST_REGEX: accepts *.localhost and *.any-domain.
 * Returns null for bare "localhost", IP addresses, or hostnames without a subdomain.
 *
 * Pure function — no side effects. Safe to use in both middleware (edge) and client components.
 *
 * @param hostname - raw hostname string (e.g. "pepe.localhost", "pepe.miapp.com", "localhost")
 * @returns tenant slug string, or null if no recognizable subdomain
 */
export function resolveTenantSlug(hostname: string): string | null {
  const clean = hostname.split(':')[0].toLowerCase()
  const match = clean.match(/^([a-z0-9][a-z0-9-]*)\.([a-z0-9.-]+)$/)
  if (!match) return null
  const subdomain = match[1]
  return subdomain === 'admin' ? '__master__' : subdomain
}
