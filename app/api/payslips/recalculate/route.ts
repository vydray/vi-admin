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
    back_ratio: number | null
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

    // 日別統計データを取得（推し小計・伝票小計の両方）
    const { data: dailyStats } = await supabaseAdmin
      .from('cast_daily_stats')
      .select('date, work_hours, wage_amount, total_sales_item_based, total_sales_receipt_based')
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

    // 勤怠ステータスを取得（出勤控除の計算用）
    const { data: attendanceStatuses } = await supabaseAdmin
      .from('attendance_statuses')
      .select('id, is_active')
      .eq('store_id', storeId)

    // 出勤扱いのステータスIDセット（is_active=trueが出勤扱い）
    const workDayStatusIds = new Set(
      (attendanceStatuses || [])
        .filter(s => s.is_active)
        .map(s => s.id)
    )

    // 報酬設定を取得（年月指定 → 直近の設定 → デフォルト設定の順で探す）
    const targetYear = month.getFullYear()
    const targetMonth = month.getMonth() + 1

    // 1. 指定年月の設定を探す
    let { data: compensationSettings } = await supabaseAdmin
      .from('compensation_settings')
      .select('enabled_deduction_ids, compensation_types, payment_selection_method, selected_compensation_type_id, store_id, target_year, target_month, status_id, hourly_wage_override')
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
        .select('enabled_deduction_ids, compensation_types, payment_selection_method, selected_compensation_type_id, store_id, target_year, target_month, status_id, hourly_wage_override')
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
        .select('enabled_deduction_ids, compensation_types, payment_selection_method, selected_compensation_type_id, store_id, target_year, target_month, status_id, hourly_wage_override')
        .eq('cast_id', cast.id)
        .eq('store_id', storeId)
        .is('target_year', null)
        .is('target_month', null)
        .eq('is_active', true)
        .maybeSingle()

      compensationSettings = defaultSettings
    }

    // 時給ステータスを取得
    let statusHourlyWage = 0
    if (compensationSettings?.status_id) {
      const { data: wageStatus } = await supabaseAdmin
        .from('wage_statuses')
        .select('hourly_wage')
        .eq('id', compensationSettings.status_id)
        .single()
      statusHourlyWage = wageStatus?.hourly_wage || 0
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
      .select('category, product_name, back_type, back_ratio, back_fixed_amount, self_back_ratio, help_back_ratio, source')
      .eq('cast_id', cast.id)
      .eq('store_id', storeId)
      .eq('is_active', true)

    // ===== cast_daily_itemsの商品バックを更新 =====
    // 1. cast_id = cast.id のレコード（推しとして）→ self_back_rate, self_back_amount を更新
    const { data: selfItems } = await supabaseAdmin
      .from('cast_daily_items')
      .select('id, product_name, category, self_sales')
      .eq('cast_id', cast.id)
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)

    // 2. help_cast_id = cast.id のレコード（ヘルプとして）→ help_back_rate, help_back_amount を更新
    const { data: helpItems } = await supabaseAdmin
      .from('cast_daily_items')
      .select('id, product_name, category, help_sales, self_sales, subtotal, cast_id')
      .eq('help_cast_id', cast.id)
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)

    // help_back_calculation_method を報酬設定から取得（compensation_types内の設定を参照）
    let helpBackCalcMethod = 'sales_based'
    if (compensationSettings?.compensation_types) {
      const compTypes = compensationSettings.compensation_types as Array<{ id: string; is_enabled?: boolean; help_back_calculation_method?: string }>
      // 選択された報酬形態または最初の有効な報酬形態から取得
      const selectedTypeId = compensationSettings.selected_compensation_type_id
      const targetType = selectedTypeId
        ? compTypes.find(t => t.id === selectedTypeId)
        : compTypes.find(t => t.is_enabled !== false)
      if (targetType?.help_back_calculation_method) {
        helpBackCalcMethod = targetType.help_back_calculation_method
      }
    }

    // バック率を取得するヘルパー関数（商品名 → カテゴリ → 全体の優先順位）
    const getBackRate = (productName: string, category: string | null): number => {
      if (!backRates || backRates.length === 0) return 0

      // 1. 商品名+カテゴリ完全一致
      let matched = backRates.find(r => r.product_name === productName && r.category === category)
      // 2. 商品名のみ一致
      if (!matched) {
        matched = backRates.find(r => r.product_name === productName && (r.category === null || r.source === 'all'))
      }
      // 3. カテゴリのみ一致
      if (!matched && category) {
        matched = backRates.find(r => r.category === category && (r.product_name === null || r.product_name === ''))
      }
      if (!matched) return 0

      return matched.self_back_ratio ?? matched.back_ratio ?? 0
    }

    // ヘルプバック率を取得（推しキャストのバック設定からhelp_back_ratioを使う）
    const getHelpBackRateFromSelfCast = async (selfCastId: number, productName: string, category: string | null): Promise<number> => {
      // 推しキャストのバック設定を取得
      const { data: selfCastBackRates } = await supabaseAdmin
        .from('cast_back_rates')
        .select('product_name, category, help_back_ratio, back_ratio, source')
        .eq('cast_id', selfCastId)
        .eq('store_id', storeId)
        .eq('is_active', true)

      if (!selfCastBackRates || selfCastBackRates.length === 0) return 0

      // 1. 商品名+カテゴリ完全一致
      let matched = selfCastBackRates.find(r => r.product_name === productName && r.category === category)
      // 2. 商品名のみ一致
      if (!matched) {
        matched = selfCastBackRates.find(r => r.product_name === productName && (r.category === null || r.source === 'all'))
      }
      // 3. カテゴリのみ一致
      if (!matched && category) {
        matched = selfCastBackRates.find(r => r.category === category && (r.product_name === null || r.product_name === ''))
      }
      if (!matched) return 0

      return matched.help_back_ratio ?? 0
    }

    // 推しとしてのバック更新
    for (const item of selfItems || []) {
      const backRate = getBackRate(item.product_name, item.category)
      const backAmount = Math.floor((item.self_sales || 0) * backRate / 100)

      await supabaseAdmin
        .from('cast_daily_items')
        .update({
          self_back_rate: backRate,
          self_back_amount: backAmount
        })
        .eq('id', item.id)
    }

    // ヘルプとしてのバック更新
    for (const item of helpItems || []) {
      const helpBackRate = await getHelpBackRateFromSelfCast(item.cast_id, item.product_name, item.category)

      // help_back_calculation_methodに基づいて計算ベースを決定
      let baseAmount: number
      switch (helpBackCalcMethod) {
        case 'full_amount':
          // 商品全額: subtotal × rate
          baseAmount = item.subtotal || 0
          break
        case 'distributed_amount':
          // 分配額基準: self_sales × rate
          baseAmount = item.self_sales || 0
          break
        case 'sales_based':
        default:
          // 売上設定に従う: help_sales × rate
          baseAmount = item.help_sales || 0
          break
      }

      const helpBackAmount = Math.floor(baseAmount * helpBackRate / 100)

      await supabaseAdmin
        .from('cast_daily_items')
        .update({
          help_back_rate: helpBackRate,
          help_back_amount: helpBackAmount
        })
        .eq('id', item.id)
    }

    console.log(`[${cast.name}] cast_daily_items バック更新: self=${(selfItems || []).length}件, help=${(helpItems || []).length}件`)

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

    // POS商品のバック情報を取得するヘルパー関数
    const getPosBackInfo = (productName: string, category: string | null, isSelf: boolean): { type: 'ratio' | 'fixed'; rate: number; fixedAmount: number } | null => {
      if (!backRates || backRates.length === 0) return null

      // 優先順位: 1. 商品名+カテゴリ完全一致 → 2. 商品名のみ一致 → 3. カテゴリのみ一致
      let matchedRate = backRates.find(
        r => r.product_name === productName && r.category === category
      )
      if (!matchedRate) {
        matchedRate = backRates.find(
          r => r.product_name === productName && (r.category === null || r.source === 'all')
        )
      }
      if (!matchedRate && category) {
        matchedRate = backRates.find(
          r => r.category === category && (r.product_name === null || r.product_name === '')
        )
      }
      if (!matchedRate) return null

      // 自己売上かヘルプかでバック率を切り替え
      const rate = isSelf
        ? (matchedRate.self_back_ratio ?? matchedRate.back_ratio)
        : (matchedRate.help_back_ratio ?? matchedRate.back_ratio)

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

    // cast_daily_itemsから商品明細を取得（POS売上）
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
      dayData.totalSales += item.subtotal  // POS売上を追加

      // cast_back_ratesからバック情報を取得して計算
      const backInfo = getPosBackInfo(item.product_name, item.category, item.is_self)
      let calculatedBackAmount = item.back_amount || 0  // DBに値があればそれを使用
      let backRatio: number | null = null

      if (backInfo && calculatedBackAmount === 0) {
        // バック設定があり、DBにバック額がない場合は計算
        backRatio = backInfo.rate
        calculatedBackAmount = backInfo.type === 'fixed'
          ? backInfo.fixedAmount * item.quantity
          : Math.floor(item.subtotal * backInfo.rate / 100)
      }

      dayData.productBack += calculatedBackAmount

      // POS商品明細をitemsに追加（BASE商品と同じ構造）
      dayData.items.push({
        product_name: item.product_name,
        category: item.category || '',
        sales_type: item.is_self ? 'self' : 'help',
        quantity: item.quantity,
        subtotal: item.subtotal,
        back_ratio: backRatio,
        back_amount: calculatedBackAmount,
        is_base: false
      })
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

    // 時給を取得（優先順位: hourly_wage_override > status_idの時給）
    // ※報酬形態のhourly_rateは「時給を使うか」のフラグで、実際の時給額ではない
    const compensationTypes = compensationSettings?.compensation_types || []
    const effectiveHourlyRate = (compensationSettings as Record<string, unknown> | null)?.hourly_wage_override as number
      || statusHourlyWage

    // 時給収入を計算（cast_daily_statsのwage_amountが0の場合は計算する）
    const statsWageAmount = (dailyStats || []).reduce((sum, d) => sum + (d.wage_amount || 0), 0)
    const calculatedWageAmount = Math.round(totalWorkHours * effectiveHourlyRate)
    const totalWageAmount = statsWageAmount > 0 ? statsWageAmount : calculatedWageAmount

    console.log(`[${cast.name}] 時給計算: effectiveRate=${effectiveHourlyRate}, hours=${totalWorkHours}, statsWage=${statsWageAmount}, calcWage=${calculatedWageAmount}, totalWage=${totalWageAmount}`)

    // 推し小計と伝票小計の両方を集計（cast_daily_statsから）
    const totalSalesItemBased = (dailyStats || []).reduce((sum, d) => sum + (d.total_sales_item_based || 0), 0)
    const totalSalesReceiptBased = (dailyStats || []).reduce((sum, d) => sum + (d.total_sales_receipt_based || 0), 0)

    // 商品バックはdailySalesMapから（後方互換性のため）
    let totalProductBack = 0
    dailySalesMap.forEach(day => {
      totalProductBack += day.productBack
    })

    console.log(`[${cast.name}] totalSalesItemBased: ${totalSalesItemBased}, totalSalesReceiptBased: ${totalSalesReceiptBased}, totalProductBack: ${totalProductBack}`)

    // 売上バック計算
    let salesBack = 0
    const enabledDeductionIds = compensationSettings?.enabled_deduction_ids || []

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
      sales_aggregation?: 'item_based' | 'receipt_based'
    }
    // is_enabled でフィルター（undefinedは有効として扱う - 後方互換性）
    const enabledTypes = compensationTypes.filter((t: CompType) => t.is_enabled !== false)

    // 各報酬形態の報酬額を計算するヘルパー関数
    const calculateCompensationForType = (compType: CompType) => {
      const typeHourlyRate = Number(compType.hourly_rate) || 0
      const typeUseWage = typeHourlyRate > 0
      const typeFixedAmount = Number(compType.fixed_amount) || 0

      // 報酬形態のsales_aggregationに基づいて売上を選択
      const typeTotalSales = compType.sales_aggregation === 'receipt_based'
        ? totalSalesReceiptBased
        : totalSalesItemBased

      // 売上バック計算
      let typeSalesBack = 0
      if (compType.use_sliding_rate && compType.sliding_rates) {
        const rate = compType.sliding_rates.find(
          r => typeTotalSales >= r.min && (r.max === 0 || typeTotalSales <= r.max)
        )
        if (rate) {
          typeSalesBack = Math.round(typeTotalSales * rate.rate / 100)
        }
      } else if (compType.commission_rate > 0) {
        typeSalesBack = Math.round(typeTotalSales * compType.commission_rate / 100)
      }

      // 総報酬額（時給は hourly_rate > 0 の場合のみ含める）
      const typeGrossEarnings = (typeUseWage ? totalWageAmount : 0) + typeSalesBack + totalProductBack + typeFixedAmount

      return {
        compType,
        useWage: typeUseWage,
        fixedAmount: typeFixedAmount,
        salesBack: typeSalesBack,
        grossEarnings: typeGrossEarnings,
        totalSales: typeTotalSales
      }
    }

    // 全報酬形態の計算結果
    const allResults = enabledTypes.map(calculateCompensationForType)

    // 採用する報酬形態を決定
    let selectedResult: ReturnType<typeof calculateCompensationForType> | undefined = undefined

    if (compensationSettings?.payment_selection_method === 'specific' && compensationSettings?.selected_compensation_type_id) {
      // 特定の報酬形態を選択
      selectedResult = allResults.find(r => r.compType.id === compensationSettings.selected_compensation_type_id)
    } else if (allResults.length > 0) {
      // 最高額を選択
      selectedResult = allResults.reduce((best, current) =>
        current.grossEarnings > best.grossEarnings ? current : best
      )
    }

    // 選択された報酬形態の値を使用
    const activeCompType = selectedResult?.compType
    const useWageData = selectedResult?.useWage ?? false
    let fixedAmount = selectedResult?.fixedAmount ?? 0
    salesBack = selectedResult?.salesBack ?? 0
    const grossEarnings = selectedResult?.grossEarnings ?? (totalProductBack + fixedAmount)

    if (activeCompType) {
      console.log(`[${cast.name}] 採用報酬形態: ${activeCompType.name}, 時給使用: ${useWageData}, 売上バック: ${salesBack}, 固定額: ${fixedAmount}, 総報酬: ${grossEarnings}`)
    }

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

    // 出勤控除（1出勤あたり×出勤日数）
    for (const d of (deductionTypes || []).filter(d => d.type === 'per_attendance')) {
      if (enabledDeductionIds.length > 0 && !enabledDeductionIds.includes(d.id)) continue
      // 出勤扱いのステータスを持つ日数をカウント
      const workDayCount = (attendanceData || []).filter(a =>
        a.status_id && workDayStatusIds.has(a.status_id)
      ).length
      if (workDayCount > 0 && d.default_amount > 0) {
        deductions.push({
          name: d.name,
          type: 'per_attendance',
          count: workDayCount,
          amount: d.default_amount * workDayCount
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
      back_ratio: number | null
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
    // リクエストボディから store_id, year_month, cast_id を取得（手動実行時）
    let targetStoreId: number | null = null
    let targetYearMonth: string | null = null
    let targetCastId: number | null = null
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

      // cast_idのバリデーション（単一キャスト計算用）
      if (body.cast_id !== undefined) {
        if (typeof body.cast_id !== 'number' || body.cast_id <= 0) {
          return NextResponse.json({ error: 'Invalid cast_id: must be a positive number' }, { status: 400 })
        }
        targetCastId = body.cast_id
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
      // セッションのstore_idはアンダースコア形式
      if (session.role !== 'super_admin' && Number(session.store_id) !== Number(targetStoreId)) {
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

    if (targetCastId && targetStoreId) {
      // 単一キャスト計算（進捗表示用）
      const { data: cast } = await supabaseAdmin
        .from('casts')
        .select('id, name')
        .eq('id', targetCastId)
        .eq('store_id', targetStoreId)
        .single()

      if (cast) {
        const result = await calculatePayslipForCast(targetStoreId, cast, month)
        if (result.success) {
          totalProcessed++
        } else {
          totalErrors++
          console.error(`Payslip error for cast ${cast.id}:`, result.error)
        }
      } else {
        return NextResponse.json({ error: 'Cast not found' }, { status: 404 })
      }
    } else if (targetStoreId) {
      // 特定店舗の全キャスト計算（手動実行）
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
