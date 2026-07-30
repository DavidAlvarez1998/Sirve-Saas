'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  ChefHat,
  Check,
  Clock,
  RefreshCw,
  ArrowRight,
  Package,
} from 'lucide-react'
import { getCocinaOrdenes, getCocinaFinalizadas } from '@/lib/api/cocina'
import { updateEstado } from '@/lib/api/ordenes'
import { getProductos } from '@/lib/api/productos'
import { useOrdenRealtime } from '@/hooks/useOrdenRealtime'
import Link from 'next/link'
import { LayoutDashboard } from 'lucide-react'
import LogoutButton from '@/components/auth/LogoutButton'
import ThemeToggle from '@/components/auth/ThemeToggle'
import { useAuth } from '@/context/AuthContext'
import Toast from '@/components/ui/Toast'
import type { Orden, OrdenItem, TipoProducto } from '@/types'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProductoInfo {
  tipo: TipoProducto
  imagenUrl?: string | null
}

type ProducotoMap = Record<string, ProductoInfo>

type Tab = 'pendientes' | 'finalizadas'

interface ToastState {
  msg: string
  type: 'success' | 'error'
}

// Grouped item (quantity summed for identical items)
interface GroupedItem extends OrdenItem {
  cantidad: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, (mesaNumero?: number | string | null) => string> = {
  MESA: (m) => `Mesa ${m}`,
  PARA_LLEVAR: () => 'Para llevar',
  DOMICILIO: () => 'Domicilio',
}

const ESTADO_COLOR: Record<string, string> = {
  ABIERTA: 'bg-blue-500',
  EN_PREPARACION: 'bg-yellow-500',
  LISTA: 'bg-green-500',
  EN_CAMINO: 'bg-indigo-500',
}

const getNextEstado = (
  estado: string
): 'EN_PREPARACION' | 'LISTA' | null => {
  const map: Record<string, 'EN_PREPARACION' | 'LISTA'> = {
    ABIERTA: 'EN_PREPARACION',
    EN_PREPARACION: 'LISTA',
  }
  return map[estado] ?? null
}

const ESTADO_BTN: Record<string, string> = {
  ABIERTA: 'Iniciar',
  EN_PREPARACION: 'Marcar lista',
  LISTA: 'Listo / Entregar',
  EN_CAMINO: 'Entregado',
}

interface Urgencia {
  level: 'alta' | 'media'
  label: string
  cardCls: string
  badgeCls: string
}

const getUrgencia = (
  fechaCreacion: string | undefined,
  estado: string,
  now: Date
): Urgencia | null => {
  if (
    estado === 'LISTA' ||
    estado === 'EN_CAMINO' ||
    estado === 'ENTREGADA' ||
    !fechaCreacion
  ) {
    return null
  }
  const min = Math.floor(
    (now.getTime() - new Date(fechaCreacion).getTime()) / 60000
  )
  if (min >= 30) {
    return {
      level: 'alta',
      label: `${min}m`,
      cardCls: 'border-red-500 ring-1 ring-red-500/40',
      badgeCls: 'bg-red-500 text-white',
    }
  }
  if (min >= 15) {
    return {
      level: 'media',
      label: `${min}m`,
      cardCls: 'border-amber-400',
      badgeCls: 'bg-amber-400 text-black',
    }
  }
  return null
}

/**
 * Group identical items (same productoNombre + notas + ingredients) by summing quantities.
 * Supports both legacy field names (nombreProducto, ingredientesExtra) and new ones.
 */
function agruparItems(items: OrdenItem[]): GroupedItem[] {
  const map = new Map<string, GroupedItem>()
  for (const item of items ?? []) {
    const nombre = item.productoNombre ?? item.nombreProducto ?? ''
    const ings = (item.ingredientesExtra ?? item.ingredientes ?? [])
      .slice()
      .sort((a, b) =>
        (a.nombre ?? a.ingredienteNombre).localeCompare(
          b.nombre ?? b.ingredienteNombre
        )
      )
      .map((i) => `${i.nombre ?? i.ingredienteNombre}:${i.cantidad}`)
      .join('|')
    const key = `${nombre}__${item.notas ?? ''}__${ings}`
    if (map.has(key)) {
      map.get(key)!.cantidad += item.cantidad
    } else {
      map.set(key, { ...item, cantidad: item.cantidad })
    }
  }
  return Array.from(map.values())
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CocinaPage() {
  const { hasRole } = useAuth()
  const [pendientes, setPendientes] = useState<Orden[]>([])
  const [finalizadas, setFinalizadas] = useState<Orden[]>([])
  const [tab, setTab] = useState<Tab>('pendientes')
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState<number | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [now, setNow] = useState<Date>(new Date())
  const [productoMap, setProductoMap] = useState<ProducotoMap>({})

  // Update "now" every minute to refresh urgency indicators without hitting backend
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    Promise.all([getCocinaOrdenes(), getCocinaFinalizadas()])
      .then(([p, f]) => {
        const yaListas = p.filter(
          (o) => o.estado === 'LISTA' || o.estado === 'EN_CAMINO'
        )
        setPendientes(
          p
            .filter((o) => o.estado !== 'LISTA' && o.estado !== 'EN_CAMINO')
            .sort(
              (a, b) =>
                new Date(a.fechaCreacion ?? a.createdAt ?? 0).getTime() -
                new Date(b.fechaCreacion ?? b.createdAt ?? 0).getTime()
            )
        )
        setFinalizadas([
          ...yaListas,
          ...f.filter((o) => o.estado !== 'CANCELADA'),
        ])
      })
      .catch(() => {})
      .finally(() => {
        if (!silent) setLoading(false)
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    getProductos()
      .then((ps) => {
        const map: ProducotoMap = {}
        ps.forEach((p) => {
          map[p.nombre] = { tipo: p.tipo, imagenUrl: p.imagenUrl }
        })
        setProductoMap(map)
      })
      .catch(() => {})
  }, [])

  // Realtime: silent reload to avoid spinner flash
  useOrdenRealtime(() => load(true))

  const handleAvanzar = async (id: number, estado: string) => {
    const next = getNextEstado(estado)
    if (!next) return
    setAdvancing(id)
    try {
      await updateEstado(id, next)
      load(true)
    } catch (e) {
      const err = e as { friendlyMessage?: string }
      setToast({
        msg: err?.friendlyMessage ?? 'Error al actualizar el estado',
        type: 'error',
      })
    } finally {
      setAdvancing(null)
    }
  }

  const ordenes = tab === 'pendientes' ? pendientes : finalizadas

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-white flex flex-col">
      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header */}
      <header className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
            <ChefHat size={18} />
          </div>
          <div>
            <h1 className="font-extrabold text-base leading-tight">Cocina</h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs">
              Sistema de pantalla
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasRole('ADMIN') && (
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              <LayoutDashboard size={13} />
              Volver al panel
            </Link>
          )}
          <ThemeToggle />
          <LogoutButton mobile />
        </div>
      </header>

