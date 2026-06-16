import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { withCronLock } from '@/lib/cronLock'
import { refreshBaseTokenIfNeeded } from '@/lib/baseTokenRefresh'

/**
 * BASEトークン自動リフレッシュ
 * Vercel Cron: 30分毎
 * 期限まで30分以内のトークンのみリフレッシュ（無駄なrotating token消費を防ぐ）
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
      { error: 'Internal server error' },
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

    const results: { store_id: number; success: boolean; error?: string; skipped?: string }[] = []

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
        // 期限まで30分以上残っていればスキップ（無駄なrotating token消費を防ぐ）。
        // 実際のリフレッシュは store 単位の分散ロックで直列化され、
        // fast/slow cron との rotating refresh_token 二重消費を防ぐ。
        const REFRESH_THRESHOLD_MS = 30 * 60 * 1000 // 30分

        const { refreshed } = await refreshBaseTokenIfNeeded(setting, REFRESH_THRESHOLD_MS)

        results.push({
          store_id: setting.store_id,
          success: true,
          ...(refreshed ? {} : { skipped: 'token still valid or refreshed by another process' }),
        })
      } catch (refreshError) {
        console.error(`[BASE Token Refresh] Store ${setting.store_id}: Failed -`, refreshError)
        results.push({
          store_id: setting.store_id,
          success: false,
          error: 'Token refresh failed',
        })
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
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
