/**
 * Formats a number as Argentine Peso currency (ARS).
 * Returns "$ 0" for null/undefined/NaN values.
 */
export function formatCurrency(n: number): string {
  if (n == null || isNaN(n)) return '$ 0'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(n))
}

/**
 * Formats an ISO date string as a localized date+time string (es-AR).
 * Returns an empty string for falsy/invalid input.
 */
export function formatDate(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

/**
 * Legacy alias — formats a number with es-CO locale rounding.
 * Kept for compatibility during migration.
 */
export function fmt(v: number | null | undefined): string {
  if (v == null) return '0'
  return Math.round(v).toLocaleString('es-CO')
}
