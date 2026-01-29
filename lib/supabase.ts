import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase環境変数が設定されていません')
}

// TypeScriptの型ガード: チェック後も型を明示的に保持
const url: string = supabaseUrl
const anonKey: string = supabaseAnonKey

// クライアントサイドではanon keyを使用（RLSが適用される）
// サーバーサイドではservice role keyを使用してRLSをバイパス
const supabaseKey = typeof window === 'undefined'
  ? (process.env.SUPABASE_SERVICE_ROLE_KEY || anonKey)
  : anonKey

export const supabase = createClient(url, supabaseKey)

// Server-side client with service role key (for API routes, auth admin operations)
export function getSupabaseServerClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not defined')
  }
  return createClient(url, serviceRoleKey)
}

// Auth client (anon key) for signIn operations
export function getSupabaseAuthClient(): SupabaseClient {
  return createClient(url, anonKey)
}