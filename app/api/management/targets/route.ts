import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const METRICS = new Set(['sales', 'attendance', 'guests'])

/**
 * 経営ダッシュボード: 日別目標の保存（売上 / 出勤人数 / 来客数）
 * POST /api/management/targets
 * body: { store_id, targets: { date: 'YYYY-MM-DD', metric: 'sales'|'attendance'|'guests', value: number | null }[] }
 *   - value = null/未指定 → その (date, metric) の目標を削除
 *   - それ以外 → upsert（store_id × date × metric でユニーク）
 *
 * 認証: super_admin、または management 権限の store_admin（自店のみ）。
 * daily_targets は RLS 有効・ポリシー無し（anon全拒否）のため、書き込みは必ずこのサーバールート（service role）経由。
 */
export async function POST(request: NextRequest) {
  // ===== 認証 =====
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let session: { role?: string; store_id?: number | string; permissions?: Record<string, boolean> }
  try {
    session = JSON.parse(sessionCookie.value)
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
  const isSuperAdmin = session.role === 'super_admin'
  const canManage = isSuperAdmin || session.permissions?.management === true
  if (!canManage) {
    return NextResponse.json({ error: 'Forbidden: 経営ダッシュボードの権限がありません' }, { status: 403 })
  }

  // ===== パラメータ =====
  let storeId: number
  let targets: { date: string; metric: string; value: number | null }[]
  try {
    const body = await request.json()
    if (typeof body.store_id !== 'number' || body.store_id <= 0) {
      return NextResponse.json({ error: 'Invalid store_id' }, { status: 400 })
    }
    storeId = body.store_id
    if (!isSuperAdmin) {
      storeId = Number(session.store_id)
      if (!storeId || storeId <= 0) {
        return NextResponse.json({ error: 'Forbidden: 店舗が特定できません' }, { status: 403 })
      }
    }

    if (!Array.isArray(body.targets) || body.targets.length === 0) {
      return NextResponse.json({ error: 'targets is required' }, { status: 400 })
    }
    if (body.targets.length > 200) {
      return NextResponse.json({ error: 'targets too many' }, { status: 400 })
    }
    const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
    targets = []
    for (const t of body.targets) {
      if (typeof t?.date !== 'string' || !dateRegex.test(t.date)) {
        return NextResponse.json({ error: `Invalid date: ${String(t?.date)}` }, { status: 400 })
      }
      if (typeof t?.metric !== 'string' || !METRICS.has(t.metric)) {
        return NextResponse.json({ error: `Invalid metric: ${String(t?.metric)}` }, { status: 400 })
      }
      let value: number | null
      if (t.value === null || t.value === undefined || t.value === '') {
        value = null
      } else {
        const n = Number(t.value)
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
          return NextResponse.json({ error: `Invalid value for ${t.date}/${t.metric}` }, { status: 400 })
        }
        value = n
      }
      targets.push({ date: t.date, metric: t.metric, value })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()

  const toUpsert = targets
    .filter((t) => t.value !== null)
    .map((t) => ({ store_id: storeId, date: t.date, metric: t.metric, value: t.value, updated_at: new Date().toISOString() }))
  const toDelete = targets.filter((t) => t.value === null)

  try {
    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from('daily_targets')
        .upsert(toUpsert, { onConflict: 'store_id,date,metric' })
      if (error) throw error
    }
    // 削除は (date, metric) 単位
    for (const d of toDelete) {
      const { error } = await supabase
        .from('daily_targets')
        .delete()
        .eq('store_id', storeId)
        .eq('date', d.date)
        .eq('metric', d.metric)
      if (error) throw error
    }
    return NextResponse.json({ success: true, upserted: toUpsert.length, deleted: toDelete.length })
  } catch (e) {
    console.error('[targets] save error:', e)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
