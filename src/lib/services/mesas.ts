import type { Sql } from 'postgres'
import { NotFoundError, ConflictError } from '@/lib/errors'

export interface Mesa {
  id: number
  numero: string
}

interface MesaRow {
  id: bigint
  numero: string
}

function toMesa(row: MesaRow): Mesa {
  return { id: Number(row.id), numero: row.numero }
}

export async function listMesas(sql: Sql): Promise<Mesa[]> {
  const rows = await sql<MesaRow[]>`SELECT id, numero FROM mesas ORDER BY id`
  return rows.map(toMesa)
}

export async function getMesa(sql: Sql, id: number): Promise<Mesa> {
  const rows = await sql<MesaRow[]>`SELECT id, numero FROM mesas WHERE id = ${id} LIMIT 1`
  if (!rows[0]) throw new NotFoundError('Mesa no encontrada')
  return toMesa(rows[0])
}

export async function createMesa(sql: Sql, { numero }: { numero: string }): Promise<Mesa> {
  const existing = await sql`SELECT id FROM mesas WHERE numero = ${numero} LIMIT 1`
  if (existing.length > 0) throw new ConflictError('Ya existe una mesa con ese número')

  const rows = await sql<MesaRow[]>`
    INSERT INTO mesas (numero) VALUES (${numero}) RETURNING id, numero
  `
  return toMesa(rows[0])
}

export async function updateMesa(sql: Sql, id: number, { numero }: { numero: string }): Promise<Mesa> {
  await getMesa(sql, id)

  const rows = await sql<MesaRow[]>`
    UPDATE mesas SET numero = ${numero} WHERE id = ${id} RETURNING id, numero
  `
  return toMesa(rows[0])
}

export async function deleteMesa(sql: Sql, id: number): Promise<void> {
  await getMesa(sql, id)
  await sql`DELETE FROM mesas WHERE id = ${id}`
}
