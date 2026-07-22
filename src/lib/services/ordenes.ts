import type { Sql, TransactionSql } from 'postgres'
import { NotFoundError, ConflictError, ValidationError } from '@/lib/errors'

// ─── Domain Types ────────────────────────────────────────────────────────────

export interface OrdenItemIngrediente {
  id: number
  itemId: number
  ingredienteId: number
  nombre: string
  cantidad: number
  precioUnitario: number
}

export interface OrdenItem {
  id: number
  ordenId: number
  productoId: number
  nombreProducto: string
  cantidad: number
  precioUnitario: number
  notas: string | null
  ingredientes: OrdenItemIngrediente[]
}

export interface Pago {
  id: number
  ordenId: number
  montoPagado: number
  metodoPago: string
  propina: number | null
  fechaPago: string
}

export interface Orden {
  id: number
  tipoOrden: string
  mesaId: number | null
  nombreCliente: string | null
  telefonoCliente: string | null
  direccionEntrega: string | null
  fechaCreacion: string
  fechaModificacion: string | null
  estado: string
  pagada: boolean
  totalMonto: number
  items: OrdenItem[]
  pagos: Pago[]
}

export interface CreateOrdenData {
  tipoOrden: string
  mesaId?: number | null
  nombreCliente?: string | null
  telefonoCliente?: string | null
  direccionEntrega?: string | null
}

export interface AddItemIngrediente {
  ingredienteId: number
  cantidad: number
}

export interface AddItemData {
  productoId: number
  cantidad: number
  notas?: string
  ingredientes?: AddItemIngrediente[]
}

export type UpdateItemData = AddItemData

export interface UpdateOrdenData {
  nombreCliente?: string | null
  telefonoCliente?: string | null
  direccionEntrega?: string | null
}

export interface PagarOrdenData {
  montoPagado: number
  propina?: number
  metodoPago: string
}

export interface DividirItemData {
  itemId: number
  cantidad: number
}

export interface DividirOrdenData {
  items: DividirItemData[]
}

// ─── DB row types ─────────────────────────────────────────────────────────────

interface OrdenRow {
  id: bigint
  tipo_orden: string
  mesa_id: bigint | null
  nombre_cliente: string | null
  telefono_cliente: string | null
  direccion_entrega: string | null
  fecha_creacion: Date
  fecha_modificacion: Date | null
  estado: string
  pagada: boolean
  total_monto: string | null
}

interface ItemRow {
  id: bigint
  orden_id: bigint
  producto_id: bigint
  nombre_producto: string
  cantidad: number
  precio_unitario: string
  notas: string | null
}

interface IngredienteRow {
  id: bigint
  item_id: bigint
  ingrediente_id: bigint
  nombre: string
  cantidad: string
  precio_unitario: string
}

interface PagoRow {
  id: bigint
  orden_id: bigint
  monto_pagado: string
  metodo_pago: string
  propina: string | null
  fecha_pago: Date
}

// ─── State machine ────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  ABIERTA: ['EN_PREPARACION', 'CANCELADA'],
  EN_PREPARACION: ['LISTA', 'CANCELADA'],
  LISTA: ['EN_CAMINO', 'ENTREGADA', 'CANCELADA'],
  EN_CAMINO: ['ENTREGADA', 'CANCELADA'],
  ENTREGADA: ['PAGADA'],
}

const ACTIVE_STATES = ['ABIERTA', 'EN_PREPARACION', 'LISTA', 'EN_CAMINO', 'ENTREGADA']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toOrden(row: OrdenRow, items: OrdenItem[], pagos: Pago[]): Orden {
  return {
    id: Number(row.id),
    tipoOrden: row.tipo_orden,
    mesaId: row.mesa_id != null ? Number(row.mesa_id) : null,
    nombreCliente: row.nombre_cliente,
    telefonoCliente: row.telefono_cliente,
    direccionEntrega: row.direccion_entrega,
    fechaCreacion: row.fecha_creacion.toISOString(),
    fechaModificacion: row.fecha_modificacion ? row.fecha_modificacion.toISOString() : null,
    estado: row.estado,
    pagada: row.pagada,
    totalMonto: Number(row.total_monto ?? 0),
    items,
    pagos,
  }
}

