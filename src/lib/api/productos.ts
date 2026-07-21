import api from './axios'
import type { Producto } from '../../types'

export const getProductos = (): Promise<Producto[]> =>
  api.get<Producto[]>('/productos').then(r => r.data)

export const createProducto = (data: Partial<Producto>): Promise<Producto> =>
  api.post<Producto>('/productos', data).then(r => r.data)

export const updateProducto = (id: number, data: Partial<Producto>): Promise<Producto> =>
  api.put<Producto>(`/productos/${id}`, data).then(r => r.data)

export const deleteProducto = (id: number): Promise<void> =>
  api.delete(`/productos/${id}`).then(() => undefined)
