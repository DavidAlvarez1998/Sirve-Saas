import api from './axios'
import type { AuthSession } from '../../types'

export async function loginUser(username: string, password: string): Promise<AuthSession> {
  const { data } = await api.post<AuthSession>('/auth/login', { username, password })
  return data
}