function toItem(row: ItemRow, ingredientes: OrdenItemIngrediente[]): OrdenItem {
  return {
    id: Number(row.id),
    ordenId: Number(row.orden_id),
    productoId: Number(row.producto_id),
    nombreProducto: row.nombre_producto,
    cantidad: row.cantidad,
    precioUnitario: Number(row.precio_unitario),
    notas: row.notas,
    ingredientes,
  }
}

function toIngrediente(row: IngredienteRow): OrdenItemIngrediente {
  return {
    id: Number(row.id),
    itemId: Number(row.item_id),
    ingredienteId: Number(row.ingrediente_id),
    nombre: row.nombre,
    cantidad: Number(row.cantidad),
    precioUnitario: Number(row.precio_unitario),
  }
}

function toPago(row: PagoRow): Pago {
  return {
    id: Number(row.id),
    ordenId: Number(row.orden_id),
    montoPagado: Number(row.monto_pagado),
    metodoPago: row.metodo_pago,
    propina: row.propina != null ? Number(row.propina) : null,
    fechaPago: row.fecha_pago.toISOString(),
  }
}

export async function buildOrden(sql: Sql | TransactionSql, id: number): Promise<Orden> {
  const rows = await sql<OrdenRow[]>`
    SELECT id, tipo_orden, mesa_id, nombre_cliente, telefono_cliente, direccion_entrega,
           fecha_creacion, fecha_modificacion, estado, pagada, total_monto
    FROM ordenes
    WHERE id = ${id}
    LIMIT 1
  `
  if (!rows[0]) throw new NotFoundError('Orden no encontrada')

  const itemRows = await sql<ItemRow[]>`
    SELECT oi.id, oi.orden_id, oi.producto_id, p.nombre AS nombre_producto,
           oi.cantidad, oi.precio_unitario, oi.notas
    FROM orden_items oi
    JOIN productos p ON p.id = oi.producto_id
    WHERE oi.orden_id = ${id}
    ORDER BY oi.id
  `

  const itemIds = itemRows.map((r) => Number(r.id))
  let ingRows: IngredienteRow[] = []
  if (itemIds.length > 0) {
    ingRows = await sql<IngredienteRow[]>`
      SELECT oii.id, oii.item_id, oii.ingrediente_id, ing.nombre,
             oii.cantidad, oii.precio_unitario
      FROM orden_item_ingredientes oii
      JOIN ingredientes ing ON ing.id = oii.ingrediente_id
      WHERE oii.item_id = ANY(${sql.array(itemIds)})
      ORDER BY oii.id
    `
  }

  const ingByItem = new Map<number, OrdenItemIngrediente[]>()
  for (const ir of ingRows) {
    const key = Number(ir.item_id)
    if (!ingByItem.has(key)) ingByItem.set(key, [])
    ingByItem.get(key)!.push(toIngrediente(ir))
  }

  const items = itemRows.map((ir) =>
    toItem(ir, ingByItem.get(Number(ir.id)) ?? [])
  )

  const pagoRows = await sql<PagoRow[]>`
    SELECT id, orden_id, monto_pagado, metodo_pago, propina, fecha_pago
    FROM pagos
    WHERE orden_id = ${id}
    ORDER BY id
  `

  return toOrden(rows[0], items, pagoRows.map(toPago))
}

