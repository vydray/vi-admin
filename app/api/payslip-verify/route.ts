import { NextRequest, NextResponse } from 'next/server'
import { format, startOfMonth, endOfMonth, parse } from 'date-fns'
import { getSupabaseServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const castId = Number(searchParams.get('cast_id'))
  const storeId = Number(searchParams.get('store_id'))
  const yearMonth = searchParams.get('year_month')

  if (!castId || !storeId || !yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { error: 'cast_id, store_id, year_month (YYYY-MM) required' },
      { status: 400 },
    )
  }

  const supabase = getSupabaseServerClient()
  const month = parse(yearMonth, 'yyyy-MM', new Date())
  const startDate = format(startOfMonth(month), 'yyyy-MM-dd')
  const endDate = format(endOfMonth(month), 'yyyy-MM-dd')

  const [psRes, pdoRes, cdiRes, compRes] = await Promise.all([
    supabase
      .from('payslips')
      .select(
        'cast_id, year_month, product_back, sales_back, hourly_income, fixed_amount, per_attendance_income, bonus_total, gross_total, total_hours, work_days, daily_payment, withholding_tax, other_deductions, total_deduction, net_payment, product_back_details, daily_details, compensation_breakdown, bonus_details, deduction_details, updated_at',
      )
      .eq('cast_id', castId)
      .eq('store_id', storeId)
      .eq('year_month', yearMonth)
      .maybeSingle(),
    supabase
      .from('payslip_daily_orders')
      .select(
        'date, self_sales_total, help_sales_total, self_back_total, help_back_total, wage_amount, work_hours',
      )
      .eq('cast_id', castId)
      .eq('store_id', storeId)
      .eq('year_month', yearMonth)
      .order('date'),
    supabase
      .from('cast_daily_items')
      .select(
        'cast_id, help_cast_id, self_sales, help_sales, self_sales_item_based, self_sales_receipt_based, self_back_amount, help_back_amount, date',
      )
      .eq('store_id', storeId)
      .or(`cast_id.eq.${castId},help_cast_id.eq.${castId}`)
      .gte('date', startDate)
      .lte('date', endDate),
    // キャストの報酬設定（aggregation 判定用）
    supabase
      .from('compensation_settings')
      .select('compensation_types, payment_selection_method, selected_compensation_type_id, target_year, target_month')
      .eq('cast_id', castId)
      .eq('store_id', storeId),
  ])

  if (psRes.error || pdoRes.error || cdiRes.error || compRes.error) {
    console.error('payslip-verify fetch error:', {
      ps: psRes.error,
      pdo: pdoRes.error,
      cdi: cdiRes.error,
      comp: compRes.error,
    })
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }

  // recalc と同じく「採用形態」を決定して aggregation を取り出す
  // 該当年月 → 直近 → デフォルトの順でフォールバック
  const targetYear = month.getFullYear()
  const targetMonthNum = month.getMonth() + 1
  const allComp = (compRes.data || []) as Array<{
    compensation_types: unknown
    payment_selection_method: string | null
    selected_compensation_type_id: string | null
    target_year: number | null
    target_month: number | null
  }>
  let compRow = allComp.find((c) => c.target_year === targetYear && c.target_month === targetMonthNum)
  if (!compRow) {
    compRow = allComp
      .filter((c) => c.target_year !== null)
      .sort((a, b) => {
        if (a.target_year !== b.target_year) return (b.target_year || 0) - (a.target_year || 0)
        return (b.target_month || 0) - (a.target_month || 0)
      })[0]
  }
  if (!compRow) {
    compRow = allComp.find((c) => c.target_year === null && c.target_month === null)
  }

  let aggregation: 'item_based' | 'receipt_based' = 'item_based'
  if (compRow) {
    const types = (compRow.compensation_types as Array<{
      id: string
      is_enabled?: boolean
      sales_aggregation?: 'item_based' | 'receipt_based'
    }> | null) || []
    const enabledTypes = types.filter((t) => t.is_enabled !== false)
    let selected = enabledTypes[0]
    if (compRow.payment_selection_method === 'specific' && compRow.selected_compensation_type_id) {
      selected = enabledTypes.find((t) => t.id === compRow!.selected_compensation_type_id) || selected
    }
    if (selected?.sales_aggregation === 'receipt_based') aggregation = 'receipt_based'
  }

  return NextResponse.json({
    payslip: psRes.data,
    dailyOrders: pdoRes.data || [],
    items: cdiRes.data || [],
    aggregation,
  })
}
