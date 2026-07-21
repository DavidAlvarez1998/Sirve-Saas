import api from './axios'
import type { Usuario, CreateUsuarioData, UpdateUsuarioData } from '../../types'

export const getUsuarios = (): Promise<Usuario[]> =>
  api.get<Usuario[]>('/usuarios').then(r => r.data)

export const createUsuario = (data: CreateUsuarioData): Promise<Usuario> =>
  api.post<Usuario>('/usuarios', data).then(r => r.data)

export const updateUsuario = (id: number, data: UpdateUsuarioData): Promise<Usuario> =>
  api.patch<Usuario>(`/usuarios/${id}`, data).then(r => r.data)

export const deleteUsuario = (id: number): Promise<void> =>
  api.delete(`/usuarios/${id}`).then(() => undefined)
