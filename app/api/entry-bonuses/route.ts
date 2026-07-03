import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { validateAdminSession } from '@/lib/adminSession'
import { computeEntryBonus, type EntryBonusResult } from '@/lib/entryBonus'

/**
 * 入店祝い金 API（Mary Mare/store7 専用・super_admin 限定）。
 *
 * GET  : store7 の在籍キャストごとに、入社日＋月売上から祝い金の該当額・達成月・状態を
 *        自動計算し、保存済みの支給予定月/支給済みフラグ(entry_bonuses)をマージして返す。
 * PUT  : 1件を upsert（支給予定月・支給済み・スナップショット額を保存）。
 * DELETE: 1件をリセット（?cast_id=）。
 *
 * 認可: super_admin のみ（店舗adminには一切見せない）。
 */

// Mary Mare 固定（この祝い金は store7 のみの運用）
const STORE_ID = 7
// 月売上判定は cast-sales と同じ item_based の total を使う（store7 は published=item_based）
const SALES_COL = 'total_sales_item_based'
// 集計開始（十分過去から。窓＋窓後まで拾えればよい）
const STATS_FROM = '2026-01-01'
// 祝い金プログラムの適用開始日。入社日がこれより前（=一括移行の4/23組）は
// この日から2ヶ月窓で判定する（快晟決定 2026-07: 4/23組は5/1判定）。
const RULE_START = '2026-05-01'

async function requireSuperAdmin() {
  const session = await validateAdminSession()
  if (!session || session.role !== 'super_admin') return null
  return session
}

interface SavedRecord {
  cast_id: number
  amount: number
  achieved_rank: number | null
  achieved_ym: string | null
  pay_ym: string | null
  is_paid: boolean
  memo: string | null
}

export async function GET() {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()
  const today = new Date().toISOString().slice(0, 10)

  // 在籍キャスト（入社日あり）
  const { data: casts, error: castErr } = await supabase
    .from('casts')
    .select('id, name, hire_date, is_active')
    .eq('store_id', STORE_ID)
    .eq('is_active', true)
    .not('hire_date', 'is', null)
  if (castErr) {
    console.error('[entry-bonuses] casts error:', castErr)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // 月売上（store7全キャスト、日別→月別に集計）。
  // Supabase は1リクエスト最大1000行(db-max-rows)のため、ページングで全件取得する。
  // ※ .range(0,99999) は上限に掛かって truncate され、後半月(6月後半以降)が欠落するので不可。
  const stats: Array<Record<string, unknown>> = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data, error: statErr } = await supabase
      .from('cast_daily_stats')
      .select(`cast_id, date, ${SALES_COL}`)
      .eq('store_id', STORE_ID)
      .gte('date', STATS_FROM)
      .order('cast_id', { ascending: true })
      .order('date', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (statErr) {
      console.error('[entry-bonuses] stats error:', statErr)
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }
    if (!data || data.length === 0) break
    stats.push(...(data as Array<Record<string, unknown>>))
    if (data.length < PAGE) break
  }

  // cast_id -> { 'YYYY-MM' -> 月売上 }
  const salesByCast = new Map<number, Record<string, number>>()
  for (const row of stats) {
    const castId = Number(row.cast_id)
    const ym = String(row.date).slice(0, 7)
    const sales = Number(row[SALES_COL] ?? 0)
    if (!salesByCast.has(castId)) salesByCast.set(castId, {})
    const m = salesByCast.get(castId)!
    m[ym] = (m[ym] ?? 0) + sales
  }

  // 保存済みレコード
  const { data: saved } = await supabase
    .from('entry_bonuses')
    .select('cast_id, amount, achieved_rank, achieved_ym, pay_ym, is_paid, memo')
    .eq('store_id', STORE_ID)
  const savedByCast = new Map<number, SavedRecord>()
  for (const r of (saved ?? []) as SavedRecord[]) savedByCast.set(Number(r.cast_id), r)

  const list = ((casts ?? []) as Array<{ id: number; name: string; hire_date: string | null; is_active: boolean }>)
    .map((c) => {
      const eligibility: EntryBonusResult | null = computeEntryBonus(
        c.hire_date,
        salesByCast.get(c.id) ?? {},
        today,
        RULE_START
      )
      const record = savedByCast.get(c.id) ?? null
      return {
        cast_id: c.id,
        cast_name: c.name,
        hire_date: c.hire_date,
        is_active: c.is_active,
        eligibility,
        record,
      }
    })
    // 入社日が新しい順（本物の新規入社が上に来る）
    .sort((a, b) => (b.hire_date ?? '').localeCompare(a.hire_date ?? ''))

  return NextResponse.json({ list, today })
}

// 1件保存（支給予定月・支給済み・スナップショット額）
export async function PUT(request: NextRequest) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const castId = Number(body.cast_id)
  if (!castId) return NextResponse.json({ error: 'cast_id が必要です' }, { status: 400 })

  const row = {
    store_id: STORE_ID,
    cast_id: castId,
    amount: Number(body.amount ?? 0),
    achieved_rank: body.achieved_rank ?? null,
    achieved_ym: body.achieved_ym ?? null,
    pay_ym: body.pay_ym ?? null,
    is_paid: Boolean(body.is_paid),
    paid_at: body.is_paid ? new Date().toISOString() : null,
    memo: body.memo ?? null,
    updated_at: new Date().toISOString(),
  }

  const supabase = getSupabaseServerClient()
  const { error } = await supabase.from('entry_bonuses').upsert(row, { onConflict: 'cast_id' })
  if (error) {
    console.error('[entry-bonuses] PUT error:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const session = await requireSuperAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const castId = Number(request.nextUrl.searchParams.get('cast_id'))
  if (!castId) return NextResponse.json({ error: 'cast_id が必要です' }, { status: 400 })

  const supabase = getSupabaseServerClient()
  const { error } = await supabase.from('entry_bonuses').delete().eq('cast_id', castId).eq('store_id', STORE_ID)
  if (error) {
    console.error('[entry-bonuses] DELETE error:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
