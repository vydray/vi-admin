import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * 経営ダッシュボード: 日別売上目標の保存
 * POST /api/management/sales-targets
 * body: { store_id: number, targets: { date: 'YYYY-MM-DD', target_amount: number | null }[] }
 *   - target_amount = null/未指定 → その日の目標を削除（クリア）
 *   - それ以外 → upsert（store_id × date でユニーク）
 *
 * 認証: super_admin、または management 権限を持つ store_admin（自店のみ）。
 * daily_sales_targets は RLS 有効・ポリシー無し（anon全拒否）のため、
 * 書き込みは必ずこのサーバールート（service role）経由で行う。
 */
export async function POST(request: NextRequest) {
  // ===== 認証（daily-pl と同条件） =====
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
  let targets: { date: string; target_amount: number | null }[]
  try {
    const body = await request.json()
    if (typeof body.store_id !== 'number' || body.store_id <= 0) {
      return NextResponse.json({ error: 'Invalid store_id' }, { status: 400 })
    }
    storeId = body.store_id
    // store_admin は自店のみ（セッションの店舗に強制）
    if (!isSuperAdmin) {
      storeId = Number(session.store_id)
      if (!storeId || storeId <= 0) {
        return NextResponse.json({ error: 'Forbidden: 店舗が特定できません' }, { status: 403 })
      }
    }

    if (!Array.isArray(body.targets) || body.targets.length === 0) {
      return NextResponse.json({ error: 'targets is required' }, { status: 400 })
    }
    if (body.targets.length > 60) {
      return NextResponse.json({ error: 'targets too many' }, { status: 400 })
    }
    const dateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
    targets = []
    for (const t of body.targets) {
      if (typeof t?.date !== 'string' || !dateRegex.test(t.date)) {
        return NextResponse.json({ error: `Invalid date: ${String(t?.date)}` }, { status: 400 })
      }
      let amount: number | null
      if (t.target_amount === null || t.target_amount === undefined || t.target_amount === '') {
        amount = null
      } else {
        const n = Number(t.target_amount)
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
          return NextResponse.json({ error: `Invalid target_amount for ${t.date}` }, { status: 400 })
        }
        amount = n
      }
      targets.push({ date: t.date, target_amount: amount })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()

  const toDelete = targets.filter((t) => t.target_amount === null).map((t) => t.date)
  const toUpsert = targets
    .filter((t) => t.target_amount !== null)
    .map((t) => ({ store_id: storeId, date: t.date, target_amount: t.target_amount, updated_at: new Date().toISOString() }))

  try {
    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from('daily_sales_targets')
        .upsert(toUpsert, { onConflict: 'store_id,date' })
      if (error) throw error
    }
    if (toDelete.length > 0) {
      const { error } = await supabase
        .from('daily_sales_targets')
        .delete()
        .eq('store_id', storeId)
        .in('date', toDelete)
      if (error) throw error
    }
    return NextResponse.json({ success: true, upserted: toUpsert.length, deleted: toDelete.length })
  } catch (e) {
    console.error('[sales-targets] save error:', e)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
}
