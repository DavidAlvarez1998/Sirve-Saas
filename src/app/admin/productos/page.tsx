'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Plus, Pencil, Trash2, Package } from 'lucide-react'
import { getProductos, createProducto, updateProducto, deleteProducto } from '@/lib/api/productos'
import { uploadImagen } from '@/lib/api/imagenes'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { toast } from 'sonner'
import ImageUpload from '@/components/ui/ImageUpload'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Badge } from '@/components/ui/Badge'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Producto, TipoProducto, ApiError } from '@/types'
import { fmt } from '@/lib/format'

const TIPOS: TipoProducto[] = ['PLATO_PREPARADO', 'VENTA_DIRECTA']
const TIPO_LABEL: Record<TipoProducto, string> = {
  PLATO_PREPARADO: 'Plato preparado',
  VENTA_DIRECTA: 'Venta directa',
}

interface ProductoForm {
  nombre: string
  descripcion: string
  precio: string | number
  tipo: TipoProducto
}

const EMPTY: ProductoForm = { nombre: '', descripcion: '', precio: 0, tipo: 'PLATO_PREPARADO' }

export default function AdminProductos() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<ProductoForm>(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirm, setConfirm] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getProductos()
      .then(setProductos)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openNew = () => {
    setForm(EMPTY)
    setEditId(null)
    setImgFile(null)
    setImgUrl(null)
    setModalOpen(true)
  }

  const openEdit = (p: Producto) => {
    setForm({
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      precio: p.precio,
      tipo: p.tipo,
    })
    setEditId(p.id)
    setImgFile(null)
    setImgUrl(p.imagenUrl ?? null)
    setModalOpen(true)
  }

  const handleImgChange = (file: File | null) => {
    if (file === null) {
      setImgFile(null)
      setImgUrl(null)
    } else {
      setImgFile(file)
    }
  }

  const handleSave = async () => {
    if (!form.nombre.trim() || form.precio === '') return
    setSaving(true)
    try {
      let imagenUrl = imgUrl
      if (imgFile) imagenUrl = await uploadImagen(imgFile)

      const data: Partial<Producto> = {
        nombre: form.nombre,
        descripcion: form.descripcion,
        precio: parseFloat(String(form.precio)),
        tipo: form.tipo,
        imagenUrl: imagenUrl ?? undefined,
      }

      if (editId !== null) {
        await updateProducto(editId, data)
        toast.success('Producto actualizado')
      } else {
        await createProducto(data)
        toast.success('Producto creado')
      }
      setModalOpen(false)
      load()
    } catch (e) {
      const err = e as ApiError
      toast.error(err.friendlyMessage ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteProducto(id)
      toast.success('Producto eliminado')
      load()
    } catch (e) {
      const err = e as ApiError
      toast.error(err.friendlyMessage ?? 'Error al eliminar')
    } finally {
      setConfirm(null)
    }
  }

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Productos</h1>
          <p className="text-muted-foreground text-xs mt-0.5">
            {productos.length} registrados
          </p>
        </div>
        <Button onClick={openNew} size="md">
          <Plus size={16} /> Nuevo
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : productos.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Sin productos aún"
          description="Creá tu primer producto para empezar."
          action={<Button onClick={openNew} size="sm">Nuevo producto</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {productos.map(p => (
            <div
              key={p.id}
              className="bg-surface rounded-3xl shadow-sm border border-border overflow-hidden hover:bg-surface-raised transition-colors cursor-pointer"
            >
              {p.imagenUrl ? (
                <div className="relative w-full h-32">
                  <Image src={p.imagenUrl} alt={p.nombre} fill className="object-cover" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
                </div>
              ) : (
                <div className="w-full h-32 bg-surface-sunken flex items-center justify-center">
                  <Package size={32} className="text-muted-foreground" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground truncate">{p.nombre}</p>
                    {p.descripcion && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {p.descripcion}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(p)}
                      className="p-2 rounded-xl hover:bg-surface-raised text-muted-foreground transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setConfirm(p.id)}
                      className="p-2 rounded-xl hover:bg-destructive/10 text-destructive transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <Badge variant={p.tipo === 'PLATO_PREPARADO' ? 'warning' : 'info'}>
                    {TIPO_LABEL[p.tipo]}
                  </Badge>
                  <span className="text-base font-bold text-foreground">
                    ${fmt(p.precio)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId !== null ? 'Editar producto' : 'Nuevo producto'}
      >
        <div className="space-y-4">
          <ImageUpload value={imgUrl} onChange={handleImgChange} label="Foto del producto" />
          <div className="flex flex-col gap-1.5">
            <Label>Nombre *</Label>
            <Input
              placeholder="Ej. Pollo a la brasa"
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Descripción</Label>
            <textarea
              className="w-full rounded-md border border-input bg-surface-sunken px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              rows={2}
              placeholder="Descripción opcional..."
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Precio *</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.precio}
              onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tipo *</Label>
            <div className="flex gap-2">
              {TIPOS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tipo: t }))}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                    form.tipo === t
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-border text-muted-foreground hover:bg-surface-raised'
                  }`}
                >
                  {TIPO_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-2xl h-11"
          >
            {saving ? 'Guardando...' : editId !== null ? 'Guardar cambios' : 'Crear producto'}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title="¿Eliminar producto?"
        message="Esta acción no se puede deshacer."
        onConfirm={() => confirm !== null && handleDelete(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
