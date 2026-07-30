'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Plus, Pencil, Trash2, Salad } from 'lucide-react'
import { getIngredientes, createIngrediente, updateIngrediente, deleteIngrediente } from '@/lib/api/ingredientes'
import { uploadImagen } from '@/lib/api/imagenes'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Toast from '@/components/ui/Toast'
import ImageUpload from '@/components/ui/ImageUpload'
import type { Ingrediente, ApiError } from '@/types'
import { fmt } from '@/lib/format'

interface IngredienteForm {
  nombre: string
  precio: string | number
}

const EMPTY: IngredienteForm = { nombre: '', precio: 0 }

interface ToastState {
  msg: string
  type: 'success' | 'error'
}

export default function AdminIngredientes() {
  const [items, setItems] = useState<Ingrediente[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<IngredienteForm>(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirm, setConfirm] = useState<number | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getIngredientes()
      .then(setItems)
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

  const openEdit = (item: Ingrediente) => {
    setForm({ nombre: item.nombre, precio: item.precio })
    setEditId(item.id)
    setImgFile(null)
    setImgUrl(item.imagenUrl ?? null)
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

      const data: Partial<Ingrediente> = {
        nombre: form.nombre,
        precio: parseFloat(String(form.precio)),
        imagenUrl: imagenUrl ?? undefined,
      }

      if (editId !== null) {
        await updateIngrediente(editId, data)
        setToast({ msg: 'Ingrediente actualizado', type: 'success' })
      } else {
        await createIngrediente(data)
        setToast({ msg: 'Ingrediente creado', type: 'success' })
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
      await deleteIngrediente(id)
      setToast({ msg: 'Ingrediente eliminado', type: 'success' })
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
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Ingredientes</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
            {items.length} registrados
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-2xl text-sm font-semibold shadow transition"
        >
          <Plus size={16} /> Nuevo
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400 dark:text-slate-500 text-sm">
          Cargando...
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400 dark:text-slate-500">
          <Salad size={40} className="mb-2 opacity-40" />
          <p className="text-sm">Sin ingredientes aún</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map(item => (
            <div
              key={item.id}
              className="bg-slate-100 dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden"
            >
              {item.imagenUrl ? (
                <div className="relative w-full h-24">
                  <Image src={item.imagenUrl} alt={item.nombre} fill className="object-cover" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
                </div>
              ) : (
                <div className="w-full h-24 bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                  <Salad size={28} className="text-slate-400 dark:text-slate-500" />
                </div>
              )}
              <div className="p-3">
                <p className="font-bold text-slate-900 dark:text-white text-sm truncate">
                  {item.nombre}
                </p>
                <p className="text-emerald-400 font-extrabold text-sm mt-1">${fmt(item.precio)}</p>
                <div className="flex gap-1 mt-2">
                  <button
                    onClick={() => openEdit(item)}
                    className="flex-1 flex justify-center py-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setConfirm(item.id)}
                    className="flex-1 flex justify-center py-1.5 rounded-xl hover:bg-red-500/10 text-red-400 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId !== null ? 'Editar ingrediente' : 'Nuevo ingrediente'}
      >
        <div className="space-y-4">
          <ImageUpload value={imgUrl} onChange={handleImgChange} label="Foto del ingrediente" />
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Nombre *
            </label>
            <input
              className="mt-1 w-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="Ej. Queso mozzarella"
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Precio extra *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="0.00"
              value={form.precio}
              onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-2xl font-semibold text-sm transition mt-2"
          >
            {saving ? 'Guardando...' : editId !== null ? 'Guardar cambios' : 'Crear ingrediente'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title="¿Eliminar ingrediente?"
        message="Esta acción no se puede deshacer."
        onConfirm={() => confirm !== null && handleDelete(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