async function recalcularTotal(sql: Sql | TransactionSql, ordenId: number): Promise<void> {
  await sql`
    UPDATE ordenes
    SET total_monto = (
      SELECT COALESCE(SUM(
        (oi.precio_unitario + COALESCE(
          (SELECT SUM(oii.precio_unitario * oii.cantidad)
           FROM orden_item_ingredientes oii
           WHERE oii.item_id = oi.id),
          0
        )) * oi.cantidad
      ), 0)
      FROM orden_items oi
      WHERE oi.orden_id = ${ordenId}
    ),
    fecha_modificacion = NOW()
    WHERE id = ${ordenId}
  `
}

function assertOrdenActiva(orden: Orden): void {
  if (!ACTIVE_STATES.includes(orden.estado)) {
    throw new ConflictError('La orden no está en un estado activo')
  }
}

// ─── Public service functions ─────────────────────────────────────────────────

export async function createOrden(sql: Sql, data: CreateOrdenData): Promise<Orden> {
  return sql.begin(async (tx: TransactionSql) => {
    if (data.tipoOrden === 'MESA') {
      if (!data.mesaId) throw new NotFoundError('Mesa no encontrada')
      const mesa = await tx`SELECT id FROM mesas WHERE id = ${data.mesaId} LIMIT 1`
      if (!mesa[0]) throw new NotFoundError('Mesa no encontrada')
    }

    const rows = await tx<OrdenRow[]>`
      INSERT INTO ordenes (
        tipo_orden, mesa_id, nombre_cliente, telefono_cliente,
        direccion_entrega, estado, pagada, total_monto, fecha_creacion
      ) VALUES (
        ${data.tipoOrden},
        ${data.mesaId ?? null},
        ${data.nombreCliente ?? null},
        ${data.telefonoCliente ?? null},
        ${data.direccionEntrega ?? null},
        'ABIERTA',
        false,
        0,
        NOW()
      )
      RETURNING id, tipo_orden, mesa_id, nombre_cliente, telefono_cliente,
                direccion_entrega, fecha_creacion, fecha_modificacion, estado, pagada, total_monto
    `

    return toOrden(rows[0], [], [])
  })
}

export async function getOrdenes(sql: Sql): Promise<Orden[]> {
  const rows = await sql<OrdenRow[]>`
    SELECT id, tipo_orden, mesa_id, nombre_cliente, telefono_cliente, direccion_entrega,
           fecha_creacion, fecha_modificacion, estado, pagada, total_monto
    FROM ordenes
    WHERE estado NOT IN ('PAGADA', 'CANCELADA')
    ORDER BY id
  `

  if (rows.length === 0) return []

  const ordenIds = rows.map((r) => Number(r.id))

  const itemRows = await sql<ItemRow[]>`
    SELECT oi.id, oi.orden_id, oi.producto_id, p.nombre AS nombre_producto,
           oi.cantidad, oi.precio_unitario, oi.notas
    FROM orden_items oi
    JOIN productos p ON p.id = oi.producto_id
    WHERE oi.orden_id = ANY(${sql.array(ordenIds)})
    ORDER BY oi.orden_id, oi.id
  `

  const itemIds = itemRows.map((r) => Number(r.id))
  let ingRows: IngredienteRow[] = []
  if (itemIds.length > 0) {
    ingRows = await sql<IngredienteRow[]>`
      SELECT oii.id, oii.item_id, oii.ingrediente_id, ing.nombre,
             oii.cantidad, oii.precio_unitario
      FROM orden_item_ingredientes oii
      JOIN ingredientes ing ON ing.id = oii.ingrediente_id
      WHERE oii.item_id = ANY(${sql.array(itemIds)})
      ORDER BY oii.id
    `
  }

  const pagoRows = await sql<PagoRow[]>`
    SELECT id, orden_id, monto_pagado, metodo_pago, propina, fecha_pago
    FROM pagos
    WHERE orden_id = ANY(${sql.array(ordenIds)})
    ORDER BY id
  `

  const ingByItem = new Map<number, OrdenItemIngrediente[]>()
  for (const ir of ingRows) {
    const key = Number(ir.item_id)
    if (!ingByItem.has(key)) ingByItem.set(key, [])
    ingByItem.get(key)!.push(toIngrediente(ir))
  }

  const itemsByOrden = new Map<number, OrdenItem[]>()
  for (const ir of itemRows) {
    const key = Number(ir.orden_id)
    if (!itemsByOrden.has(key)) itemsByOrden.set(key, [])
    itemsByOrden.get(key)!.push(toItem(ir, ingByItem.get(Number(ir.id)) ?? []))
  }

  const pagosByOrden = new Map<number, Pago[]>()
  for (const pr of pagoRows) {
    const key = Number(pr.orden_id)
    if (!pagosByOrden.has(key)) pagosByOrden.set(key, [])
    pagosByOrden.get(key)!.push(toPago(pr))
  }

  return rows.map((r) => {
    const oid = Number(r.id)
    return toOrden(r, itemsByOrden.get(oid) ?? [], pagosByOrden.get(oid) ?? [])
  })
}

