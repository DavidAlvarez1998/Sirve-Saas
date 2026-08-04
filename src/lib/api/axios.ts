import axios, { type AxiosError, type AxiosInstance } from 'axios'
import type { AuthSession, ApiError } from '@/types'

const STORAGE_KEY = 'sirve_auth'

const api: AxiosInstance = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor: inject Bearer token from localStorage
api.interceptors.request.use(config => {
  if (typeof window === 'undefined') return config // SSR safety — no-op
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const { token } = JSON.parse(raw) as AuthSession
      if (token) config.headers.Authorization = `Bearer ${token}`
    }
  } catch {
    // Corrupted storage — proceed without token
  }
  return config
})

// Response interceptor: friendly error messages + 401 → logout
api.interceptors.response.use(
  res => res,
  (err: AxiosError<{ mensaje?: string; message?: string; error?: string }>) => {
    const status = err.response?.status
    const data = err.response?.data

    // 401: clear session and redirect to login
    if (status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
      document.cookie = 'sirva_session=; SameSite=Lax; Path=/; Max-Age=0'
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }

    let friendlyMessage = data?.mensaje ?? data?.message ?? data?.error

    if (!friendlyMessage) {
      if (status === 401) friendlyMessage = 'Tu sesión expiró. Por favor ingresá de nuevo.'
      else if (status === 403) friendlyMessage = 'No tenés permiso para realizar esta acción.'
      else if (status === 409) friendlyMessage = 'Ya existe un registro con esos datos.'
      else if (status === 404) friendlyMessage = 'Recurso no encontrado.'
      else if (status === 400) friendlyMessage = 'Datos inválidos. Revisá el formulario.'
      else if (!err.response) friendlyMessage = 'No se puede conectar al servidor.'
      else friendlyMessage = 'Ocurrió un error inesperado.'
    }

    const enriched = err as unknown as ApiError
    enriched.friendlyMessage = friendlyMessage!
    return Promise.reject(enriched)
  }
)

export default api
