'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createOrden } from '../../lib/api/ordenes'
import Modal from '../../components/ui/Modal'
import Toast from '../../components/ui/Toast'
import { TableProperties, Plus } from 'lucide-react'
import { useMesero } from '../../context/MeseroContext'
import type { Mesa, TipoOrden } from '../../types'

export default function MeseroMesas() {
  const { mesas, ordenes, loadingMesas, invalidateOrdenes, invalidateMesas } = useMesero()
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedMesa, setSelectedMesa] = useState<Mesa | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const mesaOcupada = (id: number) =>
    ordenes.some(
      o =>
        o.mesaId === id &&
        o.estado !== 'CANCELADA' &&
        !(o.estado === 'ENTREGADA' && o.pagada)
    )

  const handleMesaClick = (m: Mesa) => {
    const orden = ordenes.find(
      o =>
        o.mesaId === m.id &&
        o.estado !== 'CANCELADA' &&
        !(o.estado === 'ENTREGADA' && o.pagada)
    )
    if (orden) {
      // Navigate to ordenes and pass the ordenId via sessionStorage (Next.js Router has no state param)
      sessionStorage.setItem('meseroNavState', JSON.stringify({ ordenId: orden.id }))
      router.push('/mesero/ordenes')
    } else {
      setSelectedMesa(m)
      setModalOpen(true)
    }
  }

  const handleCrearOrden = async () => {
    if (!selectedMesa) return
    setSaving(true)
    try {
      const orden = await createOrden({ tipoOrden: 'MESA', mesaId: selectedMesa.id })
      setToast({ msg: `Orden creada en Mesa ${selectedMesa.numero}`, type: 'success' })
      setModalOpen(false)
      invalidateOrdenes()
      invalidateMesas()
      sessionStorage.setItem('meseroNavState', JSON.stringify({ ordenId: orden.id }))
      router.push('/mesero/ordenes')
    } catch (e: unknown) {
      const err = e as { friendlyMessage?: string }
      setToast({ msg: err.friendlyMessage || 'Error al crear orden', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Mesas</h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">Toca para crear o ver la orden</p>
        </div>
        <button
          onClick={() => { setSelectedMesa(null); setModalOpen(true) }}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white px-4 py-2.5 rounded-2xl text-sm font-semibold shadow transition"
        >
          <Plus size={16} /> Para llevar
        </button>
      </div>

      {loadingMesas ? (
        <div className="flex justify-center py-16 text-slate-400 dark:text-slate-500 text-sm">Cargando...</div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {mesas.map(m => {
            const ocupada = mesaOcupada(m.id)
            return (
              <button
                key={m.id}
                onClick={() => handleMesaClick(m)}
                className={`rounded-3xl p-4 flex flex-col items-center gap-2 shadow-sm border transition active:scale-95 ${
                  ocupada
                    ? 'bg-orange-500 border-orange-400 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-sky-500 text-slate-600 dark:text-slate-300'
                }`}
              >
                <TableProperties size={24} className={ocupada ? 'text-white' : 'text-sky-400'} />
                <span className="font-bold text-sm">{m.numero}</span>
                <span className={`text-[10px] font-medium ${ocupada ? 'text-orange-100' : 'text-slate-400 dark:text-slate-500'}`}>
                  {ocupada ? 'Ocupada' : 'Libre'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nueva orden" size="sm">
        <OrdenTipoSelector
          mesa={selectedMesa}
          saving={saving}
          onCrear={handleCrearOrden}
          onOtroTipo={async (tipo, cliente) => {
            setSaving(true)
            try {
              const orden = await createOrden({ tipoOrden: tipo, ...cliente })
              setToast({ msg: 'Orden creada', type: 'success' })
              setModalOpen(false)
              invalidateOrdenes()
              invalidateMesas()
              sessionStorage.setItem('meseroNavState', JSON.stringify({ ordenId: orden.id }))
              router.push('/mesero/ordenes')
            } catch (e: unknown) {
              const err = e as { friendlyMessage?: string }
              setToast({ msg: err.friendlyMessage || 'Error al crear orden', type: 'error' })
            } finally {
              setSaving(false)
            }
          }}
        />
      </Modal>
    </div>
  )
}

interface OrdenTipoSelectorProps {
  mesa: Mesa | null
  saving: boolean
  onCrear: () => void
  onOtroTipo: (
    tipo: TipoOrden,
    cliente: { nombreCliente?: string; telefonoCliente?: string; direccionEntrega?: string }
  ) => void
}

function OrdenTipoSelector({ mesa, saving, onCrear, onOtroTipo }: OrdenTipoSelectorProps) {
  const [tipo, setTipo] = useState<TipoOrden>(mesa ? 'MESA' : 'PARA_LLEVAR')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')

  const handleCrear = () => {
    if (tipo === 'MESA') { onCrear(); return }
    const cliente: { nombreCliente?: string; telefonoCliente?: string; direccionEntrega?: string } = {
      nombreCliente: nombre,
      telefonoCliente: telefono,
    }
    if (tipo === 'DOMICILIO') cliente.direccionEntrega = direccion
    onOtroTipo(tipo, cliente)
  }

  return (
    <div className="space-y-4">
      {!mesa && (
        <div>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Tipo de orden</label>
          <div className="mt-1 flex gap-2">
            {([['PARA_LLEVAR', 'Para llevar'], ['DOMICILIO', 'Domicilio']] as [TipoOrden, string][]).map(([t, l]) => (
              <button
                key={t}
                onClick={() => setTipo(t)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition ${
                  tipo === t
                    ? 'bg-sky-500 border-sky-500 text-white'
                    : 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
      {mesa && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Se creará una orden para{' '}
          <strong className="text-slate-900 dark:text-white">Mesa {mesa.numero}</strong>
        </p>
      )}
      {tipo !== 'MESA' && (
        <>
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Nombre cliente</label>
            <input
              className="mt-1 w-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Teléfono</label>
            <input
              className="mt-1 w-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400"
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          {tipo === 'DOMICILIO' && (
            <div>
              <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Dirección *</label>
              <input
                className="mt-1 w-full bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400"
                value={direccion}
                onChange={e => setDireccion(e.target.value)}
                placeholder="Calle, número..."
              />
            </div>
          )}
        </>
      )}
      <button
        onClick={handleCrear}
        disabled={saving}
        className="w-full bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white py-3 rounded-2xl font-semibold text-sm transition"
      >
        {saving ? 'Creando...' : 'Crear orden'}
      </button>
    </div>
  )
}
