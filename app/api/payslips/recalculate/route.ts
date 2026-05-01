import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { randomUUID } from 'crypto'
import { calculateCastSalesByPublishedMethod } from '@/lib/salesCalculation'
import { isYearMonthLocked } from '@/lib/payslipLockDate'
import { recalculateForDate } from '@/lib/recalculateSales'
import type { SalesSettings } from '@/types/database'

const TRACKED_FIELDS = ['gross_total', 'hourly_income', 'sales_back', 'product_back', 'fixed_amount', 'per_attendance_income', 'bonus_total', 'total_deduction', 'daily_payment', 'withholding_tax', 'other_deductions', 'net_payment'] as const

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
  total_sales_item_based?: number
  total_sales_receipt_based?: number
  product_back_item_based?: number
}

interface AttendanceData {
  date: string
  daily_payment: number
  late_minutes: number
  status_id: string | null
  check_in_datetime?: string | null
  check_out_datetime?: string | null
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
  selfBack: number
  helpBack: number
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
  month: Date,
  batchId: string,
  triggeredBy: 'manual' | 'cron'
): Promise<{ success: boolean; error?: string }> {
  try {
    const yearMonth = format(month, 'yyyy-MM')
    const startDate = format(startOfMonth(month), 'yyyy-MM-dd')
    const endDate = format(endOfMonth(month), 'yyyy-MM-dd')

    // ログ用に現在の値を取得
    const { data: existingPayslip } = await supabaseAdmin
      .from('payslips')
      .select('id, gross_total, hourly_income, sales_back, product_back, fixed_amount, per_attendance_income, bonus_total, total_deduction, daily_payment, withholding_tax, other_deductions, net_payment')
      .eq('cast_id', cast.id)
      .eq('store_id', storeId)
      .eq('year_month', yearMonth)
      .single()

    // cron は cutoff(翌月6日)以降スキップ。manual(手動再計算)は緊急修正用なので常に動く
    if (triggeredBy === 'cron' && isYearMonthLocked(yearMonth)) {
      return { success: true }
    }

    // 日別統計データを取得（推し小計・伝票小計の両方 + costume_id: 形態別wage計算用）
    const { data: dailyStats } = await supabaseAdmin
      .from('cast_daily_stats')
      .select('date, work_hours, wage_amount, total_sales_item_based, total_sales_receipt_based, product_back_item_based, costume_id')
      .eq('cast_id', cast.id)
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)

    // 勤怠データを取得（check_in/check_out_datetime を保存値に含めるため一緒に取得）
    const { data: attendanceData } = await supabaseAdmin
      .from('attendance')
      .select('date, daily_payment, late_minutes, status_id, check_in_datetime, check_out_datetime')
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

    // 賞与設定を取得
    const { data: bonusTypes } = await supabaseAdmin
      .from('bonus_types')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('display_order')

    // 手動賞与を取得
    const { data: castBonuses } = await supabaseAdmin
      .from('cast_bonuses')
      .select('*')
      .eq('store_id', storeId)
      .eq('cast_id', cast.id)
      .eq('year_month', yearMonth)

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
      .select('enabled_deduction_ids, enabled_bonus_ids, compensation_types, payment_selection_method, selected_compensation_type_id, store_id, target_year, target_month, status_id, hourly_wage_override')
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
        .select('enabled_deduction_ids, enabled_bonus_ids, compensation_types, payment_selection_method, selected_compensation_type_id, store_id, target_year, target_month, status_id, hourly_wage_override')
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
        .select('enabled_deduction_ids, enabled_bonus_ids, compensation_types, payment_selection_method, selected_compensation_type_id, store_id, target_year, target_month, status_id, hourly_wage_override')
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
    // 注: バック額のUPDATE後にもう一度refetchするため let で受ける
    let { data: dailyItems } = await supabaseAdmin
      .from('cast_daily_items')
      .select('date, category, product_name, quantity, subtotal, self_back_amount, help_back_amount, is_self, help_cast_id')
      .eq('cast_id', cast.id)
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)

    // BASE注文は cast_daily_items テーブルに category='BASE' で取り込まれているため
    // 個別の base_orders SELECT は不要（dailyItems 経由で同じデータを参照）

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
    // 注: バック額のUPDATE後にもう一度refetchするため let で受ける
    let { data: helpItems } = await supabaseAdmin
      .from('cast_daily_items')
      .select('id, date, product_name, category, help_sales, self_sales, subtotal, cast_id, quantity, help_back_amount')
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
          // 分配額基準: self_sales × rate（フリー卓でself_sales=0の場合はsubtotal/2）
          baseAmount = (item.self_sales || 0) > 0
            ? item.self_sales
            : Math.floor((item.subtotal || 0) / 2)
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

    // バック額UPDATE後の最新値を再取得（dailyItems と helpItems のメモリ内値は古いため）
    // これをしないと dailySalesMap / totalSelfBack / totalHelpBack が UPDATE 前の値を参照してドリフトする
    const refetchedDaily = await supabaseAdmin
      .from('cast_daily_items')
      .select('date, category, product_name, quantity, subtotal, self_back_amount, help_back_amount, is_self, help_cast_id')
      .eq('cast_id', cast.id)
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)
    dailyItems = refetchedDaily.data
    const refetchedHelp = await supabaseAdmin
      .from('cast_daily_items')
      .select('id, date, product_name, category, help_sales, self_sales, subtotal, cast_id, quantity, help_back_amount')
      .eq('help_cast_id', cast.id)
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)
    helpItems = refetchedHelp.data

    // 売上設定を取得（全フィールド）
    const { data: salesSettings } = await supabaseAdmin
      .from('sales_settings')
      .select('*')
      .eq('store_id', storeId)
      .single()

    // 注文データを取得（売上計算用） - ページネーションで1000件制限を回避
    let orders: Array<{
      id: string
      staff_name: string | null
      order_date: string
      total_incl_tax: number | null
      order_items: Array<{
        id: number
        product_name: string
        category: string | null
        cast_name: string[] | null
        quantity: number
        unit_price: number
        subtotal: number
      }>
    }> = []
    {
      const pageSize = 1000
      let offset = 0
      while (true) {
        const { data: page, error: pageError } = await supabaseAdmin
          .from('orders')
          .select(`
            id,
            staff_name,
            order_date,
            total_incl_tax,
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
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1)
        if (pageError) {
          console.error('orders fetch error:', pageError)
          break
        }
        if (!page || page.length === 0) break
        orders = orders.concat(page as typeof orders)
        if (page.length < pageSize) break
        offset += pageSize
      }
    }

    // キャストリスト（売上計算用）
    const { data: allCasts } = await supabaseAdmin
      .from('casts')
      .select('id, name')
      .eq('store_id', storeId)
    const castList = (allCasts || []).map(c => ({ id: c.id, name: c.name }))

    // POS商品のバック情報を取得するヘルパー関数（BASEカテゴリも getPosBackInfo で扱う）
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
            selfBack: 0,
            helpBack: 0,
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
          selfBack: 0,
          helpBack: 0,
          items: []
        })
      }
      const dayData = dailySalesMap.get(item.date)!
      dayData.totalSales += item.subtotal  // POS売上を追加

      // バック額はUPDATE後の self_back_amount をそのまま使用（self_sales × rate で正規化済み）
      // is_self=false かつ self_sales=0 のテーブルヘルプ商品は self_back_amount=0 が正しい
      // → ここでフォールバック計算（subtotal × rate）すると水増しになるためDB値のみ採用
      const calculatedBackAmount = item.self_back_amount || 0
      const backInfo = getPosBackInfo(item.product_name, item.category, item.is_self)
      const backRatio = backInfo?.rate ?? null

      dayData.productBack += calculatedBackAmount
      dayData.selfBack += calculatedBackAmount

      // POS商品明細をitemsに追加（BASE商品も cast_daily_items に取り込まれているのでここで処理）
      dayData.items.push({
        product_name: item.product_name,
        category: item.category || '',
        sales_type: item.is_self ? 'self' : 'help',
        quantity: item.quantity,
        subtotal: item.subtotal,
        back_ratio: backRatio,
        back_amount: calculatedBackAmount,
        is_base: item.category === 'BASE'
      })
    }

    // ヘルプとしての商品明細をdailySalesMapに追加
    for (const item of helpItems || []) {
      if (!item.date) continue
      if (!dailySalesMap.has(item.date)) {
        dailySalesMap.set(item.date, {
          date: item.date,
          totalSales: 0,
          productBack: 0,
          selfBack: 0,
          helpBack: 0,
          items: []
        })
      }
      const dayData = dailySalesMap.get(item.date)!
      const helpBackAmount = item.help_back_amount || 0
      dayData.productBack += helpBackAmount
      dayData.helpBack += helpBackAmount
      dayData.items.push({
        product_name: item.product_name,
        category: item.category || '',
        sales_type: 'help',
        quantity: item.quantity || 1,
        subtotal: item.help_sales || 0,
        back_ratio: null,
        back_amount: helpBackAmount,
        is_base: false
      })
    }

    // BASE注文は cast_daily_items に取り込まれているので上の dailyItems ループで処理済み。
    // 以前はここで base_orders から直接バックを再計算して dailySalesMap に追加していたが、
    // cast_daily_items 経路と二重カウントになり product_back_details 合計が水増しされていたため削除。
    // payslips.product_back は cast_daily_items.self_back_amount の合計から作られるので変化なし。

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

    // 商品バックはcast_daily_itemsから計算（報酬明細ページと同じソース: self_back_amount + help_back_amount）
    const totalSelfBack = (dailyItems || []).reduce((sum, item) => sum + (item.self_back_amount || 0), 0)
    const totalHelpBack = (helpItems || []).reduce((sum, item) => sum + (item.help_back_amount || 0), 0)
    const totalProductBack = totalSelfBack + totalHelpBack

    console.log(`[${cast.name}] totalSalesItemBased: ${totalSalesItemBased}, totalSalesReceiptBased: ${totalSalesReceiptBased}, totalProductBack: ${totalProductBack}`)

    // 売上バック計算
    let salesBack = 0
    // null = 未設定（全控除適用、後方互換）, [] = 全控除無効, [1,2,3] = 指定控除のみ
    const enabledDeductionIds = compensationSettings?.enabled_deduction_ids ?? null

    // アクティブな報酬タイプを取得
    type CompType = {
      id: string
      name: string
      commission_rate: number
      fixed_amount: number
      per_attendance_amount?: number
      hourly_rate: number
      use_sliding_rate: boolean
      sliding_rates: { min: number; max: number; rate: number }[] | null
      is_enabled: boolean
      sales_aggregation?: 'item_based' | 'receipt_based'
      use_product_back?: boolean
      use_help_product_back?: boolean
      sales_calculation_settings?: {
        exclude_service_charge?: boolean
        exclude_consumption_tax?: boolean
        use_tax_excluded?: boolean
        help_distribution_method?: string
        multi_cast_distribution?: string
        [key: string]: unknown
      }
    }
    // is_enabled でフィルター（undefinedは有効として扱う - 後方互換性）
    const enabledTypes = compensationTypes.filter((t: CompType) => t.is_enabled !== false)

    // サービス料率を取得（税込み＋サービス料の計算用）
    let serviceFeeRate = 0.2 // デフォルト20%
    const hasServiceChargeType = enabledTypes.some((t: CompType) => t.sales_calculation_settings?.exclude_service_charge === true)
    if (hasServiceChargeType) {
      const { data: sysSettings } = await supabaseAdmin
        .from('system_settings')
        .select('setting_key, setting_value')
        .eq('store_id', storeId)
      if (sysSettings) {
        const row = sysSettings.find((r: { setting_key: string }) => r.setting_key === 'service_fee_rate')
        if (row) serviceFeeRate = parseFloat(row.setting_value) / 100
      }
    }

    // 税込み＋サービス料の特殊売上計算（exclude_service_charge === true のとき）
    const specialSalesMap = new Map<string, number>()
    if (hasServiceChargeType) {
      const allCastNames = castList.map(c => c.name)
      for (const compType of enabledTypes) {
        const scs = compType.sales_calculation_settings
        if (scs?.exclude_service_charge !== true) continue

        const helpDistMethod = scs.help_distribution_method || 'all_to_nomination'

        // この推しの伝票を取得
        const castOrders = (orders || []).filter(o => {
          if (!o.staff_name) return false
          return o.staff_name === cast.name
        })

        let specialTotal = 0
        for (const order of castOrders) {
          let orderSales = (order as Record<string, unknown>).total_incl_tax as number || 0

          // 他キャスト名がついた商品を探す
          const helpItemsInOrder = (order.order_items || []).filter((item: { cast_name: string[] | null; subtotal: number }) => {
            if (!item.cast_name || item.cast_name.length === 0) return false
            return item.cast_name.some(cn => cn !== cast.name && allCastNames.includes(cn))
          })

          for (const helpItem of helpItemsInOrder) {
            // subtotal（税込み）にサービス料率をかける
            const helpAmount = helpItem.subtotal * (1 + serviceFeeRate)

            if (helpDistMethod === 'equal_per_person') {
              // 均等割: 推しとヘルプで半分ずつ → 半分を引く
              orderSales -= Math.floor(helpAmount / 2)
            } else if (helpDistMethod === 'equal_all') {
              // 均等割（全員頭数割り）: 推しとヘルプで半分ずつ
              orderSales -= Math.floor(helpAmount / 2)
            }
            // 'all_to_nomination': 全額推し → 引かない
          }

          specialTotal += Math.floor(orderSales)
        }

        // BASE売上を加算（cast_daily_itemsのBASEカテゴリ）
        for (const item of (dailyItems || [])) {
          if (item.category === 'BASE') {
            specialTotal += (item.subtotal || 0)
          }
        }

        specialSalesMap.set(compType.id, specialTotal)
        console.log(`[${cast.name}] 税込み＋サービス料計算: compType=${compType.name}, specialTotal=${specialTotal}`)
      }
    }

    // ========== 形態別 wage 計算用データを準備 ==========
    // 売上連動時給 / 保証時給のみ をサポートするため、ブラケット・保証レート・衣装クラスを取得
    // 設計: 「保証時給」と「売上連動」は独立した報酬形態なので、互いの自動スライド/フォールバックなし
    const hasUniformOrGuaranteed = enabledTypes.some((t: CompType) =>
      (t as { use_uniform_based_wage?: boolean }).use_uniform_based_wage === true ||
      (t as { use_guaranteed_wage_only?: boolean }).use_guaranteed_wage_only === true
    )

    const uniformClassMap = new Map<number, string>()
    const wageBrackets: { bracket_min: number; bracket_max: number | null; rates: Record<string, number> }[] = []
    let guaranteedRates: Record<string, number> | null = null
    let guaranteedThresholdHours: number | null = null
    let guaranteedAfterMode: 'zero' | 'bracket' = 'zero'
    const cumulativeBeforeMap = new Map<string, number>() // date -> cumulative work_hours BEFORE that date

    if (hasUniformOrGuaranteed) {
      // 衣装マスタ
      const { data: uniformsData } = await supabaseAdmin
        .from('uniforms')
        .select('id, class_label')
        .eq('store_id', storeId)
        .eq('is_active', true)
      uniformsData?.forEach((u: { id: number; class_label: string | null }) => {
        if (u.class_label) uniformClassMap.set(u.id, u.class_label)
      })

      // 売上連動ブラケット
      const { data: bracketsData } = await supabaseAdmin
        .from('sales_based_wage_brackets')
        .select('bracket_min, bracket_max, rates, display_order')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
      bracketsData?.forEach((b: { bracket_min: number; bracket_max: number | null; rates: Record<string, number> }) => {
        wageBrackets.push({ bracket_min: b.bracket_min, bracket_max: b.bracket_max, rates: b.rates })
      })

      // 保証時給レート + 上限 + 超過後挙動
      const { data: storeWage } = await supabaseAdmin
        .from('store_wage_settings')
        .select('guaranteed_wage_threshold_hours, guaranteed_wage_rates, guaranteed_wage_after_threshold')
        .eq('store_id', storeId)
        .maybeSingle()
      if (storeWage?.guaranteed_wage_rates) {
        guaranteedRates = storeWage.guaranteed_wage_rates as Record<string, number>
        guaranteedThresholdHours = storeWage.guaranteed_wage_threshold_hours ?? null
        const afterCfg = storeWage.guaranteed_wage_after_threshold as { mode?: string } | null
        guaranteedAfterMode = afterCfg?.mode === 'bracket' ? 'bracket' : 'zero'
      }

      // 累計時間: このキャストの全期間（月跨ぎでも累計）
      if (guaranteedThresholdHours != null) {
        const { data: history } = await supabaseAdmin
          .from('cast_daily_stats')
          .select('date, work_hours')
          .eq('cast_id', cast.id)
          .eq('store_id', storeId)
          .order('date', { ascending: true })
        let runningTotal = 0
        ;(history || []).forEach((d: { date: string; work_hours: number | null }) => {
          cumulativeBeforeMap.set(d.date, runningTotal)
          runningTotal += Number(d.work_hours || 0)
        })
      }
    }

    // 形態×日 で wage を返すヘルパー（保証時給のみ / 売上連動 / 通常 を分岐）
    const computeWageForDay = (compType: CompType, day: { date: string; work_hours: number | null; costume_id: number | null }): number => {
      const hours = Number(day.work_hours || 0)
      if (hours <= 0) return 0
      const useGuaranteedOnly = (compType as { use_guaranteed_wage_only?: boolean }).use_guaranteed_wage_only === true
      const useUniformBased = (compType as { use_uniform_based_wage?: boolean }).use_uniform_based_wage === true

      if (useGuaranteedOnly) {
        if (!guaranteedRates || day.costume_id == null) return 0
        const cls = uniformClassMap.get(day.costume_id)
        if (!cls) return 0
        const guaranteedRate = guaranteedRates[cls] ?? 0

        // 上限なし → 全日保証レート
        if (guaranteedThresholdHours == null) {
          return Math.round(guaranteedRate * hours)
        }

        // 上限超過後の代替レート
        const computeAfterRate = (): number => {
          if (guaranteedAfterMode !== 'bracket') return 0
          const monthlyTotal = compType.sales_aggregation === 'receipt_based' ? totalSalesReceiptBased : totalSalesItemBased
          const bracket = wageBrackets.find(b =>
            monthlyTotal >= b.bracket_min && (b.bracket_max == null || monthlyTotal < b.bracket_max)
          )
          return bracket?.rates[cls] ?? 0
        }

        const cumBefore = cumulativeBeforeMap.get(day.date) ?? 0
        if (cumBefore >= guaranteedThresholdHours) {
          // 既に上限到達済み
          return Math.round(computeAfterRate() * hours)
        }
        const cumAfter = cumBefore + hours
        if (cumAfter <= guaranteedThresholdHours) {
          // まだ上限内
          return Math.round(guaranteedRate * hours)
        }
        // 境界日: 厳密分割
        const guaranteedHours = guaranteedThresholdHours - cumBefore
        const overHours = hours - guaranteedHours
        return Math.round(guaranteedRate * guaranteedHours + computeAfterRate() * overHours)
      }

      if (useUniformBased) {
        // 売上連動時給: ブラケット時給のみ（保証時給フォールバックなし、独立した報酬形態として比較）
        if (day.costume_id == null) return 0
        const cls = uniformClassMap.get(day.costume_id)
        if (!cls) return 0
        const monthlyTotal = compType.sales_aggregation === 'receipt_based' ? totalSalesReceiptBased : totalSalesItemBased
        const bracket = wageBrackets.find(b =>
          monthlyTotal >= b.bracket_min && (b.bracket_max == null || monthlyTotal < b.bracket_max)
        )
        const normalRate = bracket?.rates[cls] ?? 0
        return Math.round(normalRate * hours)
      }

      // 通常時給: cast_daily_stats.wage_amount にすでに hourly_rate × 時間 + bonuses が入っている
      // hourly_rate > 0 なら totalWageAmount から比例配分（厳密性を保つため day.wage_amount は使わない）
      // ただしこの分岐に来るのは hourly_rate > 0 のケースのみなので、簡易に hourly_rate × hours で OK
      const hourlyRate = Number(compType.hourly_rate) || 0
      if (hourlyRate <= 0) return 0
      return Math.round(hourlyRate * hours)
    }

    // 各報酬形態の報酬額を計算するヘルパー関数
    const calculateCompensationForType = (compType: CompType) => {
      const typeHourlyRate = Number(compType.hourly_rate) || 0
      const useGuaranteedOnly = (compType as { use_guaranteed_wage_only?: boolean }).use_guaranteed_wage_only === true
      const useUniformBased = (compType as { use_uniform_based_wage?: boolean }).use_uniform_based_wage === true
      const typeUseWage = typeHourlyRate > 0 || useGuaranteedOnly || useUniformBased
      const typeFixedAmount = Number(compType.fixed_amount) || 0
      const typePerAttendanceAmount = Number(compType.per_attendance_amount) || 0
      const typeWorkDays = (dailyStats || []).filter((s: { work_hours?: number }) => (s.work_hours || 0) > 0).length
      const typePerAttendanceIncome = typePerAttendanceAmount * typeWorkDays

      // 報酬形態のsales_aggregationに基づいて売上を選択
      // 税込み＋サービス料の特殊計算がある場合はそちらを優先
      const specialSales = specialSalesMap.get(compType.id)
      const typeTotalSales = specialSales !== undefined
        ? specialSales
        : (compType.sales_aggregation === 'receipt_based'
          ? totalSalesReceiptBased
          : totalSalesItemBased)

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

      // 商品バック（use_product_back フラグに基づく - 報酬明細ページと同じロジック）
      const typeProductBack = compType.use_product_back ? totalProductBack : 0

      // 形態別の wage_amount を計算
      // - 売上連動時給 / 保証時給のみ: per-day で動的計算（衣装・累計時間考慮）
      // - 通常 hourly_rate: cast_daily_stats.wage_amount を使用（bonuses 含む）
      let typeWageAmount = 0
      if (useGuaranteedOnly || useUniformBased) {
        typeWageAmount = (dailyStats || []).reduce((sum, d) => sum + computeWageForDay(compType, d as { date: string; work_hours: number | null; costume_id: number | null }), 0)
      } else if (typeHourlyRate > 0) {
        // 既存挙動: cast_daily_stats.wage_amount の合計（bonuses込み）を使用
        typeWageAmount = totalWageAmount
      }

      // 総報酬額
      const typeGrossEarnings = typeWageAmount + typeSalesBack + typeProductBack + typeFixedAmount + typePerAttendanceIncome

      return {
        compType,
        useWage: typeUseWage,
        fixedAmount: typeFixedAmount,
        perAttendanceIncome: typePerAttendanceIncome,
        salesBack: typeSalesBack,
        productBack: typeProductBack,
        wageAmount: typeWageAmount,
        grossEarnings: typeGrossEarnings,
        totalSales: typeTotalSales
      }
    }

    // 全報酬形態の計算結果
    const allResults = enabledTypes.map(calculateCompensationForType)

    // ===== 賞与計算（複合条件対応） =====
    // 採用判定で「賞与込みでスライド」するため、選択前にキャスト全体の賞与額を計算しておく
    // use_bonuses=false の形態が採用された場合は最終的にルールベース賞与を0扱いにする
    const enabledBonusIds = compensationSettings?.enabled_bonus_ids ?? null
    const ruleBonusDetails: Array<{ name: string; type: string; amount: number; detail: string }> = []
    const manualBonusDetails: Array<{ name: string; type: string; amount: number; detail: string }> = []

    // 指名（推し）伝票の事前取得
    // - nomination_tiered: 通常の guest_count 集計
    // - nomination_tiered + qualifying_product_ids: 該当商品が入っている伝票のみで集計
    let totalNominations = 0
    let castMonthOrdersForNomination: { guest_count: number | null; order_items: { product_name: string | null }[] }[] = []
    const needsNomination = (bonusTypes || []).some(bt => {
      const c = bt.conditions as { reward?: { type?: string } }
      return c.reward?.type === 'nomination_tiered'
    })
    if (needsNomination) {
      const monthStartTs = format(startOfMonth(month), "yyyy-MM-dd'T'00:00:00")
      const monthEndTs = format(endOfMonth(month), "yyyy-MM-dd'T'23:59:59")
      // ページネーションで1000件制限を回避
      // order_items テーブルには product_id カラムが無いため、product_name で照合する
      const pageSize = 1000
      let offset = 0
      while (true) {
        const { data: page, error: pageError } = await supabaseAdmin
          .from('orders')
          .select('guest_count, order_items(product_name)')
          .eq('store_id', storeId)
          .eq('staff_name', cast.name)
          .gte('order_date', monthStartTs)
          .lte('order_date', monthEndTs)
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1)
        if (pageError) {
          console.error('nomination orders fetch error:', pageError)
          break
        }
        if (!page || page.length === 0) break
        castMonthOrdersForNomination = castMonthOrdersForNomination.concat(page as unknown as typeof castMonthOrdersForNomination)
        if (page.length < pageSize) break
        offset += pageSize
      }
      totalNominations = castMonthOrdersForNomination.reduce((sum, o) => sum + (o.guest_count || 0), 0)
    }

    // VIP対象商品ID → 商品名 マッピング（qualifying_product_ids でフィルタする際に使用）
    // order_items は product_name しか持っていないため、bonus_types に保存された
    // product_id 配列を product_name 配列に変換しておく
    const qualifyingProductNamesByBonus = new Map<number, Set<string>>()
    if (needsNomination) {
      const allQualifyingIds = new Set<number>()
      for (const bt of bonusTypes || []) {
        const c = bt.conditions as { reward?: { type?: string; qualifying_product_ids?: number[] } }
        if (c.reward?.type === 'nomination_tiered' && c.reward.qualifying_product_ids) {
          for (const pid of c.reward.qualifying_product_ids) allQualifyingIds.add(pid)
        }
      }
      if (allQualifyingIds.size > 0) {
        const { data: matchedProducts } = await supabaseAdmin
          .from('products')
          .select('id, name')
          .eq('store_id', storeId)
          .in('id', [...allQualifyingIds])
        const idToName = new Map<number, string>()
        ;(matchedProducts || []).forEach(p => idToName.set(p.id, p.name))
        for (const bt of bonusTypes || []) {
          const c = bt.conditions as { reward?: { type?: string; qualifying_product_ids?: number[] } }
          if (c.reward?.type === 'nomination_tiered' && c.reward.qualifying_product_ids) {
            const names = new Set<string>()
            for (const pid of c.reward.qualifying_product_ids) {
              const name = idToName.get(pid)
              if (name) names.add(name)
            }
            qualifyingProductNamesByBonus.set(bt.id, names)
          }
        }
      }
    }

    // rank_based 報酬用: 店舗内の月間売上ランキングを計算（cast_daily_stats から）
    // sales_settings.published_aggregation に従って item_based / receipt_based を選択
    let castRankMap: Map<number, number> | null = null
    const needsRank = (bonusTypes || []).some(bt => {
      const c = bt.conditions as { reward?: { type?: string } }
      return c.reward?.type === 'rank_based'
    })
    if (needsRank) {
      const { data: salesSettingsForRank } = await supabaseAdmin
        .from('sales_settings')
        .select('published_aggregation')
        .eq('store_id', storeId)
        .maybeSingle()
      const publishedMethod = (salesSettingsForRank as { published_aggregation?: string } | null)?.published_aggregation ?? 'item_based'
      if (publishedMethod !== 'none') {
        const aggField = publishedMethod === 'receipt_based' ? 'total_sales_receipt_based' : 'total_sales_item_based'
        const { data: monthStats } = await supabaseAdmin
          .from('cast_daily_stats')
          .select(`cast_id, ${aggField}`)
          .eq('store_id', storeId)
          .gte('date', startDate)
          .lte('date', endDate)
        const castSalesMap = new Map<number, number>()
        ;(monthStats || []).forEach((s: Record<string, unknown>) => {
          const cid = s.cast_id as number
          const sales = (s[aggField] as number | null) ?? 0
          castSalesMap.set(cid, (castSalesMap.get(cid) ?? 0) + sales)
        })
        // 売上 DESC, 同点は cast_id ASC でタイブレーク
        const sortedCasts = [...castSalesMap.entries()].sort((a, b) => {
          if (b[1] !== a[1]) return b[1] - a[1]
          return a[0] - b[0]
        })
        castRankMap = new Map()
        sortedCasts.forEach(([castId], idx) => castRankMap!.set(castId, idx + 1))
      }
    }

    // シフト数・シフト日取得（attendance条件用）
    let totalShifts = 0
    let shiftDates: string[] = []
    const needsAttendance = (bonusTypes || []).some(bt => {
      const c = bt.conditions as { attendance?: unknown }
      return !!c.attendance
    })
    if (needsAttendance) {
      const { data: shiftData } = await supabaseAdmin
        .from('shifts')
        .select('date')
        .eq('store_id', storeId)
        .eq('cast_id', cast.id)
        .gte('date', startDate)
        .lte('date', endDate)
      shiftDates = (shiftData || []).map(s => s.date)
      totalShifts = shiftDates.length
    }

    const attendedDates = new Set((attendanceData || []).map(a => a.date))

    for (const bt of (bonusTypes || [])) {
      // enabled_bonus_ids フィルタ（null or 空配列 = 賞与なし）
      if (!enabledBonusIds || !enabledBonusIds.includes(bt.id)) continue

      const c = bt.conditions as {
        attendance?: { eligible_status_ids?: string[]; disqualify_status_ids?: string[]; require_all_shifts?: boolean; min_days?: number | null; min_hours_per_day?: number | null; min_total_hours?: number | null } | null
        reward?: {
          type?: string
          amount?: number
          tiers?: Array<{ min: number; max: number | null; amount: number }>
          rank_tiers?: Array<{ rank: number; amount: number }>
          sales_target?: string
          qualifying_product_ids?: number[]
        }
      }

      let allConditionsMet = true
      const detailParts: string[] = []
      let bonusWorkDays = 0

      // --- 出勤条件チェック ---
      if (c.attendance) {
        const att = c.attendance
        const eligibleIds = new Set(att.eligible_status_ids || [])
        const disqualifyIds = new Set(att.disqualify_status_ids || [])

        bonusWorkDays = (attendanceData || []).filter(a => a.status_id && eligibleIds.has(a.status_id)).length
        const hasDisqualify = (attendanceData || []).some(a => a.status_id && disqualifyIds.has(a.status_id))

        if (hasDisqualify) {
          allConditionsMet = false
        }
        if (att.require_all_shifts && totalShifts > 0 && bonusWorkDays < totalShifts) {
          allConditionsMet = false
        }
        if (att.min_days != null && bonusWorkDays < att.min_days) {
          allConditionsMet = false
        }
        if (att.min_hours_per_day != null) {
          const hasShortDay = (dailyStats || []).some((d: { work_hours?: number }) =>
            (d.work_hours || 0) > 0 && (d.work_hours || 0) < att.min_hours_per_day!
          )
          if (hasShortDay) allConditionsMet = false
        }
        if (att.min_total_hours != null && totalWorkHours < att.min_total_hours) {
          allConditionsMet = false
        }

        detailParts.push(`出勤${bonusWorkDays}日${hasDisqualify ? '/NG有' : ''}`)
      }

      // --- 報酬計算 ---
      if (allConditionsMet && c.reward) {
        let bonusAmount = 0

        if (c.reward.type === 'fixed') {
          bonusAmount = c.reward.amount || 0
        } else if (c.reward.type === 'per_attendance') {
          const days = bonusWorkDays || (attendanceData || []).length
          bonusAmount = days * (c.reward.amount || 0)
        } else if (c.reward.type === 'attendance_tiered' && c.reward.tiers) {
          // 出勤条件なしの場合は全出勤日数を使う
          const days = bonusWorkDays || (attendanceData || []).length
          const tier = [...c.reward.tiers].sort((a, b) => b.min - a.min).find(t => days >= t.min)
          if (tier) bonusAmount = tier.amount
        } else if (c.reward.type === 'sales_tiered' && c.reward.tiers) {
          const sales = c.reward.sales_target === 'receipt_based' ? totalSalesReceiptBased : totalSalesItemBased
          const tier = [...c.reward.tiers].sort((a, b) => b.min - a.min).find(t => sales >= t.min)
          if (tier) bonusAmount = tier.amount
        } else if (c.reward.type === 'nomination_tiered' && c.reward.tiers) {
          // qualifying_product_ids が指定されていれば、その商品が含まれる伝票のみで集計
          // order_items は product_name しか持っていないので、事前に変換した名前セットでフィルタする
          const qualifyingNames = qualifyingProductNamesByBonus.get(bt.id)
          let nominationCount: number
          if (qualifyingNames && qualifyingNames.size > 0) {
            nominationCount = castMonthOrdersForNomination
              .filter(o => (o.order_items || []).some(item => item.product_name != null && qualifyingNames.has(item.product_name)))
              .reduce((sum, o) => sum + (o.guest_count || 0), 0)
            detailParts.push(`対象指名${nominationCount}組(商品フィルタ)`)
          } else {
            nominationCount = totalNominations
            detailParts.push(`指名${nominationCount}組`)
          }
          const tier = [...c.reward.tiers].sort((a, b) => b.min - a.min).find(t => nominationCount >= t.min)
          if (tier) bonusAmount = tier.amount
        } else if (c.reward.type === 'rank_based' && c.reward.rank_tiers) {
          // 月間ランキングを参照して該当順位の amount を支給
          const myRank = castRankMap?.get(cast.id)
          if (myRank != null) {
            const tier = c.reward.rank_tiers.find(t => t.rank === myRank)
            if (tier) {
              bonusAmount = tier.amount
              detailParts.push(`月間${myRank}位`)
            } else {
              detailParts.push(`月間${myRank}位(対象外)`)
            }
          }
        }

        if (bonusAmount > 0) {
          ruleBonusDetails.push({
            name: bt.name,
            type: bt.bonus_category,
            amount: bonusAmount,
            detail: detailParts.join(' / ') + ` → ¥${bonusAmount.toLocaleString()}`
          })
        }
      }
    }

    // 手動賞与を追加（use_bonuses の影響を受けない）
    for (const cb of (castBonuses || [])) {
      manualBonusDetails.push({ name: cb.name || '手動賞与', type: 'manual', amount: cb.amount, detail: cb.note || '' })
    }

    const ruleBonusTotal = ruleBonusDetails.reduce((sum, b) => sum + b.amount, 0)
    const manualBonusTotal = manualBonusDetails.reduce((sum, b) => sum + b.amount, 0)

    // ===== 採用する報酬形態を決定（賞与込みでスライド） =====
    // 各形態の use_bonuses を考慮: false ならルール賞与は0扱いで比較
    // 手動賞与は全形態に等しく加算されるので比較に影響しない（最終加算時に含める）
    const scoreForType = (r: ReturnType<typeof calculateCompensationForType>): number => {
      const useBonuses = (r.compType as { use_bonuses?: boolean }).use_bonuses !== false
      return r.grossEarnings + (useBonuses ? ruleBonusTotal : 0)
    }

    let selectedResult: ReturnType<typeof calculateCompensationForType> | undefined = undefined

    if (compensationSettings?.payment_selection_method === 'specific' && compensationSettings?.selected_compensation_type_id) {
      // 特定の報酬形態を選択
      selectedResult = allResults.find(r => r.compType.id === compensationSettings.selected_compensation_type_id)
    } else if (allResults.length > 0) {
      // 最高額（賞与込み）を選択
      selectedResult = allResults.reduce((best, current) =>
        scoreForType(current) > scoreForType(best) ? current : best
      )
    }

    // 選択された報酬形態の値を使用
    const activeCompType = selectedResult?.compType
    const useWageData = selectedResult?.useWage ?? false
    let fixedAmount = selectedResult?.fixedAmount ?? 0
    salesBack = selectedResult?.salesBack ?? 0
    const productBack = selectedResult?.productBack ?? totalProductBack
    // 採用形態の wage_amount（保証時給/売上連動/通常時給に応じて動的に決まる）
    const selectedWageAmount = selectedResult?.wageAmount ?? 0

    // 採用形態の use_bonuses に応じてルール賞与を実際に適用するか決定
    const bonusesEnabledByType = (activeCompType as { use_bonuses?: boolean } | undefined)?.use_bonuses !== false
    const bonusDetails = [
      ...(bonusesEnabledByType ? ruleBonusDetails : []),
      ...manualBonusDetails,
    ]
    const bonusTotal = bonusDetails.reduce((sum, b) => sum + b.amount, 0)

    let grossEarnings = (selectedResult?.grossEarnings ?? (totalProductBack + fixedAmount)) + bonusTotal

    if (activeCompType) {
      console.log(`[${cast.name}] 採用報酬形態: ${activeCompType.name}, 時給使用: ${useWageData}, 売上バック: ${salesBack}, 固定額: ${fixedAmount}, 賞与: ${bonusTotal} (use_bonuses=${bonusesEnabledByType}), 総報酬: ${grossEarnings}`)
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
      d => d.type === 'penalty_late' && (enabledDeductionIds === null || enabledDeductionIds.includes(d.id))
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
      if (enabledDeductionIds !== null && !enabledDeductionIds.includes(d.id)) continue
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
      if (enabledDeductionIds !== null && !enabledDeductionIds.includes(d.id)) continue
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
      if (enabledDeductionIds !== null && !enabledDeductionIds.includes(d.id)) continue
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
      if (enabledDeductionIds !== null && !enabledDeductionIds.includes(d.id)) continue
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

    // 日別詳細（フルスキーマで保存→画面側は動的計算ゼロで描画する想定）
    const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
    const dailyDetails = days
      .map(day => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const stats = (dailyStats || []).find(s => s.date === dateStr)
        const attendance = (attendanceData || []).find(a => a.date === dateStr)
        const sales = dailySalesMap.get(dateStr)

        let workTimeRange = ''
        if (attendance?.check_in_datetime && attendance?.check_out_datetime) {
          const checkIn = new Date(attendance.check_in_datetime)
          const checkOut = new Date(attendance.check_out_datetime)
          const pad = (n: number) => String(n).padStart(2, '0')
          // JST基準で表示（UTC→JST=+9h）
          const jstIn = new Date(checkIn.getTime() + 9 * 3600 * 1000)
          const jstOut = new Date(checkOut.getTime() + 9 * 3600 * 1000)
          workTimeRange = `${pad(jstIn.getUTCHours())}:${pad(jstIn.getUTCMinutes())}〜${pad(jstOut.getUTCHours())}:${pad(jstOut.getUTCMinutes())}`
        }

        return {
          date: dateStr,
          hours: stats?.work_hours || 0,
          hourly_wage: stats?.work_hours ? Math.round((stats?.wage_amount || 0) / stats.work_hours) : 0,
          hourly_income: stats?.wage_amount || 0,
          sales: sales?.totalSales || 0,
          sales_item_based: stats?.total_sales_item_based ?? sales?.totalSales ?? 0,
          sales_receipt_based: stats?.total_sales_receipt_based ?? sales?.totalSales ?? 0,
          // sales_service_charge は別計算が必要(exclude_service_charge使用時のみ) → 未保存。画面側でフォールバック計算する
          back: sales?.productBack || 0,
          self_back: sales?.selfBack || 0,
          help_back: sales?.helpBack || 0,
          work_time_range: workTimeRange,
          daily_payment: attendance?.daily_payment || 0,
          late_minutes: attendance?.late_minutes || 0,
        }
      })
      .filter(d =>
        // 出勤あり、または売上・バック・日払い・遅刻のいずれかがある日を含める
        // (シフト外日のBASE売上等を含めるため hours=0 でも sales/back > 0 なら表示)
        d.hours > 0 ||
        d.sales > 0 ||
        d.back > 0 ||
        d.daily_payment > 0 ||
        d.late_minutes > 0
      )

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

    // 控除内訳から表示用カラムへの分解(報酬明細一覧でカラム別に表示するため固定保存)
    const dailyPaymentAmount = deductions
      .filter(d => d.type === 'daily_payment')
      .reduce((sum, d) => sum + d.amount, 0)
    const withholdingTaxAmount = deductions
      .filter(d => d.type === 'percentage')
      .reduce((sum, d) => sum + d.amount, 0)
    const otherDeductionsAmount = totalDeduction - dailyPaymentAmount - withholdingTaxAmount

    // 出勤報酬は採用された報酬形態の per_attendance_amount × 出勤日数
    const perAttendanceIncomeAmount = selectedResult?.perAttendanceIncome ?? 0

    // 全報酬形態の計算結果を保存(ロック後の比較表示用)
    // bonus_amount = この形態が採用された場合に加算される賞与（ルール+手動）。
    //   use_bonuses=false ならルール賞与は0、手動賞与は常に加算。
    //   シフトアプリ等の当月動的判定で「賞与込みスライド」を再現するために保持
    const compensationBreakdown = allResults.map(r => {
      const typeUseBonuses = (r.compType as { use_bonuses?: boolean }).use_bonuses !== false
      const typeBonusAmount = (typeUseBonuses ? ruleBonusTotal : 0) + manualBonusTotal
      return {
        id: r.compType.id,
        name: r.compType.name,
        use_wage: r.useWage,
        // 形態ごとの時給収入（保証時給のみ/売上連動/通常時給で計算ロジックが異なる）
        hourly_income: r.useWage ? r.wageAmount : 0,
        sales_back: r.salesBack,
        product_back: r.productBack,
        fixed_amount: r.fixedAmount,
        per_attendance_income: r.perAttendanceIncome,
        total_sales: r.totalSales,
        gross_earnings: r.grossEarnings,
        use_bonuses: typeUseBonuses,
        bonus_amount: typeBonusAmount,
        gross_with_bonus: r.grossEarnings + typeBonusAmount,
        is_selected: selectedResult?.compType.id === r.compType.id,
      }
    })

    // payslipsテーブルに保存
    const payslipData = {
      cast_id: cast.id,
      store_id: storeId,
      year_month: yearMonth,
      status: 'draft',
      work_days: workDays,
      total_hours: Math.round(totalWorkHours * 100) / 100,
      average_hourly_wage: useWageData && totalWorkHours > 0 ? Math.round(selectedWageAmount / totalWorkHours) : 0,
      hourly_income: useWageData ? selectedWageAmount : 0,
      sales_back: salesBack,
      product_back: productBack,
      fixed_amount: fixedAmount,
      per_attendance_income: perAttendanceIncomeAmount,
      gross_total: grossEarnings,
      daily_payment: dailyPaymentAmount,
      withholding_tax: withholdingTaxAmount,
      other_deductions: otherDeductionsAmount,
      total_deduction: totalDeduction,
      net_payment: netEarnings,
      daily_details: dailyDetails,
      product_back_details: productBackDetails,
      deduction_details: deductions,
      bonus_total: bonusTotal,
      bonus_details: bonusDetails,
      compensation_breakdown: compensationBreakdown,
    }

    const { error } = await supabaseAdmin
      .from('payslips')
      .upsert(payslipData, { onConflict: 'cast_id,store_id,year_month' })

    if (error) {
      console.error('Payslip upsert error:', error)
      return { success: false, error: 'Failed to save payslip' }
    }

    // ===== payslip_daily_orders 構築・保存 =====
    // shift-app/vi-admin の伝票単位 表示用 snapshot
    // payslips.* と同じく recalc 時点の値で固定保存し、ロック後は触らない
    try {
      const aggregation = (selectedResult?.compType as { sales_aggregation?: string })?.sales_aggregation === 'receipt_based'
        ? 'receipt_based' as const
        : 'item_based' as const

      // 月内の関連 cast_daily_items を全件取得（推し or ヘルプ で関わってる行）
      const { data: pdoSourceItems, error: pdoSrcErr } = await supabaseAdmin
        .from('cast_daily_items')
        .select(`
          date, order_id, table_number, guest_name,
          cast_id, help_cast_id, is_self,
          category, product_name, quantity, subtotal,
          self_sales, help_sales,
          self_sales_item_based, self_sales_receipt_based,
          self_back_amount, help_back_amount,
          self_back_rate, help_back_rate
        `)
        .eq('store_id', storeId)
        .or(`cast_id.eq.${cast.id},help_cast_id.eq.${cast.id}`)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('order_id', { ascending: true })

      if (pdoSrcErr) {
        console.error(`[${cast.name}] payslip_daily_orders source fetch error:`, pdoSrcErr)
      } else {
        type SourceRow = {
          date: string
          order_id: string | null
          table_number: string | null
          guest_name: string | null
          cast_id: number
          help_cast_id: number | null
          is_self: boolean
          category: string | null
          product_name: string
          quantity: number
          subtotal: number
          self_sales: number
          help_sales: number
          self_sales_item_based: number | string | null
          self_sales_receipt_based: number | string | null
          self_back_amount: number | string | null
          help_back_amount: number | string | null
          self_back_rate: number | null
          help_back_rate: number | null
        }
        const rows = (pdoSourceItems || []) as SourceRow[]

        // 推しキャスト名 lookup（自分以外の推しの卓で ヘルプ参加してる場合に必要）
        const otherOshiIds = new Set<number>()
        for (const r of rows) {
          if (r.cast_id !== cast.id) otherOshiIds.add(r.cast_id)
        }
        const castNameById = new Map<number, string>()
        castNameById.set(cast.id, cast.name)
        if (otherOshiIds.size > 0) {
          const { data: otherCasts } = await supabaseAdmin
            .from('casts')
            .select('id, name')
            .in('id', [...otherOshiIds])
          for (const c of (otherCasts || [])) {
            castNameById.set(c.id, c.name as string)
          }
        }

        // 日次の wage / hours は既に取得済みの dailyStats から
        const statsByDate = new Map<string, { wage_amount: number; work_hours: number }>()
        for (const ds of (dailyStats || [])) {
          statsByDate.set(ds.date, {
            wage_amount: ds.wage_amount || 0,
            work_hours: ds.work_hours || 0,
          })
        }

        // 日付 → order_id → 行の集合 に group
        const byDate = new Map<string, Map<string, SourceRow[]>>()
        for (const row of rows) {
          if (!byDate.has(row.date)) byDate.set(row.date, new Map())
          const byOrder = byDate.get(row.date)!
          const orderKey = row.order_id || `__no_order_${row.date}`
          if (!byOrder.has(orderKey)) byOrder.set(orderKey, [])
          byOrder.get(orderKey)!.push(row)
        }

        // 出勤はあるが売上0の日も行を作るため、日付集合を統合
        const allDates = new Set<string>()
        for (const d of byDate.keys()) allDates.add(d)
        for (const ds of (dailyStats || [])) {
          if ((ds.work_hours || 0) > 0) allDates.add(ds.date)
        }

        // 各日のレコード組み立て
        const insertRows: Array<Record<string, unknown>> = []
        for (const date of allDates) {
          const byOrder = byDate.get(date) || new Map<string, SourceRow[]>()
          let selfSalesTotal = 0
          let helpSalesTotal = 0
          let selfBackTotal = 0
          let helpBackTotal = 0

          const orders: unknown[] = []
          for (const [, orderRows] of byOrder) {
            const first = orderRows[0]
            // この伝票でこのキャストが推し参加しているか
            const isSelfOnOrder = orderRows.some(r => r.cast_id === cast.id)
            const orderType: 'self' | 'help' = isSelfOnOrder ? 'self' : 'help'
            const oshiCastId = isSelfOnOrder ? cast.id : first.cast_id
            const oshiCastName = castNameById.get(oshiCastId) || ''

            // items[] 構築
            const items: unknown[] = []
            let orderTotalCredit = 0
            let orderTotalBack = 0
            for (const row of orderRows) {
              let credit = 0
              let back = 0
              let rate = 0
              if (row.cast_id === cast.id) {
                // 推しの行
                credit = aggregation === 'receipt_based'
                  ? Number(row.self_sales_receipt_based) || 0
                  : Number(row.self_sales_item_based) || 0
                back = Number(row.self_back_amount) || 0
                rate = row.self_back_rate || 0
                selfSalesTotal += credit
                selfBackTotal += back
              } else if (row.help_cast_id === cast.id) {
                // ヘルプの行
                credit = Number(row.help_sales) || 0
                back = Number(row.help_back_amount) || 0
                rate = row.help_back_rate || 0
                helpSalesTotal += credit
                helpBackTotal += back
              }
              orderTotalCredit += credit
              orderTotalBack += back

              const unitPrice = (row.quantity || 0) > 0
                ? Math.round((row.subtotal || 0) / row.quantity)
                : 0

              items.push({
                category: row.category || '',
                product_name: row.product_name,
                quantity: row.quantity,
                unit_price: unitPrice,
                subtotal: row.subtotal,
                credit,
                back_rate: rate,
                back_amount: back,
                is_base: row.category === 'BASE',
              })
            }

            orders.push({
              order_id: first.order_id,
              type: orderType,
              table_number: first.table_number,
              guest_name: first.guest_name,
              oshi_cast_id: oshiCastId,
              oshi_cast_name: oshiCastName,
              total_credit: orderTotalCredit,
              total_back: orderTotalBack,
              items,
            })
          }

          const stat = statsByDate.get(date) || { wage_amount: 0, work_hours: 0 }
          insertRows.push({
            store_id: storeId,
            cast_id: cast.id,
            year_month: yearMonth,
            date,
            self_sales_total: selfSalesTotal,
            help_sales_total: helpSalesTotal,
            self_back_total: selfBackTotal,
            help_back_total: helpBackTotal,
            wage_amount: stat.wage_amount,
            work_hours: stat.work_hours,
            orders,
          })
        }

        // この (cast, year_month) の既存行を一旦削除して新規 INSERT（差分なら DELETE はノーオプ）
        await supabaseAdmin
          .from('payslip_daily_orders')
          .delete()
          .eq('cast_id', cast.id)
          .eq('year_month', yearMonth)

        if (insertRows.length > 0) {
          const { error: insErr } = await supabaseAdmin
            .from('payslip_daily_orders')
            .insert(insertRows)
          if (insErr) {
            console.error(`[${cast.name}] payslip_daily_orders insert error:`, insErr)
          }
        }
      }
    } catch (e) {
      // payslip 本体は保存済みなので、daily_orders 失敗は warn ログだけ
      console.error(`[${cast.name}] payslip_daily_orders build error:`, e)
    }

    // 再計算ログを記録（既存payslipがある場合、差分の有無に関わらず全キャスト記録）
    if (existingPayslip) {
      try {
        const beforeValues: Record<string, number> = {}
        const afterValues: Record<string, number> = {}

        for (const field of TRACKED_FIELDS) {
          beforeValues[field] = (existingPayslip as Record<string, unknown>)[field] as number ?? 0
          afterValues[field] = (payslipData as Record<string, unknown>)[field] as number ?? 0
        }

        await supabaseAdmin.from('payslip_recalculation_logs').insert({
          batch_id: batchId,
          store_id: storeId,
          cast_id: cast.id,
          cast_name: cast.name,
          year_month: yearMonth,
          triggered_by: triggeredBy,
          before_values: beforeValues,
          after_values: afterValues,
        })
      } catch (logErr) {
        console.error('Failed to insert recalculation log:', logErr)
      }
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
    let clientBatchId: string | null = null
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

      // batch_id（フロントから共通batch_idを渡す場合）
      if (body.batch_id && typeof body.batch_id === 'string') {
        clientBatchId = body.batch_id
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

    const batchId = clientBatchId || randomUUID()
    const triggeredBy: 'manual' | 'cron' = isCron ? 'cron' : 'manual'

    let totalProcessed = 0
    let totalErrors = 0
    const failedCasts: { id: number; name: string; error: string }[] = []

    // 手動再計算時は cast_daily_stats を月内全日リフレッシュしてから集計する
    // （compensation_settings 等の設定変更後に過去日の wage_amount が古いままになるのを防ぐ）
    // - cron 時はスキップ（recalculate-sales cron が別途daily statsを更新済み）
    // - バッチ実行（batch_id 指定）ではフロント側で1回だけ事前リフレッシュする想定なのでスキップ
    //   （単一キャスト×42回呼ぶ「全キャスト再計算」で42回リフレッシュが走るのを回避）
    const skipRefresh = triggeredBy === 'cron' || !!clientBatchId
    const refreshDailyStatsForMonth = async (storeId: number) => {
      if (skipRefresh) return
      const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
      for (const d of days) {
        const dateStr = format(d, 'yyyy-MM-dd')
        await recalculateForDate(storeId, dateStr)
      }
    }

    if (targetCastId && targetStoreId) {
      // 単一キャスト計算（進捗表示用）
      const { data: cast } = await supabaseAdmin
        .from('casts')
        .select('id, name')
        .eq('id', targetCastId)
        .eq('store_id', targetStoreId)
        .single()

      if (cast) {
        await refreshDailyStatsForMonth(targetStoreId)
        const result = await calculatePayslipForCast(targetStoreId, cast, month, batchId, triggeredBy)
        if (result.success) {
          totalProcessed++
        } else {
          totalErrors++
          failedCasts.push({ id: cast.id, name: cast.name, error: result.error || 'Unknown error' })
          console.error(`Payslip error for cast ${cast.id} (${cast.name}):`, result.error)
        }
      } else {
        return NextResponse.json({ error: 'Cast not found' }, { status: 404 })
      }
    } else if (targetStoreId) {
      // 特定店舗の全キャスト計算（手動実行）
      // アクティブキャスト + payslipが存在する非アクティブキャスト
      const { data: activeCasts } = await supabaseAdmin
        .from('casts')
        .select('id, name')
        .eq('store_id', targetStoreId)
        .eq('is_active', true)

      const yearMonth = format(month, 'yyyy-MM')
      const { data: payslipCasts } = await supabaseAdmin
        .from('payslips')
        .select('cast_id, casts(id, name)')
        .eq('store_id', targetStoreId)
        .eq('year_month', yearMonth)

      const castMap = new Map<number, { id: number; name: string }>()
      for (const c of activeCasts || []) castMap.set(c.id, c)
      for (const p of payslipCasts || []) {
        const c = (p as Record<string, unknown>).casts as { id: number; name: string } | null
        if (c && !castMap.has(c.id)) castMap.set(c.id, c)
      }

      await refreshDailyStatsForMonth(targetStoreId)

      for (const cast of castMap.values()) {
        const result = await calculatePayslipForCast(targetStoreId, cast, month, batchId, triggeredBy)
        if (result.success) {
          totalProcessed++
        } else {
          totalErrors++
          failedCasts.push({ id: cast.id, name: cast.name, error: result.error || 'Unknown error' })
          console.error(`Payslip error for cast ${cast.id} (${cast.name}):`, result.error)
        }
      }
    } else if (isCron) {
      // 全店舗計算（Cron実行時のみ）
      const { data: stores } = await supabaseAdmin
        .from('stores')
        .select('id')

      for (const store of stores || []) {
        const { data: activeCasts } = await supabaseAdmin
          .from('casts')
          .select('id, name')
          .eq('store_id', store.id)
          .eq('is_active', true)

        const yearMonth = format(month, 'yyyy-MM')
        const { data: payslipCasts } = await supabaseAdmin
          .from('payslips')
          .select('cast_id, casts(id, name)')
          .eq('store_id', store.id)
          .eq('year_month', yearMonth)

        const castMap = new Map<number, { id: number; name: string }>()
        for (const c of activeCasts || []) castMap.set(c.id, c)
        for (const p of payslipCasts || []) {
          const c = (p as Record<string, unknown>).casts as { id: number; name: string } | null
          if (c && !castMap.has(c.id)) castMap.set(c.id, c)
        }

        for (const cast of castMap.values()) {
          const result = await calculatePayslipForCast(store.id, cast, month, batchId, triggeredBy)
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
      failedCasts: failedCasts.length > 0 ? failedCasts : undefined,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Payslip recalculate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
