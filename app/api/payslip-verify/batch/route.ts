import { NextRequest, NextResponse } from 'next/server'
import { format, startOfMonth, endOfMonth, parse } from 'date-fns'
import { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase'

// Supabase デフォルトの max-rows (1000) を超えるデータを全件取得
async function fetchAll<T>(
  supabase: SupabaseClient,
  build: (q: ReturnType<SupabaseClient['from']>) => unknown,
  table: string,
): Promise<T[]> {
  const PAGE_SIZE = 1000
  const all: T[] = []
  let from = 0
  while (true) {
    const q = build(supabase.from(table)) as { range: (a: number, b: number) => Promise<{ data: T[] | null; error: unknown }> }
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1)
    if (error || !data) {
      if (error) console.error(`fetchAll ${table} error`, error)
      break
    }
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

interface PayslipRow {
  cast_id: number
  total_hours: number | null
  product_back_details: Array<{ sales_type: 'self' | 'help'; back_amount: number }> | null
  daily_details: Array<{
    sales?: number
    back?: number
    self_back?: number
    help_back?: number
    hours?: number
  }> | null
}

interface DailyOrderRow {
  cast_id: number
  self_sales_total: number
  help_sales_total: number
  self_back_total: number
  help_back_total: number
  wage_amount: number
  work_hours: number
}

interface CastDailyItemRow {
  cast_id: number | null
  help_cast_id: number | null
  self_sales: number | null
  help_sales: number | null
  self_sales_item_based: number | string | null
  self_sales_receipt_based: number | string | null
  self_back_amount: number | string | null
  help_back_amount: number | string | null
}

interface CompSettingsRow {
  cast_id: number
  compensation_types: unknown
  payment_selection_method: string | null
  selected_compensation_type_id: string | null
  target_year: number | null
  target_month: number | null
}

type Status = 'ok' | 'mismatch' | 'no_data'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const storeId = Number(searchParams.get('store_id'))
  const yearMonth = searchParams.get('year_month')

  if (!storeId || !yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { error: 'store_id, year_month (YYYY-MM) required' },
      { status: 400 },
    )
  }

  const supabase = getSupabaseServerClient()
  const month = parse(yearMonth, 'yyyy-MM', new Date())
  const startDate = format(startOfMonth(month), 'yyyy-MM-dd')
  const endDate = format(endOfMonth(month), 'yyyy-MM-dd')

  const [payslips, pdoRows, cdiRows, compRows] = await Promise.all([
    fetchAll<PayslipRow>(supabase, (q) =>
      q
        .select('cast_id, total_hours, product_back_details, daily_details')
        .eq('store_id', storeId)
        .eq('year_month', yearMonth),
      'payslips',
    ),
    fetchAll<DailyOrderRow>(supabase, (q) =>
      q
        .select('cast_id, self_sales_total, help_sales_total, self_back_total, help_back_total, wage_amount, work_hours')
        .eq('store_id', storeId)
        .eq('year_month', yearMonth),
      'payslip_daily_orders',
    ),
    fetchAll<CastDailyItemRow>(supabase, (q) =>
      q
        .select(
          'cast_id, help_cast_id, self_sales, help_sales, self_sales_item_based, self_sales_receipt_based, self_back_amount, help_back_amount',
        )
        .eq('store_id', storeId)
        .gte('date', startDate)
        .lte('date', endDate),
      'cast_daily_items',
    ),
    // 全キャストの compensation_settings（aggregation 判定用）
    fetchAll<CompSettingsRow>(supabase, (q) =>
      q
        .select('cast_id, compensation_types, payment_selection_method, selected_compensation_type_id, target_year, target_month')
        .eq('store_id', storeId),
      'compensation_settings',
    ),
  ])

  // キャストごとの aggregation method を判定
  const targetYear = month.getFullYear()
  const targetMonthNum = month.getMonth() + 1
  const compByCast = new Map<number, CompSettingsRow[]>()
  for (const c of compRows) {
    if (!compByCast.has(c.cast_id)) compByCast.set(c.cast_id, [])
    compByCast.get(c.cast_id)!.push(c)
  }
  const aggregationByCast = new Map<number, 'item_based' | 'receipt_based'>()
  for (const [castId, rows] of compByCast.entries()) {
    let row = rows.find((r) => r.target_year === targetYear && r.target_month === targetMonthNum)
    if (!row) {
      row = rows
        .filter((r) => r.target_year !== null)
        .sort((a, b) => {
          if (a.target_year !== b.target_year) return (b.target_year || 0) - (a.target_year || 0)
          return (b.target_month || 0) - (a.target_month || 0)
        })[0]
    }
    if (!row) row = rows.find((r) => r.target_year === null && r.target_month === null)

    let aggregation: 'item_based' | 'receipt_based' = 'item_based'
    if (row) {
      const types = (row.compensation_types as Array<{
        id: string
        is_enabled?: boolean
        sales_aggregation?: 'item_based' | 'receipt_based'
      }> | null) || []
      const enabledTypes = types.filter((t) => t.is_enabled !== false)
      let selected = enabledTypes[0]
      if (row.payment_selection_method === 'specific' && row.selected_compensation_type_id) {
        selected = enabledTypes.find((t) => t.id === row!.selected_compensation_type_id) || selected
      }
      if (selected?.sales_aggregation === 'receipt_based') aggregation = 'receipt_based'
    }
    aggregationByCast.set(castId, aggregation)
  }

  const payslipMap = new Map<number, PayslipRow>()
  for (const p of payslips) payslipMap.set(p.cast_id, p)

  const pdoMap = new Map<number, DailyOrderRow[]>()
  for (const d of pdoRows) {
    if (!pdoMap.has(d.cast_id)) pdoMap.set(d.cast_id, [])
    pdoMap.get(d.cast_id)!.push(d)
  }

  // cast_daily_items は cast_id / help_cast_id 両方で集計するので両方インデックス
  const cdiByCast = new Map<number, CastDailyItemRow[]>()
  for (const i of cdiRows) {
    if (i.cast_id != null) {
      if (!cdiByCast.has(i.cast_id)) cdiByCast.set(i.cast_id, [])
      cdiByCast.get(i.cast_id)!.push(i)
    }
    if (i.help_cast_id != null && i.help_cast_id !== i.cast_id) {
      if (!cdiByCast.has(i.help_cast_id)) cdiByCast.set(i.help_cast_id, [])
      cdiByCast.get(i.help_cast_id)!.push(i)
    }
  }

  // 全関係キャスト ID を集める
  const allCastIds = new Set<number>()
  for (const id of payslipMap.keys()) allCastIds.add(id)
  for (const id of pdoMap.keys()) allCastIds.add(id)
  for (const id of cdiByCast.keys()) allCastIds.add(id)

  const statuses: Record<number, Status> = {}

  for (const castId of allCastIds) {
    const ps = payslipMap.get(castId)
    const pdoRows = pdoMap.get(castId) || []
    const cdiRows = cdiByCast.get(castId) || []

    if (!ps && pdoRows.length === 0 && cdiRows.length === 0) {
      statuses[castId] = 'no_data'
      continue
    }

    const pbd = ps?.product_back_details || []
    const pbdSelf = pbd.filter((d) => d.sales_type === 'self').reduce((s, d) => s + (d.back_amount || 0), 0)
    const pbdHelp = pbd.filter((d) => d.sales_type === 'help').reduce((s, d) => s + (d.back_amount || 0), 0)

    const dd = ps?.daily_details || []
    const ddBack = dd.reduce((s, d) => s + (d.back || 0), 0)
    const ddSelfBack = dd.reduce((s, d) => s + (d.self_back || 0), 0)
    const ddHelpBack = dd.reduce((s, d) => s + (d.help_back || 0), 0)
    const ddHours = dd.reduce((s, d) => s + (d.hours || 0), 0)

    const pdoSelfSales = pdoRows.reduce((s, d) => s + (d.self_sales_total || 0), 0)
    const pdoHelpSales = pdoRows.reduce((s, d) => s + (d.help_sales_total || 0), 0)
    const pdoSelfBack = pdoRows.reduce((s, d) => s + (d.self_back_total || 0), 0)
    const pdoHelpBack = pdoRows.reduce((s, d) => s + (d.help_back_total || 0), 0)
    const pdoHours = pdoRows.reduce((s, d) => s + Number(d.work_hours || 0), 0)

    // recalc の pdo 構築と同じルールで集計
    // - cast_id = X の行 → 推し（卓内ヘルプ含む）：self_sales_(item|receipt)_based + 卓内ヘルプ help_sales
    // - cast_id ≠ X AND help_cast_id = X → ヘルプ（他卓）：help_sales
    const aggregation = aggregationByCast.get(castId) ?? 'item_based'
    const rawSelfSales = cdiRows
      .filter((i) => i.cast_id === castId)
      .reduce((s, i) => {
        const baseCredit = aggregation === 'receipt_based'
          ? Number(i.self_sales_receipt_based) || 0
          : Number(i.self_sales_item_based) || 0
        // 卓内ヘルプ（cast_id=help_cast_id=X）の help_sales を推し credit に加算
        const helpCredit = i.help_cast_id === castId ? (Number(i.help_sales) || 0) : 0
        return s + baseCredit + helpCredit
      }, 0)
    const rawHelpSales = cdiRows
      .filter((i) => i.help_cast_id === castId && i.cast_id !== castId)
      .reduce((s, i) => s + (Number(i.help_sales) || 0), 0)
    const rawSelfBack = cdiRows
      .filter((i) => i.cast_id === castId)
      .reduce((s, i) => {
        const baseBack = Number(i.self_back_amount) || 0
        const helpBack = i.help_cast_id === castId ? (Number(i.help_back_amount) || 0) : 0
        return s + baseBack + helpBack
      }, 0)
    const rawHelpBack = cdiRows
      .filter((i) => i.help_cast_id === castId && i.cast_id !== castId)
      .reduce((s, i) => s + (Number(i.help_back_amount) || 0), 0)

    // チェック対象（page.tsx と同じ rows）
    const checks: Array<{ vals: number[]; tol: number }> = [
      { vals: [pbdSelf, ddSelfBack, pdoSelfBack, rawSelfBack], tol: 1 },
      { vals: [pbdHelp, ddHelpBack, pdoHelpBack, rawHelpBack], tol: 1 },
      { vals: [pbdSelf + pbdHelp, ddBack, pdoSelfBack + pdoHelpBack, rawSelfBack + rawHelpBack], tol: 1 },
      { vals: [pdoSelfSales, rawSelfSales], tol: 1 },
      { vals: [pdoHelpSales, rawHelpSales], tol: 1 },
      { vals: [pdoSelfSales + pdoHelpSales, rawSelfSales + rawHelpSales], tol: 1 },
      { vals: [ps?.total_hours ?? NaN, ddHours, pdoHours].filter((v) => !Number.isNaN(v)), tol: 0.01 },
    ]

    let mismatch = false
    for (const c of checks) {
      const filtered = c.vals.filter((v) => v != null)
      if (filtered.length < 2) continue
      const ref = filtered[0]
      if (filtered.some((v) => Math.abs(v - ref) > c.tol)) {
        mismatch = true
        break
      }
    }

    statuses[castId] = mismatch ? 'mismatch' : 'ok'
  }

  return NextResponse.json({ statuses })
}