export async function getOrdenById(sql: Sql, id: number): Promise<Orden> {
  return buildOrden(sql, id)
}

export async function getHistorial(
  sql: Sql,
  page: number,
  size: number
): Promise<{ content: Orden[]; totalElements: number }> {
  const countRows = await sql<{ total: string }[]>`
    SELECT COUNT(*)::text AS total FROM ordenes WHERE estado IN ('PAGADA', 'CANCELADA')
  `
  const totalElements = Number(countRows[0]?.total ?? 0)

  const offset = page * size
  const rows = await sql<OrdenRow[]>`
    SELECT id, tipo_orden, mesa_id, nombre_cliente, telefono_cliente, direccion_entrega,
           fecha_creacion, fecha_modificacion, estado, pagada, total_monto
    FROM ordenes
    WHERE estado IN ('PAGADA', 'CANCELADA')
    ORDER BY fecha_creacion DESC
    LIMIT ${size} OFFSET ${offset}
  `

  if (rows.length === 0) return { content: [], totalElements }

  const ordenIds = rows.map((r) => Number(r.id))

  const itemRows = await sql<ItemRow[]>`
    SELECT oi.id, oi.orden_id, oi.producto_id, p.nombre AS nombre_producto,
           oi.cantidad, oi.precio_unitario, oi.notas
    FROM orden_items oi
    JOIN productos p ON p.id = oi.producto_id
    WHERE oi.orden_id = ANY(${sql.array(ordenIds)})
    ORDER BY oi.orden_id, oi.id
  `

  const itemIds = itemRows.map((r) => Number(r.id))
  let ingRows: IngredienteRow[] = []
  if (itemIds.length > 0) {
    ingRows = await sql<IngredienteRow[]>`
      SELECT oii.id, oii.item_id, oii.ingrediente_id, ing.nombre,
             oii.cantidad, oii.precio_unitario
      FROM orden_item_ingredientes oii
      JOIN ingredientes ing ON ing.id = oii.ingrediente_id
      WHERE oii.item_id = ANY(${sql.array(itemIds)})
      ORDER BY oii.id
    `
  }

  const pagoRows = await sql<PagoRow[]>`
    SELECT id, orden_id, monto_pagado, metodo_pago, propina, fecha_pago
    FROM pagos
    WHERE orden_id = ANY(${sql.array(ordenIds)})
    ORDER BY id
  `

  const ingByItem = new Map<number, OrdenItemIngrediente[]>()
  for (const ir of ingRows) {
    const key = Number(ir.item_id)
    if (!ingByItem.has(key)) ingByItem.set(key, [])
    ingByItem.get(key)!.push(toIngrediente(ir))
  }

  const itemsByOrden = new Map<number, OrdenItem[]>()
  for (const ir of itemRows) {
    const key = Number(ir.orden_id)
    if (!itemsByOrden.has(key)) itemsByOrden.set(key, [])
    itemsByOrden.get(key)!.push(toItem(ir, ingByItem.get(Number(ir.id)) ?? []))
  }

  const pagosByOrden = new Map<number, Pago[]>()
  for (const pr of pagoRows) {
    const key = Number(pr.orden_id)
    if (!pagosByOrden.has(key)) pagosByOrden.set(key, [])
    pagosByOrden.get(key)!.push(toPago(pr))
  }

  const content = rows.map((r) => {
    const oid = Number(r.id)
    return toOrden(r, itemsByOrden.get(oid) ?? [], pagosByOrden.get(oid) ?? [])
  })

  return { content, totalElements }
}

