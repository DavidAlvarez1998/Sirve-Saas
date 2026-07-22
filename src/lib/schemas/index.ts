import { z } from 'zod'

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export const MesaSchema = z.object({
  numero: z.string().min(1).max(20),
})

export const ProductoSchema = z.object({
  nombre: z.string().min(1).max(100),
  descripcion: z.string().optional(),
  precio: z.number().min(0),
  tipo: z.enum(['PLATO_PREPARADO', 'VENTA_DIRECTA']),
  imagenUrl: z.string().url().nullable().optional(),
})

export const IngredienteSchema = z.object({
  nombre: z.string().min(1).max(100),
  precio: z.number().min(0),
  imagenUrl: z.string().url().nullable().optional(),
})

export const CreateOrdenSchema = z.object({
  tipoOrden: z.enum(['MESA', 'PARA_LLEVAR', 'DOMICILIO']),
  mesaId: z.number().int().positive().nullable().optional(),
  nombreCliente: z.string().nullable().optional(),
  telefonoCliente: z.string().nullable().optional(),
  direccionEntrega: z.string().nullable().optional(),
})

export const AddItemSchema = z.object({
  productoId: z.number().int().positive(),
  cantidad: z.number().int().min(1),
  notas: z.string().optional(),
  ingredientes: z.array(z.object({
    ingredienteId: z.number().int().positive(),
    cantidad: z.number().min(0),
  })).optional(),
})

export const UpdateItemSchema = AddItemSchema

export const PagarOrdenSchema = z.object({
  montoPagado: z.number().positive(),
  propina: z.number().min(0).optional(),
  metodoPago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']),
})

export const UpdateEstadoSchema = z.object({
  estado: z.enum(['ABIERTA', 'EN_PREPARACION', 'LISTA', 'EN_CAMINO', 'ENTREGADA', 'PAGADA', 'CANCELADA']),
})

export const DividirOrdenSchema = z.object({
  items: z.array(z.object({
    itemId: z.number().int().positive(),
    cantidad: z.number().int().min(1),
  })).min(1),
})

export const CreateUsuarioSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
  roles: z.array(z.enum(['MESERO', 'COCINA'])).min(1),
})

export const UpdateUsuarioSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().nullable().optional(),
  password: z.string().min(6).optional(),
  roles: z.array(z.enum(['MESERO', 'COCINA'])).min(1).optional(),
  activo: z.boolean().optional(),
})

export const CreateTenantSchema = z.object({
  nombre: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
  adminEmail: z.string().email(),
})

export const CompletarSetupSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
})
