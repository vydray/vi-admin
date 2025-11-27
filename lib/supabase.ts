import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side client with service role key (for API routes, auth admin operations)
export function getSupabaseServerClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_KEY is not defined')
  return createClient(supabaseUrl, serviceRoleKey)
}

// Auth client (anon key) for signIn operations
export function getSupabaseAuthClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey)
}