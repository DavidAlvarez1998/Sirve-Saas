import api from './axios'
import type { Mesa } from '../../types'

export const getMesas = (): Promise<Mesa[]> =>
  api.get<Mesa[]>('/mesas').then(r => r.data)

export const createMesa = (data: Partial<Mesa>): Promise<Mesa> =>
  api.post<Mesa>('/mesas', data).then(r => r.data)

export const updateMesa = (id: number, data: Partial<Mesa>): Promise<Mesa> =>
  api.put<Mesa>(`/mesas/${id}`, data).then(r => r.data)

export const deleteMesa = (id: number): Promise<void> =>
  api.delete(`/mesas/${id}`).then(() => undefined)
