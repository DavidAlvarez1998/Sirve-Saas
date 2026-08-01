'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  getOrdenById,
  getOrdenesHistorial,
  addItem,
  removeItem,
  updateItem,
  updateEstado,
  updateOrden,
  pagarOrden,
  deleteOrden,
  dividirOrden,
  separarItem,
} from '../../../lib/api/ordenes'
import Modal from '../../../components/ui/Modal'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import StatusBadge from '../../../components/ui/StatusBadge'
import { toast } from 'sonner'
import {
  Plus, Trash2, CreditCard, ChevronRight, X, Check, Package, Salad,
  Pencil, MapPin, User, Phone, Copy,
} from 'lucide-react'
import { fmt } from '../../../lib/format'
import { useMesero } from '../../../context/MeseroContext'
import { ESTADO_LABEL } from '../../../lib/estado-orden'
import type {
  Orden, OrdenItem, EstadoOrden, TipoOrden, MetodoPago, Producto, Ingrediente,
} from '../../../types'

// ─── Constants ───────────────────────────────────────────────────────────────

const ESTADOS: EstadoOrden[] = ['ABIERTA', 'EN_PREPARACION', 'LISTA', 'EN_CAMINO', 'ENTREGADA', 'CANCELADA']
const METODOS: MetodoPago[] = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']
const METODO_LABEL: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
}

