import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * 全 admin_users の updated_at を NOW() に更新することで、
 * 全ユーザーのセッションを強制無効化する cron。
 *
 * 仕組み:
 * - /api/auth/session のチェックで `userUpdated > sessionCreated` の場合に
 *   セッション無効化されるロジックを流用
 * - 次にページ遷移 or リロードしたタイミングで自動ログアウト → ログイン画面
 *
 * スケジュール: 毎日 JST 13:00 (= UTC 04:00)
 */
export async function GET(request: NextRequest) {
  // Vercel Cron 認証
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/force-logout-all] CRON_SECRET is not configured')
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date().toISOString()
  const { error, count } = await supabaseAdmin
    .from('admin_users')
    .update({ updated_at: now }, { count: 'exact' })
    .not('id', 'is', null) // 全行対象 (WHERE 句なし update は supabase-js 側で拒否されるため)

  if (error) {
    console.error('[cron/force-logout-all] update error:', error)
    return NextResponse.json({ error: 'Failed to invalidate sessions' }, { status: 500 })
  }

  console.log(`[cron/force-logout-all] invalidated ${count ?? '?'} admin_users sessions`)
  return NextResponse.json({ success: true, invalidated: count, at: now })
}
