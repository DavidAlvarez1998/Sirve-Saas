'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { Plus, Pencil, Trash2, Salad } from 'lucide-react'
import { getIngredientes, createIngrediente, updateIngrediente, deleteIngrediente } from '@/lib/api/ingredientes'
import { uploadImagen, deleteImagen } from '@/lib/api/imagenes'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { toast } from 'sonner'
import ImageUpload from '@/components/ui/ImageUpload'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Ingrediente, ApiError } from '@/types'
import { fmt } from '@/lib/format'

interface IngredienteForm {
  nombre: string
  precio: string | number
}

const EMPTY: IngredienteForm = { nombre: '', precio: 0 }

export default function AdminIngredientes() {
  const [items, setItems] = useState<Ingrediente[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<IngredienteForm>(EMPTY)
  const [editId, setEditId] = useState<number | null>(null)
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [prevImgUrl, setPrevImgUrl] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirm, setConfirm] = useState<number | null>(null)
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
    setPrevImgUrl(null)
    setModalOpen(true)
  }

  const openEdit = (item: Ingrediente) => {
    setForm({ nombre: item.nombre, precio: item.precio })
    setEditId(item.id)
    setImgFile(null)
    setImgUrl(item.imagenUrl ?? null)
    setPrevImgUrl(item.imagenUrl ?? null)
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
        if (prevImgUrl && prevImgUrl !== imagenUrl) deleteImagen(prevImgUrl).catch(() => {})
        toast.success('Ingrediente actualizado')
      } else {
        await createIngrediente(data)
        toast.success('Ingrediente creado')
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
      await deleteIngrediente(id)
      toast.success('Ingrediente eliminado')
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
          <h1 className="text-2xl font-semibold text-foreground">Ingredientes</h1>
          <p className="text-muted-foreground text-xs mt-0.5">
            {items.length} registrados
          </p>
        </div>
        <Button onClick={openNew} size="md">
          <Plus size={16} /> Nuevo
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Salad}
          title="Sin ingredientes aún"
          description="Creá tu primer ingrediente para empezar."
          action={<Button onClick={openNew} size="sm">Nuevo ingrediente</Button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map(item => (
            <div
              key={item.id}
              className="bg-surface rounded-3xl shadow-sm border border-border overflow-hidden hover:bg-surface-raised transition-colors cursor-pointer"
            >
              {item.imagenUrl ? (
                <div className="relative w-full h-24">
                  <Image src={item.imagenUrl} alt={item.nombre} fill className="object-cover" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" />
                </div>
              ) : (
                <div className="w-full h-24 bg-surface-sunken flex items-center justify-center">
                  <Salad size={28} className="text-muted-foreground" />
                </div>
              )}
              <div className="p-3">
                <p className="font-bold text-foreground text-sm truncate">
                  {item.nombre}
                </p>
                <p className="text-success font-bold text-sm mt-1">${fmt(item.precio)}</p>
                <div className="flex gap-1 mt-2">
                  <button
                    onClick={() => openEdit(item)}
                    className="flex-1 flex justify-center py-1.5 rounded-xl hover:bg-surface-raised text-muted-foreground transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setConfirm(item.id)}
                    className="flex-1 flex justify-center py-1.5 rounded-xl hover:bg-destructive/10 text-destructive transition-colors"
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
          <div className="flex flex-col gap-1.5">
            <Label>Nombre *</Label>
            <Input
              placeholder="Ej. Queso mozzarella"
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Precio extra *</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.precio}
              onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
            />
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-2xl h-11"
          >
            {saving ? 'Guardando...' : editId !== null ? 'Guardar cambios' : 'Crear ingrediente'}
          </Button>
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
