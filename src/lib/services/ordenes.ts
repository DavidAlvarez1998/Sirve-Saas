import type { Sql } from 'postgres'
import { NotFoundError, ConflictError, ValidationError } from '@/lib/errors'

// ─── Domain Types ────────────────────────────────────────────────────────────

export interface OrdenItemIngrediente {
  id: number
  itemId: number
  ingredienteId: number
  ingredienteNombre: string
  cantidad: number
  precioUnitario: number
}

export interface OrdenItem {
  id: number
  ordenId: number
  productoId: number
  productoNombre: string
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
  mesaNumero: number | null
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
  mesa_numero: number | null
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

interface ItemIngredienteRow {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toOrden(row: OrdenRow, items: OrdenItem[], pagos: Pago[]): Orden {
  return {
    id: Number(row.id),
    tipoOrden: row.tipo_orden,
    mesaId: row.mesa_id != null ? Number(row.mesa_id) : null,
    mesaNumero: row.mesa_numero ?? null,
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
    productoNombre: row.nombre_producto,
    cantidad: row.cantidad,
    precioUnitario: Number(row.precio_unitario),
    notas: row.notas,
    ingredientes,
  }
}

function toIngrediente(row: ItemIngredienteRow): OrdenItemIngrediente {
  return {
    id: Number(row.id),
    itemId: Number(row.item_id),
    ingredienteId: Number(row.ingrediente_id),
    ingredienteNombre: row.nombre,
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

export async function buildOrden(sql: Sql, id: number): Promise<Orden> {
  const rows = await sql<OrdenRow[]>`
    SELECT o.id, o.tipo_orden, o.mesa_id, m.numero AS mesa_numero,
           o.nombre_cliente, o.telefono_cliente, o.direccion_entrega,
           o.fecha_creacion, o.fecha_modificacion, o.estado, o.pagada, o.total_monto
    FROM ordenes o
    LEFT JOIN mesas m ON m.id = o.mesa_id
    WHERE o.id = ${id}
    LIMIT 1
  `
  if (!rows[0]) throw new NotFoundError('Orden no encontrada')

  const [itemRows, ingRows, pagoRows] = await Promise.all([
    sql<ItemRow[]>`
      SELECT oi.id, oi.orden_id, oi.producto_id, p.nombre AS nombre_producto,
             oi.cantidad, oi.precio_unitario, oi.notas
      FROM orden_items oi
      JOIN productos p ON p.id = oi.producto_id
      WHERE oi.orden_id = ${id}
      ORDER BY oi.id
    `,
    sql<ItemIngredienteRow[]>`
      SELECT oii.id, oii.item_id, oii.ingrediente_id, ing.nombre,
             oii.cantidad, oii.precio_unitario
      FROM orden_item_ingredientes oii
      JOIN ingredientes ing ON ing.id = oii.ingrediente_id
      WHERE oii.item_id IN (SELECT id FROM orden_items WHERE orden_id = ${id})
      ORDER BY oii.id
    `,
    sql<PagoRow[]>`
      SELECT id, orden_id, monto_pagado, metodo_pago, propina, fecha_pago
      FROM pagos
      WHERE orden_id = ${id}
      ORDER BY id
    `,
  ])

  const ingByItem = new Map<number, OrdenItemIngrediente[]>()
  for (const ir of ingRows) {
    const key = Number(ir.item_id)
    if (!ingByItem.has(key)) ingByItem.set(key, [])
    ingByItem.get(key)!.push(toIngrediente(ir))
  }

  const items = itemRows.map((ir) =>
    toItem(ir, ingByItem.get(Number(ir.id)) ?? [])
  )

  return toOrden(rows[0], items, pagoRows.map(toPago))
}

async function recalcularTotal(sql: Sql, ordenId: number): Promise<void> {
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

// ─── Public service functions ─────────────────────────────────────────────────

export async function createOrden(sql: Sql, data: CreateOrdenData): Promise<Orden> {
  await sql`BEGIN`
  try {
    if (data.tipoOrden === 'MESA') {
      if (!data.mesaId) throw new NotFoundError('Mesa no encontrada')
      const mesa = await sql`SELECT id FROM mesas WHERE id = ${data.mesaId} LIMIT 1`
      if (!mesa[0]) throw new NotFoundError('Mesa no encontrada')
      const active = await sql`
        SELECT id FROM ordenes
        WHERE mesa_id = ${data.mesaId}
          AND estado NOT IN ('CANCELADA', 'ENTREGADA')
          AND pagada = false
        LIMIT 1
      `
      if (active[0]) throw new ValidationError('La mesa ya tiene una orden activa')
    }

    const [insertedRow] = await sql<{ id: bigint }[]>`
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
      RETURNING id
    `

    const result = await buildOrden(sql, Number(insertedRow.id))
    await sql`COMMIT`
    return result
  } catch (e) {
    await sql`ROLLBACK`
    throw e
  }
}

export async function getOrdenes(sql: Sql): Promise<Orden[]> {
  const rows = await sql<OrdenRow[]>`
    SELECT o.id, o.tipo_orden, o.mesa_id, m.numero AS mesa_numero,
           o.nombre_cliente, o.telefono_cliente, o.direccion_entrega,
           o.fecha_creacion, o.fecha_modificacion, o.estado, o.pagada, o.total_monto
    FROM ordenes o
    LEFT JOIN mesas m ON m.id = o.mesa_id
    WHERE o.estado NOT IN ('PAGADA', 'CANCELADA')
      AND NOT (o.estado = 'ENTREGADA' AND o.pagada = true)
    ORDER BY o.id
  `

  if (rows.length === 0) return []

  const itemRows = await sql<ItemRow[]>`
    SELECT oi.id, oi.orden_id, oi.producto_id, p.nombre AS nombre_producto,
           oi.cantidad, oi.precio_unitario, oi.notas
    FROM orden_items oi
    JOIN productos p ON p.id = oi.producto_id
    WHERE oi.orden_id IN (
      SELECT id FROM ordenes WHERE estado NOT IN ('PAGADA', 'CANCELADA') AND NOT (estado = 'ENTREGADA' AND pagada = true)
    )
    ORDER BY oi.orden_id, oi.id
  `

  const ingRows = await sql<ItemIngredienteRow[]>`
    SELECT oii.id, oii.item_id, oii.ingrediente_id, ing.nombre,
           oii.cantidad, oii.precio_unitario
    FROM orden_item_ingredientes oii
    JOIN ingredientes ing ON ing.id = oii.ingrediente_id
    WHERE oii.item_id IN (
      SELECT oi.id FROM orden_items oi
      WHERE oi.orden_id IN (
        SELECT id FROM ordenes WHERE estado NOT IN ('PAGADA', 'CANCELADA') AND NOT (estado = 'ENTREGADA' AND pagada = true)
      )
    )
    ORDER BY oii.id
  `

  const pagoRows = await sql<PagoRow[]>`
    SELECT id, orden_id, monto_pagado, metodo_pago, propina, fecha_pago
    FROM pagos
    WHERE orden_id IN (
      SELECT id FROM ordenes WHERE estado NOT IN ('PAGADA', 'CANCELADA') AND NOT (estado = 'ENTREGADA' AND pagada = true)
    )
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

  return rows.map((r) => toOrden(r, itemsByOrden.get(Number(r.id)) ?? [], pagosByOrden.get(Number(r.id)) ?? []))
}

export async function getOrdenById(sql: Sql, id: number): Promise<Orden> {
  return buildOrden(sql, id)
}

export async function getHistorial(
  sql: Sql,
  page: number,
  size: number
): Promise<{ content: Orden[]; page: number; hasNext: boolean }> {
  const offset = page * size
  const rows = await sql<OrdenRow[]>`
    SELECT o.id, o.tipo_orden, o.mesa_id, m.numero AS mesa_numero,
           o.nombre_cliente, o.telefono_cliente, o.direccion_entrega,
           o.fecha_creacion, o.fecha_modificacion, o.estado, o.pagada, o.total_monto
    FROM ordenes o
    LEFT JOIN mesas m ON m.id = o.mesa_id
    WHERE o.estado IN ('PAGADA', 'CANCELADA') OR (o.estado = 'ENTREGADA' AND o.pagada = true)
    ORDER BY o.fecha_creacion DESC
    LIMIT ${size} OFFSET ${offset}
  `

  if (rows.length === 0) return { content: [], page, hasNext: false }

  const itemRows = await sql<ItemRow[]>`
    SELECT oi.id, oi.orden_id, oi.producto_id, p.nombre AS nombre_producto,
           oi.cantidad, oi.precio_unitario, oi.notas
    FROM orden_items oi
    JOIN productos p ON p.id = oi.producto_id
    WHERE oi.orden_id IN (
      SELECT id FROM ordenes
      WHERE estado IN ('PAGADA', 'CANCELADA') OR (estado = 'ENTREGADA' AND pagada = true)
      ORDER BY fecha_creacion DESC
      LIMIT ${size} OFFSET ${offset}
    )
    ORDER BY oi.orden_id, oi.id
  `

  const ingRows = await sql<ItemIngredienteRow[]>`
    SELECT oii.id, oii.item_id, oii.ingrediente_id, ing.nombre,
           oii.cantidad, oii.precio_unitario
    FROM orden_item_ingredientes oii
    JOIN ingredientes ing ON ing.id = oii.ingrediente_id
    WHERE oii.item_id IN (
      SELECT oi.id FROM orden_items oi
      WHERE oi.orden_id IN (
        SELECT id FROM ordenes
        WHERE estado IN ('PAGADA', 'CANCELADA')
        ORDER BY fecha_creacion DESC
        LIMIT ${size} OFFSET ${offset}
      )
    )
    ORDER BY oii.id
  `

  const pagoRows = await sql<PagoRow[]>`
    SELECT id, orden_id, monto_pagado, metodo_pago, propina, fecha_pago
    FROM pagos
    WHERE orden_id IN (
      SELECT id FROM ordenes
      WHERE estado IN ('PAGADA', 'CANCELADA') OR (estado = 'ENTREGADA' AND pagada = true)
      ORDER BY fecha_creacion DESC
      LIMIT ${size} OFFSET ${offset}
    )
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

  return { content, page, hasNext: content.length === size }
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
  const rows = await sql<{ estado: string; pagada: boolean }[]>`
    SELECT estado, pagada FROM ordenes WHERE id = ${id} LIMIT 1
  `
  if (!rows[0]) throw new NotFoundError('Orden no encontrada')

  const { estado, pagada } = rows[0]
  if (estado === 'PAGADA' || estado === 'CANCELADA') {
    throw new ConflictError('No se puede modificar una orden pagada o cancelada')
  }
  if (nuevoEstado === 'PAGADA' && !pagada) {
    throw new ConflictError('La orden aún no está pagada')
  }

  await sql`
    UPDATE ordenes
    SET estado = ${nuevoEstado}, fecha_modificacion = NOW()
    WHERE id = ${id}
  `

  return buildOrden(sql, id)
}

// ─── Catalog row types (batch-fetch helpers) ──────────────────────────────────
// Distinct from ItemIngredienteRow (which is the orden_item_ingredientes shape)

interface ProductoRow {
  id: bigint
  precio: string
}

interface CatalogIngredienteRow {
  id: bigint
  precio: string
}

async function fetchCatalog(
  sql: Sql,
  productoIds: number[],
  ingredienteIds: number[]
): Promise<{
  prodMap: Map<number, ProductoRow>
  ingMap: Map<number, CatalogIngredienteRow>
}> {
  const prodQuery =
    productoIds.length > 0
      ? sql<ProductoRow[]>`SELECT id, precio FROM productos WHERE id = ANY(${sql.array(productoIds, 20)})`
      : Promise.resolve([] as ProductoRow[])
  const ingQuery =
    ingredienteIds.length > 0
      ? sql<CatalogIngredienteRow[]>`SELECT id, precio FROM ingredientes WHERE id = ANY(${sql.array(ingredienteIds, 20)})`
      : Promise.resolve([] as CatalogIngredienteRow[])
  const [prodRows, ingRows] = await Promise.all([prodQuery, ingQuery])
  const prodMap = new Map<number, ProductoRow>(prodRows.map((r) => [Number(r.id), r]))
  const ingMap = new Map<number, CatalogIngredienteRow>(ingRows.map((r) => [Number(r.id), r]))
  return { prodMap, ingMap }
}

export async function addItem(sql: Sql, ordenId: number, data: AddItemData): Promise<Orden> {
  await sql`BEGIN`
  try {
    const ordenRows = await sql<OrdenRow[]>`
      SELECT id, estado, pagada FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    if (ordenRows[0].estado === 'PAGADA' || ordenRows[0].estado === 'CANCELADA') {
      throw new ConflictError('No se puede modificar una orden pagada o cancelada')
    }

    const ingredienteIds = (data.ingredientes ?? []).map((i) => i.ingredienteId)
    const { prodMap, ingMap } = await fetchCatalog(sql, [data.productoId], ingredienteIds)

    const prod = prodMap.get(data.productoId)
    if (!prod) throw new NotFoundError('Producto no encontrado')

    const [itemRow] = await sql<{ id: bigint }[]>`
      INSERT INTO orden_items (orden_id, producto_id, cantidad, precio_unitario, notas)
      VALUES (${ordenId}, ${data.productoId}, ${data.cantidad}, ${prod.precio}, ${data.notas ?? null})
      RETURNING id
    `

    for (const ing of data.ingredientes ?? []) {
      const ingCatalog = ingMap.get(ing.ingredienteId)
      if (!ingCatalog) throw new NotFoundError(`Ingrediente ${ing.ingredienteId} no encontrado`)

      await sql`
        INSERT INTO orden_item_ingredientes (item_id, ingrediente_id, cantidad, precio_unitario)
        VALUES (${Number(itemRow.id)}, ${ing.ingredienteId}, ${ing.cantidad}, ${ingCatalog.precio})
      `
    }

    await recalcularTotal(sql, ordenId)
    const result = await buildOrden(sql, ordenId)
    await sql`COMMIT`
    return result
  } catch (e) {
    await sql`ROLLBACK`
    throw e
  }
}

export async function addItems(sql: Sql, ordenId: number, items: AddItemData[]): Promise<Orden> {
  await sql`BEGIN`
  try {
    // 1. Validate orden
    const ordenRows = await sql<OrdenRow[]>`
      SELECT id, estado, pagada FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    if (ordenRows[0].estado === 'PAGADA' || ordenRows[0].estado === 'CANCELADA') {
      throw new ConflictError('No se puede modificar una orden pagada o cancelada')
    }

    // 2. Batch-fetch catalog (productos + ingredientes) via fetchCatalog
    const productoIds = [...new Set(items.map((it) => it.productoId))]
    const ingredienteIds = [...new Set(items.flatMap((it) => (it.ingredientes ?? []).map((ing) => ing.ingredienteId)))]
    const { prodMap, ingMap } = await fetchCatalog(sql, productoIds, ingredienteIds)

    // 3. Validate all productos (1-based index)
    for (let i = 0; i < items.length; i++) {
      if (!prodMap.has(items[i].productoId)) {
        throw new NotFoundError(`Producto no encontrado (item #${i + 1})`)
      }
    }

    // 4. Validate all ingredientes (1-based index)
    for (let i = 0; i < items.length; i++) {
      for (const ing of items[i].ingredientes ?? []) {
        if (!ingMap.has(ing.ingredienteId)) {
          throw new NotFoundError(`Ingrediente ${ing.ingredienteId} no encontrado (item #${i + 1})`)
        }
      }
    }

    // 5. Sequential INSERT orden_items (RETURNING id needed as FK for ingredientes)
    const insertedItemIds: number[] = []
    for (const it of items) {
      const prod = prodMap.get(it.productoId)!
      const [row] = await sql<{ id: bigint }[]>`
        INSERT INTO orden_items (orden_id, producto_id, cantidad, precio_unitario, notas)
        VALUES (${ordenId}, ${it.productoId}, ${it.cantidad}, ${prod.precio}, ${it.notas ?? null})
        RETURNING id
      `
      insertedItemIds.push(Number(row.id))
    }

    // 6. Sequential INSERT orden_item_ingredientes
    for (let i = 0; i < items.length; i++) {
      for (const ing of items[i].ingredientes ?? []) {
        const ingCatalog = ingMap.get(ing.ingredienteId)!
        await sql`
          INSERT INTO orden_item_ingredientes (item_id, ingrediente_id, cantidad, precio_unitario)
          VALUES (${insertedItemIds[i]}, ${ing.ingredienteId}, ${ing.cantidad}, ${ingCatalog.precio})
        `
      }
    }

    // 7. Recalculate + build
    await recalcularTotal(sql, ordenId)
    const result = await buildOrden(sql, ordenId)
    await sql`COMMIT`
    return result
  } catch (e) {
    await sql`ROLLBACK`
    throw e
  }
}

export async function updateItem(
  sql: Sql,
  ordenId: number,
  itemId: number,
  data: UpdateItemData
): Promise<Orden> {
  await sql`BEGIN`
  try {
    const ordenRows = await sql<OrdenRow[]>`
      SELECT id, estado, pagada FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    if (ordenRows[0].estado === 'PAGADA' || ordenRows[0].estado === 'CANCELADA') {
      throw new ConflictError('No se puede modificar una orden pagada o cancelada')
    }

    const itemRows = await sql<{ id: bigint; orden_id: bigint }[]>`
      SELECT id, orden_id FROM orden_items WHERE id = ${itemId} AND orden_id = ${ordenId} LIMIT 1
    `
    if (!itemRows[0]) throw new NotFoundError('Item no encontrado en esta orden')

    const ingredienteIds = (data.ingredientes ?? []).map((i) => i.ingredienteId)
    const { prodMap, ingMap } = await fetchCatalog(sql, [data.productoId], ingredienteIds)

    const prod = prodMap.get(data.productoId)
    if (!prod) throw new NotFoundError('Producto no encontrado')

    for (const ing of data.ingredientes ?? []) {
      if (!ingMap.has(ing.ingredienteId)) {
        throw new NotFoundError(`Ingrediente ${ing.ingredienteId} no encontrado`)
      }
    }

    await sql`DELETE FROM orden_item_ingredientes WHERE item_id = ${itemId}`

    await sql`
      UPDATE orden_items
      SET producto_id = ${data.productoId},
          cantidad = ${data.cantidad},
          precio_unitario = ${prod.precio},
          notas = ${data.notas ?? null}
      WHERE id = ${itemId}
    `

    for (const ing of data.ingredientes ?? []) {
      const ingCatalog = ingMap.get(ing.ingredienteId)!
      await sql`
        INSERT INTO orden_item_ingredientes (item_id, ingrediente_id, cantidad, precio_unitario)
        VALUES (${itemId}, ${ing.ingredienteId}, ${ing.cantidad}, ${ingCatalog.precio})
      `
    }

    await recalcularTotal(sql, ordenId)
    const result = await buildOrden(sql, ordenId)
    await sql`COMMIT`
    return result
  } catch (e) {
    await sql`ROLLBACK`
    throw e
  }
}

export async function removeItem(sql: Sql, ordenId: number, itemId: number): Promise<Orden> {
  await sql`BEGIN`
  try {
    const ordenRows = await sql<OrdenRow[]>`
      SELECT id, estado, pagada FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    if (ordenRows[0].pagada || ordenRows[0].estado === 'CANCELADA') {
      throw new ConflictError('No se puede modificar una orden pagada o cancelada')
    }

    const itemRows = await sql<{ id: bigint }[]>`
      SELECT id FROM orden_items WHERE id = ${itemId} AND orden_id = ${ordenId} LIMIT 1
    `
    if (!itemRows[0]) throw new NotFoundError('Item no encontrado en esta orden')

    await sql`DELETE FROM orden_item_ingredientes WHERE item_id = ${itemId}`
    await sql`DELETE FROM orden_items WHERE id = ${itemId} AND orden_id = ${ordenId}`

    await recalcularTotal(sql, ordenId)
    const result = await buildOrden(sql, ordenId)
    await sql`COMMIT`
    return result
  } catch (e) {
    await sql`ROLLBACK`
    throw e
  }
}

export async function pagarOrden(sql: Sql, ordenId: number, data: PagarOrdenData): Promise<Orden> {
  await sql`BEGIN`
  try {
    const ordenRows = await sql<OrdenRow[]>`
      SELECT id, estado, pagada, total_monto FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    if (ordenRows[0].pagada || ordenRows[0].estado === 'CANCELADA') {
      throw new ConflictError('Esta orden ya está pagada o fue cancelada')
    }

    await sql`
      INSERT INTO pagos (orden_id, monto_pagado, metodo_pago, propina, fecha_pago)
      VALUES (${ordenId}, ${data.montoPagado}, ${data.metodoPago}, ${data.propina ?? null}, NOW())
    `

    const totalRows = await sql<{ total: string }[]>`
      SELECT COALESCE(SUM(monto_pagado), 0)::text AS total FROM pagos WHERE orden_id = ${ordenId}
    `
    const totalPagado = Number(totalRows[0]?.total ?? 0)
    const totalMonto = Number(ordenRows[0].total_monto ?? 0)

    if (totalPagado >= totalMonto) {
      await sql`UPDATE ordenes SET pagada = true, fecha_modificacion = NOW() WHERE id = ${ordenId}`
    } else {
      await sql`UPDATE ordenes SET fecha_modificacion = NOW() WHERE id = ${ordenId}`
    }

    const result = await buildOrden(sql, ordenId)
    await sql`COMMIT`
    return result
  } catch (e) {
    await sql`ROLLBACK`
    throw e
  }
}

export async function separarItem(sql: Sql, ordenId: number, itemId: number): Promise<{ orden: Orden; nuevoItemId: number }> {
  await sql`BEGIN`
  try {
    const ordenRows = await sql<OrdenRow[]>`
      SELECT id, estado FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    if (ordenRows[0].estado === 'CANCELADA' || ordenRows[0].estado === 'PAGADA') {
      throw new ConflictError('No se puede modificar una orden pagada o cancelada')
    }

    const itemRows = await sql<{ id: bigint; cantidad: number; precio_unitario: string; notas: string | null; producto_id: bigint }[]>`
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

    await sql`UPDATE orden_items SET cantidad = ${item.cantidad - 1} WHERE id = ${itemId}`

    const ingRows = await sql<{ ingrediente_id: bigint; cantidad: string; precio_unitario: string }[]>`
      SELECT ingrediente_id, cantidad, precio_unitario
      FROM orden_item_ingredientes
      WHERE item_id = ${itemId}
    `

    const [newItem] = await sql<{ id: bigint }[]>`
      INSERT INTO orden_items (orden_id, producto_id, cantidad, precio_unitario, notas)
      VALUES (${ordenId}, ${Number(item.producto_id)}, 1, ${item.precio_unitario}, ${item.notas})
      RETURNING id
    `

    if (ingRows.length > 0) {
      for (const ing of ingRows) {
        await sql`
          INSERT INTO orden_item_ingredientes (item_id, ingrediente_id, cantidad, precio_unitario)
          VALUES (${Number(newItem.id)}, ${Number(ing.ingrediente_id)}, ${ing.cantidad}, ${ing.precio_unitario})
        `
      }
    }

    const result = await buildOrden(sql, ordenId)
    await sql`COMMIT`
    return { orden: result, nuevoItemId: Number(newItem.id) }
  } catch (e) {
    await sql`ROLLBACK`
    throw e
  }
}

export async function dividirOrden(
  sql: Sql,
  ordenId: number,
  data: DividirOrdenData
): Promise<{ ordenOriginal: Orden; ordenNueva: Orden }> {
  await sql`BEGIN`
  try {
    const ordenRows = await sql<OrdenRow[]>`
      SELECT id, tipo_orden, mesa_id, nombre_cliente, telefono_cliente, direccion_entrega,
             estado, pagada, total_monto
      FROM ordenes WHERE id = ${ordenId} LIMIT 1
    `
    if (!ordenRows[0]) throw new NotFoundError('Orden no encontrada')
    const originalRow = ordenRows[0]
    if (originalRow.estado === 'CANCELADA' || originalRow.pagada) {
      throw new ConflictError('No se puede dividir una orden pagada o cancelada')
    }

    const allItemRows = await sql<{ id: bigint; cantidad: number; precio_unitario: string; notas: string | null; producto_id: bigint }[]>`
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

    const [nuevaOrdenRow] = await sql<{ id: bigint }[]>`
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

      const ingRows = await sql<{ ingrediente_id: bigint; cantidad: string; precio_unitario: string }[]>`
        SELECT ingrediente_id, cantidad, precio_unitario
        FROM orden_item_ingredientes
        WHERE item_id = ${itemId}
      `

      const restante = item.cantidad - cantidadASplit

      if (restante === 0) {
        await sql`UPDATE orden_items SET orden_id = ${nuevaOrdenId} WHERE id = ${itemId}`
      } else {
        await sql`UPDATE orden_items SET cantidad = ${restante} WHERE id = ${itemId}`

        const [newItemRow] = await sql<{ id: bigint }[]>`
          INSERT INTO orden_items (orden_id, producto_id, cantidad, precio_unitario, notas)
          VALUES (${nuevaOrdenId}, ${Number(item.producto_id)}, ${cantidadASplit}, ${item.precio_unitario}, ${item.notas})
          RETURNING id
        `

        if (ingRows.length > 0) {
          for (const ing of ingRows) {
            await sql`
              INSERT INTO orden_item_ingredientes (item_id, ingrediente_id, cantidad, precio_unitario)
              VALUES (${Number(newItemRow.id)}, ${Number(ing.ingrediente_id)}, ${ing.cantidad}, ${ing.precio_unitario})
            `
          }
        }
      }
    }

    await recalcularTotal(sql, ordenId)
    await recalcularTotal(sql, nuevaOrdenId)

    const ordenOriginal = await buildOrden(sql, ordenId)
    const ordenNueva = await buildOrden(sql, nuevaOrdenId)

    await sql`COMMIT`
    return { ordenOriginal, ordenNueva }
  } catch (e) {
    await sql`ROLLBACK`
    throw e
  }
}
