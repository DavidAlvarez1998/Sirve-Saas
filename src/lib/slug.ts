// ─── Slug utilities ───────────────────────────────────────────────────────────
// Pure functions — no DB access. Safe to import in tests without mocking.

export const RESERVED_SLUGS = [
  'master', 'admin', 'www', 'api', 'app', 'sirva',
  'superadmin', 'login', 'setup',
] as const

const RANDOM_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const MAX_BASE_LENGTH = 58 // reserves 5 chars for '-xxxx' suffix

/**
 * Derive a URL-safe slug from a human-readable restaurant name.
 *
 * Steps:
 *  1. Lowercase
 *  2. NFD normalize + strip combining marks (removes accents: á→a, ñ→n, etc.)
 *  3. Replace runs of non-alphanumeric characters with a single hyphen
 *  4. Strip leading/trailing hyphens
 *  5. Cap at 58 chars (leaves room for '-xxxx' collision suffix)
 *
 * Returns an empty string if the input produces no alphanumeric characters.
 */
export function deriveSlug(name: string): string {
  let s = name.toLowerCase()
  s = s.normalize('NFD').replace(/\p{M}/gu, '')
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  s = s.slice(0, MAX_BASE_LENGTH)
  return s
}

/**
 * Appends a 4-character random alphanumeric suffix separated by a hyphen.
 * Example: 'mi-restaurante' → 'mi-restaurante-k3f7'
 */
export function withRandomSuffix(base: string): string {
  let suffix = ''
  for (let i = 0; i < 4; i++) {
    suffix += RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)]
  }
  return `${base}-${suffix}`
}
