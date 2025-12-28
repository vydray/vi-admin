import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { exchangeCodeForToken } from '@/lib/baseApi'
import { cookies } from 'next/headers'

/**
 * BASE OAuthコールバック
 * GET /api/base/callback?code=xxx&state=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    // エラーの場合
    if (error) {
      const errorDescription = searchParams.get('error_description') || 'Unknown error'
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_SITE_URL}/base-settings?error=${encodeURIComponent(errorDescription)}`
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_SITE_URL}/base-settings?error=${encodeURIComponent('Missing code or state')}`
      )
    }

    // stateを検証
    const cookieStore = await cookies()
    const savedState = cookieStore.get('base_oauth_state')?.value

    if (!savedState || savedState !== state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_SITE_URL}/base-settings?error=${encodeURIComponent('Invalid state')}`
      )
    }

    // stateからstore_idを取得
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
    const storeId = parseInt(stateData.store_id)

    const supabase = getSupabaseServerClient()

    // base_settingsからclient_id, client_secretを取得
    const { data: settings, error: settingsError } = await supabase
      .from('base_settings')
      .select('client_id, client_secret')
      .eq('store_id', storeId)
      .single()

    if (settingsError || !settings?.client_id || !settings?.client_secret) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_SITE_URL}/base-settings?error=${encodeURIComponent('API credentials not found')}`
      )
    }

    // 認可コードをトークンに交換
    const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/base/callback`
    const tokens = await exchangeCodeForToken(
      settings.client_id,
      settings.client_secret,
      code,
      redirectUri
    )

    // トークンをDBに保存
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    const { error: updateError } = await supabase
      .from('base_settings')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        is_active: true,
      })
      .eq('store_id', storeId)

    if (updateError) {
      console.error('Token save error:', updateError)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_SITE_URL}/base-settings?error=${encodeURIComponent('Failed to save tokens')}`
      )
    }

    // Cookieをクリア
    cookieStore.delete('base_oauth_state')

    // 成功
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/base-settings?success=true`
    )
  } catch (error) {
    console.error('BASE callback error:', error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_SITE_URL}/base-settings?error=${encodeURIComponent('Internal server error')}`
    )
  }
}
