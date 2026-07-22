import type { Sql } from 'postgres'
import { NotFoundError, ConflictError } from '@/lib/errors'

export interface Producto {
  id: number
  nombre: string
  descripcion: string | null
  precio: number
  tipo: string
  imagenUrl: string | null
}

interface ProductoRow {
  id: bigint
  nombre: string
  descripcion: string | null
  precio: string
  tipo: string
  imagen_url: string | null
}

interface ProductoInput {
  nombre: string
  descripcion?: string
  precio: number
  tipo: string
  imagenUrl?: string | null
}

function toProducto(row: ProductoRow): Producto {
  return {
    id: Number(row.id),
    nombre: row.nombre,
    descripcion: row.descripcion,
    precio: Number(row.precio),
    tipo: row.tipo,
    imagenUrl: row.imagen_url,
  }
}

export async function listProductos(sql: Sql): Promise<Producto[]> {
  const rows = await sql<ProductoRow[]>`
    SELECT id, nombre, descripcion, precio, tipo, imagen_url
    FROM productos
    ORDER BY id
  `
  return rows.map(toProducto)
}

export async function getProducto(sql: Sql, id: number): Promise<Producto> {
  const rows = await sql<ProductoRow[]>`
    SELECT id, nombre, descripcion, precio, tipo, imagen_url
    FROM productos
    WHERE id = ${id}
    LIMIT 1
  `
  if (!rows[0]) throw new NotFoundError('Producto no encontrado')
  return toProducto(rows[0])
}

export async function createProducto(sql: Sql, data: ProductoInput): Promise<Producto> {
  const existing = await sql`SELECT id FROM productos WHERE nombre = ${data.nombre} LIMIT 1`
  if (existing.length > 0) throw new ConflictError('Ya existe un producto con ese nombre')

  const rows = await sql<ProductoRow[]>`
    INSERT INTO productos (nombre, descripcion, precio, tipo, imagen_url)
    VALUES (
      ${data.nombre},
      ${data.descripcion ?? null},
      ${data.precio},
      ${data.tipo},
      ${data.imagenUrl ?? null}
    )
    RETURNING id, nombre, descripcion, precio, tipo, imagen_url
  `
  return toProducto(rows[0])
}

export async function updateProducto(sql: Sql, id: number, data: ProductoInput): Promise<Producto> {
  await getProducto(sql, id)

  const rows = await sql<ProductoRow[]>`
    UPDATE productos
    SET
      nombre      = ${data.nombre},
      descripcion = ${data.descripcion ?? null},
      precio      = ${data.precio},
      tipo        = ${data.tipo},
      imagen_url  = ${data.imagenUrl ?? null}
    WHERE id = ${id}
    RETURNING id, nombre, descripcion, precio, tipo, imagen_url
  `
  return toProducto(rows[0])
}

export async function deleteProducto(sql: Sql, id: number): Promise<void> {
  await getProducto(sql, id)
  await sql`DELETE FROM productos WHERE id = ${id}`
}
