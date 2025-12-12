import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/src/lib/supabase.types'

// Service role key client — full privileges, server-only
export const serverClient: SupabaseClient<Database> = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
