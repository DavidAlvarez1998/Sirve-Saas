'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, TableProperties } from 'lucide-react'
import { getMesas, createMesa, updateMesa, deleteMesa } from '@/lib/api/mesas'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { toast } from 'sonner'
import type { Mesa, ApiError } from '@/types'

interface MesaForm {
  numero: string
}

export default function AdminMesas() {
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<MesaForm>({ numero: '' })
  const [editId, setEditId] = useState<number | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [confirm, setConfirm] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    getMesas()
      .then(setMesas)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openNew = () => {
    setForm({ numero: '' })
    setEditId(null)
    setModalOpen(true)
  }

  const openEdit = (m: Mesa) => {
    setForm({ numero: String(m.numero) })
    setEditId(m.id)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.numero.trim()) return
    setSaving(true)
    try {
      const data: Partial<Mesa> = { numero: form.numero }
      if (editId !== null) {
        await updateMesa(editId, data)
        toast.success('Mesa actualizada')
      } else {
        await createMesa(data)
        toast.success('Mesa creada')
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
      await deleteMesa(id)
      toast.success('Mesa eliminada')
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
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Mesas</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
            {mesas.length} registradas
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-2xl text-sm font-semibold shadow transition"
        >
          <Plus size={16} /> Nueva
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400 dark:text-slate-500 text-sm">
          Cargando...
        </div>
      ) : mesas.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-slate-400 dark:text-slate-500">
          <TableProperties size={40} className="mb-2 opacity-40" />
          <p className="text-sm">Sin mesas aún</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {mesas.map(m => (
            <div
              key={m.id}
              className="bg-slate-100 dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 flex flex-col items-center gap-2"
            >
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 flex items-center justify-center">
                <TableProperties size={22} className="text-sky-400" />
              </div>
              <p className="font-extrabold text-slate-900 dark:text-white text-sm">
                Mesa {m.numero}
              </p>
              <div className="flex gap-1 w-full">
                <button
                  onClick={() => openEdit(m)}
                  className="flex-1 flex justify-center py-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setConfirm(m.id)}
                  className="flex-1 flex justify-center py-1.5 rounded-xl hover:bg-red-500/10 text-red-400 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId !== null ? 'Editar mesa' : 'Nueva mesa'}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Número de mesa *
            </label>
            <input
              className="mt-1 w-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400"
              placeholder="Ej. 1, A1, VIP-1..."
              value={form.numero}
              onChange={e => setForm({ numero: e.target.value })}
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white py-3 rounded-2xl font-semibold text-sm transition"
          >
            {saving ? 'Guardando...' : editId !== null ? 'Guardar cambios' : 'Crear mesa'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title="¿Eliminar mesa?"
        message="La mesa se eliminará permanentemente."
        onConfirm={() => confirm !== null && handleDelete(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
