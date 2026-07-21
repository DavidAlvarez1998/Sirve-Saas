import api from './axios'
import type { Orden, ReporteVentas } from '../../types'

export const getCocinaOrdenes = (): Promise<Orden[]> =>
  api.get<Orden[]>('/cocina/pendientes').then(r => r.data)

export const getCocinaFinalizadas = (): Promise<Orden[]> =>
  api.get<Orden[]>('/cocina/finalizadas').then(r => r.data)

export const getReporte = (fechaInicio: string, fechaFin: string): Promise<ReporteVentas> =>
  api
    .get<ReporteVentas>('/reportes/ventas', { params: { fechaInicio, fechaFin } })
    .then(r => r.data)
