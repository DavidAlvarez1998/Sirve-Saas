import { createClient } from '@supabase/supabase-js'

// Singleton server-side client with service_role key.
// Never expose this to the client — only import from server code (Route Handlers, lib).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)