export async function updateOrden(sql: Sql, id: number, data: UpdateOrdenData): Promise<Orden> {
  const orden = await buildOrden(sql, id)
  if (orden.estado === 'PAGADA' || orden.estado === 'CANCELADA') {
    throw new ConflictError('No se puede modificar una orden pagada o cancelada')
  }

  await sql`
    UPDATE ordenes
    SET nombre_cliente     = ${data.nombreCliente ?? orden.nombreCliente},
        telefono_cliente   = ${data.telefonoCliente ?? orden.telefonoCliente},
        direccion_entrega  = ${data.direccionEntrega ?? orden.direccionEntrega},
        fecha_modificacion = NOW()
    WHERE id = ${id}
  `

  return buildOrden(sql, id)
}

export async function deleteOrden(sql: Sql, id: number): Promise<void> {
  const rows = await sql<OrdenRow[]>`
    SELECT id, estado FROM ordenes WHERE id = ${id} LIMIT 1
  `
  if (!rows[0]) throw new NotFoundError('Orden no encontrada')
  if (rows[0].estado !== 'ABIERTA') {
    throw new ValidationError('Solo se pueden eliminar órdenes en estado ABIERTA')
  }
  await sql`DELETE FROM ordenes WHERE id = ${id}`
}

export async function updateEstado(sql: Sql, id: number, nuevoEstado: string): Promise<Orden> {
  const orden = await buildOrden(sql, id)

  const allowed = VALID_TRANSITIONS[orden.estado] ?? []
  if (!allowed.includes(nuevoEstado)) {
    throw new ConflictError('Transición de estado inválida')
  }

  if (nuevoEstado === 'PAGADA' && !orden.pagada) {
    throw new ConflictError('Transición de estado inválida')
  }

  await sql`
    UPDATE ordenes
    SET estado = ${nuevoEstado}, fecha_modificacion = NOW()
    WHERE id = ${id}
  `

  return buildOrden(sql, id)
}