// Token-based border+text classes for estado buttons/chips (used inline where Badge is not enough)
const ESTADO_CLS: Record<string, string> = {
  ABIERTA:        'bg-info/20 border-info/40 text-info',
  EN_PREPARACION: 'bg-warning/20 border-warning/40 text-warning',
  LISTA:          'bg-success/20 border-success/40 text-success',
  EN_CAMINO:      'bg-info/20 border-info/40 text-info',
  ENTREGADA:      'bg-success/20 border-success/40 text-success',
  PAGADA:         'bg-muted border-border text-muted-foreground',
  CANCELADA:      'bg-destructive/20 border-destructive/40 text-destructive',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isClosed = (o: Orden) =>
  o.estado === 'CANCELADA' || o.estado === 'PAGADA' || (o.estado === 'ENTREGADA' && o.pagada)

const tipoLabel = (t: TipoOrden | undefined, mesaNumero?: number | string | null): string => {
  if (t === 'MESA') return `Mesa ${mesaNumero || ''}`
  if (t === 'PARA_LLEVAR') return 'Para llevar'
  if (t === 'DOMICILIO') return 'Domicilio'
  return t ?? ''
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function MeseroOrdenes() {
  const { ordenes, loadingOrdenes, invalidateOrdenes, invalidateMesas, syncOrden } = useMesero()
  const [tab, setTab] = useState<'activas' | 'historial'>('activas')
  const [historial, setHistorial] = useState<Orden[]>([])
  const [histPage, setHistPage] = useState(0)
  const [histHasNext, setHistHasNext] = useState(false)
  const [histLoading, setHistLoading] = useState(false)
  const [selected, setSelected] = useState<Orden | null>(null)

  const [addModal, setAddModal] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [estadoModal, setEstadoModal] = useState(false)
  const [confirmDel, setConfirmDel] = useState<number | null>(null)
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<OrdenItem | null>(null)
  const [editModal, setEditModal] = useState(false)
  const [editingItem, setEditingItem] = useState<OrdenItem | null>(null)
  const [editOrdenModal, setEditOrdenModal] = useState(false)
  const [confirmAddToPaid, setConfirmAddToPaid] = useState(false)
  const [confirmEditPaid, setConfirmEditPaid] = useState<OrdenItem | null>(null)
  const [splitMode, setSplitMode] = useState(false)
  const [splitSelected, setSplitSelected] = useState<Set<string>>(new Set())
  const [splitting, setSplitting] = useState(false)

  const selectedIdRef = useRef<number | null>(null)
  useEffect(() => { selectedIdRef.current = selected?.id ?? null }, [selected])

  // Lock body scroll while this view is mounted (split-panel layout)
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Mobile back navigation: push a history entry when an order is selected so the
  // hardware back button / swipe clears the detail panel instead of navigating away.
  const detailHistoryPushed = useRef(false)

  useEffect(() => {
    if (!selected) { detailHistoryPushed.current = false; return }
    if (!detailHistoryPushed.current) {
      window.history.pushState({ meseroOrdenDetail: true }, '', window.location.href)
      detailHistoryPushed.current = true
    }
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPop = () => { detailHistoryPushed.current = false; setSelected(null) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const loadHistorial = useCallback((page: number, append = false) => {
    setHistLoading(true)
    getOrdenesHistorial(page, 20)
      .then(data => {
        setHistorial(prev => append ? [...prev, ...data.content] : data.content)
        setHistPage(data.page)
        setHistHasNext(data.hasNext)
      })
      .catch(() => {})
      .finally(() => setHistLoading(false))
  }, [])

  const loadOrden = useCallback((id: number) => {
    getOrdenById(id).then(updated => {
      setSelected(updated)
      syncOrden(updated)
    }).catch(() => {})
  }, [syncOrden])

  // On mount: read sessionStorage to restore ordenId selection (replaces React Router location.state)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('meseroNavState')
      if (raw) {
        const state = JSON.parse(raw) as { ordenId?: number }
        sessionStorage.removeItem('meseroNavState')
        if (state.ordenId) loadOrden(state.ordenId)
      }
    } catch {
      // ignore parse errors
    }
  }, [loadOrden])

  useEffect(() => {
    if (tab === 'historial' && historial.length === 0) loadHistorial(0)
  }, [tab, loadHistorial]) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    invalidateOrdenes()
    if (selected) loadOrden(selected.id)
    setHistorial([])
    setHistPage(0)
    setHistHasNext(false)
  }

  const doRemoveItem = async (item: OrdenItem) => {
    if (!selected) return
    try {
      let updated: Orden
      if (item.cantidad > 1) {
        updated = await updateItem(selected.id, item.id, {
          productoId: item.productoId,
          cantidad: item.cantidad - 1,
          notas: item.notas || '',
          ingredientes: item.ingredientes?.map(ing => ({ ingredienteId: ing.ingredienteId, cantidad: ing.cantidad })) ?? [],
        })
      } else {
        updated = await removeItem(selected.id, item.id)
      }
      setSelected(updated)
      syncOrden(updated)
    } catch (e: unknown) {
      const err = e as { friendlyMessage?: string }
      toast.error(err.friendlyMessage || 'Error')
    } finally {
      setConfirmRemoveItem(null)
    }
  }

  const handleDeleteOrden = async () => {
    if (confirmDel === null) return
    try {
      await deleteOrden(confirmDel)
      setSelected(null)
      toast.success('Orden eliminada')
      invalidateOrdenes()
      invalidateMesas()
    } catch (e: unknown) {
      const err = e as { friendlyMessage?: string }
      toast.error(err.friendlyMessage || 'Error')
    } finally {
      setConfirmDel(null)
    }
  }

  const handleEditItem = async (item: OrdenItem) => {
    if (!selected) return
    if (selected.pagada) { setConfirmEditPaid(item); return }
    if (item.cantidad > 1) {
      try {
        const { orden: updated, nuevoItemId } = await separarItem(selected.id, item.id)
        setSelected(updated)
        syncOrden(updated)
        const nuevoItem = updated.items.find(i => i.id === nuevoItemId)
        if (nuevoItem) { setEditingItem(nuevoItem); setEditModal(true) }
      } catch (e: unknown) {
        const err = e as { friendlyMessage?: string }
        toast.error(err.friendlyMessage || 'Error')
      }
      return
    }
    setEditingItem(item)
    setEditModal(true)
  }

  const selectOrden = useCallback((id: number) => {
    setSplitMode(false)
    setSplitSelected(new Set())
    loadOrden(id)
  }, [loadOrden])

  const toggleSplitCard = (key: string) => {
    setSplitSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSplit = async () => {
    if (!selected) return
    setSplitting(true)
    try {
      const counts: Record<string, number> = {}
      for (const key of splitSelected) {
        const itemId = key.split('_')[0]
        counts[itemId] = (counts[itemId] || 0) + 1
      }
      const data = {
        items: Object.entries(counts).map(([itemId, cantidad]) => ({ itemId: Number(itemId), cantidad })),
      }
      const { nueva } = await dividirOrden(selected.id, data)
      setSelected(nueva)
      setSplitMode(false)
      setSplitSelected(new Set())
      invalidateOrdenes()
      invalidateMesas()
      toast.success(`Orden dividida → nueva orden #${nueva.id} creada`)
    } catch (e: unknown) {
      const err = e as { friendlyMessage?: string }
      toast.error(err.friendlyMessage || 'Error al dividir la orden')
    } finally {
      setSplitting(false)
    }
  }

  // Suppress unused variable warning — refresh is available for future use
  void refresh

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden">
      {/* Order list panel */}
      <div
        className={`w-full md:w-80 md:border-r border-border bg-surface flex flex-col flex-1 md:flex-none min-h-0 ${selected ? 'hidden md:flex' : 'flex'}`}
      >
        <div className="p-4 border-b border-border">
          <h1 className="text-xl font-semibold text-foreground">Órdenes</h1>
          <div className="mt-3 flex rounded-xl overflow-hidden border border-border">
            <button
              onClick={() => setTab('activas')}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${tab === 'activas' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-surface-raised'}`}
            >
              Activas · {ordenes.length}
            </button>
            <button
              onClick={() => setTab('historial')}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${tab === 'historial' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-surface-raised'}`}
            >
              {historial.length > 0 ? `Historial · ${historial.length}` : 'Historial'}
            </button>
          </div>
        </div>

        {tab === 'activas' ? (
          loadingOrdenes ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Cargando...</div>
          ) : ordenes.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Sin órdenes activas</div>
          ) : (
            <div className="divide-y divide-border overflow-y-auto flex-1 scrollbar-hide pb-16 md:pb-0 min-h-0">
              {ordenes.map(o => (
                <OrdenListItem key={o.id} o={o} selected={selected} onSelect={selectOrden} />
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col overflow-y-auto flex-1 scrollbar-hide pb-16 md:pb-0 min-h-0">
            {historial.length === 0 && histLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Cargando...</div>
            ) : historial.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Sin órdenes en el historial</div>
            ) : (
              <div className="divide-y divide-border">
                {historial.map(o => (
                  <OrdenListItem key={o.id} o={o} selected={selected} onSelect={selectOrden} />
                ))}
              </div>
            )}
            {histHasNext && (
              <button
                onClick={() => loadHistorial(histPage + 1, true)}
                disabled={histLoading}
                className="m-3 py-2.5 rounded-2xl border border-border text-xs font-semibold text-muted-foreground hover:bg-surface-raised disabled:opacity-40 transition-colors"
              >
                {histLoading ? 'Cargando...' : 'Ver 20 más'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected ? (
        <div className="flex-1 bg-background flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {/* Detail header */}
            <div className="bg-surface border-b border-border px-4 py-4 flex items-center justify-between">
              <div>
                <button
                  onClick={() => detailHistoryPushed.current ? window.history.back() : setSelected(null)}
                  className="md:hidden text-xs text-primary mb-1"
                >
                  ← Volver
                </button>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-foreground text-lg">
                    {tipoLabel(selected.tipoOrden, selected.mesaNumero)}
                  </h2>
                  <button
                    onClick={() => setEditOrdenModal(true)}
                    className="p-1 rounded-lg hover:bg-surface-raised text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
                {(selected.nombreCliente || selected.telefonoCliente || selected.direccionEntrega) && (
                  <div className="mt-1 space-y-0.5">
                    {selected.nombreCliente && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <User size={10} />{selected.nombreCliente}
                      </p>
                    )}
                    {selected.telefonoCliente && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone size={10} />{selected.telefonoCliente}
                      </p>
                    )}
                    {selected.direccionEntrega && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin size={10} />{selected.direccionEntrega}
                      </p>
                    )}
                  </div>
                )}
                {selected.pagada && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success/20 text-success mt-1">
                    Pagada
                  </span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                {!isClosed(selected) && (selected.items?.reduce((s, i) => s + i.cantidad, 0) ?? 0) > 1 && (
                  <button
                    onClick={() => { setSplitMode(m => !m); setSplitSelected(new Set()) }}
                    title="Dividir orden"
                    className={`p-2 rounded-2xl border text-xs font-semibold transition-colors ${splitMode ? 'bg-warning/20 border-warning/40 text-warning' : 'border-border text-muted-foreground hover:bg-surface-raised'}`}
                  >
                    <Copy size={14} />
                  </button>
                )}
                {!splitMode && (() => {
                  const cls = ESTADO_CLS[selected.estado] ?? ESTADO_CLS.ABIERTA
                  const label = ESTADO_LABEL[selected.estado] ?? selected.estado
                  return (
                    <button
                      onClick={() => setEstadoModal(true)}
                      className={`px-3 py-2 rounded-2xl border text-xs font-semibold transition-colors ${cls}`}
                    >
                      {label}
                    </button>
                  )
                })()}
                {!splitMode && (
                  <button
                    onClick={() => setPayModal(true)}
                    className="px-3 py-2 rounded-2xl bg-success text-white text-xs font-semibold hover:opacity-90 transition-colors flex items-center gap-1"
                  >
                    <CreditCard size={13} /> Cobrar
                  </button>
                )}
                {!splitMode && !selected.pagada && (
                  <button
                    onClick={() => setConfirmDel(selected.id)}
                    className="p-2 rounded-2xl hover:bg-destructive/10 text-destructive transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            {splitMode && (
              <div className="mx-4 mt-3 mb-0 px-3 py-2 rounded-2xl bg-warning/10 border border-warning/30 text-warning text-xs font-medium flex items-center gap-2">
                <Copy size={12} />
                Selecciona los productos que quieres mover a una nueva orden
              </div>
            )}

            {/* Items */}
            <div className="p-4 space-y-3">
              {selected.items?.length === 0 && (
                <p className="text-slate-400 dark:text-slate-500 text-sm text-center py-6">
                  Sin items. Agrega productos abajo.
                </p>
              )}
              {selected.items?.flatMap(item =>
                Array.from({ length: item.cantidad }, (_, i) => ({ ...item, _unit: i }))
              ).map(item => {
                const cardKey = `${item.id}_${item._unit}`
                const isCardSelected = splitSelected.has(cardKey)
                const precioUnit =
                  item.precioUnitario +
                  (item.ingredientes?.reduce((s, ing) => s + ing.precioUnitario * ing.cantidad, 0) ?? 0)
                return (
                  <div
                    key={cardKey}
                    onClick={splitMode ? () => toggleSplitCard(cardKey) : undefined}
                    className={`relative bg-surface rounded-2xl p-3.5 shadow-sm border flex items-start gap-3 transition-colors
                      ${splitMode ? 'cursor-pointer' : ''}
                      ${splitMode && isCardSelected ? 'border-warning bg-warning/10' : 'border-border'}
                    `}
                  >
                    {splitMode && (
                      <div
                        className={`absolute top-2.5 right-2.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 ${isCardSelected ? 'bg-warning border-warning' : 'border-border'}`}
                      >
                        {isCardSelected && <Check size={10} className="text-black" />}
                      </div>
                    )}
                    {item.productoImagenUrl ? (
                      <img src={item.productoImagenUrl} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" alt="" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-surface-sunken flex items-center justify-center flex-shrink-0">
                        <Package size={18} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground text-sm">{item.productoNombre}</p>
                      <p className="text-xs text-muted-foreground">${fmt(precioUnit)}</p>
                      {item.notas && (
                        <p className="text-xs text-warning mt-0.5 italic">{item.notas}</p>
                      )}
                      {item.ingredientes?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.ingredientes.map(ing => (
                            <span key={ing.id} className="text-[10px] bg-success/15 text-success px-2 py-0.5 rounded-full">
                              {ing.cantidad > 1 ? `${ing.cantidad}x ` : '+'}{ing.ingredienteNombre}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {!splitMode && (
                      <div className="flex gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => handleEditItem(item)}
                          className="p-1.5 rounded-xl hover:bg-info/10 text-info transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        {!selected.pagada && (
                          <button
                            onClick={() => setConfirmRemoveItem(item)}
                            className="p-1.5 rounded-xl hover:bg-destructive/10 text-destructive transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Actions bottom */}
            <div className="px-4 pb-6">
              {splitMode ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSplitMode(false); setSplitSelected(new Set()) }}
                    className="flex-1 py-3.5 rounded-2xl border border-border text-muted-foreground text-sm font-semibold hover:bg-surface-raised transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSplit}
                    disabled={splitSelected.size === 0 || splitting}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-warning text-black text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-colors"
                  >
                    <Copy size={14} />
                    {splitting ? 'Dividiendo...' : `Mover (${splitSelected.size})`}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => selected.pagada ? setConfirmAddToPaid(true) : setAddModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-primary text-primary text-sm font-semibold hover:bg-primary/10 transition-colors"
                >
                  <Plus size={16} /> Agregar producto
                </button>
              )}
            </div>

            {/* Payment summary */}
            <div className="mx-4 mb-6 bg-surface rounded-3xl p-4 shadow-sm border border-border">
              <div className="flex justify-between text-sm text-muted-foreground mb-1">
                <span>Subtotal</span>
                <span>${fmt(selected.totalMonto)}</span>
              </div>
              {selected.pagos?.map((p, i) => (
                <div key={i} className="flex justify-between text-xs text-success mb-0.5">
                  <span>Pago ({METODO_LABEL[p.metodoPago]})</span>
                  <span>-${fmt(p.montoPagado)}</span>
                </div>
              ))}
              <div className="border-t border-border mt-2 pt-2 flex justify-between font-bold text-foreground">
                <span>Total</span>
                <span>
                  ${fmt(Math.max(0, selected.totalMonto - (selected.pagos?.reduce((s, p) => s + p.montoPagado, 0) ?? 0)))}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Selecciona una orden
        </div>
      )}

      {/* Sub-modals — only rendered when an order is selected */}
      {selected && (
        <>
          <AddItemModal
            open={addModal}
            onClose={() => setAddModal(false)}
            ordenId={selected.id}
            onDone={updated => { setSelected(updated); setAddModal(false); syncOrden(updated) }}
            onError={msg => toast.error(msg)}
          />

          <PagarModal
            open={payModal}
            onClose={() => setPayModal(false)}
            orden={selected}
            onDone={updated => {
              setPayModal(false)
              toast.success('Pago registrado')
              if (isClosed(updated)) {
                setSelected(null)
                invalidateOrdenes()
                invalidateMesas()
                setHistorial([])
                setHistPage(0)
                setHistHasNext(false)
              } else {
                setSelected(updated)
                invalidateOrdenes()
                invalidateMesas()
              }
            }}
            onError={msg => toast.error(msg)}
          />

          <EstadoModal
            open={estadoModal}
            onClose={() => setEstadoModal(false)}
            orden={selected}
            onDone={updated => {
              setEstadoModal(false)
              toast.success('Estado actualizado')
              if (isClosed(updated)) {
                setSelected(null)
                invalidateOrdenes()
                invalidateMesas()
                setHistorial([])
                setHistPage(0)
                setHistHasNext(false)
              } else {
                setSelected(updated)
                invalidateOrdenes()
              }
            }}
            onError={msg => toast.error(msg)}
          />

          <EditItemModal
            open={editModal}
            onClose={() => setEditModal(false)}
            item={editingItem}
            ordenId={selected.id}
            onDone={updated => {
              setSelected(updated)
              setEditModal(false)
              syncOrden(updated)
              toast.success('Item actualizado')
            }}
            onError={msg => toast.error(msg)}
          />

          <EditOrdenModal
            open={editOrdenModal}
            onClose={() => setEditOrdenModal(false)}
            orden={selected}
            onDone={updated => {
              setSelected(updated)
              setEditOrdenModal(false)
              syncOrden(updated)
              invalidateMesas()
              toast.success('Orden actualizada')
            }}
            onError={msg => toast.error(msg)}
          />
        </>
      )}

      {/* Global confirm dialogs */}
      <ConfirmDialog
        open={confirmDel !== null}
        title="¿Eliminar orden?"
        message="Se eliminará permanentemente esta orden."
        onConfirm={handleDeleteOrden}
        onCancel={() => setConfirmDel(null)}
      />

      <ConfirmDialog
        open={confirmRemoveItem !== null}
        title="¿Quitar producto?"
        message="Se quitará este producto de la orden."
        onConfirm={() => confirmRemoveItem && doRemoveItem(confirmRemoveItem)}
        onCancel={() => setConfirmRemoveItem(null)}
      />

      <ConfirmDialog
        open={confirmAddToPaid}
        title="Orden ya pagada"
        message="Esta orden ya fue pagada. Agregar productos cambiará el total y se necesitará cobrar la diferencia. ¿Continuar?"
        onConfirm={() => { setConfirmAddToPaid(false); setAddModal(true) }}
        onCancel={() => setConfirmAddToPaid(false)}
      />

      <ConfirmDialog
        open={confirmEditPaid !== null}
        title="Orden ya pagada"
        message="Esta orden ya fue pagada. Editar este producto cambiará el total y se necesitará cobrar la diferencia. ¿Continuar?"
        onConfirm={() => {
          if (confirmEditPaid) { setEditingItem(confirmEditPaid); setConfirmEditPaid(null); setEditModal(true) }
        }}
        onCancel={() => setConfirmEditPaid(null)}
      />
    </div>
  )
}

// ─── OrdenListItem ────────────────────────────────────────────────────────────

function OrdenListItem({
  o,
  selected,
  onSelect,
}: {
  o: Orden
  selected: Orden | null
  onSelect: (id: number) => void
}) {
  return (
    <button
      onClick={() => onSelect(o.id)}
      className={`w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-surface-raised transition-colors cursor-pointer ${selected?.id === o.id ? 'bg-primary/10 border-r-2 border-primary' : ''}`}
    >
      <div>
        <p className="font-bold text-foreground text-sm">
          {o.tipoOrden === 'MESA'
            ? `Mesa ${o.mesaNumero}`
            : o.tipoOrden === 'PARA_LLEVAR'
              ? 'Para llevar'
              : 'Domicilio'}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          ${fmt(o.totalMonto)} · {o.items?.length || 0} items
        </p>
        <div className="mt-1.5">
          <StatusBadge estado={o.estado} pagada={o.pagada} />
        </div>
      </div>
      <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
    </button>
  )
}

// ─── AddItemModal ─────────────────────────────────────────────────────────────

function AddItemModal({
  open,
  onClose,
  ordenId,
  onDone,
  onError,
}: {
  open: boolean
  onClose: () => void
  ordenId: number
  onDone: (updated: Orden) => void
  onError: (msg: string) => void
}) {
  const { productos, ingredientes } = useMesero()
  const [selectedProduct, setSelectedProduct] = useState<Producto | null>(null)
  const [cantidad, setCantidad] = useState(1)
  const [notas, setNotas] = useState('')
  const [extras, setExtras] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) { setSelectedProduct(null); setCantidad(1); setNotas(''); setExtras({}) }
  }, [open])

  const setIngCantidad = (id: number, delta: number) =>
    setExtras(prev => {
      const next = Math.max(0, (prev[id] || 0) + delta)
      if (next === 0) {
        const copy = { ...prev }
        delete copy[id]
        return copy
      }
      return { ...prev, [id]: next }
    })

  const handleAdd = async () => {
    if (!selectedProduct) return
    setSaving(true)
    try {
      const item = {
        productoId: selectedProduct.id,
        cantidad,
        notas,
        ingredientes: Object.entries(extras).map(([id, qty]) => ({ ingredienteId: Number(id), cantidad: qty })),
      }
      const updated = await addItem(ordenId, item)
      onDone(updated)
    } catch (e: unknown) {
      const err = e as { friendlyMessage?: string }
      onError(err.friendlyMessage || 'Error al agregar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Agregar producto" size="lg">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Productos</p>
          <div className="max-h-64 overflow-y-auto scrollbar-hide space-y-3">
            {(['PLATO_PREPARADO', 'VENTA_DIRECTA'] as const).map(tipo => {
              const grupo = productos.filter(p => p.tipo === tipo)
              if (grupo.length === 0) return null
              return (
                <div key={tipo}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 px-1 ${tipo === 'PLATO_PREPARADO' ? 'text-warning' : 'text-info'}`}>
                    {tipo === 'PLATO_PREPARADO' ? 'Platos preparados' : 'Venta directa'}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {grupo.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProduct(p)}
                        className={`flex items-center gap-2 p-2.5 rounded-2xl border text-left transition-colors ${selectedProduct?.id === p.id ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:border-primary'}`}
                      >
                        {p.imagenUrl ? (
                          <img src={p.imagenUrl} className="w-9 h-9 rounded-xl object-cover flex-shrink-0" alt="" />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-surface-sunken flex items-center justify-center flex-shrink-0">
                            <Package size={14} className="text-slate-500 dark:text-slate-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{p.nombre}</p>
                          <p className="text-xs text-muted-foreground">${fmt(p.precio)}</p>
                        </div>
                        {selectedProduct?.id === p.id && <Check size={12} className="text-primary ml-auto flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {selectedProduct && (
          <>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-foreground">Cantidad</label>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => setCantidad(c => Math.max(1, c - 1))} className="w-8 h-8 rounded-full border border-border text-foreground flex items-center justify-center font-bold">-</button>
                <span className="font-bold text-foreground w-6 text-center">{cantidad}</span>
                <button onClick={() => setCantidad(c => c + 1)} className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">+</button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Notas</label>
              <input
                className="mt-1 w-full bg-surface-sunken border border-input rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Instrucciones para este producto..."
                value={notas}
                onChange={e => setNotas(e.target.value)}
              />
            </div>

            {ingredientes.length > 0 && selectedProduct.tipo === 'PLATO_PREPARADO' && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Extras / ingredientes</p>
                <div className="flex flex-wrap gap-2">
                  {ingredientes.map((ing: Ingrediente) => {
                    const isSelected = (extras[ing.id] || 0) > 0
                    return (
                      <button
                        key={ing.id}
                        onClick={() =>
                          isSelected
                            ? setExtras(prev => { const copy = { ...prev }; delete copy[ing.id]; return copy })
                            : setExtras(prev => ({ ...prev, [ing.id]: 1 }))
                        }
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isSelected ? 'bg-success border-success text-white' : 'border-border text-muted-foreground hover:border-success'}`}
                      >
                        {ing.imagenUrl ? (
                          <img src={ing.imagenUrl} className="w-4 h-4 rounded-full object-cover" alt="" />
                        ) : (
                          <Salad size={12} />
                        )}
                        +{ing.nombre} ${fmt(ing.precio)}
                      </button>
                    )
                  })}
                </div>
                {Object.keys(extras).length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {ingredientes.filter((ing: Ingrediente) => (extras[ing.id] || 0) > 0).map((ing: Ingrediente) => (
                      <div key={ing.id} className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-success/15">
                        <span className="text-xs text-success font-medium flex-1 truncate">{ing.nombre}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => setIngCantidad(ing.id, -1)} className="w-6 h-6 rounded-full border border-success/40 bg-surface text-success flex items-center justify-center text-xs font-bold">-</button>
                          <span className="w-5 text-center text-xs font-bold text-success">{extras[ing.id]}</span>
                          <button onClick={() => setIngCantidad(ing.id, 1)} className="w-6 h-6 rounded-full bg-success text-white flex items-center justify-center text-xs font-bold">+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <button
          onClick={handleAdd}
          disabled={!selectedProduct || saving}
          className="w-full bg-primary hover:opacity-90 disabled:opacity-40 text-primary-foreground py-3 rounded-2xl font-semibold text-sm transition-colors"
        >
          {saving ? 'Agregando...' : 'Agregar a la orden'}
        </button>
      </div>
    </Modal>
  )
}

// ─── PagarModal ───────────────────────────────────────────────────────────────

function PagarModal({
  open,
  onClose,
  orden,
  onDone,
  onError,
}: {
  open: boolean
  onClose: () => void
  orden: Orden
  onDone: (updated: Orden) => void
  onError: (msg: string) => void
}) {
  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO')
  const [monto, setMonto] = useState<number | string>('')
  const [propina, setPropina] = useState<number | string>('0')
  const [saving, setSaving] = useState(false)

  const yaPagado = orden?.pagos?.reduce((s, p) => s + p.montoPagado, 0) ?? 0
  const restante = Math.max(0, (orden?.totalMonto ?? 0) - yaPagado)

  useEffect(() => {
    if (open) { setMonto(restante); setPropina('0') }
  }, [open, orden]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePagar = async () => {
    setSaving(true)
    try {
      const updated = await pagarOrden(orden.id, {
        metodoPago: metodo,
        montoPagado: parseFloat(String(monto)),
        propina: parseFloat(String(propina)) || 0,
      })
      onDone(updated)
    } catch (e: unknown) {
      const err = e as { friendlyMessage?: string }
      onError(err.friendlyMessage || 'Error al procesar pago')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar pago" size="sm">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground">Método de pago</label>
          <div className="mt-1 flex gap-2 flex-wrap">
            {METODOS.map(m => (
              <button
                key={m}
                onClick={() => setMetodo(m)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${metodo === m ? 'bg-success border-success text-white' : 'border-border text-muted-foreground hover:bg-surface-raised'}`}
              >
                {METODO_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Monto pagado</label>
          <input
            type="number"
            step="0.01"
            className="mt-1 w-full bg-surface-sunken border border-input rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={monto}
            onChange={e => setMonto(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Propina</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="mt-1 w-full bg-surface-sunken border border-input rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={propina}
            onChange={e => setPropina(e.target.value)}
          />
        </div>
        <div className="bg-surface rounded-2xl p-3 text-sm">
          <div className="flex justify-between text-foreground">
            <span>Total orden</span>
            <span className="font-bold">${fmt(orden?.totalMonto)}</span>
          </div>
          {yaPagado > 0 && (
            <div className="flex justify-between text-success mt-1">
              <span>Ya pagado</span>
              <span>-${fmt(yaPagado)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground mt-1">
            <span>Propina</span>
            <span>${fmt(parseFloat(String(propina)) || 0)}</span>
          </div>
          <div className="flex justify-between font-bold text-foreground mt-2 pt-2 border-t border-border">
            <span>Total a cobrar</span>
            <span>${fmt(restante + (parseFloat(String(propina)) || 0))}</span>
          </div>
        </div>
        <button
          onClick={handlePagar}
          disabled={saving || !monto}
          className="w-full bg-success hover:opacity-90 disabled:opacity-50 text-white py-3 rounded-2xl font-semibold text-sm transition-colors"
        >
          {saving ? 'Procesando...' : 'Confirmar pago'}
        </button>
      </div>
    </Modal>
  )
}

// ─── EditItemModal ────────────────────────────────────────────────────────────

function EditItemModal({
  open,
  onClose,
  item,
  ordenId,
  onDone,
  onError,
}: {
  open: boolean
  onClose: () => void
  item: OrdenItem | null
  ordenId: number
  onDone: (updated: Orden) => void
  onError: (msg: string) => void
}) {
  const { productos, ingredientes: todosIngredientes } = useMesero()
  const [productTipo, setProductTipo] = useState<string | null>(null)
  const [cantidad, setCantidad] = useState(1)
  const [notas, setNotas] = useState('')
  const [extras, setExtras] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !item) return
    setCantidad(item.cantidad)
    setNotas(item.notas || '')
    const initial: Record<number, number> = {}
    item.ingredientes?.forEach(ing => { initial[ing.ingredienteId] = ing.cantidad })
    setExtras(initial)
    setProductTipo(productos.find(p => p.id === item.productoId)?.tipo || null)
  }, [open, item, productos])

  const setIngCantidad = (id: number, delta: number) =>
    setExtras(prev => {
      const next = Math.max(0, (prev[id] || 0) + delta)
      if (next === 0) {
        const copy = { ...prev }
        delete copy[id]
        return copy
      }
      return { ...prev, [id]: next }
    })

  const handleSave = async () => {
    if (!item) return
    setSaving(true)
    try {
      const data = {
        productoId: item.productoId,
        cantidad,
        notas,
        ingredientes: Object.entries(extras).map(([id, qty]) => ({ ingredienteId: Number(id), cantidad: qty })),
      }
      const updated = await updateItem(ordenId, item.id, data)
      onDone(updated)
    } catch (e: unknown) {
      const err = e as { friendlyMessage?: string }
      onError(err.friendlyMessage || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (!item) return null

  return (
    <Modal open={open} onClose={onClose} title="Editar producto" size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-surface rounded-2xl">
          {item.productoImagenUrl ? (
            <img src={item.productoImagenUrl} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" alt="" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-surface-sunken flex items-center justify-center flex-shrink-0">
              <Package size={18} className="text-muted-foreground" />
            </div>
          )}
          <div>
            <p className="font-bold text-foreground text-sm">{item.productoNombre}</p>
            <p className="text-xs text-muted-foreground">${fmt(item.precioUnitario)}/ud</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-foreground">Cantidad</label>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => setCantidad(c => Math.max(1, c - 1))} className="w-8 h-8 rounded-full border border-border text-foreground flex items-center justify-center font-bold">-</button>
            <span className="font-bold text-foreground w-6 text-center">{cantidad}</span>
            <button onClick={() => setCantidad(c => c + 1)} className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">+</button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground">Notas</label>
          <input
            className="mt-1 w-full bg-surface-sunken border border-input rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Instrucciones para este producto..."
            value={notas}
            onChange={e => setNotas(e.target.value)}
          />
        </div>

        {productTipo === 'PLATO_PREPARADO' && todosIngredientes.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Extras / ingredientes</p>
            <div className="flex flex-wrap gap-2">
              {todosIngredientes.map((ing: Ingrediente) => {
                const isSelected = (extras[ing.id] || 0) > 0
                return (
                  <button
                    key={ing.id}
                    onClick={() =>
                      isSelected
                        ? setExtras(prev => { const copy = { ...prev }; delete copy[ing.id]; return copy })
                        : setExtras(prev => ({ ...prev, [ing.id]: 1 }))
                    }
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${isSelected ? 'bg-success border-success text-white' : 'border-border text-muted-foreground hover:border-success'}`}
                  >
                    {ing.imagenUrl ? (
                      <img src={ing.imagenUrl} className="w-4 h-4 rounded-full object-cover" alt="" />
                    ) : (
                      <Salad size={12} />
                    )}
                    +{ing.nombre} ${fmt(ing.precio)}
                  </button>
                )
              })}
            </div>
            {Object.keys(extras).length > 0 && (
              <div className="mt-2 space-y-1.5">
                {todosIngredientes.filter((ing: Ingrediente) => (extras[ing.id] || 0) > 0).map((ing: Ingrediente) => (
                  <div key={ing.id} className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-success/15">
                    <span className="text-xs text-success font-medium flex-1 truncate">{ing.nombre}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setIngCantidad(ing.id, -1)} className="w-6 h-6 rounded-full border border-success/40 bg-surface text-success flex items-center justify-center text-xs font-bold">-</button>
                      <span className="w-5 text-center text-xs font-bold text-success">{extras[ing.id]}</span>
                      <button onClick={() => setIngCantidad(ing.id, 1)} className="w-6 h-6 rounded-full bg-success text-white flex items-center justify-center text-xs font-bold">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-primary hover:opacity-90 disabled:opacity-40 text-primary-foreground py-3 rounded-2xl font-semibold text-sm transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </Modal>
  )
}

// ─── EditOrdenModal ───────────────────────────────────────────────────────────

function EditOrdenModal({
  open,
  onClose,
  orden,
  onDone,
  onError,
}: {
  open: boolean
  onClose: () => void
  orden: Orden
  onDone: (updated: Orden) => void
  onError: (msg: string) => void
}) {
  const { mesas } = useMesero()
  const [tipo, setTipo] = useState<TipoOrden>('PARA_LLEVAR')
  const [mesaId, setMesaId] = useState('')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !orden) return
    setTipo(orden.tipoOrden || 'PARA_LLEVAR')
    setMesaId(orden.mesaId ? String(orden.mesaId) : '')
    setNombre(orden.nombreCliente || '')
    setTelefono(orden.telefonoCliente || '')
    setDireccion(orden.direccionEntrega || '')
  }, [open, orden?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = {
        tipoOrden: tipo,
        mesaId: tipo === 'MESA' ? Number(mesaId) : null,
        nombreCliente: tipo !== 'MESA' ? nombre || null : null,
        telefonoCliente: tipo !== 'MESA' ? telefono || null : null,
        direccionEntrega: tipo === 'DOMICILIO' ? direccion || null : null,
      }
      const updated = await updateOrden(orden.id, data)
      onDone(updated)
    } catch (e: unknown) {
      const err = e as { friendlyMessage?: string }
      onError(err.friendlyMessage || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const TIPOS: { value: TipoOrden; label: string }[] = [
    { value: 'MESA', label: 'Mesa' },
    { value: 'PARA_LLEVAR', label: 'Para llevar' },
    { value: 'DOMICILIO', label: 'Domicilio' },
  ]

  return (
    <Modal open={open} onClose={onClose} title="Editar orden" size="sm">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo de orden</label>
          <div className="mt-2 flex gap-2">
            {TIPOS.map(t => (
              <button
                key={t.value}
                onClick={() => setTipo(t.value)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${tipo === t.value ? 'bg-primary border-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-surface-raised'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tipo === 'MESA' && (
          <div>
            <label className="text-sm font-medium text-foreground">Mesa</label>
            <select
              value={mesaId}
              onChange={e => setMesaId(e.target.value)}
              className="mt-1 w-full bg-surface-sunken border border-input rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Seleccionar mesa</option>
              {mesas.map(m => (
                <option key={m.id} value={m.id}>Mesa {m.numero}</option>
              ))}
            </select>
          </div>
        )}

        {(tipo === 'PARA_LLEVAR' || tipo === 'DOMICILIO') && (
          <>
            <div>
              <label className="text-sm font-medium text-foreground">Nombre del cliente</label>
              <input
                className="mt-1 w-full bg-surface-sunken border border-input rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Nombre..."
                value={nombre}
                onChange={e => setNombre(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Teléfono</label>
              <input
                className="mt-1 w-full bg-surface-sunken border border-input rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Teléfono..."
                value={telefono}
                onChange={e => setTelefono(e.target.value)}
              />
            </div>
          </>
        )}

        {tipo === 'DOMICILIO' && (
          <div>
            <label className="text-sm font-medium text-foreground">Dirección de entrega</label>
            <input
              className="mt-1 w-full bg-surface-sunken border border-input rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Dirección..."
              value={direccion}
              onChange={e => setDireccion(e.target.value)}
            />
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || (tipo === 'MESA' && !mesaId)}
          className="w-full bg-primary hover:opacity-90 disabled:opacity-40 text-primary-foreground py-3 rounded-2xl font-semibold text-sm transition-colors"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </Modal>
  )
}

// ─── EstadoModal ──────────────────────────────────────────────────────────────

function EstadoModal({
  open,
  onClose,
  orden,
  onDone,
  onError,
}: {
  open: boolean
  onClose: () => void
  orden: Orden
  onDone: (updated: Orden) => void
  onError: (msg: string) => void
}) {
  const [estado, setEstado] = useState<EstadoOrden>(orden?.estado || 'ABIERTA')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setEstado(orden?.estado || 'ABIERTA')
  }, [open, orden?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpdate = async () => {
    setSaving(true)
    try {
      const updated = await updateEstado(orden.id, estado)
      onDone(updated)
    } catch (e: unknown) {
      const err = e as { friendlyMessage?: string }
      onError(err.friendlyMessage || 'Error')
    } finally {
      setSaving(false)
    }
  }

  const estadosSinCancelar = ESTADOS.filter(
    e => e !== 'CANCELADA' && (e !== 'EN_CAMINO' || orden?.tipoOrden === 'DOMICILIO')
  )

  return (
    <Modal open={open} onClose={onClose} title="Cambiar estado" size="sm">
      <div className="space-y-3">
        {estadosSinCancelar.map(e => {
          const cls = ESTADO_CLS[e] ?? ESTADO_CLS.ABIERTA
          const label = ESTADO_LABEL[e] ?? e
          const isSelected = estado === e
          return (
            <button
              key={e}
              onClick={() => setEstado(e)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-sm font-medium transition-colors ${isSelected ? cls : 'border-border text-muted-foreground hover:bg-surface-raised'}`}
            >
              {label}
              {isSelected && <Check size={16} />}
            </button>
          )
        })}

        <div className="border-t border-border pt-3">
          {(() => {
            const cls = ESTADO_CLS.CANCELADA
            const label = ESTADO_LABEL.CANCELADA
            const isSelected = estado === 'CANCELADA'
            return (
              <button
                onClick={() => setEstado('CANCELADA')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-sm font-medium transition-colors ${isSelected ? cls : 'border-border text-muted-foreground hover:bg-surface-raised'}`}
              >
                {label}
                {isSelected && <Check size={16} />}
              </button>
            )
          })()}
        </div>

        {estado === 'CANCELADA' && (
          <div className="px-3 py-2.5 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs leading-relaxed">
            Esta acción cancelará la orden, seguro?
          </div>
        )}

        <button
          onClick={handleUpdate}
          disabled={saving}
          className={`w-full py-3 rounded-2xl font-semibold text-sm transition-colors disabled:opacity-50 ${estado === 'CANCELADA' ? 'bg-destructive hover:opacity-90 text-destructive-foreground' : 'bg-primary hover:opacity-90 text-primary-foreground'}`}
        >
          {saving ? 'Actualizando...' : estado === 'CANCELADA' ? 'Confirmar cancelación' : 'Guardar estado'}
        </button>
      </div>
    </Modal>
  )
}
