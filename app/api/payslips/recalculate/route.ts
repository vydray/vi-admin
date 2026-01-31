import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { calculateCastSalesByPublishedMethod } from '@/lib/salesCalculation'
import type { SalesSettings } from '@/types/database'

// Service Role Key でRLSをバイパス
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Cron認証（Vercel Cron用）
function validateCronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true
  }
  return false
}

interface Cast {
  id: number
  name: string
}

interface DailyStats {
  date: string
  work_hours: number
  wage_amount: number
}

interface AttendanceData {
  date: string
  daily_payment: number
  late_minutes: number
  status_id: string | null
}

interface DeductionType {
  id: number
  name: string
  type: string
  percentage: number | null
  default_amount: number
  attendance_status_id: string | null
  penalty_amount: number
}

interface LatePenaltyRule {
  deduction_type_id: number
  calculation_type: 'fixed' | 'tiered' | 'cumulative'
  fixed_amount: number
  interval_minutes: number
  amount_per_interval: number
  max_amount: number
}

interface CompensationSettings {
  enabled_deduction_ids: number[]
  compensation_types: {
    id: string
    name: string
    commission_rate: number
    use_sliding_rate: boolean
    sliding_rates: { min: number; max: number; rate: number }[] | null
  }[] | null
  payment_selection_method: 'highest' | 'specific'
  selected_compensation_type_id: string | null
}

interface DailySalesData {
  date: string
  totalSales: number
  productBack: number
  items: Array<{
    product_name: string
    category: string | null
    sales_type: 'self' | 'help'
    quantity: number
    subtotal: number
    back_ratio: number
    back_amount: number
    is_base?: boolean
  }>
}

interface BaseOrder {
  id: number
  product_name: string
  actual_price: number | null
  quantity: number
  business_date: string | null
}

interface CastBackRate {
  category: string | null
  product_name: string | null
  back_type: 'ratio' | 'fixed'
  back_ratio: number
  back_fixed_amount: number
  self_back_ratio: number | null
}

// SalesSettings は types/database.ts からインポート

