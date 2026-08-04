import api from './axios'
import type {
  Orden,
  EstadoOrden,
  CreateOrdenData,
  AddItemData,
  UpdateItemData,
  PagarOrdenData,
  DividirOrdenData,
} from '../../types'

export const getOrdenes = (): Promise<Orden[]> =>
  api.get<Orden[]>('/ordenes').then(r => r.data)

export interface OrdenesHistorialPage {
  content: Orden[]
  page: number
  hasNext: boolean
}

export const getOrdenesHistorial = (page = 0, size = 20): Promise<OrdenesHistorialPage> =>
  api.get<OrdenesHistorialPage>(`/ordenes/historial?page=${page}&size=${size}`).then(r => r.data)

export const getOrdenById = (id: number): Promise<Orden> =>
  api.get<Orden>(`/ordenes/${id}`).then(r => r.data)

export const createOrden = (data: CreateOrdenData): Promise<Orden> =>
  api.post<Orden>('/ordenes', data).then(r => r.data)

export const deleteOrden = (id: number): Promise<void> =>
  api.delete(`/ordenes/${id}`).then(() => undefined)

export const updateOrden = (id: number, data: Partial<CreateOrdenData>): Promise<Orden> =>
  api.patch<Orden>(`/ordenes/${id}`, data).then(r => r.data)

export const updateEstado = (id: number, estado: EstadoOrden): Promise<Orden> =>
  api.patch<Orden>(`/ordenes/${id}/estado`, { estado }).then(r => r.data)

export const addItem = (id: number, item: AddItemData): Promise<Orden> =>
  api.post<Orden>(`/ordenes/${id}/items`, item).then(r => r.data)

export const addItems = (id: number, items: AddItemData[]): Promise<Orden> =>
  api.post<Orden>(`/ordenes/${id}/items/batch`, { items }).then(r => r.data)

export const removeItem = (id: number, itemId: number): Promise<Orden> =>
  api.delete<Orden>(`/ordenes/${id}/items/${itemId}`).then(r => r.data)

export const updateItem = (id: number, itemId: number, item: UpdateItemData): Promise<Orden> =>
  api.patch<Orden>(`/ordenes/${id}/items/${itemId}`, item).then(r => r.data)

export const pagarOrden = (id: number, pago: PagarOrdenData): Promise<Orden> =>
  api.post<Orden>(`/ordenes/${id}/pagar`, pago).then(r => r.data)

export const dividirOrden = (
  id: number,
  data: DividirOrdenData
): Promise<{ original: Orden; nueva: Orden }> =>
  api.post<{ original: Orden; nueva: Orden }>(`/ordenes/${id}/dividir`, data).then(r => r.data)

export const separarItem = (
  id: number,
  itemId: number
): Promise<{ orden: Orden; nuevoItemId: number }> =>
  api
    .post<{ orden: Orden; nuevoItemId: number }>(`/ordenes/${id}/items/${itemId}/separar`)
    .then(r => r.data)
