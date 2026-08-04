// ─── Auth ─────────────────────────────────────
export type UserRole = 'ADMIN' | 'MESERO' | 'COCINA' | 'SUPERADMIN'
export type TenantSlug = string // Branded type kept as string for simplicity

export interface AuthSession {
  token: string
  username: string
  roles: UserRole[]
  tenantId: string // Never null after normalization ('__master__' for SUPERADMIN)
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  username: string
  roles: UserRole[]
  tenantId: string | null // Raw from backend, null for SUPERADMIN
}

// ─── Orders ───────────────────────────────────
export type EstadoOrden =
  | 'ABIERTA'
  | 'EN_PREPARACION'
  | 'LISTA'
  | 'EN_CAMINO'
  | 'ENTREGADA'
  | 'PAGADA'
  | 'CANCELADA'

export type TipoOrden = 'MESA' | 'PARA_LLEVAR' | 'DOMICILIO'
export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA'

// Flat DTO shapes matching actual backend responses
export interface IngredienteItem {
  id: number
  ingredienteId: number
  ingredienteNombre: string
  nombre?: string // legacy alias — same as ingredienteNombre
  cantidad: number
  precioUnitario: number
}

export interface OrdenItem {
  id: number
  itemId?: number // alias for id used by some cocina endpoints
  productoId: number
  productoNombre: string
  nombreProducto?: string // legacy alias — same as productoNombre
  productoImagenUrl?: string | null
  cantidad: number
  precioUnitario: number
  notas?: string
  ingredientes: IngredienteItem[]
  ingredientesExtra?: IngredienteItem[] // legacy alias — same as ingredientes
}

export interface Pago {
  id: number
  montoPagado: number
  propina: number
  metodoPago: MetodoPago
  fecha?: string // ISO
}

export interface Orden {
  id: number
  ordenId?: number // alias used by cocina endpoint — same value as id
  tipoOrden: TipoOrden
  estado: EstadoOrden
  mesaId?: number | null
  mesaNumero?: number | null
  items: OrdenItem[]
  pagos: Pago[]
  totalMonto: number
  pagada: boolean
  nombreCliente?: string | null
  telefonoCliente?: string | null
  direccionEntrega?: string | null
  fechaCreacion?: string // ISO — used by cocina for urgency timer
  createdAt?: string
  updatedAt?: string
}

// ─── Catalog ──────────────────────────────────
export type TipoProducto = 'PLATO_PREPARADO' | 'VENTA_DIRECTA'

export interface Producto {
  id: number
  nombre: string
  descripcion?: string
  precio: number
  tipo: TipoProducto
  imagen?: string | null
  imagenUrl?: string | null
}

export interface Ingrediente {
  id: number
  nombre: string
  precio: number
  imagenUrl?: string | null
}

export interface Mesa {
  id: number
  numero: string
}

// ─── API error ────────────────────────────────
export interface ApiError extends Error {
  friendlyMessage: string
  response?: {
    status: number
    data?: { mensaje?: string; message?: string; error?: string }
  }
}

// ─── Users ────────────────────────────────────
export interface Usuario {
  id: number
  username: string
  email?: string | null
  roles: UserRole[]
  activo: boolean
  createdAt?: string
}

export interface CreateUsuarioData {
  username: string
  password: string
  roles: UserRole[]
}

export interface UpdateUsuarioData {
  username?: string
  email?: string | null
  password?: string
  roles?: UserRole[]
  activo?: boolean
}

// ─── Tenants ──────────────────────────────────
export interface Tenant {
  id: number
  nombre: string
  slug: string
  activo: boolean
  setupUrl?: string | null
  createdAt?: string | null
  fechaVencimiento?: string | null
}

export interface TenantExpiryState {
  fechaVencimiento: string | null
  diasRestantes: number | null
  vencida: boolean
}

export interface CreateTenantData {
  nombre: string
  slug: string
  adminEmail: string
}

// ─── Reporte ──────────────────────────────────
export interface ReporteVentas {
  totalVentas: number
  cantidadOrdenes: number
  totalPropinas: number
  totalEfectivo: number
  totalTarjeta: number
  totalTransferencia: number
  fechaInicio?: string
  fechaFin?: string
}

// ─── Orden input DTOs ─────────────────────────
export interface CreateOrdenData {
  tipoOrden: TipoOrden
  mesaId?: number | null
  nombreCliente?: string | null
  telefonoCliente?: string | null
  direccionEntrega?: string | null
}

export interface AddItemData {
  productoId: number
  cantidad: number
  notas?: string
  ingredientes?: Array<{ ingredienteId: number; cantidad: number }>
}

export interface UpdateItemData {
  productoId: number
  cantidad: number
  notas?: string
  ingredientes?: Array<{ ingredienteId: number; cantidad: number }>
}

export interface PagarOrdenData {
  montoPagado: number
  propina?: number
  metodoPago: MetodoPago
}

export interface DividirOrdenData {
  items: Array<{ itemId: number; cantidad: number }>
}

// ─── Realtime ─────────────────────────────────
export type OrdenRealtimeCallback = (orden: Orden) => void
