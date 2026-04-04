import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase'

async function validateSession(): Promise<{ id: string; storeId: number; isAllStore: boolean; role: string } | null> {
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
      role: session.role || '',
    }
  } catch {
    return null
  }
}

function requireSuperAdmin(session: { role: string } | null) {
  return session?.role === 'super_admin'
}

/**
 * LINE設定を取得
 * GET /api/line-settings?store_id=1
 */
export async function GET(request: NextRequest) {
  const session = await validateSession()
  if (!requireSuperAdmin(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const storeId = request.nextUrl.searchParams.get('store_id')
  if (!storeId) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('store_line_configs')
    .select('*')
    .eq('store_id', Number(storeId))
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ config: null })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ config: data })
}

/**
 * LINE設定を作成/更新
 * POST /api/line-settings
 * body: { store_id, store_name?, id?, line_channel_id, line_channel_secret, line_channel_access_token, liff_id? }
 */
export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!requireSuperAdmin(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { store_id, id, store_name, line_channel_id, line_channel_secret, line_channel_access_token, liff_id } = body

  if (!store_id || !line_channel_id || !line_channel_secret || !line_channel_access_token) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()

  if (id) {
    // 更新
    const { error } = await supabase
      .from('store_line_configs')
      .update({
        line_channel_id: line_channel_id.trim(),
        line_channel_secret: line_channel_secret.trim(),
        line_channel_access_token: line_channel_access_token.trim(),
        liff_id: liff_id?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, action: 'updated' })
  } else {
    // 新規作成
    const { error } = await supabase
      .from('store_line_configs')
      .insert({
        store_id,
        store_name: store_name || '',
        line_channel_id: line_channel_id.trim(),
        line_channel_secret: line_channel_secret.trim(),
        line_channel_access_token: line_channel_access_token.trim(),
        liff_id: liff_id?.trim() || null,
        is_active: true,
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, action: 'created' })
  }
}

/**
 * LINE設定を削除
 * DELETE /api/line-settings?id=xxx
 */
export async function DELETE(request: NextRequest) {
  const session = await validateSession()
  if (!requireSuperAdmin(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  const { error } = await supabase
    .from('store_line_configs')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

/**
 * LINE設定の有効/無効を切り替え
 * PATCH /api/line-settings
 * body: { id, is_active }
 */
export async function PATCH(request: NextRequest) {
  const session = await validateSession()
  if (!requireSuperAdmin(session)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, is_active } = body

  if (!id || typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'id and is_active are required' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  const { error } = await supabase
    .from('store_line_configs')
    .update({ is_active })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
