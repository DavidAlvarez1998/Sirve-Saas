import api from './axios'

export interface SetupInfo {
  tenantNombre: string
  adminEmail: string
}

export function getSetupInfo(token: string): Promise<SetupInfo> {
  return api.get<SetupInfo>(`/setup/${token}`).then((r) => r.data)
}

export function completarSetup(
  token: string,
  data: { email: string; password: string }
): Promise<void> {
  return api.post(`/setup/${token}`, data).then((r) => r.data)
}