export async function addItem(sql: Sql, ordenId: number, data: AddItemData): Promise<Orden> {
  return sql.begin(async (tx: TransactionSql) => {
    const ordenRows = await tx<OrdenRow[]>`
      SELECT id, estado, pagada FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    if (ordenRows[0].estado === 'PAGADA' || ordenRows[0].estado === 'CANCELADA') {
      throw new ConflictError('No se puede modificar una orden pagada o cancelada')
    }

    const prodRows = await tx<{ id: bigint; precio: string }[]>`
      SELECT id, precio FROM productos WHERE id = ${data.productoId} LIMIT 1
    `
    if (!prodRows[0]) throw new NotFoundError('Producto no encontrado')

    const [itemRow] = await tx<{ id: bigint }[]>`
      INSERT INTO orden_items (orden_id, producto_id, cantidad, precio_unitario, notas)
      VALUES (${ordenId}, ${data.productoId}, ${data.cantidad}, ${prodRows[0].precio}, ${data.notas ?? null})
      RETURNING id
    `

    if (data.ingredientes && data.ingredientes.length > 0) {
      for (const ing of data.ingredientes) {
        const ingRows = await tx<{ id: bigint; precio: string }[]>`
          SELECT id, precio FROM ingredientes WHERE id = ${ing.ingredienteId} LIMIT 1
        `
        if (!ingRows[0]) throw new NotFoundError(`Ingrediente ${ing.ingredienteId} no encontrado`)

        await tx`
          INSERT INTO orden_item_ingredientes (item_id, ingrediente_id, cantidad, precio_unitario)
          VALUES (${Number(itemRow.id)}, ${ing.ingredienteId}, ${ing.cantidad}, ${ingRows[0].precio})
        `
      }
    }

    await recalcularTotal(tx, ordenId)
    return buildOrden(tx, ordenId)
  })
}

export async function updateItem(
  sql: Sql,
  ordenId: number,
  itemId: number,
  data: UpdateItemData
): Promise<Orden> {
  return sql.begin(async (tx: TransactionSql) => {
    const ordenRows = await tx<OrdenRow[]>`
      SELECT id, estado, pagada FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    if (ordenRows[0].estado === 'PAGADA' || ordenRows[0].estado === 'CANCELADA') {
      throw new ConflictError('No se puede modificar una orden pagada o cancelada')
    }

    const itemRows = await tx<{ id: bigint; orden_id: bigint }[]>`
      SELECT id, orden_id FROM orden_items WHERE id = ${itemId} AND orden_id = ${ordenId} LIMIT 1
    `
    if (!itemRows[0]) throw new NotFoundError('Item no encontrado en esta orden')

    const prodRows = await tx<{ id: bigint; precio: string }[]>`
      SELECT id, precio FROM productos WHERE id = ${data.productoId} LIMIT 1
    `
    if (!prodRows[0]) throw new NotFoundError('Producto no encontrado')

    await tx`DELETE FROM orden_item_ingredientes WHERE item_id = ${itemId}`

    await tx`
      UPDATE orden_items
      SET producto_id = ${data.productoId},
          cantidad = ${data.cantidad},
          precio_unitario = ${prodRows[0].precio},
          notas = ${data.notas ?? null}
      WHERE id = ${itemId}
    `

    if (data.ingredientes && data.ingredientes.length > 0) {
      for (const ing of data.ingredientes) {
        const ingRows = await tx<{ id: bigint; precio: string }[]>`
          SELECT id, precio FROM ingredientes WHERE id = ${ing.ingredienteId} LIMIT 1
        `
        if (!ingRows[0]) throw new NotFoundError(`Ingrediente ${ing.ingredienteId} no encontrado`)

        await tx`
          INSERT INTO orden_item_ingredientes (item_id, ingrediente_id, cantidad, precio_unitario)
          VALUES (${itemId}, ${ing.ingredienteId}, ${ing.cantidad}, ${ingRows[0].precio})
        `
      }
    }

    await recalcularTotal(tx, ordenId)
    return buildOrden(tx, ordenId)
  })
}

