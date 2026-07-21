import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Returns the browser-only Supabase client singleton.
 * Used exclusively for Realtime broadcast subscriptions — NOT Supabase Auth.
 *
 * Throws if called from a Server Component or Route Handler.
 * Import this only inside 'use client' components or hooks.
 */
export function getSupabase(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('Supabase client is browser-only — do not call from Server Components')
  }

  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      '[supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set. ' +
        'Copy .env.local.example to .env.local and fill in the values.'
    )
  }

  _client = createClient(url, key)
  return _client
}
