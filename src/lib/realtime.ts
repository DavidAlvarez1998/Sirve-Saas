import { supabaseAdmin } from './supabase-admin'

// Fire-and-forget broadcast after each order mutation.
// Failures are swallowed — a missing broadcast must never break the HTTP response (CT-004).
export async function broadcastOrden(tenantSlug: string, payload: unknown): Promise<void> {
  try {
    await supabaseAdmin.channel(`ordenes:${tenantSlug}`).send({
      type: 'broadcast',
      event: 'orden_update',
      payload,
    })
  } catch (err) {
    console.error('[realtime] broadcastOrden failed', err)
  }
}
