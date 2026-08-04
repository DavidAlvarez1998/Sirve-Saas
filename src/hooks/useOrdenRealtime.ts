'use client'

import { useEffect, useRef } from 'react'
import { getSupabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useOrdenRealtime(onOrdenEvent: (payload: unknown) => void): void {
  const { tenantSlug } = useAuth()
  const callbackRef = useRef(onOrdenEvent)

  // Keep ref current without triggering re-subscriptions
  useEffect(() => {
    callbackRef.current = onOrdenEvent
  })

  useEffect(() => {
    if (!tenantSlug) {
      console.warn('[useOrdenRealtime] tenantSlug not available, skipping subscription')
      return
    }

    const channel = getSupabase()
      .channel(`ordenes:${tenantSlug}`)
      .on('broadcast', { event: 'orden_update' }, ({ payload }) => {
        callbackRef.current(payload)
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [tenantSlug]) // callback intentionally excluded — accessed via ref
}
