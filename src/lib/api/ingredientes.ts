import api from './axios'
import type { Ingrediente } from '../../types'

export const getIngredientes = (): Promise<Ingrediente[]> =>
  api.get<Ingrediente[]>('/ingredientes').then(r => r.data)

export const createIngrediente = (data: Partial<Ingrediente>): Promise<Ingrediente> =>
  api.post<Ingrediente>('/ingredientes', data).then(r => r.data)

export const updateIngrediente = (id: number, data: Partial<Ingrediente>): Promise<Ingrediente> =>
  api.put<Ingrediente>(`/ingredientes/${id}`, data).then(r => r.data)

export const deleteIngrediente = (id: number): Promise<void> =>
  api.delete(`/ingredientes/${id}`).then(() => undefined)
