import type { Sql } from 'postgres'
import type { Orden } from './ordenes'
import { buildOrden } from './ordenes'

export async function getPendientes(sql: Sql): Promise<Orden[]> {
  const rows = await sql<{ id: bigint }[]>`
    SELECT id FROM ordenes
    WHERE estado IN ('ABIERTA', 'EN_PREPARACION')
    ORDER BY fecha_creacion ASC
  `
  return Promise.all(rows.map(r => buildOrden(sql, Number(r.id))))
}

export async function getFinalizadas(sql: Sql): Promise<Orden[]> {
  const rows = await sql<{ id: bigint }[]>`
    SELECT id FROM ordenes
    WHERE estado IN ('LISTA', 'EN_CAMINO')
    ORDER BY fecha_creacion DESC
  `
  return Promise.all(rows.map(r => buildOrden(sql, Number(r.id))))
}
