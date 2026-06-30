import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { validateAdminSession, requireSuperAdmin } from '@/lib/adminSession'

async function validateSuperAdmin(): Promise<boolean> {
  const session = await validateAdminSession()
  return requireSuperAdmin(session)
}

/**
 * デイリーチェック通知設定の取得
 * GET /api/daily-check-settings
 * super_admin のみ。全店の webhook URL / enabled を返す。
 */
export async function GET() {
  if (!(await validateSuperAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = getSupabaseServerClient()

  const [{ data: stores }, { data: settings }] = await Promise.all([
    supabase.from('stores').select('id, store_name, is_active').eq('is_active', true).order('id'),
    supabase.from('store_notification_settings').select('store_id, discord_webhook_url, daily_check_enabled'),
  ])

  const settingMap = new Map((settings || []).map(s => [s.store_id, s]))
  const rows = (stores || []).map(s => {
    const setting = settingMap.get(s.id)
    return {
      store_id: s.id,
      store_name: s.store_name,
      discord_webhook_url: setting?.discord_webhook_url || '',
      daily_check_enabled: setting?.daily_check_enabled ?? false,
    }
  })

  return NextResponse.json({ settings: rows })
}

/**
 * デイリーチェック通知設定の保存
 * POST /api/daily-check-settings
 * body: { store_id, discord_webhook_url, daily_check_enabled }
 */
export async function POST(request: NextRequest) {
  if (!(await validateSuperAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { store_id, discord_webhook_url, daily_check_enabled } = body

  if (!store_id) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 })
  }

  const url = typeof discord_webhook_url === 'string' ? discord_webhook_url.trim() : ''
  // webhook URL の簡易バリデーション（空は許可＝通知無効化）
  if (url && !url.startsWith('https://discord.com/api/webhooks/') && !url.startsWith('https://discordapp.com/api/webhooks/')) {
    return NextResponse.json({ error: 'Discord webhook URL の形式が不正です' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  const { error } = await supabase
    .from('store_notification_settings')
    .upsert({
      store_id,
      discord_webhook_url: url || null,
      daily_check_enabled: !!daily_check_enabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'store_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