export async function removeItem(sql: Sql, ordenId: number, itemId: number): Promise<Orden> {
  return sql.begin(async (tx: TransactionSql) => {
    const ordenRows = await tx<OrdenRow[]>`
      SELECT id, estado, pagada FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    if (ordenRows[0].pagada || ordenRows[0].estado === 'CANCELADA') {
      throw new ConflictError('No se puede modificar una orden pagada o cancelada')
    }

    const itemRows = await tx<{ id: bigint }[]>`
      SELECT id FROM orden_items WHERE id = ${itemId} AND orden_id = ${ordenId} LIMIT 1
    `
    if (!itemRows[0]) throw new NotFoundError('Item no encontrado en esta orden')

    await tx`DELETE FROM orden_item_ingredientes WHERE item_id = ${itemId}`
    await tx`DELETE FROM orden_items WHERE id = ${itemId} AND orden_id = ${ordenId}`

    await recalcularTotal(tx, ordenId)
    return buildOrden(tx, ordenId)
  })
}

export async function pagarOrden(sql: Sql, ordenId: number, data: PagarOrdenData): Promise<Orden> {
  return sql.begin(async (tx: TransactionSql) => {
    const ordenRows = await tx<OrdenRow[]>`
      SELECT id, estado, pagada, total_monto FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    if (ordenRows[0].pagada || ordenRows[0].estado === 'CANCELADA') {
      throw new ConflictError('Esta orden ya está pagada o fue cancelada')
    }

    await tx`
      INSERT INTO pagos (orden_id, monto_pagado, metodo_pago, propina, fecha_pago)
      VALUES (${ordenId}, ${data.montoPagado}, ${data.metodoPago}, ${data.propina ?? null}, NOW())
    `

    const totalRows = await tx<{ total: string }[]>`
      SELECT COALESCE(SUM(monto_pagado), 0)::text AS total FROM pagos WHERE orden_id = ${ordenId}
    `
    const totalPagado = Number(totalRows[0]?.total ?? 0)
    const totalMonto = Number(ordenRows[0].total_monto ?? 0)

    if (totalPagado >= totalMonto) {
      await tx`UPDATE ordenes SET pagada = true, fecha_modificacion = NOW() WHERE id = ${ordenId}`
    } else {
      await tx`UPDATE ordenes SET fecha_modificacion = NOW() WHERE id = ${ordenId}`
    }

    return buildOrden(tx, ordenId)
  })
}

