import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { refreshAccessToken } from '@/lib/baseApi'
import { withCronLock } from '@/lib/cronLock'

/**
 * BASEトークン自動リフレッシュ
 * Vercel Cron: 毎日12:00 UTC (21:00 JST)
 */
export async function GET(request: Request) {
  try {
    // Vercel Cronの認証チェック
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Cron Job重複実行防止（ロック取得）
    const result = await withCronLock('refresh-base-tokens', async () => {
      return await executeRefreshBaseTokens()
    }, 600) // 10分タイムアウト

    if (result === null) {
      return NextResponse.json({
        message: 'Job is already running, skipped'
      })
    }

    return result
  } catch (error) {
    console.error('[CRON] refresh-base-tokens error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

async function executeRefreshBaseTokens() {
  try {

    const supabase = getSupabaseServerClient()

    // 全店舗のBASE設定を取得
    const { data: settings, error } = await supabase
      .from('base_settings')
      .select('*')
      .not('refresh_token', 'is', null)

    if (error) {
      console.error('Failed to fetch base_settings:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    const results: { store_id: number; success: boolean; error?: string }[] = []

    for (const setting of settings || []) {
      if (!setting.client_id || !setting.client_secret || !setting.refresh_token) {
        results.push({
          store_id: setting.store_id,
          success: false,
          error: 'Missing credentials',
        })
        continue
      }

      try {
        const newTokens = await refreshAccessToken(
          setting.client_id,
          setting.client_secret,
          setting.refresh_token
        )

        const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000)

        await supabase
          .from('base_settings')
          .update({
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token,
            token_expires_at: expiresAt.toISOString(),
          })
          .eq('store_id', setting.store_id)

        results.push({ store_id: setting.store_id, success: true })
      } catch (refreshError) {
        const errorMessage = refreshError instanceof Error ? refreshError.message : 'Unknown error'
        results.push({
          store_id: setting.store_id,
          success: false,
          error: errorMessage,
        })
        console.error(`[BASE Token Refresh] Store ${setting.store_id}: Failed -`, errorMessage)
      }
    }

    return NextResponse.json({
      success: true,
      results,
      refreshedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[BASE Token Refresh] executeRefreshBaseTokens error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
