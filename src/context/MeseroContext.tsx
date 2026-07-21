'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getMesas } from '../lib/api/mesas'
import { getOrdenes } from '../lib/api/ordenes'
import { getProductos } from '../lib/api/productos'
import { getIngredientes } from '../lib/api/ingredientes'
import { useOrdenRealtime } from '../hooks/useOrdenRealtime'
import type { Mesa, Orden, Producto, Ingrediente } from '../types'

interface MeseroContextValue {
  mesas: Mesa[]
  ordenes: Orden[]
  productos: Producto[]
  ingredientes: Ingrediente[]
  loadingMesas: boolean
  loadingOrdenes: boolean
  loadingCatalogo: boolean
  invalidateMesas: () => void
  invalidateOrdenes: () => void
  invalidateCatalogo: () => void
  syncOrden: (updated: Orden) => void
}

const MeseroContext = createContext<MeseroContextValue | null>(null)

export function MeseroProvider({ children }: { children: React.ReactNode }) {
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [ordenes, setOrdenes] = useState<Orden[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([])
  const [loadingMesas, setLoadingMesas] = useState(true)
  const [loadingOrdenes, setLoadingOrdenes] = useState(true)
  const [loadingCatalogo, setLoadingCatalogo] = useState(true)

  // Initial load — fire all four fetches in parallel on mount
  useEffect(() => {
    Promise.allSettled([getMesas(), getOrdenes()]).then(([rm, ro]) => {
      if (rm.status === 'fulfilled') setMesas(rm.value)
      setLoadingMesas(false)
      if (ro.status === 'fulfilled') setOrdenes(ro.value)
      setLoadingOrdenes(false)
    })
    Promise.allSettled([getProductos(), getIngredientes()]).then(([rp, ri]) => {
      if (rp.status === 'fulfilled') setProductos(rp.value)
      if (ri.status === 'fulfilled') setIngredientes(ri.value)
      setLoadingCatalogo(false)
    })
  }, [])

  const invalidateMesas = useCallback(() => getMesas().then(setMesas).catch(() => {}), [])
  const invalidateOrdenes = useCallback(() => getOrdenes().then(setOrdenes).catch(() => {}), [])
  const invalidateCatalogo = useCallback(
    () =>
      Promise.all([getProductos(), getIngredientes()])
        .then(([p, i]) => { setProductos(p); setIngredientes(i) })
        .catch(() => {}),
    []
  )

  // Mirror syncOrdenInList logic from Ordenes.jsx — drop if closed, else patch in place
  const syncOrden = useCallback((updated: Orden) => {
    setOrdenes(prev => {
      const isClosed = (x: Orden) =>
        x.estado === 'CANCELADA' ||
        x.estado === 'PAGADA' ||
        (x.estado === 'ENTREGADA' && x.pagada)
      if (isClosed(updated)) return prev.filter(o => o.id !== updated.id)
      return prev.map(o =>
        o.id === updated.id
          ? { ...o, totalMonto: updated.totalMonto, items: updated.items, estado: updated.estado, pagada: updated.pagada }
          : o
      )
    })
  }, [])

  // Realtime — one subscription per layout mount, lives across Mesas <-> Ordenes navigation
  useOrdenRealtime(() => {
    invalidateOrdenes()
  })

  const value = useMemo<MeseroContextValue>(
    () => ({
      mesas,
      ordenes,
      productos,
      ingredientes,
      loadingMesas,
      loadingOrdenes,
      loadingCatalogo,
      invalidateMesas,
      invalidateOrdenes,
      invalidateCatalogo,
      syncOrden,
    }),
    [
      mesas, ordenes, productos, ingredientes,
      loadingMesas, loadingOrdenes, loadingCatalogo,
      invalidateMesas, invalidateOrdenes, invalidateCatalogo, syncOrden,
    ]
  )

  return <MeseroContext.Provider value={value}>{children}</MeseroContext.Provider>
}

export function useMesero(): MeseroContextValue {
  const ctx = useContext(MeseroContext)
  if (!ctx) throw new Error('useMesero must be used inside MeseroProvider')
  return ctx
}
