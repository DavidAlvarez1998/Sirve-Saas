'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Plus, Pencil, Trash2, Package } from 'lucide-react'
import { getProductos, createProducto, updateProducto, deleteProducto } from '@/lib/api/productos'
import { uploadImagen } from '@/lib/api/imagenes'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Toast from '@/components/ui/Toast'
import ImageUpload from '@/components/ui/ImageUpload'
import type { Producto, TipoProducto, ApiError } from '@/types'
import { fmt } from '@/lib/format'

const TIPOS: TipoProducto[] = ['PLATO_PREPARADO', 'VENTA_DIRECTA']
const TIPO_LABEL: Record<TipoProducto, string> = {
  PLATO_PREPARADO: 'Plato preparado',
  VENTA_DIRECTA: 'Venta directa',
}
const TIPO_COLOR: Record<TipoProducto, string> = {
  PLATO_PREPARADO: 'bg-orange-500/20 text-orange-400',
  VENTA_DIRECTA: 'bg-sky-500/20 text-sky-400',
}

interface ProductoForm {
  nombre: string
  descripcion: string
  precio: string | number
  tipo: TipoProducto
}

const EMPTY: ProductoForm = { nombre: '', descripcion: '', precio: 0, tipo: 'PLATO_PREPARADO' }

interface ToastState {
  msg: string
  type: 'success' | 'error'
}

export default function AdminProductos() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<ProductoForm>(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirm, setConfirm] = useState<number | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
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
        setToast({ msg: 'Producto actualizado', type: 'success' })
      } else {
        await createProducto(data)
        setToast({ msg: 'Producto creado', type: 'success' })
      }
      setModalOpen(false)
      load()
    } catch (e) {
      const err = e as ApiError
      setToast({ msg: err.friendlyMessage ?? 'Error al guardar', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteProducto(id)
      setToast({ msg: 'Producto eliminado', type: 'success' })
      load()
    } catch (e) {
      const err = e as ApiError
      setToast({ msg: err.friendlyMessage ?? 'Error al eliminar', type: 'error' })
    } finally {
      setConfirm(null)
    }
  }

  return (
    <div className="p-5">
      {toast && (
        <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Productos</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
            {productos.length} registrados
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-2xl text-sm font-semibold shadow transition"
        >
          <Plus size={16} /> Nuevo
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400 dark:text-slate-500 text-sm">
          Cargando...
        </div>
      ) : productos.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400 dark:text-slate-500">
          <Package size={40} className="mb-2 opacity-40" />
          <p className="text-sm">Sin productos aún</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {productos.map(p => (
            <div
              key={p.id}
              className="bg-slate-100 dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
            >
              {p.imagenUrl ? (
                <div className="relative w-full h-32">
                  <Image src={p.imagenUrl} alt={p.nombre} fill className="object-cover" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
                </div>
              ) : (
                <div className="w-full h-32 bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                  <Package size={32} className="text-slate-400 dark:text-slate-500" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">{p.nombre}</p>
                    {p.descripcion && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {p.descripcion}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(p)}
                      className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setConfirm(p.id)}
                      className="p-2 rounded-xl hover:bg-red-500/10 text-red-400 transition"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TIPO_COLOR[p.tipo]}`}
                  >
                    {TIPO_LABEL[p.tipo]}
                  </span>
                  <span className="text-base font-extrabold text-slate-900 dark:text-white">
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
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Nombre *
            </label>
            <input
              className="mt-1 w-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="Ej. Pollo a la brasa"
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Descripción
            </label>
            <textarea
              className="mt-1 w-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
              rows={2}
              placeholder="Descripción opcional..."
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Precio *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="0.00"
              value={form.precio}
              onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Tipo *</label>
            <div className="mt-1 flex gap-2">
              {TIPOS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tipo: t }))}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition ${
                    form.tipo === t
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {TIPO_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white py-3 rounded-2xl font-semibold text-sm transition mt-2"
          >
            {saving ? 'Guardando...' : editId !== null ? 'Guardar cambios' : 'Crear producto'}
          </button>
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