// 遅刻罰金を計算
function calculateLatePenalty(lateMinutes: number, rule: LatePenaltyRule): number {
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

// 単一キャストの報酬明細を計算・保存
async function calculatePayslipForCast(
  storeId: number,
  cast: Cast,
  month: Date
): Promise<{ success: boolean; error?: string }> {
  try {
    const yearMonth = format(month, 'yyyy-MM')
    const startDate = format(startOfMonth(month), 'yyyy-MM-dd')
    const endDate = format(endOfMonth(month), 'yyyy-MM-dd')

    // 確定済みかチェック
    const { data: existingPayslip } = await supabaseAdmin
      .from('payslips')
      .select('id, status')
      .eq('cast_id', cast.id)
      .eq('store_id', storeId)
      .eq('year_month', yearMonth)
      .single()

    if (existingPayslip?.status === 'finalized') {
      return { success: true } // 確定済みはスキップ
    }

    // 既存のpayslip_itemsデータを削除（再計算のため）
    await supabaseAdmin
      .from('payslip_items')
      .delete()
      .eq('cast_id', cast.id)
      .eq('year_month', yearMonth)

    // 日別統計データを取得
    const { data: dailyStats } = await supabaseAdmin
      .from('cast_daily_stats')
      .select('date, work_hours, wage_amount')
      .eq('cast_id', cast.id)
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)

    // 勤怠データを取得
    const { data: attendanceData } = await supabaseAdmin
      .from('attendance')
      .select('date, daily_payment, late_minutes, status_id')
      .eq('store_id', storeId)
      .eq('cast_name', cast.name)
      .gte('date', startDate)
      .lte('date', endDate)

    // 控除設定を取得
    const { data: deductionTypes } = await supabaseAdmin
      .from('deduction_types')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)

    // 遅刻罰金ルールを取得
    const lateDeductionIds = (deductionTypes || [])
      .filter(d => d.type === 'penalty_late')
      .map(d => d.id)

    let latePenaltyRules: LatePenaltyRule[] = []
    if (lateDeductionIds.length > 0) {
      const { data: rules } = await supabaseAdmin
        .from('late_penalty_rules')
        .select('*')
        .in('deduction_type_id', lateDeductionIds)
      latePenaltyRules = rules || []
    }

    // 報酬設定を取得（年月指定 → 直近の設定 → デフォルト設定の順で探す）
    const targetYear = month.getFullYear()
    const targetMonth = month.getMonth() + 1

    // 1. 指定年月の設定を探す
    let { data: compensationSettings } = await supabaseAdmin
      .from('compensation_settings')
      .select('enabled_deduction_ids, compensation_types, payment_selection_method, selected_compensation_type_id, store_id, target_year, target_month')
      .eq('cast_id', cast.id)
      .eq('store_id', storeId)
      .eq('target_year', targetYear)
      .eq('target_month', targetMonth)
      .eq('is_active', true)
      .maybeSingle()

    // 2. なければ直近の設定を探す
    if (!compensationSettings) {
      const { data: recentSettings } = await supabaseAdmin
        .from('compensation_settings')
        .select('enabled_deduction_ids, compensation_types, payment_selection_method, selected_compensation_type_id, store_id, target_year, target_month')
        .eq('cast_id', cast.id)
        .eq('store_id', storeId)
        .eq('is_active', true)
        .not('target_year', 'is', null)
        .order('target_year', { ascending: false })
        .order('target_month', { ascending: false })
        .limit(1)
        .maybeSingle()

      compensationSettings = recentSettings
    }

    // 3. なければデフォルト設定を探す
    if (!compensationSettings) {
      const { data: defaultSettings } = await supabaseAdmin
        .from('compensation_settings')
        .select('enabled_deduction_ids, compensation_types, payment_selection_method, selected_compensation_type_id, store_id, target_year, target_month')
        .eq('cast_id', cast.id)
        .eq('store_id', storeId)
        .is('target_year', null)
        .is('target_month', null)
        .eq('is_active', true)
        .maybeSingle()

      compensationSettings = defaultSettings
    }

    // 日別売上データを取得（cast_daily_itemsから）
    const { data: dailyItems } = await supabaseAdmin
      .from('cast_daily_items')
      .select('date, category, product_name, quantity, subtotal, back_amount, is_self')
      .eq('cast_id', cast.id)
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)

    // BASE注文を取得
    const { data: baseOrders } = await supabaseAdmin
      .from('base_orders')
      .select('id, product_name, actual_price, quantity, business_date')
      .eq('store_id', storeId)
      .eq('cast_id', cast.id)
      .gte('business_date', startDate)
      .lte('business_date', endDate)

    // BASEバック率を取得
    const { data: backRates } = await supabaseAdmin
      .from('cast_back_rates')
      .select('category, product_name, back_type, back_ratio, back_fixed_amount, self_back_ratio')
      .eq('cast_id', cast.id)
      .eq('store_id', storeId)
      .eq('is_active', true)

    // 売上設定を取得（全フィールド）
    const { data: salesSettings } = await supabaseAdmin
      .from('sales_settings')
      .select('*')
      .eq('store_id', storeId)
      .single()

    // 注文データを取得（売上計算用）
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        staff_name,
        order_date,
        order_items (
          id,
          product_name,
          category,
          cast_name,
          quantity,
          unit_price,
          subtotal
        )
      `)
      .eq('store_id', storeId)
      .gte('order_date', startDate)
      .lte('order_date', endDate + 'T23:59:59')
      .is('deleted_at', null)

    // キャストリスト（売上計算用）
    const { data: allCasts } = await supabaseAdmin
      .from('casts')
      .select('id, name')
      .eq('store_id', storeId)
    const castList = (allCasts || []).map(c => ({ id: c.id, name: c.name }))

    // BASEバック情報を取得するヘルパー関数
    const getBaseBackInfo = (productName: string): { type: 'ratio' | 'fixed'; rate: number; fixedAmount: number } | null => {
      if (!backRates || backRates.length === 0) return null

      // 1. カテゴリ='BASE'で商品名完全一致
      let matchedRate = backRates.find(
        r => r.product_name === productName && r.category === 'BASE'
      )
      // 2. カテゴリ='BASE'で商品名なし
      if (!matchedRate) {
        matchedRate = backRates.find(
          r => r.category === 'BASE' && r.product_name === null
        )
      }
      if (!matchedRate) return null

      const rate = matchedRate.self_back_ratio ?? matchedRate.back_ratio
      return {
        type: matchedRate.back_type || 'ratio',
        rate,
        fixedAmount: matchedRate.back_fixed_amount || 0
      }
    }

    // 日別売上を集計（共通関数を使用）
    const dailySalesMap = new Map<string, DailySalesData>()

    // 注文を日付ごとにグループ化
    const ordersByDate = new Map<string, typeof orders>()
    for (const order of orders || []) {
      const dateStr = order.order_date?.split('T')[0]
      if (dateStr) {
        const existing = ordersByDate.get(dateStr) || []
        existing.push(order)
        ordersByDate.set(dateStr, existing)
      }
    }

    // 日付ごとに売上を計算（共通関数を使用）
    if (salesSettings) {
      ordersByDate.forEach((dayOrders, dateStr) => {
        // 共通関数で売上を計算（税抜設定が自動適用される）
        const salesResults = calculateCastSalesByPublishedMethod(
          dayOrders as any,
          castList,
          salesSettings as SalesSettings,
          0.1,  // taxRate
          0     // serviceRate
        )

        // このキャストの売上を取得
        const castSales = salesResults.find(r => r.cast_id === cast.id)
        if (castSales && castSales.total_sales > 0) {
          dailySalesMap.set(dateStr, {
            date: dateStr,
            totalSales: castSales.total_sales,
            productBack: 0,  // 商品バックは別途計算
            items: castSales.items.map(item => ({
              product_name: item.product_name,
              category: item.category,
              sales_type: item.sales_type,
              quantity: item.quantity,
              subtotal: item.subtotal_excl_tax,
              back_ratio: item.back_ratio,
              back_amount: item.back_amount,
              is_base: false
            }))
          })
        }
      })
    }

    // cast_daily_itemsから商品バックを取得（バック計算はPOSで行われている）
    for (const item of dailyItems || []) {
      if (!dailySalesMap.has(item.date)) {
        dailySalesMap.set(item.date, {
          date: item.date,
          totalSales: 0,
          productBack: 0,
          items: []
        })
      }
      const dayData = dailySalesMap.get(item.date)!
      dayData.productBack += item.back_amount
    }

    // BASE注文のバックを計算して追加
    const excludeTax = salesSettings?.item_exclude_consumption_tax ?? salesSettings?.use_tax_excluded ?? false
    const taxPercent = 10

    for (const baseOrder of baseOrders || []) {
      if (!baseOrder.business_date) continue

      const backInfo = getBaseBackInfo(baseOrder.product_name)
      if (!backInfo) continue // バック設定がなければスキップ

      // BASE注文のactual_priceは既に税抜価格なので、税計算は不要
      const calcPrice = baseOrder.actual_price || 0
      const subtotal = calcPrice * baseOrder.quantity
      const backAmount = backInfo.type === 'fixed'
        ? backInfo.fixedAmount * baseOrder.quantity
        : Math.floor(subtotal * backInfo.rate / 100)

      // dailySalesMapに追加
      if (!dailySalesMap.has(baseOrder.business_date)) {
        dailySalesMap.set(baseOrder.business_date, {
          date: baseOrder.business_date,
          totalSales: 0,
          productBack: 0,
          items: []
        })
      }
      const dayData = dailySalesMap.get(baseOrder.business_date)!
      dayData.totalSales += subtotal  // BASE売上を追加
      dayData.productBack += backAmount
      dayData.items.push({
        product_name: baseOrder.product_name,
        category: 'BASE',
        sales_type: 'self',
        quantity: baseOrder.quantity,
        subtotal,
        back_ratio: backInfo.rate,
        back_amount: backAmount,
        is_base: true
      })
    }

    // ===== 集計計算 =====
    const totalWorkHours = (dailyStats || []).reduce((sum, d) => sum + (d.work_hours || 0), 0)
    const totalWageAmount = (dailyStats || []).reduce((sum, d) => sum + (d.wage_amount || 0), 0)

    let totalSales = 0
    let totalProductBack = 0
    dailySalesMap.forEach(day => {
      totalSales += day.totalSales
      totalProductBack += day.productBack
    })

    // 売上バック計算
    let salesBack = 0
    const enabledDeductionIds = compensationSettings?.enabled_deduction_ids || []
    const compensationTypes = compensationSettings?.compensation_types || []

    if (!compensationSettings) {
      // No compensation settings found
    }

    // アクティブな報酬タイプを取得
    type CompType = {
      id: string
      name: string
      commission_rate: number
      fixed_amount: number
      hourly_rate: number
      use_sliding_rate: boolean
      sliding_rates: { min: number; max: number; rate: number }[] | null
      is_enabled: boolean
    }
    // is_enabled でフィルター（undefinedは有効として扱う - 後方互換性）
    const enabledTypes = compensationTypes.filter((t: CompType) => t.is_enabled !== false)

    let activeCompType: CompType | undefined = undefined
    if (compensationSettings?.payment_selection_method === 'specific' && compensationSettings?.selected_compensation_type_id) {
      activeCompType = enabledTypes.find((t: CompType) => t.id === compensationSettings.selected_compensation_type_id)
    } else if (enabledTypes.length > 0) {
      // highest: 最高額を計算して選択（簡易版：最初のタイプを使用）
      activeCompType = enabledTypes[0]
    }

    let fixedAmount = 0

    if (activeCompType) {
      // 固定額（文字列の場合も考慮）
      fixedAmount = Number(activeCompType.fixed_amount) || 0

      // 売上バック計算
      if (activeCompType.use_sliding_rate && activeCompType.sliding_rates) {
        const rate = activeCompType.sliding_rates.find(
          r => totalSales >= r.min && (r.max === 0 || totalSales <= r.max)
        )
        if (rate) {
          salesBack = Math.round(totalSales * rate.rate / 100)
        }
      } else {
        salesBack = Math.round(totalSales * activeCompType.commission_rate / 100)
      }
    }

    // 時給を使用するかどうか（hourly_rateが設定されている場合のみ）
    const hourlyRate = Number(activeCompType?.hourly_rate) || 0
    const useWageData = hourlyRate > 0
    const grossEarnings = (useWageData ? totalWageAmount : 0) + salesBack + totalProductBack + fixedAmount

    // ===== 控除計算 =====
    const deductions: Array<{ name: string; type: string; count?: number; percentage?: number; amount: number }> = []

    // 日払い合計
    const totalDailyPayment = (attendanceData || []).reduce((sum, a) => sum + (a.daily_payment || 0), 0)
    if (totalDailyPayment > 0) {
      deductions.push({
        name: '日払い',
        type: 'daily_payment',
        count: (attendanceData || []).filter(a => (a.daily_payment || 0) > 0).length,
        amount: totalDailyPayment
      })
    }

    // 遅刻罰金
    const lateDeduction = (deductionTypes || []).find(
      d => d.type === 'penalty_late' && (enabledDeductionIds.length === 0 || enabledDeductionIds.includes(d.id))
    )
    if (lateDeduction) {
      const rule = latePenaltyRules.find(r => r.deduction_type_id === lateDeduction.id)
      if (rule) {
        let totalLatePenalty = 0
        let lateCount = 0
        for (const a of attendanceData || []) {
          if (a.late_minutes > 0) {
            totalLatePenalty += calculateLatePenalty(a.late_minutes, rule)
            lateCount++
          }
        }
        if (totalLatePenalty > 0) {
          deductions.push({
            name: lateDeduction.name || '遅刻罰金',
            type: 'penalty_late',
            count: lateCount,
            amount: totalLatePenalty
          })
        }
      }
    }

    // ステータス連動罰金
    for (const d of (deductionTypes || []).filter(d => d.type === 'penalty_status' && d.attendance_status_id)) {
      if (enabledDeductionIds.length > 0 && !enabledDeductionIds.includes(d.id)) continue
      const count = (attendanceData || []).filter(a => a.status_id === d.attendance_status_id).length
      if (count > 0) {
        deductions.push({
          name: d.name,
          type: 'penalty_status',
          count,
          amount: d.penalty_amount * count
        })
      }
    }

    // 固定控除
    for (const d of (deductionTypes || []).filter(d => d.type === 'fixed')) {
      if (enabledDeductionIds.length > 0 && !enabledDeductionIds.includes(d.id)) continue
      if (d.default_amount > 0) {
        deductions.push({
          name: d.name,
          type: 'fixed',
          amount: d.default_amount
        })
      }
    }

    // 源泉徴収
    for (const d of (deductionTypes || []).filter(d => d.type === 'percentage' && d.percentage)) {
      if (enabledDeductionIds.length > 0 && !enabledDeductionIds.includes(d.id)) continue
      const amount = Math.round(grossEarnings * (d.percentage || 0) / 100)
      if (amount > 0) {
        deductions.push({
          name: d.name,
          type: 'percentage',
          percentage: d.percentage || 0,
          amount
        })
      }
    }

    const totalDeduction = deductions.reduce((sum, d) => sum + d.amount, 0)
    const netEarnings = grossEarnings - totalDeduction

    // 日別詳細
    const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
    const dailyDetails = days
      .map(day => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const stats = (dailyStats || []).find(s => s.date === dateStr)
        const attendance = (attendanceData || []).find(a => a.date === dateStr)
        const sales = dailySalesMap.get(dateStr)
        return {
          date: dateStr,
          hours: stats?.work_hours || 0,
          hourly_wage: stats?.work_hours ? Math.round((stats?.wage_amount || 0) / stats.work_hours) : 0,
          hourly_income: stats?.wage_amount || 0,
          sales: sales?.totalSales || 0,
          back: sales?.productBack || 0,
          daily_payment: attendance?.daily_payment || 0
        }
      })
      .filter(d => d.hours > 0)

    // 商品バック詳細
    const productBackDetails: Array<{
      product_name: string
      category: string | null
      sales_type: 'self' | 'help'
      quantity: number
      subtotal: number
      back_ratio: number
      back_amount: number
    }> = []

    const grouped = new Map<string, typeof productBackDetails[0]>()
    dailySalesMap.forEach(day => {
      for (const item of day.items) {
        const key = `${item.category || ''}:${item.product_name}:${item.sales_type}`
        const existing = grouped.get(key)
        if (existing) {
          existing.quantity += item.quantity
          existing.subtotal += item.subtotal
          existing.back_amount += item.back_amount
        } else {
          grouped.set(key, { ...item })
        }
      }
    })
    grouped.forEach(item => productBackDetails.push(item))

    // payslip_itemsに保存するデータを作成
    const payslipItems: any[] = []
    dailySalesMap.forEach((dayData, dateStr) => {
      dayData.items.forEach(item => {
        payslipItems.push({
          cast_id: cast.id,
          store_id: storeId,
          date: dateStr,
          year_month: yearMonth,
          product_name: item.product_name,
          category: item.category,
          quantity: item.quantity,
          subtotal: item.subtotal,
          back_ratio: item.back_ratio,
          back_amount: item.back_amount,
          sales_type: item.sales_type,
          is_base: item.is_base,
          order_id: null  // TODO: order_idを保存する場合は追加
        })
      })
    })

    // payslip_itemsに保存
    if (payslipItems.length > 0) {
      const { error: itemsError } = await supabaseAdmin
        .from('payslip_items')
        .insert(payslipItems)

      if (itemsError) {
        console.error('payslip_items保存エラー:', itemsError)
        // エラーでも処理は続行（payslipsテーブルの保存は行う）
      }
    }

    const workDays = dailyDetails.filter(d => d.hours > 0).length
    const averageHourlyWage = totalWorkHours > 0 ? Math.round(totalWageAmount / totalWorkHours) : 0

    // payslipsテーブルに保存
    const payslipData = {
      cast_id: cast.id,
      store_id: storeId,
      year_month: yearMonth,
      status: 'draft',
      work_days: workDays,
      total_hours: Math.round(totalWorkHours * 100) / 100,
      average_hourly_wage: useWageData ? averageHourlyWage : 0,
      hourly_income: useWageData ? totalWageAmount : 0,
      sales_back: salesBack,
      product_back: totalProductBack,
      fixed_amount: fixedAmount,
      gross_total: grossEarnings,
      total_deduction: totalDeduction,
      net_payment: netEarnings,
      daily_details: dailyDetails,
      product_back_details: productBackDetails,
      deduction_details: deductions
    }

    const { error } = await supabaseAdmin
      .from('payslips')
      .upsert(payslipData, { onConflict: 'cast_id,store_id,year_month' })

    if (error) {
      console.error('Payslip upsert error:', error)
      return { success: false, error: 'Failed to save payslip' }
    }

    return { success: true }
  } catch (err) {
    console.error('Payslip calculation error:', err)
    return { success: false, error: 'Failed to calculate payslip' }
  }
}

// POST: 報酬明細を再計算
export async function POST(request: NextRequest) {
  // Cron認証またはセッション認証
  const isCron = validateCronAuth(request)

  try {
    // リクエストボディから store_id と year_month を取得（手動実行時）
    let targetStoreId: number | null = null
    let targetYearMonth: string | null = null
    try {
      const body = await request.json()

      // store_idのバリデーション
      if (body.store_id !== undefined) {
        if (typeof body.store_id !== 'number' || body.store_id <= 0) {
          return NextResponse.json({ error: 'Invalid store_id: must be a positive number' }, { status: 400 })
        }
        targetStoreId = body.store_id
      }

      // year_monthのバリデーション
      if (body.year_month !== undefined) {
        const yearMonthRegex = /^\d{4}-(0[1-9]|1[0-2])$/
        if (typeof body.year_month !== 'string' || !yearMonthRegex.test(body.year_month)) {
          return NextResponse.json({ error: 'Invalid year_month format: must be YYYY-MM' }, { status: 400 })
        }
        const [year, month] = body.year_month.split('-').map(Number)
        if (year < 2000 || year > 2100) {
          return NextResponse.json({ error: 'Invalid year: must be between 2000 and 2100' }, { status: 400 })
        }
        targetYearMonth = body.year_month
      }
    } catch {
      // bodyがない場合（Cronからの呼び出し）
    }

    // 手動実行時の権限チェック
    if (targetStoreId && !isCron) {
      const cookieStore = await cookies()
      const sessionCookie = cookieStore.get('admin_session')

      if (!sessionCookie) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      let session
      try {
        session = JSON.parse(sessionCookie.value)
      } catch {
        return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
      }

      // super_adminは全店舗にアクセス可能、それ以外は自店舗のみ
      if (session.role !== 'super_admin' && session.storeId !== targetStoreId) {
        return NextResponse.json(
          { error: 'Forbidden: You can only recalculate payslips for your own store' },
          { status: 403 }
        )
      }
    }

    // 計算対象月を決定（指定がなければ当月）
    let month: Date
    if (targetYearMonth) {
      const [year, monthNum] = targetYearMonth.split('-').map(Number)
      month = new Date(year, monthNum - 1, 1)
    } else {
      month = new Date()
    }

    let totalProcessed = 0
    let totalErrors = 0

    if (targetStoreId) {
      // 特定店舗のみ計算（手動実行）
      const { data: casts } = await supabaseAdmin
        .from('casts')
        .select('id, name')
        .eq('store_id', targetStoreId)
        .eq('is_active', true)

      for (const cast of casts || []) {
        const result = await calculatePayslipForCast(targetStoreId, cast, month)
        if (result.success) {
          totalProcessed++
        } else {
          totalErrors++
          console.error(`Payslip error for cast ${cast.id}:`, result.error)
        }
      }
    } else if (isCron) {
      // 全店舗計算（Cron実行時のみ）
      const { data: stores } = await supabaseAdmin
        .from('stores')
        .select('id')

      for (const store of stores || []) {
        const { data: casts } = await supabaseAdmin
          .from('casts')
          .select('id, name')
          .eq('store_id', store.id)
          .eq('is_active', true)

        for (const cast of casts || []) {
          const result = await calculatePayslipForCast(store.id, cast, month)
          if (result.success) {
            totalProcessed++
          } else {
            totalErrors++
            console.error(`Payslip error for cast ${cast.id}:`, result.error)
          }
        }
      }
    } else {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      processed: totalProcessed,
      errors: totalErrors,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Payslip recalculate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
