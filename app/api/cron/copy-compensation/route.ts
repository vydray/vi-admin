import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Vercel Cron（Bearer CRON_SECRET）または super_admin セッションで実行可
function validateCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

async function validateSuperAdmin(): Promise<boolean> {
  const cookieStore = await cookies()
  const c = cookieStore.get('admin_session')
  if (!c) return false
  try {
    const s = JSON.parse(c.value)
    return !!s?.id && (s.isAllStore || s.role === 'super_admin')
  } catch {
    return false
  }
}

// 報酬形態(compensation_settings)を前月から当月へ自動コピー。
// - 全カラムをそのまま複製するため、報酬形態に加えて時給(status_id / hourly_wage_override 等)も引き継ぐ
//   （画面の「全員一括コピー」は時給フィールドを除外していて運ばない）
// - 当月に既に行があるキャストはスキップ（冪等・非破壊）
// - 既定の対象月は実行時の当月。?year=&month= で手動指定も可
export async function GET(request: NextRequest) {
  if (!validateCron(request) && !(await validateSuperAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseServerClient()
  const url = new URL(request.url)
  const now = new Date()
  const year = Number(url.searchParams.get('year')) || now.getUTCFullYear()
  const month = Number(url.searchParams.get('month')) || now.getUTCMonth() + 1
  if (month < 1 || month > 12) {
    return NextResponse.json({ error: 'month が不正です' }, { status: 400 })
  }
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1

  // 前月の有効な報酬設定（全店・全カラム）
  const { data: prevRows, error: prevErr } = await supabase
    .from('compensation_settings')
    .select('*')
    .eq('target_year', prevYear)
    .eq('target_month', prevMonth)
    .eq('is_active', true)
  if (prevErr) {
    return NextResponse.json({ error: prevErr.message }, { status: 500 })
  }

  // 当月の既存（store_id:cast_id で重複判定）
  const { data: curRows } = await supabase
    .from('compensation_settings')
    .select('store_id, cast_id')
    .eq('target_year', year)
    .eq('target_month', month)
    .eq('is_active', true)
  const existing = new Set((curRows || []).map((r: { store_id: number; cast_id: number }) => `${r.store_id}:${r.cast_id}`))

  const toInsert: Record<string, unknown>[] = []
  for (const row of (prevRows || []) as Record<string, unknown>[]) {
    const key = `${row.store_id}:${row.cast_id}`
    if (existing.has(key)) continue
    const clone: Record<string, unknown> = { ...row }
    delete clone.id
    delete clone.created_at
    delete clone.updated_at
    clone.target_year = year
    clone.target_month = month
    clone.is_locked = false // 新しい月は未確定で開始
    clone.locked_at = null
    toInsert.push(clone)
  }

  let inserted = 0
  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from('compensation_settings').insert(toInsert)
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
    inserted = toInsert.length
  }

  const byStore: Record<number, number> = {}
  for (const c of toInsert) {
    const sid = Number(c.store_id)
    byStore[sid] = (byStore[sid] || 0) + 1
  }

  return NextResponse.json({
    ok: true,
    target: `${year}-${String(month).padStart(2, '0')}`,
    from: `${prevYear}-${String(prevMonth).padStart(2, '0')}`,
    prevCount: prevRows?.length || 0,
    skippedExisting: (prevRows?.length || 0) - toInsert.length,
    inserted,
    byStore,
  })
}
