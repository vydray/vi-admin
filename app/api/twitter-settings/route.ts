import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { validateAdminSession } from '@/lib/adminSession'

async function validateSession(): Promise<{ id: string; storeId: number; isAllStore: boolean } | null> {
  const s = await validateAdminSession()
  if (!s) return null
  return {
    id: String(s.id),
    storeId: s.storeId,
    isAllStore: s.isAllStore,
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

  if (action === 'save_post_times') {
    const { default_post_times } = body
    // "HH:MM" 形式 (24h) のみ受け付け、昇順ソート + 重複排除
    if (!Array.isArray(default_post_times)) {
      return NextResponse.json({ error: 'default_post_times must be an array' }, { status: 400 })
    }
    const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
    const cleaned = Array.from(
      new Set(
        default_post_times
          .map((t: unknown) => (typeof t === 'string' ? t.trim() : ''))
          .filter((t: string) => HHMM.test(t))
      )
    ).sort()

    const { error } = await supabase
      .from('store_twitter_settings')
      .upsert({
        store_id,
        default_post_times: cleaned,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'store_id',
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, default_post_times: cleaned })
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
