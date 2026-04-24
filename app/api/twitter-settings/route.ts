import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase'

async function validateSession(): Promise<{ id: string; storeId: number; isAllStore: boolean } | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return null

  try {
    const session = JSON.parse(sessionCookie.value)
    if (!session?.id) return null
    return {
      id: session.id,
      storeId: session.store_id || session.storeId,
      isAllStore: session.isAllStore || false,
    }
  } catch {
    return null
  }
}

/**
 * Twitter設定を取得
 * GET /api/twitter-settings?store_id=1&fields=twitter_username,connected_at
 */
export async function GET(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const storeId = Number(request.nextUrl.searchParams.get('store_id'))
  const fields = request.nextUrl.searchParams.get('fields') || '*'

  if (!storeId) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 })
  }

  if (!session.isAllStore && session.storeId !== storeId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('store_twitter_settings')
    .select(fields)
    .eq('store_id', storeId)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ settings: data || null })
}

/**
 * Twitter設定を保存/更新
 * POST /api/twitter-settings
 * body: { action, store_id, ... }
 */
export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { action, store_id } = body

  if (!store_id) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 })
  }

  if (!session.isAllStore && session.storeId !== store_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseServerClient()

  if (action === 'save_credentials') {
    const { api_key, api_secret } = body

    const { error } = await supabase
      .from('store_twitter_settings')
      .upsert({
        store_id,
        api_key: api_key?.trim(),
        api_secret: api_secret?.trim(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'store_id',
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  if (action === 'disconnect') {
    const { error } = await supabase
      .from('store_twitter_settings')
      .update({
        access_token: null,
        refresh_token: null,
        twitter_user_id: null,
        twitter_username: null,
        connected_at: null,
        health_status: 'unknown',
        last_health_check_at: null,
        health_error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', store_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
