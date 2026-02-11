import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth } from 'date-fns'

// セッション検証（store_idオーバーライド対応）
async function validateSession(requestedStoreId?: number): Promise<{ storeId: number } | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return null

  try {
    const session = JSON.parse(sessionCookie.value)

    // super_adminの場合、リクエストされたstore_idを使用可能
    if (requestedStoreId && session.isAllStore) {
      return { storeId: requestedStoreId }
    }

    // store_adminの場合、自分のstore_idのみ使用可能
    if (requestedStoreId && requestedStoreId !== session.store_id && !session.isAllStore) {
      return null
    }

    return { storeId: requestedStoreId || session.store_id }
  } catch {
    return null
  }
}

interface PayslipSummary {
  cast_id: number
  cast_name: string
  work_days: number
  total_hours: number
  hourly_income: number
  sales_back: number
  product_back: number
  fixed_amount: number
  gross_total: number
  daily_payment: number
  withholding_tax: number
  other_deductions: number
  total_deduction: number
  net_payment: number
}

// 遅刻罰金計算
function calculateLatePenalty(lateMinutes: number, rule: {
  calculation_type: string
  fixed_amount: number
  interval_minutes: number
  amount_per_interval: number
  max_amount: number
}): number {
  if (lateMinutes <= 0) return 0

  switch (rule.calculation_type) {
    case 'fixed':
      return rule.fixed_amount
    case 'cumulative':
      const intervals = Math.ceil(lateMinutes / rule.interval_minutes)
      const penalty = intervals * rule.amount_per_interval
      return rule.max_amount > 0 ? Math.min(penalty, rule.max_amount) : penalty
    default:
      return 0
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { year_month, store_id } = body

    // セッション検証（store_idオーバーライド対応）
    const session = await validateSession(store_id)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!year_month) {
      return NextResponse.json({ error: 'year_month is required' }, { status: 400 })
    }

    const supabase = getSupabaseServerClient()
    const storeId = session.storeId
    const targetMonth = new Date(`${year_month}-01`)
    const startDate = format(startOfMonth(targetMonth), 'yyyy-MM-dd')
    const endDate = format(endOfMonth(targetMonth), 'yyyy-MM-dd')

    // 1. アクティブなキャスト一覧
    const { data: casts } = await supabase
      .from('casts')
      .select('id, name')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('name')

    if (!casts || casts.length === 0) {
      return NextResponse.json({ success: true, payslips: [] })
    }

    // 2. 全キャストの日別統計を一括取得（ページネーションでmax-rows制限を回避）
    const allDailyStats: { cast_id: number; date: string; work_hours: number; wage_amount: number; total_sales_item_based: number; total_sales_receipt_based: number; product_back_item_based: number; product_back_receipt_based: number }[] = []
    {
      let offset = 0
      while (true) {
        const { data } = await supabase
          .from('cast_daily_stats')
          .select('cast_id, date, work_hours, wage_amount, total_sales_item_based, total_sales_receipt_based, product_back_item_based, product_back_receipt_based')
          .eq('store_id', storeId)
          .gte('date', startDate)
          .lte('date', endDate)
          .range(offset, offset + 999)
        if (!data || data.length === 0) break
        allDailyStats.push(...data)
        if (data.length < 1000) break
        offset += 1000
      }
    }

    // 3. 全キャストの日別アイテムを一括取得（商品バック計算用 - 報酬明細ページと同じソース）
    const allDailyItems: { cast_id: number; help_cast_id: number | null; self_back_amount: number; help_back_amount: number }[] = []
    {
      let offset = 0
      while (true) {
        const { data } = await supabase
          .from('cast_daily_items')
          .select('cast_id, help_cast_id, self_back_amount, help_back_amount')
          .eq('store_id', storeId)
          .gte('date', startDate)
          .lte('date', endDate)
          .range(offset, offset + 999)
        if (!data || data.length === 0) break
        allDailyItems.push(...data)
        if (data.length < 1000) break
        offset += 1000
      }
    }

    // 4. 勤怠データを一括取得
    const castNames = casts.map(c => c.name)
    const allAttendance: { cast_name: string; date: string; daily_payment: number; late_minutes: number; status_id: string }[] = []
    {
      let offset = 0
      while (true) {
        const { data } = await supabase
          .from('attendance')
          .select('cast_name, date, daily_payment, late_minutes, status_id')
          .eq('store_id', storeId)
          .in('cast_name', castNames)
          .gte('date', startDate)
          .lte('date', endDate)
          .range(offset, offset + 999)
        if (!data || data.length === 0) break
        allAttendance.push(...data)
        if (data.length < 1000) break
        offset += 1000
      }
    }

    // 5. 勤怠ステータス（出勤扱い判定用）
    const { data: attendanceStatuses } = await supabase
      .from('attendance_statuses')
      .select('id, code, is_active')
      .eq('store_id', storeId)
      .eq('is_active', true)

    const workDayStatusIds = new Set(
      (attendanceStatuses || [])
        .filter(s => s.is_active)
        .map(s => s.id.toString())
    )

    // 6. 控除設定を取得
    const { data: deductionTypes } = await supabase
      .from('deduction_types')
      .select('id, name, type, percentage, default_amount, attendance_status_id, penalty_amount')
      .eq('store_id', storeId)
      .eq('is_active', true)

    // 7. 遅刻罰金ルールを取得
    const lateDeductionIds = (deductionTypes || [])
      .filter(d => d.type === 'penalty_late')
      .map(d => d.id)

    let latePenaltyRules: Array<{
      deduction_type_id: number
      calculation_type: string
      fixed_amount: number
      interval_minutes: number
      amount_per_interval: number
      max_amount: number
    }> = []
    if (lateDeductionIds.length > 0) {
      const { data: rules } = await supabase
        .from('late_penalty_rules')
        .select('deduction_type_id, calculation_type, fixed_amount, interval_minutes, amount_per_interval, max_amount')
        .in('deduction_type_id', lateDeductionIds)
      latePenaltyRules = rules || []
    }

    // 8. 報酬設定を一括取得
    const castIds = casts.map(c => c.id)
    const { data: allCompSettings } = await supabase
      .from('compensation_settings')
      .select('cast_id, status_id, hourly_wage_override, enabled_deduction_ids, compensation_types, payment_selection_method, selected_compensation_type_id, target_year, target_month')
      .eq('store_id', storeId)
      .in('cast_id', castIds)
      .eq('is_active', true)

    // 9. 時給ステータスを取得
    const { data: wageStatuses } = await supabase
      .from('wage_statuses')
      .select('id, hourly_wage')
      .eq('store_id', storeId)

    const wageStatusMap = new Map((wageStatuses || []).map(ws => [ws.id, ws.hourly_wage]))

    // キャストごとに計算
    const payslips: PayslipSummary[] = []

    for (const cast of casts) {
      // このキャストのデータをフィルタ
      const castStats = (allDailyStats || []).filter(s => s.cast_id === cast.id)
      const castAttendance = (allAttendance || []).filter(a => a.cast_name === cast.name)

      // 商品バック（cast_daily_items から取得 - 報酬明細ページと同じソース）
      const selfBackAmount = (allDailyItems || [])
        .filter(i => i.cast_id === cast.id)
        .reduce((sum, i) => sum + (i.self_back_amount || 0), 0)
      const helpBackAmount = (allDailyItems || [])
        .filter(i => i.help_cast_id === cast.id)
        .reduce((sum, i) => sum + (i.help_back_amount || 0), 0)
      const totalProductBack = selfBackAmount + helpBackAmount

      // 報酬設定を取得（年月指定 → 直近 → デフォルトの順）
      const targetYear = targetMonth.getFullYear()
      const targetMonthNum = targetMonth.getMonth() + 1

      let compSettings = (allCompSettings || []).find(
        cs => cs.cast_id === cast.id && cs.target_year === targetYear && cs.target_month === targetMonthNum
      )
      if (!compSettings) {
        compSettings = (allCompSettings || [])
          .filter(cs => cs.cast_id === cast.id && cs.target_year !== null)
          .sort((a, b) => {
            if (a.target_year !== b.target_year) return (b.target_year || 0) - (a.target_year || 0)
            return (b.target_month || 0) - (a.target_month || 0)
          })[0]
      }
      if (!compSettings) {
        compSettings = (allCompSettings || []).find(
          cs => cs.cast_id === cast.id && cs.target_year === null && cs.target_month === null
        )
      }

      // 勤務時間・時給計算
      const totalWorkHours = castStats.reduce((sum, s) => sum + (s.work_hours || 0), 0)
      const statsWageAmount = castStats.reduce((sum, s) => sum + (s.wage_amount || 0), 0)

      // 時給を取得
      const statusHourlyWage = compSettings?.status_id ? wageStatusMap.get(compSettings.status_id) || 0 : 0
      const effectiveHourlyRate = compSettings?.hourly_wage_override || statusHourlyWage
      const calculatedWageAmount = Math.round(totalWorkHours * effectiveHourlyRate)
      const totalWageAmount = statsWageAmount > 0 ? statsWageAmount : calculatedWageAmount

      // 売上集計（報酬形態のsales_aggregationに基づく）
      const compensationTypes = compSettings?.compensation_types as Array<{
        id: string
        name: string
        is_enabled?: boolean
        sales_aggregation?: 'item_based' | 'receipt_based'
        commission_rate?: number
        use_sliding_rate?: boolean
        sliding_rates?: Array<{ min: number; max: number; rate: number }>
        hourly_rate?: number
        fixed_amount?: number
        use_product_back?: boolean
        use_help_product_back?: boolean
      }> || []

      const enabledTypes = compensationTypes.filter(t => t.is_enabled !== false)

      // 各報酬形態の報酬額を計算
      const calculateForType = (compType: typeof enabledTypes[0]) => {
        const typeIsItemBased = compType.sales_aggregation !== 'receipt_based'
        const typeTotalSales = castStats.reduce((sum, s) => {
          return sum + (typeIsItemBased ? (s.total_sales_item_based || 0) : (s.total_sales_receipt_based || 0))
        }, 0)

        let typeSalesBack = 0
        if (compType.use_sliding_rate && compType.sliding_rates) {
          const rate = compType.sliding_rates.find(
            r => typeTotalSales >= r.min && (r.max === 0 || typeTotalSales <= r.max)
          )
          if (rate) {
            typeSalesBack = Math.round(typeTotalSales * rate.rate / 100)
          }
        } else if (compType.commission_rate && compType.commission_rate > 0) {
          typeSalesBack = Math.round(typeTotalSales * compType.commission_rate / 100)
        }

        const typeUseWage = (compType.hourly_rate || 0) > 0
        const typeHourlyIncome = typeUseWage ? totalWageAmount : 0
        const typeFixedAmount = compType.fixed_amount || 0
        const typeProductBack = compType.use_product_back ? totalProductBack : 0
        const typeGrossTotal = typeHourlyIncome + typeSalesBack + typeProductBack + typeFixedAmount

        return { compType, salesBack: typeSalesBack, useWage: typeUseWage, hourlyIncome: typeHourlyIncome, fixedAmount: typeFixedAmount, productBack: typeProductBack, grossTotal: typeGrossTotal }
      }

      const allResults = enabledTypes.map(calculateForType)

      // 採用する報酬形態を決定（recalculate APIと同じロジック）
      let selected = allResults[0] || null
      if (compSettings?.payment_selection_method === 'specific' && compSettings?.selected_compensation_type_id) {
        selected = allResults.find(r => r.compType.id === compSettings.selected_compensation_type_id) || selected
      } else if (allResults.length > 1) {
        // 最高額を選択
        selected = allResults.reduce((best, current) =>
          current.grossTotal > best.grossTotal ? current : best
        )
      }

      const salesBack = selected?.salesBack ?? 0
      const fixedAmount = selected?.fixedAmount ?? 0
      const hourlyIncome = selected?.hourlyIncome ?? 0
      const productBack = selected?.productBack ?? totalProductBack
      const grossTotal = selected?.grossTotal ?? totalProductBack

      // 控除計算
      const enabledDeductionIds = compSettings?.enabled_deduction_ids || []

      // 日払い
      const dailyPayment = castAttendance.reduce((sum, a) => sum + (a.daily_payment || 0), 0)

      // 遅刻罰金
      let latePenalty = 0
      const lateDeduction = (deductionTypes || []).find(
        d => d.type === 'penalty_late' && (enabledDeductionIds.length === 0 || enabledDeductionIds.includes(d.id))
      )
      if (lateDeduction) {
        const rule = latePenaltyRules.find(r => r.deduction_type_id === lateDeduction.id)
        if (rule) {
          for (const a of castAttendance) {
            if (a.late_minutes > 0) {
              latePenalty += calculateLatePenalty(a.late_minutes, rule)
            }
          }
        }
      }

      // ステータス連動罰金
      let statusPenalty = 0
      for (const d of (deductionTypes || []).filter(d => d.type === 'penalty_status' && d.attendance_status_id)) {
        if (enabledDeductionIds.length > 0 && !enabledDeductionIds.includes(d.id)) continue
        const count = castAttendance.filter(a => a.status_id === d.attendance_status_id).length
        statusPenalty += d.penalty_amount * count
      }

      // 固定控除
      let fixedDeduction = 0
      for (const d of (deductionTypes || []).filter(d => d.type === 'fixed')) {
        if (enabledDeductionIds.length > 0 && !enabledDeductionIds.includes(d.id)) continue
        fixedDeduction += d.default_amount || 0
      }

      // 出勤控除
      let perAttendanceDeduction = 0
      for (const d of (deductionTypes || []).filter(d => d.type === 'per_attendance')) {
        if (enabledDeductionIds.length > 0 && !enabledDeductionIds.includes(d.id)) continue
        const workDayCount = castAttendance.filter(a => a.status_id && workDayStatusIds.has(a.status_id)).length
        perAttendanceDeduction += (d.default_amount || 0) * workDayCount
      }

      // 源泉徴収
      let withholdingTax = 0
      for (const d of (deductionTypes || []).filter(d => d.type === 'percentage' && d.percentage)) {
        if (enabledDeductionIds.length > 0 && !enabledDeductionIds.includes(d.id)) continue
        withholdingTax += Math.round(grossTotal * (d.percentage || 0) / 100)
      }

      // その他控除
      const otherDeductions = latePenalty + statusPenalty + fixedDeduction + perAttendanceDeduction

      // 控除合計
      const totalDeduction = dailyPayment + withholdingTax + otherDeductions

      // 出勤日数（報酬明細ページと同じ: 勤務時間 > 0 の日数）
      const workDays = castStats.filter(s => (s.work_hours || 0) > 0).length

      payslips.push({
        cast_id: cast.id,
        cast_name: cast.name,
        work_days: workDays,
        total_hours: Math.round(totalWorkHours * 100) / 100,
        hourly_income: hourlyIncome,
        sales_back: salesBack,
        product_back: productBack,
        fixed_amount: fixedAmount,
        gross_total: grossTotal,
        daily_payment: dailyPayment,
        withholding_tax: withholdingTax,
        other_deductions: otherDeductions,
        total_deduction: totalDeduction,
        net_payment: grossTotal - totalDeduction
      })
    }

    return NextResponse.json({
      success: true,
      payslips
    })
  } catch (error) {
    console.error('Payslip list API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