      {/* Tabs */}
      <div className="flex mx-4 mt-4 bg-slate-100 dark:bg-slate-800 rounded-2xl p-1 gap-1">
        <button
          onClick={() => setTab('pendientes')}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-1.5 ${
            tab === 'pendientes'
              ? 'bg-emerald-500 text-white'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Clock size={14} /> Pendientes
          {pendientes.length > 0 && (
            <span
              className={`ml-1 w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${
                tab === 'pendientes'
                  ? 'bg-white text-emerald-600'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {pendientes.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('finalizadas')}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-1.5 ${
            tab === 'finalizadas'
              ? 'bg-slate-300 dark:bg-slate-600 text-slate-900 dark:text-white'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Check size={14} /> Finalizadas
        </button>
      </div>

      {/* Orders grid */}
      <div className="flex-1 p-4 overflow-auto">
        {loading ? (
          <div className="text-center text-slate-400 dark:text-slate-500 py-12 text-sm">
            Cargando...
          </div>
        ) : ordenes.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-500 dark:text-slate-600">
            <ChefHat size={48} className="mb-3 opacity-30" />
            <p className="text-sm">
              {tab === 'pendientes'
                ? '¡Todo al día! Sin pedidos pendientes.'
                : 'Sin órdenes finalizadas.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ordenes.map((o) => {
              const ordenId = o.ordenId ?? o.id
              const fechaCreacion = o.fechaCreacion ?? o.createdAt
              const urgencia = getUrgencia(fechaCreacion, o.estado, now)
              const isAdvancing = advancing === ordenId
              const minTranscurridos = fechaCreacion
                ? Math.floor(
                    (now.getTime() - new Date(fechaCreacion).getTime()) / 60000
                  )
                : 0
              const elapsedLabel =
                minTranscurridos >= 60
                  ? `${Math.floor(minTranscurridos / 60)}h${
                      minTranscurridos % 60 > 0
                        ? ` ${minTranscurridos % 60}m`
                        : ''
                    }`
                  : minTranscurridos >= 1
                  ? `${minTranscurridos}m`
                  : null

              return (
                <div
                  key={ordenId}
                  className={`bg-slate-100 dark:bg-slate-800 rounded-3xl overflow-hidden border transition ${
                    urgencia
                      ? urgencia.cardCls
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {/* Card header */}
                  <div
                    className={`px-4 py-3 flex items-center justify-between ${
                      ESTADO_COLOR[o.estado] ?? 'bg-slate-700'
                    }`}
                  >
                    <div>
                      <p className="font-extrabold text-sm">
                        {(
                          TIPO_LABEL[o.tipoOrden] ?? (() => o.tipoOrden)
                        )(o.mesaNumero)}
                      </p>
                      {o.nombreCliente && (
                        <p className="text-white/80 text-xs">
                          {o.nombreCliente}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      {fechaCreacion && (
                        <p className="text-xs text-white/80">
                          {new Date(fechaCreacion).toLocaleTimeString('es', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5">
                        {elapsedLabel && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              minTranscurridos >= 30
                                ? 'bg-red-500 text-white'
                                : minTranscurridos >= 15
                                ? 'bg-amber-400 text-black'
                                : 'bg-white/20 text-white/90'
                            }`}
                          >
                            ⏱ {elapsedLabel}
                          </span>
                        )}
                        <p className="text-xs font-bold">#{ordenId}</p>
                      </div>
                    </div>
                  </div>

                  {/* Items */}
                  {(() => {
                    const items = agruparItems(o.items)
                    const preparados = items.filter(
                      (it) =>
                        (productoMap[it.productoNombre ?? it.nombreProducto ?? '']
                          ?.tipo ?? 'PLATO_PREPARADO') === 'PLATO_PREPARADO'
                    )
                    const directa = items.filter(
                      (it) =>
                        productoMap[it.productoNombre ?? it.nombreProducto ?? '']
                          ?.tipo === 'VENTA_DIRECTA'
                    )

                    const renderItem = (item: GroupedItem) => {
                      const nombre =
                        item.productoNombre ?? item.nombreProducto ?? ''
                      const info = productoMap[nombre]
                      const ings =
                        item.ingredientesExtra ?? item.ingredientes ?? []
                      return (
                        <div
                          key={item.itemId ?? item.id}
                          className="flex items-start gap-2"
                        >
                          <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                            {info?.imagenUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={info.imagenUrl}
                                alt={nombre}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package
                                size={16}
                                className="text-slate-400 dark:text-slate-500"
                              />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <span className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                              {item.cantidad}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {nombre}
                            </p>
                            {item.notas && (
                              <p className="text-xs text-yellow-400 italic">
                                {item.notas}
                              </p>
                            )}
                            {ings.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {ings.map((ing, i) => (
                                  <span
                                    key={i}
                                    className="text-[10px] bg-emerald-900/60 text-emerald-400 px-2 py-0.5 rounded-full"
                                  >
                                    {ing.cantidad > 1
                                      ? `${ing.cantidad}x `
                                      : '+'}
                                    {ing.nombre ?? ing.ingredienteNombre}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div className="p-4 space-y-2">
                        {preparados.map(renderItem)}
                        {preparados.length > 0 && directa.length > 0 && (
                          <div className="flex items-center gap-2 py-1">
                            <div className="flex-1 border-t border-slate-300 dark:border-slate-600/60" />
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                              Venta directa
                            </span>
                            <div className="flex-1 border-t border-slate-300 dark:border-slate-600/60" />
                          </div>
                        )}
                        {directa.map(renderItem)}
                      </div>
                    )
                  })()}

                  {/* Footer: advance button or status badge */}
                  {getNextEstado(o.estado) ? (
                    <div className="px-4 pb-3 pt-2 border-t border-slate-200 dark:border-slate-700/50 flex justify-end">
                      <button
                        onClick={() => handleAvanzar(ordenId, o.estado)}
                        disabled={isAdvancing}
                        className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition active:scale-95 disabled:opacity-50 text-white shadow-sm ${
                          ESTADO_COLOR[o.estado] ?? 'bg-slate-600'
                        } hover:opacity-80`}
                      >
                        {isAdvancing ? (
                          <RefreshCw size={11} className="animate-spin" />
                        ) : (
                          <ArrowRight size={11} />
                        )}
                        {isAdvancing
                          ? 'Actualizando...'
                          : ESTADO_BTN[o.estado]}
                      </button>
                    </div>
                  ) : (
                    (o.estado === 'LISTA' || o.estado === 'EN_CAMINO') && (
                      <div className="px-4 pb-3 pt-2 border-t border-slate-200 dark:border-slate-700/50 flex justify-end">
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-green-400 bg-green-500/15 border border-green-500/30">
                          <Check size={11} />
                          {o.estado === 'EN_CAMINO'
                            ? 'En camino'
                            : 'Lista — esperando mesero'}
                        </span>
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