export async function separarItem(sql: Sql, ordenId: number, itemId: number): Promise<Orden> {
  return sql.begin(async (tx: TransactionSql) => {
    const ordenRows = await tx<OrdenRow[]>`
      SELECT id, estado FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    if (ordenRows[0].estado === 'CANCELADA' || ordenRows[0].estado === 'PAGADA') {
      throw new ConflictError('No se puede modificar una orden pagada o cancelada')
    }

    const itemRows = await tx<{ id: bigint; cantidad: number; precio_unitario: string; notas: string | null; producto_id: bigint }[]>`
      SELECT id, cantidad, precio_unitario, notas, producto_id
      FROM orden_items
      WHERE id = ${itemId} AND orden_id = ${ordenId}
      LIMIT 1
    `
    if (!itemRows[0]) throw new NotFoundError('Item no encontrado en esta orden')

    const item = itemRows[0]

    if (item.cantidad <= 1) {
      throw new ConflictError('El ítem solo tiene una unidad, no se puede separar')
    }

    await tx`UPDATE orden_items SET cantidad = ${item.cantidad - 1} WHERE id = ${itemId}`

    const ingRows = await tx<{ ingrediente_id: bigint; cantidad: string; precio_unitario: string }[]>`
      SELECT ingrediente_id, cantidad, precio_unitario
      FROM orden_item_ingredientes
      WHERE item_id = ${itemId}
    `

    const [newItem] = await tx<{ id: bigint }[]>`
      INSERT INTO orden_items (orden_id, producto_id, cantidad, precio_unitario, notas)
      VALUES (${ordenId}, ${Number(item.producto_id)}, 1, ${item.precio_unitario}, ${item.notas})
      RETURNING id
    `

    if (ingRows.length > 0) {
      for (const ing of ingRows) {
        await tx`
          INSERT INTO orden_item_ingredientes (item_id, ingrediente_id, cantidad, precio_unitario)
          VALUES (${Number(newItem.id)}, ${Number(ing.ingrediente_id)}, ${ing.cantidad}, ${ing.precio_unitario})
        `
      }
    }

    return buildOrden(tx, ordenId)
  })
}

export async function dividirOrden(
  sql: Sql,
  ordenId: number,
  data: DividirOrdenData
): Promise<{ ordenOriginal: Orden; ordenNueva: Orden }> {
  return sql.begin(async (tx: TransactionSql) => {
    const ordenRows = await tx<OrdenRow[]>`
      SELECT id, tipo_orden, mesa_id, nombre_cliente, telefono_cliente, direccion_entrega,
             estado, pagada, total_monto
      FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    const originalRow = ordenRows[0]
    if (originalRow.estado === 'CANCELADA' || originalRow.pagada) {
      throw new ConflictError('No se puede dividir una orden pagada o cancelada')
    }

    const allItemRows = await tx<{ id: bigint; cantidad: number; precio_unitario: string; notas: string | null; producto_id: bigint }[]>`
      SELECT id, cantidad, precio_unitario, notas, producto_id
      FROM orden_items
      WHERE orden_id = ${ordenId}
      ORDER BY id
    `

    const totalUnidadesOriginales = allItemRows.reduce((sum, r) => sum + r.cantidad, 0)
    const divisionMap = new Map<number, number>(data.items.map((i) => [i.itemId, i.cantidad]))

    let totalUnidadesASplit = 0
    for (const [did, dcant] of divisionMap) {
      const item = allItemRows.find((r) => Number(r.id) === did)
      if (!item) throw new NotFoundError(`Item ${did} no encontrado en esta orden`)
      if (dcant <= 0 || dcant > item.cantidad) {
        throw new ValidationError(`Cantidad inválida para el item ${did}`)
      }
      totalUnidadesASplit += dcant
    }

    if (totalUnidadesASplit >= totalUnidadesOriginales) {
      throw new ValidationError('No se pueden mover todos los ítems')
    }

    const [nuevaOrdenRow] = await tx<{ id: bigint }[]>`
      INSERT INTO ordenes (
        tipo_orden, mesa_id, nombre_cliente, telefono_cliente,
        direccion_entrega, estado, pagada, total_monto, fecha_creacion
      ) VALUES (
        ${originalRow.tipo_orden},
        ${originalRow.mesa_id ? Number(originalRow.mesa_id) : null},
        ${originalRow.nombre_cliente},
        ${originalRow.telefono_cliente},
        ${originalRow.direccion_entrega},
        'ABIERTA',
        false,
        0,
        NOW()
      )
      RETURNING id
    `
    const nuevaOrdenId = Number(nuevaOrdenRow.id)

    for (const item of allItemRows) {
      const itemId = Number(item.id)
      const cantidadASplit = divisionMap.get(itemId)
      if (!cantidadASplit) continue

      const ingRows = await tx<{ ingrediente_id: bigint; cantidad: string; precio_unitario: string }[]>`
        SELECT ingrediente_id, cantidad, precio_unitario
        FROM orden_item_ingredientes
        WHERE item_id = ${itemId}
      `

      const restante = item.cantidad - cantidadASplit

      if (restante === 0) {
        await tx`UPDATE orden_items SET orden_id = ${nuevaOrdenId} WHERE id = ${itemId}`
      } else {
        await tx`UPDATE orden_items SET cantidad = ${restante} WHERE id = ${itemId}`

        const [newItemRow] = await tx<{ id: bigint }[]>`
          INSERT INTO orden_items (orden_id, producto_id, cantidad, precio_unitario, notas)
          VALUES (${nuevaOrdenId}, ${Number(item.producto_id)}, ${cantidadASplit}, ${item.precio_unitario}, ${item.notas})
          RETURNING id
        `

        if (ingRows.length > 0) {
          for (const ing of ingRows) {
            await tx`
              INSERT INTO orden_item_ingredientes (item_id, ingrediente_id, cantidad, precio_unitario)
              VALUES (${Number(newItemRow.id)}, ${Number(ing.ingrediente_id)}, ${ing.cantidad}, ${ing.precio_unitario})
            `
          }
        }
      }
    }

    await recalcularTotal(tx, ordenId)
    await recalcularTotal(tx, nuevaOrdenId)

    const ordenOriginal = await buildOrden(tx, ordenId)
    const ordenNueva = await buildOrden(tx, nuevaOrdenId)

    return { ordenOriginal, ordenNueva }
  })
}
