import api from './axios'
import type { Tenant, Usuario, CreateTenantData, UpdateUsuarioData, TenantExpiryState } from '../../types'

export const getTenants = (): Promise<Tenant[]> =>
  api.get<Tenant[]>('/admin/tenants').then(r => r.data)

export const createTenant = (
  data: CreateTenantData
): Promise<{ setupUrl: string } & Tenant> =>
  api.post<{ setupUrl: string } & Tenant>('/admin/tenants', data).then(r => r.data)

export const desactivarTenant = (id: number): Promise<Tenant> =>
  api.patch<Tenant>(`/admin/tenants/${id}/desactivar`).then(r => r.data)

export const deleteTenant = (slug: string): Promise<void> =>
  api.delete(`/admin/tenants/${slug}`).then(() => undefined)

export const getTenantUsuarios = (slug: string): Promise<Usuario[]> =>
  api.get<Usuario[]>(`/admin/tenants/${slug}/usuarios`).then(r => r.data)

export const updateTenantUsuario = (
  slug: string,
  id: number,
  data: UpdateUsuarioData
): Promise<Usuario> =>
  api.patch<Usuario>(`/admin/tenants/${slug}/usuarios/${id}`, data).then(r => r.data)

export const updateTenantExpiry = (
  slug: string,
  fechaVencimiento: string | null
): Promise<Tenant> =>
  api.patch<Tenant>(`/admin/tenants/${slug}`, { fechaVencimiento }).then(r => r.data)

export const getMyTenantExpiry = (): Promise<TenantExpiryState> =>
  api.get<TenantExpiryState>('/me/tenant').then(r => r.data)
