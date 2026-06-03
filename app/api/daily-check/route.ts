import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { runDailyCheck } from '@/lib/dailyCheck'

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
 * デイリー異常チェック（read-only）
 * GET /api/daily-check?days=3
 *
 * super_admin(isAllStore)は全店、店舗管理者は自店のみ。
 * ホーム画面の通知バーから呼ぶ。
 */
export async function GET(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const windowDays = Math.min(Math.max(Number(request.nextUrl.searchParams.get('days')) || 3, 1), 14)

  // JST の本日を 'YYYY-MM-DD' で取得
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })

  // 権限フィルタ: 全店管理者は全店、それ以外は自店のみ
  const storeIds = session.isAllStore ? undefined : [session.storeId]

  try {
    const report = await runDailyCheck(todayStr, windowDays, storeIds)
    return NextResponse.json(report)
  } catch (e) {
    console.error('[daily-check] error:', e)
    return NextResponse.json({ error: 'check failed' }, { status: 500 })
  }
}
