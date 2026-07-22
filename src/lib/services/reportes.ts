import type { Sql } from 'postgres'

export interface ReporteVentas {
  totalVentas: number
  cantidadOrdenes: number
  totalPropinas: number
  totalEfectivo: number
  totalTarjeta: number
  totalTransferencia: number
}

interface PagoReporteRow {
  orden_id: bigint
  monto_pagado: string
  metodo_pago: string
  propina: string | null
}

export async function getReporteVentas(
  sql: Sql,
  fechaInicio?: string,
  fechaFin?: string
): Promise<ReporteVentas> {
  let rows: PagoReporteRow[]

  if (fechaInicio && fechaFin) {
    rows = await sql<PagoReporteRow[]>`
      SELECT p.orden_id, p.monto_pagado, p.metodo_pago, p.propina
      FROM pagos p
      JOIN ordenes o ON o.id = p.orden_id
      WHERE o.pagada = true
        AND o.fecha_creacion BETWEEN ${fechaInicio}::date AND ${fechaFin}::date
    `
  } else {
    rows = await sql<PagoReporteRow[]>`
      SELECT p.orden_id, p.monto_pagado, p.metodo_pago, p.propina
      FROM pagos p
      JOIN ordenes o ON o.id = p.orden_id
      WHERE o.pagada = true
    `
  }

  const ordenIds = new Set<string>()
  let totalVentas = 0
  let totalPropinas = 0
  let totalEfectivo = 0
  let totalTarjeta = 0
  let totalTransferencia = 0

  for (const row of rows) {
    ordenIds.add(String(row.orden_id))
    const monto = Number(row.monto_pagado)
    const propina = row.propina != null ? Number(row.propina) : 0

    totalVentas += monto
    totalPropinas += propina

    if (row.metodo_pago === 'EFECTIVO') totalEfectivo += monto
    else if (row.metodo_pago === 'TARJETA') totalTarjeta += monto
    else if (row.metodo_pago === 'TRANSFERENCIA') totalTransferencia += monto
  }

  return {
    totalVentas,
    cantidadOrdenes: ordenIds.size,
    totalPropinas,
    totalEfectivo,
    totalTarjeta,
    totalTransferencia,
  }
}
