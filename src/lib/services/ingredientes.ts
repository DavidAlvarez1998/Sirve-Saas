import type { Sql } from 'postgres'
import { NotFoundError, ConflictError } from '@/lib/errors'

export interface Ingrediente {
  id: number
  nombre: string
  precio: number
  imagenUrl: string | null
}

interface IngredienteRow {
  id: bigint
  nombre: string
  precio: string
  imagen_url: string | null
}

interface IngredienteInput {
  nombre: string
  precio: number
  imagenUrl?: string | null
}

function toIngrediente(row: IngredienteRow): Ingrediente {
  return {
    id: Number(row.id),
    nombre: row.nombre,
    precio: Number(row.precio),
    imagenUrl: row.imagen_url,
  }
}

export async function listIngredientes(sql: Sql): Promise<Ingrediente[]> {
  const rows = await sql<IngredienteRow[]>`
    SELECT id, nombre, precio, imagen_url
    FROM ingredientes
    ORDER BY id
  `
  return rows.map(toIngrediente)
}

export async function getIngrediente(sql: Sql, id: number): Promise<Ingrediente> {
  const rows = await sql<IngredienteRow[]>`
    SELECT id, nombre, precio, imagen_url
    FROM ingredientes
    WHERE id = ${id}
    LIMIT 1
  `
  if (!rows[0]) throw new NotFoundError('Ingrediente no encontrado')
  return toIngrediente(rows[0])
}

export async function createIngrediente(sql: Sql, data: IngredienteInput): Promise<Ingrediente> {
  const existing = await sql`SELECT id FROM ingredientes WHERE nombre = ${data.nombre} LIMIT 1`
  if (existing.length > 0) throw new ConflictError('Ya existe un ingrediente con ese nombre')

  const rows = await sql<IngredienteRow[]>`
    INSERT INTO ingredientes (nombre, precio, imagen_url)
    VALUES (${data.nombre}, ${data.precio}, ${data.imagenUrl ?? null})
    RETURNING id, nombre, precio, imagen_url
  `
  return toIngrediente(rows[0])
}

export async function updateIngrediente(sql: Sql, id: number, data: IngredienteInput): Promise<Ingrediente> {
  await getIngrediente(sql, id)

  const rows = await sql<IngredienteRow[]>`
    UPDATE ingredientes
    SET
      nombre     = ${data.nombre},
      precio     = ${data.precio},
      imagen_url = ${data.imagenUrl ?? null}
    WHERE id = ${id}
    RETURNING id, nombre, precio, imagen_url
  `
  return toIngrediente(rows[0])
}

export async function deleteIngrediente(sql: Sql, id: number): Promise<void> {
  await getIngrediente(sql, id)
  await sql`DELETE FROM ingredientes WHERE id = ${id}`
}
