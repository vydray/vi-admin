import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { getAuthorizationUrl } from '@/lib/baseApi'
import { cookies } from 'next/headers'

/**
 * BASE OAuth認可フロー開始
 * GET /api/base/auth?store_id=1
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('store_id')

    if (!storeId) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 })
    }

    const supabase = getSupabaseServerClient()

    // base_settingsからclient_idを取得
    const { data: settings, error } = await supabase
      .from('base_settings')
      .select('client_id')
      .eq('store_id', parseInt(storeId))
      .single()

    if (error || !settings?.client_id) {
      return NextResponse.json(
        { error: 'BASE API credentials not configured' },
        { status: 400 }
      )
    }

    // stateにstoreIdを含める（CSRF対策 & コールバック時の識別用）
    const state = Buffer.from(JSON.stringify({
      store_id: storeId,
      timestamp: Date.now(),
    })).toString('base64')

    // stateをCookieに保存（検証用）
    const cookieStore = await cookies()
    cookieStore.set('base_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10分
      path: '/',
    })

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/base/callback`
    const authUrl = getAuthorizationUrl(settings.client_id, redirectUri, state)

    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('BASE auth error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
