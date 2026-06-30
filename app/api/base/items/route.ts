import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { fetchItems } from '@/lib/baseApi'
import { refreshBaseTokenIfNeeded } from '@/lib/baseTokenRefresh'
import { validateAdminSession } from '@/lib/adminSession'

/**
 * セッション検証関数
 */
async function validateSession(): Promise<{ storeId: number; isAllStore: boolean } | null> {
  const session = await validateAdminSession()
  if (!session) return null
  return {
    storeId: session.storeId,
    isAllStore: session.isAllStore
  }
}

/**
 * BASE商品一覧を取得
 * GET /api/base/items?store_id=1
 */
export async function GET(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('store_id')

    if (!storeId) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 })
    }

    const supabase = getSupabaseServerClient()

    // base_settingsを取得
    const { data: settings, error: settingsError } = await supabase
      .from('base_settings')
      .select('*')
      .eq('store_id', parseInt(storeId))
      .single()

    if (settingsError || !settings) {
      return NextResponse.json(
        { error: 'BASE settings not found' },
        { status: 400 }
      )
    }

    if (!settings.access_token) {
      return NextResponse.json(
        { error: 'Not authenticated with BASE' },
        { status: 401 }
      )
    }

    // トークンの有効期限をチェック(store単位ロックで直列化、cronとのrotating RT二重消費を防ぐ)
    let accessToken = settings.access_token
    try {
      const { accessToken: refreshed } = await refreshBaseTokenIfNeeded({
        store_id: settings.store_id,
        access_token: settings.access_token,
        refresh_token: settings.refresh_token,
        client_id: settings.client_id,
        client_secret: settings.client_secret,
        token_expires_at: settings.token_expires_at,
      }, 60_000)
      accessToken = refreshed
    } catch (refreshError) {
      console.error('Token refresh failed:', refreshError)
      return NextResponse.json(
        { error: 'Token expired and refresh failed' },
        { status: 401 }
      )
    }

    // BASE APIから商品を取得
    const itemsResponse = await fetchItems(accessToken)

    return NextResponse.json({
      success: true,
      items: itemsResponse.items || [],
    })
  } catch (error) {
    console.error('BASE items error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
