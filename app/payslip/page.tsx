'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useStore } from '@/contexts/StoreContext'
import { SalesSettings, CompensationType, CastBackRate } from '@/types'
import { calculateCastSalesByPublishedMethod, getDefaultSalesSettings, applyRoundingNew } from '@/lib/salesCalculation'
import { exportToPDF } from '@/lib/pdfExport'
import LoadingSpinner from '@/components/LoadingSpinner'
import ProtectedPage from '@/components/ProtectedPage'

interface Cast {
  id: number
  name: string
  display_order: number | null
  status: string | null
}

interface DailyStats {
  date: string
  work_hours: number
  wage_amount: number
  total_sales_item_based: number
  product_back_item_based: number
  self_sales_item_based: number
  help_sales_item_based: number
}

interface AttendanceData {
  date: string
  daily_payment: number
  late_minutes: number
  status_id: string | null
  status: string | null
  check_in_datetime: string | null
  check_out_datetime: string | null
  break_minutes: number
}

interface DeductionType {
  id: number
  name: string
  type: 'percentage' | 'fixed' | 'penalty_status' | 'penalty_late' | 'daily_payment' | 'manual'
  percentage: number | null
  default_amount: number
  attendance_status_id: string | null
  penalty_amount: number
  is_active: boolean
}

interface LatePenaltyRule {
  id: number
  deduction_type_id: number
  calculation_type: 'fixed' | 'tiered' | 'cumulative'
  fixed_amount: number
  interval_minutes: number
  amount_per_interval: number
  max_amount: number
}

interface CompensationSettings {
  enabled_deduction_ids: number[]
  compensation_types: CompensationType[] | null
  payment_selection_method: 'highest' | 'specific'
  selected_compensation_type_id: string | null
}

interface OrderItemWithTax {
  id: number
  order_id: string
  product_name: string
  category: string | null
  cast_name: string[] | null  // 配列として保存されている
  quantity: number
  unit_price: number
  unit_price_excl_tax: number
  subtotal: number
  tax_amount: number
}

interface Order {
  id: string
  staff_name: string | null
  order_date: string
  order_items: OrderItemWithTax[]
}

interface DeductionResult {
  name: string
  amount: number
  count?: number
  detail?: string
}

interface SavedPayslip {
  id: number
  cast_id: number
  store_id: number
  year_month: string
  status: 'draft' | 'finalized'
  work_days: number
  total_hours: number
  average_hourly_wage: number
  hourly_income: number
  sales_back: number
  product_back: number
  fixed_amount: number
  gross_total: number
  total_deduction: number
  net_payment: number
  daily_details: Array<{
    date: string
    hours: number
    hourly_wage: number
    hourly_income: number
    sales: number
    back: number
    daily_payment: number
  }>
  product_back_details: Array<{
    product_name: string
    category: string | null
    sales_type: 'self' | 'help'
    quantity: number
    subtotal: number
    back_ratio: number
    back_amount: number
  }>
  deduction_details: Array<{
    name: string
    type: string
    count?: number
    percentage?: number
    amount: number
  }>
  finalized_at: string | null
  created_at: string
  updated_at: string
}

interface DailySalesData {
  date: string
  selfSales: number
  helpSales: number
  totalSales: number
  productBack: number
  items: ProductBackItem[]
}

interface ProductBackItem {
  orderId: string
  productName: string
  category: string | null
  quantity: number
  subtotal: number
  backRatio: number
  backAmount: number
  salesType: 'self' | 'help'
  isBase?: boolean  // BASE注文かどうか
}

export default function PayslipPage() {
  return (
    <ProtectedPage permissionKey="payslip">
      <PayslipPageContent />
    </ProtectedPage>
  )
}

function PayslipPageContent() {
  const { storeId, isLoading: storeLoading } = useStore()
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [casts, setCasts] = useState<Cast[]>([])
  const [selectedCastId, setSelectedCastId] = useState<number | null>(null)

  // 検索・フィルター
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('在籍')

  // フィルター済みキャスト一覧
  const filteredCasts = useMemo(() => {
    return casts.filter(cast => {
      if (statusFilter && cast.status !== statusFilter) return false
      if (searchText && !cast.name.toLowerCase().includes(searchText.toLowerCase())) return false
      return true
    })
  }, [casts, statusFilter, searchText])

  // Data
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([])
  const [attendanceData, setAttendanceData] = useState<AttendanceData[]>([])
  const [deductionTypes, setDeductionTypes] = useState<DeductionType[]>([])
  const [latePenaltyRules, setLatePenaltyRules] = useState<Map<number, LatePenaltyRule>>(new Map())
  const [compensationSettings, setCompensationSettings] = useState<CompensationSettings | null>(null)
  const compensationSettingsRef = useRef<CompensationSettings | null>(null)
  const [salesSettings, setSalesSettings] = useState<SalesSettings | null>(null)
  const [backRates, setBackRates] = useState<CastBackRate[]>([])
  const [dailySalesData, setDailySalesData] = useState<Map<string, DailySalesData>>(new Map())
  const [savedPayslip, setSavedPayslip] = useState<SavedPayslip | null>(null)
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [csvExporting, setCsvExporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const [selectedDayDetail, setSelectedDayDetail] = useState<string | null>(null) // 日別詳細モーダル用
  const [showDailyWageModal, setShowDailyWageModal] = useState(false) // 日別時給モーダル用
  const [selectedProductDetail, setSelectedProductDetail] = useState<{
    productName: string
    category: string | null
    salesType: 'self' | 'help'
  } | null>(null) // 商品別詳細モーダル用
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null) // 伝票詳細モーダル用
  const [orderDetail, setOrderDetail] = useState<{
    id: string
    receipt_number: string | null
    guest_name: string | null
    staff_name: string | null
    table_number: string | null
    order_date: string
    subtotal_excl_tax: number
    tax_amount: number
    service_charge: number
    total_incl_tax: number
    order_items: {
      id: number
      product_name: string
      category: string | null
      cast_name: string[] | null
      quantity: number
      unit_price: number
      subtotal: number
      tax_amount: number
    }[]
  } | null>(null)

  const currencyFormatter = useMemo(() => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0
    })
  }, [])

  // キャスト一覧を取得
  const loadCasts = useCallback(async () => {
    const { data, error } = await supabase
      .from('casts')
      .select('id, name, display_order, status')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name')

    if (error) {
      console.error('キャスト取得エラー:', error)
      return
    }
    setCasts(data || [])
    if (data && data.length > 0 && !selectedCastId) {
      setSelectedCastId(data[0].id)
    }
  }, [storeId, selectedCastId])

  // 控除設定を取得
  const loadDeductionSettings = useCallback(async () => {
    const { data: types } = await supabase
      .from('deduction_types')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('display_order')

    setDeductionTypes(types || [])

    if (types && types.length > 0) {
      const lateDeductionIds = types
        .filter(t => t.type === 'penalty_late')
        .map(t => t.id)

      if (lateDeductionIds.length > 0) {
        const { data: rules } = await supabase
          .from('late_penalty_rules')
          .select('*')
          .in('deduction_type_id', lateDeductionIds)

        if (rules) {
          const rulesMap = new Map<number, LatePenaltyRule>()
          rules.forEach(r => rulesMap.set(r.deduction_type_id, r))
          setLatePenaltyRules(rulesMap)
        }
      }
    }
  }, [storeId])

  // 売上設定を取得
  const loadSalesSettings = useCallback(async () => {
    const { data } = await supabase
      .from('sales_settings')
      .select('*')
      .eq('store_id', storeId)
      .maybeSingle()

    if (data) {
      setSalesSettings(data as SalesSettings)
    } else {
      const defaults = getDefaultSalesSettings(storeId)
      setSalesSettings({
        id: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...defaults,
      } as SalesSettings)
    }
  }, [storeId])

  // バック率設定を取得
  const loadBackRates = useCallback(async () => {
    const { data, error } = await supabase
      .from('cast_back_rates')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)

    if (error) {
      console.error('バック率取得エラー:', error)
    }
    setBackRates((data || []) as CastBackRate[])
  }, [storeId])

  // キャストの報酬設定を取得
  const loadCompensationSettings = useCallback(async (castId: number): Promise<CompensationSettings | null> => {
    const { data, error } = await supabase
      .from('compensation_settings')
      .select('enabled_deduction_ids, compensation_types, payment_selection_method, selected_compensation_type_id')
      .eq('cast_id', castId)
      .eq('store_id', storeId)
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('報酬設定取得エラー:', error.message, error.code)
    }

    const settings = error ? null : data
    setCompensationSettings(settings)
    compensationSettingsRef.current = settings
    return settings
  }, [storeId])

  // 日別統計データを取得
  const loadDailyStats = useCallback(async (castId: number, month: Date) => {
    const startDate = format(startOfMonth(month), 'yyyy-MM-dd')
    const endDate = format(endOfMonth(month), 'yyyy-MM-dd')

    const { data } = await supabase
      .from('cast_daily_stats')
      .select(`
        date,
        work_hours,
        wage_amount,
        total_sales_item_based,
        product_back_item_based,
        self_sales_item_based,
        help_sales_item_based
      `)
      .eq('cast_id', castId)
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    setDailyStats(data || [])
  }, [storeId])

  // 勤怠データを取得
  const loadAttendanceData = useCallback(async (castId: number, month: Date) => {
    const startDate = format(startOfMonth(month), 'yyyy-MM-dd')
    const endDate = format(endOfMonth(month), 'yyyy-MM-dd')

    const cast = casts.find(c => c.id === castId)
    if (!cast) return

    const { data } = await supabase
      .from('attendance')
      .select('date, daily_payment, late_minutes, status_id, status, check_in_datetime, check_out_datetime, break_minutes')
      .eq('store_id', storeId)
      .eq('cast_name', cast.name)
      .gte('date', startDate)
      .lte('date', endDate)

    setAttendanceData(data || [])
  }, [storeId, casts])

  // 保存済み報酬明細を取得
  const loadPayslip = useCallback(async (castId: number, month: Date) => {
    const yearMonth = format(month, 'yyyy-MM')

    const { data, error } = await supabase
      .from('payslips')
      .select('*')
      .eq('cast_id', castId)
      .eq('store_id', storeId)
      .eq('year_month', yearMonth)
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('報酬明細取得エラー:', error)
    }

    setSavedPayslip(error ? null : data as SavedPayslip)
  }, [storeId])

  // RoundingMethodをposition+typeに変換
  const parseRoundingMethod = useCallback((method: string): { position: number; type: 'floor' | 'ceil' | 'round' | 'none' } => {
    switch (method) {
      case 'floor_100': return { position: 100, type: 'floor' }
      case 'floor_10': return { position: 10, type: 'floor' }
      case 'floor_1': return { position: 1, type: 'floor' }
      case 'ceil_100': return { position: 100, type: 'ceil' }
      case 'ceil_10': return { position: 10, type: 'ceil' }
      case 'ceil_1': return { position: 1, type: 'ceil' }
      case 'round': return { position: 1, type: 'round' }
      case 'none':
      default: return { position: 1, type: 'none' }
    }
  }, [])

  // 商品バック情報を取得（cast_back_ratesに設定がある場合のみ）
  // SELF/HELP別のバック情報（type, rate, fixedAmount）を返す
  const getProductBackInfo = useCallback((
    castId: number,
    category: string | null,
    productName: string,
    salesType: 'self' | 'help'
  ): { type: 'ratio' | 'fixed'; rate: number; fixedAmount: number } | null => {
    if (backRates.length === 0) return null

    // キャストのバック率設定をフィルタ（is_activeはロード時に既にフィルタ済み）
    const castRates = backRates.filter(r => r.cast_id === castId)
    if (castRates.length === 0) return null

    // マッチする設定を探す
    let matchedRate: CastBackRate | undefined

    // 1. 商品名完全一致を探す
    matchedRate = castRates.find(
      r => r.product_name === productName && r.category === category
    )

    // 2. カテゴリ一致（商品名なし = null）を探す
    if (!matchedRate) {
      matchedRate = castRates.find(
        r => r.category === category && r.product_name === null
      )
    }

    // 3. 全カテゴリ対象（category=null, product_name=null）を探す
    if (!matchedRate) {
      matchedRate = castRates.find(
        r => r.category === null && r.product_name === null
      )
    }

    // 設定がない場合はnull（バックなし）
    if (!matchedRate) return null

    // SELF/HELP別のバック率を返す
    const rate = salesType === 'self'
      ? (matchedRate.self_back_ratio ?? matchedRate.back_ratio)
      : (matchedRate.help_back_ratio ?? matchedRate.back_ratio)

    return {
      type: matchedRate.back_type || 'ratio',
      rate,
      fixedAmount: matchedRate.back_fixed_amount || 0
    }
  }, [backRates])

  // 注文データから売上を計算
  const calculateSalesFromOrders = useCallback(async (castId: number, month: Date, compSettings: CompensationSettings | null) => {
    if (!salesSettings) return

    // 引数から報酬設定を使用（確実に最新の設定を使う）
    const currentCompSettings = compSettings

    // 有効な報酬形態を取得
    const types = (currentCompSettings?.compensation_types || []).filter(t => t.is_enabled)
    let currentCompensationType = types[0] || null
    if (currentCompSettings?.payment_selection_method === 'specific' && currentCompSettings?.selected_compensation_type_id) {
      currentCompensationType = types.find(t => t.id === currentCompSettings.selected_compensation_type_id) || currentCompensationType
    }

    // 商品バック設定（報酬形態から取得）
    const salesAggregation = currentCompensationType?.sales_aggregation ?? 'item_based'
    const useProductBack = currentCompensationType?.use_product_back ?? false
    const useHelpProductBack = currentCompensationType?.use_help_product_back ?? false
    const helpBackMethod = currentCompensationType?.help_back_calculation_method ?? 'sales_based'

    const startDate = format(startOfMonth(month), 'yyyy-MM-dd')
    const endDate = format(endOfMonth(month), 'yyyy-MM-dd')

    const cast = casts.find(c => c.id === castId)
    if (!cast) return

    // 注文データを取得
    const { data: orders } = await supabase
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
          unit_price_excl_tax,
          subtotal,
          tax_amount
        )
      `)
      .eq('store_id', storeId)
      .gte('order_date', startDate)
      .lte('order_date', endDate + 'T23:59:59')
      .is('deleted_at', null)

    // BASE注文を取得
    const { data: baseOrders } = await supabase
      .from('base_orders')
      .select('id, base_order_id, product_name, actual_price, quantity, business_date')
      .eq('store_id', storeId)
      .eq('cast_id', castId)
      .gte('business_date', startDate)
      .lte('business_date', endDate)

    // BASE注文を日別にグループ化
    const baseOrdersByDate = new Map<string, Array<{
      id: number
      base_order_id: string
      product_name: string
      actual_price: number | null
      quantity: number
      business_date: string | null
    }>>()

    baseOrders?.forEach(order => {
      if (order.business_date) {
        const existing = baseOrdersByDate.get(order.business_date) || []
        existing.push(order)
        baseOrdersByDate.set(order.business_date, existing)
      }
    })

    if ((!orders || orders.length === 0) && (!baseOrders || baseOrders.length === 0)) {
      setDailySalesData(new Map())
      return
    }

    // 日別に分解（order_dateベースで集計）
    const ordersByDate = new Map<string, Order[]>()
    orders?.forEach(order => {
      const dateStr = order.order_date?.split('T')[0]
      if (dateStr) {
        const existing = ordersByDate.get(dateStr) || []
        existing.push(order as Order)
        ordersByDate.set(dateStr, existing)
      }
    })

    // 全日付を取得（POS注文とBASE注文の両方の日付を含める）
    const allDates = new Set<string>()
    ordersByDate.forEach((_, dateStr) => allDates.add(dateStr))
    baseOrdersByDate.forEach((_, dateStr) => allDates.add(dateStr))

    // 日別に集計
    const dailyMap = new Map<string, DailySalesData>()
    const castList = casts.map(c => ({ id: c.id, name: c.name }))

    // 各日の売上を計算
    allDates.forEach(dateStr => {
      const dayOrders = ordersByDate.get(dateStr) || []
      const dayBaseOrders = baseOrdersByDate.get(dateStr) || []
      // 売上は公開設定に基づいて計算
      const publishedSales = calculateCastSalesByPublishedMethod(
        dayOrders,
        castList,
        salesSettings,
        0.1, // taxRate
        0    // serviceRate
      )

      const publishedResult = publishedSales.find(r => r.cast_id === castId)

      // 商品バックを独自計算（cast_back_ratesに設定がある商品のみ）
      let productBackTotal = 0
      const productBackItems: ProductBackItem[] = []

      // 商品バックが無効な場合、またはreceipt_basedモードの場合はスキップ
      // (商品バックはitem_basedモードでのみ計算)
      if (!useProductBack || salesAggregation !== 'item_based') {
        if (publishedResult) {
          dailyMap.set(dateStr, {
            date: dateStr,
            selfSales: publishedResult.self_sales || 0,
            helpSales: publishedResult.help_sales || 0,
            totalSales: publishedResult.total_sales || 0,
            productBack: 0,
            items: []
          })
        }
        return
      }

      // 端数処理設定を取得（商品単位の設定を使用）
      const excludeTax = salesSettings.item_exclude_consumption_tax ?? salesSettings.use_tax_excluded ?? false
      const excludeService = salesSettings.item_exclude_service_charge ?? false
      const serviceRate = 0.1 // サービス料率（10%）TODO: systemSettingsから取得
      const taxPercent = 10 // 消費税率（10%）TODO: systemSettingsから取得
      const roundingPosition = salesSettings.item_rounding_position ?? 100
      const roundingMethod = salesSettings.item_rounding_method ?? 'floor_100'
      const { type: roundingType } = parseRoundingMethod(roundingMethod)
      const roundingTiming = salesSettings.item_rounding_timing ?? 'per_item'
      const nominationDistributeAll = salesSettings.item_nomination_distribute_all ?? false

      // ヘルプ除外名リスト（フリー等）
      const nonHelpNames = salesSettings.non_help_staff_names || []

      dayOrders.forEach(order => {
        const orderStaffName = order.staff_name
        // staff_nameはカンマ区切りの場合がある（例: "あんり, にな"）
        const allNominations = orderStaffName ? orderStaffName.split(', ').map(n => n.trim()) : []

        // ヘルプ除外名を推しから除外（実在キャストの推しのみ残す）
        const realNominations = allNominations.filter(n => !nonHelpNames.includes(n))
        // 推しがヘルプ除外名のみの場合（フリーなど）
        const nominationIsNonHelpOnly = allNominations.length > 0 && realNominations.length === 0

        order.order_items.forEach(item => {
          // このキャストの商品のみ対象（cast_nameは配列）
          if (!item.cast_name || !item.cast_name.includes(cast.name)) return

          // 商品上の実キャスト（nonHelpNamesを除外）
          const castsOnItem = item.cast_name || []
          const realCastsOnItem = castsOnItem.filter(c => !nonHelpNames.includes(c))

          // 商品上の推しキャスト
          const nominationCastsOnItem = nominationIsNonHelpOnly
            ? realCastsOnItem
            : realCastsOnItem.filter(c => realNominations.includes(c))
          // 商品上のヘルプキャスト
          const helpCastsOnItem = nominationIsNonHelpOnly
            ? []
            : realCastsOnItem.filter(c => !realNominations.includes(c))

          // SELF/HELP判定
          // nominationIsNonHelpOnlyの場合（フリー推し等）は商品についてるキャスト全員がSELF
          // それ以外は、実推しに含まれていればSELF、含まれていなければHELP
          const salesType: 'self' | 'help' = nominationIsNonHelpOnly
            ? 'self'
            : (realNominations.includes(cast.name) ? 'self' : 'help')

          // ヘルプの場合、ヘルプバックが無効ならスキップ
          if (salesType === 'help' && !useHelpProductBack) {
            return
          }

          // バック情報を取得（SELF/HELP別）
          const backInfo = getProductBackInfo(castId, item.category, item.product_name, salesType)
          if (backInfo === null) return // 設定がない商品はスキップ

          // 金額計算（compensation-settingsと同じロジック）
          // 商品ごとの処理（per_itemの場合）は単価に対して適用
          let calcPrice = item.unit_price

          if (roundingTiming === 'per_item') {
            // 単価に対して税抜き・端数処理を適用
            if (excludeTax) {
              calcPrice = Math.floor(calcPrice * 100 / (100 + taxPercent))
            }
            calcPrice = applyRoundingNew(calcPrice, roundingPosition, roundingType)
            // サービス料を除外する場合
            if (excludeService && serviceRate > 0) {
              const servicePercent = Math.round(serviceRate * 100)
              const afterServicePrice = Math.floor(calcPrice * (100 + servicePercent) / 100)
              calcPrice = applyRoundingNew(afterServicePrice, roundingPosition, roundingType)
            }
          }

          const subtotal = calcPrice * item.quantity

          // バック金額計算（compensation-settingsと同じロジック）
          // item_multi_cast_distribution: 'all_equal'=ヘルプ商品も売上に含める, 'nomination_only'=推しのみ
          const salesAttribution = salesSettings.item_multi_cast_distribution ?? 'nomination_only'
          const helpDistMethod = salesSettings.item_help_distribution_method ?? 'all_to_nomination'
          const helpRatioSetting = salesSettings.item_help_ratio ?? 50

          const numHelpCasts = helpCastsOnItem.length
          const hasOrderNomination = realNominations.length > 0

          let baseForBack = subtotal

          if (salesAttribution === 'all_equal') {
            // ヘルプ商品も売上に含める → 分配計算が必要
            if (helpDistMethod === 'equal_per_person' || helpDistMethod === 'equal_all') {
              // 均等割: 全キャストで等分
              // nominationDistributeAllがtrueの場合、商品についていない推しも含める
              const shouldIncludeAllNominations = nominationDistributeAll || nominationCastsOnItem.length === 0
              const nominationsNotOnItem = realNominations.filter(n => !castsOnItem.includes(n))

              if (shouldIncludeAllNominations && !nominationIsNonHelpOnly && nominationsNotOnItem.length > 0) {
                // 全員（商品上 + 商品外の実推し）で計算
                const totalPeople = realCastsOnItem.length + nominationsNotOnItem.length
                baseForBack = totalPeople > 0 ? Math.floor(subtotal / totalPeople) : 0
              } else if (realCastsOnItem.length > 0) {
                // 商品上のキャストのみで計算
                baseForBack = Math.floor(subtotal / realCastsOnItem.length)
              } else {
                baseForBack = 0
              }
            } else if (helpDistMethod === 'equal') {
              // 推し・ヘルプで半分ずつ
              if (hasOrderNomination && numHelpCasts > 0) {
                if (salesType === 'self') {
                  const selfShare = Math.floor(subtotal / 2)
                  // nominationDistributeAllの場合は全推しで分配
                  const shouldIncludeAllNominations = nominationDistributeAll || nominationCastsOnItem.length === 0
                  if (shouldIncludeAllNominations && !nominationIsNonHelpOnly) {
                    baseForBack = realNominations.length > 0 ? Math.floor(selfShare / realNominations.length) : 0
                  } else {
                    baseForBack = nominationCastsOnItem.length > 0 ? Math.floor(selfShare / nominationCastsOnItem.length) : 0
                  }
                } else {
                  const helpShare = subtotal - Math.floor(subtotal / 2)
                  baseForBack = Math.floor(helpShare / numHelpCasts)
                }
              } else if (hasOrderNomination && numHelpCasts === 0) {
                // ヘルプがいない場合、推しが全額
                const shouldIncludeAllNominations = nominationDistributeAll || nominationCastsOnItem.length === 0
                if (shouldIncludeAllNominations && !nominationIsNonHelpOnly) {
                  baseForBack = realNominations.length > 0 ? Math.floor(subtotal / realNominations.length) : subtotal
                } else {
                  baseForBack = nominationCastsOnItem.length > 0 ? Math.floor(subtotal / nominationCastsOnItem.length) : subtotal
                }
              } else if (!hasOrderNomination && numHelpCasts > 0) {
                // 推しがいない場合、ヘルプが全額
                baseForBack = Math.floor(subtotal / numHelpCasts)
              } else {
                baseForBack = 0
              }
            } else if (helpDistMethod === 'ratio') {
              // 比率で分配（helpRatioSettingは推しの割合）
              if (hasOrderNomination && numHelpCasts > 0) {
                if (salesType === 'self') {
                  const selfShare = Math.floor(subtotal * helpRatioSetting / 100)
                  const shouldIncludeAllNominations = nominationDistributeAll || nominationCastsOnItem.length === 0
                  if (shouldIncludeAllNominations && !nominationIsNonHelpOnly) {
                    baseForBack = realNominations.length > 0 ? Math.floor(selfShare / realNominations.length) : 0
                  } else {
                    baseForBack = nominationCastsOnItem.length > 0 ? Math.floor(selfShare / nominationCastsOnItem.length) : 0
                  }
                } else {
                  const selfShare = Math.floor(subtotal * helpRatioSetting / 100)
                  const helpShare = subtotal - selfShare
                  baseForBack = Math.floor(helpShare / numHelpCasts)
                }
              } else if (hasOrderNomination && numHelpCasts === 0) {
                // ヘルプがいない場合、推しが全額
                const shouldIncludeAllNominations = nominationDistributeAll || nominationCastsOnItem.length === 0
                if (shouldIncludeAllNominations && !nominationIsNonHelpOnly) {
                  baseForBack = realNominations.length > 0 ? Math.floor(subtotal / realNominations.length) : subtotal
                } else {
                  baseForBack = nominationCastsOnItem.length > 0 ? Math.floor(subtotal / nominationCastsOnItem.length) : subtotal
                }
              } else if (!hasOrderNomination && numHelpCasts > 0) {
                // 推しがいない場合、ヘルプが全額
                baseForBack = Math.floor(subtotal / numHelpCasts)
              } else {
                baseForBack = 0
              }
            } else {
              // all_to_nomination: 全額推しに
              if (salesType === 'self') {
                const shouldIncludeAllNominations = nominationDistributeAll || nominationCastsOnItem.length === 0
                if (shouldIncludeAllNominations && !nominationIsNonHelpOnly) {
                  baseForBack = realNominations.length > 0 ? Math.floor(subtotal / realNominations.length) : subtotal
                } else {
                  baseForBack = nominationCastsOnItem.length > 0 ? Math.floor(subtotal / nominationCastsOnItem.length) : subtotal
                }
              } else {
                baseForBack = 0
              }
            }
          } else {
            // nomination_only: 推しのみ
            if (salesType === 'self') {
              // SELFの場合、推し人数で分配
              const shouldIncludeAllNominations = nominationDistributeAll || nominationCastsOnItem.length === 0
              if (shouldIncludeAllNominations && !nominationIsNonHelpOnly) {
                baseForBack = realNominations.length > 0 ? Math.floor(subtotal / realNominations.length) : subtotal
              } else {
                baseForBack = nominationCastsOnItem.length > 0 ? Math.floor(subtotal / nominationCastsOnItem.length) : subtotal
              }
            } else {
              // HELPの場合、full_amountなら商品価格、それ以外は0
              if (helpBackMethod === 'full_amount') {
                baseForBack = subtotal
              } else {
                baseForBack = 0
              }
            }
          }

          // バック金額計算（端数処理は売上金額にのみ適用、バック金額には適用しない）
          // 固定額バックの場合はfixedAmountを使用、それ以外は率で計算
          const backAmount = backInfo.type === 'fixed'
            ? backInfo.fixedAmount
            : Math.floor(baseForBack * backInfo.rate / 100)

          productBackTotal += backAmount
          productBackItems.push({
            orderId: order.id,
            productName: item.product_name,
            category: item.category,
            quantity: item.quantity,
            subtotal,
            backRatio: backInfo.rate,
            backAmount,
            salesType,
            isBase: false
          })
        })
      })

      // BASE注文のバックを計算（POS注文と同じ売上設定を適用）
      if (useProductBack) {
        dayBaseOrders.forEach(baseOrder => {
          // BASE商品のバック情報を取得（カテゴリは'BASE'として検索）
          const backInfo = getProductBackInfo(castId, 'BASE', baseOrder.product_name, 'self')
          if (backInfo === null) return // 設定がない商品はスキップ

          // 金額計算（POS注文と同じ売上設定を適用）
          let calcPrice = baseOrder.actual_price || 0

          if (roundingTiming === 'per_item') {
            // 単価に対して税抜き・端数処理を適用
            if (excludeTax) {
              calcPrice = Math.floor(calcPrice * 100 / (100 + taxPercent))
            }
            calcPrice = applyRoundingNew(calcPrice, roundingPosition, roundingType)
            // サービス料を除外する場合
            if (excludeService && serviceRate > 0) {
              const servicePercent = Math.round(serviceRate * 100)
              const afterServicePrice = Math.floor(calcPrice * (100 + servicePercent) / 100)
              calcPrice = applyRoundingNew(afterServicePrice, roundingPosition, roundingType)
            }
          }

          const subtotal = calcPrice * baseOrder.quantity
          const backAmount = backInfo.type === 'fixed'
            ? backInfo.fixedAmount * baseOrder.quantity
            : Math.floor(subtotal * backInfo.rate / 100)

          productBackTotal += backAmount
          productBackItems.push({
            orderId: baseOrder.base_order_id,
            productName: baseOrder.product_name,
            category: 'BASE',
            quantity: baseOrder.quantity,
            subtotal,
            backRatio: backInfo.rate,
            backAmount,
            salesType: 'self',
            isBase: true
          })
        })
      }

      if (publishedResult || productBackTotal > 0) {
        dailyMap.set(dateStr, {
          date: dateStr,
          selfSales: publishedResult?.self_sales || 0,
          helpSales: publishedResult?.help_sales || 0,
          totalSales: publishedResult?.total_sales || 0,
          productBack: productBackTotal,
          items: productBackItems
        })
      }
    })

    setDailySalesData(dailyMap)
  }, [storeId, casts, salesSettings, backRates, getProductBackInfo, parseRoundingMethod])

  // 初期ロード完了フラグ
  const [initialized, setInitialized] = useState(false)

  // 初期ロード
  useEffect(() => {
    if (storeLoading || !storeId) return
    const init = async () => {
      setLoading(true)
      await loadCasts()
      await loadDeductionSettings()
      await loadSalesSettings()
      await loadBackRates()
      setInitialized(true)
      setLoading(false)
    }
    init()
  }, [loadCasts, loadDeductionSettings, loadSalesSettings, loadBackRates, storeLoading, storeId])

  // キャストまたは月が変わったらデータを再取得（初期ロード完了後のみ）
  // ※ キャスト切り替え時のチカチカを防ぐため、loading状態は変更しない
  useEffect(() => {
    if (!initialized) return
    if (selectedCastId && casts.length > 0 && salesSettings) {
      const loadData = async () => {
        await loadDailyStats(selectedCastId, selectedMonth)
        await loadAttendanceData(selectedCastId, selectedMonth)
        // 報酬設定をロードし、その結果を直接売上計算に渡す
        const compSettings = await loadCompensationSettings(selectedCastId)
        await calculateSalesFromOrders(selectedCastId, selectedMonth, compSettings)
        // 保存済み報酬明細を取得
        await loadPayslip(selectedCastId, selectedMonth)
      }
      loadData()
    }
  }, [initialized, selectedCastId, selectedMonth, casts, salesSettings, loadDailyStats, loadAttendanceData, loadCompensationSettings, calculateSalesFromOrders, loadPayslip])

  // 伝票詳細を取得
  useEffect(() => {
    if (!selectedOrderId) {
      setOrderDetail(null)
      return
    }

    const loadOrderDetail = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          receipt_number,
          guest_name,
          staff_name,
          table_number,
          order_date,
          subtotal_excl_tax,
          tax_amount,
          service_charge,
          total_incl_tax,
          order_items (
            id,
            product_name,
            category,
            cast_name,
            quantity,
            unit_price,
            subtotal,
            tax_amount
          )
        `)
        .eq('id', selectedOrderId)
        .single()

      if (error) {
        console.error('伝票詳細取得エラー:', error)
        return
      }

      setOrderDetail(data)
    }

    loadOrderDetail()
  }, [selectedOrderId])

  // アクティブな報酬形態を取得
  const activeCompensationType = useMemo((): CompensationType | null => {
    if (!compensationSettings?.compensation_types) return null

    const types = compensationSettings.compensation_types.filter(t => t.is_enabled)
    if (types.length === 0) return null

    if (compensationSettings.payment_selection_method === 'specific' && compensationSettings.selected_compensation_type_id) {
      return types.find(t => t.id === compensationSettings.selected_compensation_type_id) || types[0]
    }

    // highest: とりあえず最初の有効なものを返す（実際は売上に応じて計算が必要）
    return types[0]
  }, [compensationSettings])

  // 集計値を計算
  const summary = useMemo(() => {
    // 時給関連はcast_daily_statsから
    const totalWorkHours = dailyStats.reduce((sum, d) => sum + (d.work_hours || 0), 0)
    const totalWageAmount = dailyStats.reduce((sum, d) => sum + (d.wage_amount || 0), 0)

    // 売上は注文データから計算したものを使用
    let totalSales = 0
    let totalProductBack = 0
    dailySalesData.forEach(day => {
      totalSales += day.totalSales
      totalProductBack += day.productBack
    })

    // 売上バック計算（compensation_typesのcommission_rateを使用）
    let salesBack = 0
    if (activeCompensationType) {
      if (activeCompensationType.use_sliding_rate && activeCompensationType.sliding_rates) {
        // スライド式
        const rate = activeCompensationType.sliding_rates.find(
          r => totalSales >= r.min && (r.max === 0 || totalSales <= r.max)
        )
        if (rate) {
          salesBack = Math.round(totalSales * rate.rate / 100)
        }
      } else {
        // 固定率
        salesBack = Math.round(totalSales * activeCompensationType.commission_rate / 100)
      }
    }

    // 固定額（月額固定報酬）
    const fixedAmount = activeCompensationType?.fixed_amount || 0

    // 時給がオンの場合のみ時給収入を含める
    const useWageData = activeCompensationType?.hourly_rate && activeCompensationType.hourly_rate > 0

    // 総支給額
    const grossEarnings = (useWageData ? totalWageAmount : 0) + salesBack + totalProductBack + fixedAmount

    return {
      totalWorkHours: Math.round(totalWorkHours * 100) / 100,
      totalWageAmount,
      totalSales,
      salesBack,
      totalProductBack,
      fixedAmount,
      grossEarnings,
      useWageData: !!useWageData
    }
  }, [dailyStats, dailySalesData, activeCompensationType])

  // 遅刻罰金を計算
  const calculateLatePenalty = useCallback((lateMinutes: number, rule: LatePenaltyRule): number => {
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
  }, [])

  // 控除を計算
  const deductions = useMemo((): DeductionResult[] => {
    const results: DeductionResult[] = []
    const enabledIds = compensationSettings?.enabled_deduction_ids || []

    // 日払い合計
    const totalDailyPayment = attendanceData.reduce((sum, a) => sum + (a.daily_payment || 0), 0)
    if (totalDailyPayment > 0) {
      results.push({
        name: '日払い',
        amount: totalDailyPayment,
        count: attendanceData.filter(a => (a.daily_payment || 0) > 0).length,
        detail: `${attendanceData.filter(a => (a.daily_payment || 0) > 0).length}回`
      })
    }

    // 遅刻罰金
    const lateDeduction = deductionTypes.find(d => d.type === 'penalty_late' && (enabledIds.length === 0 || enabledIds.includes(d.id)))
    if (lateDeduction) {
      const rule = latePenaltyRules.get(lateDeduction.id)
      if (rule) {
        let totalLatePenalty = 0
        let lateCount = 0
        attendanceData.forEach(a => {
          if (a.late_minutes > 0) {
            totalLatePenalty += calculateLatePenalty(a.late_minutes, rule)
            lateCount++
          }
        })
        if (totalLatePenalty > 0) {
          results.push({
            name: lateDeduction.name || '遅刻罰金',
            amount: totalLatePenalty,
            count: lateCount,
            detail: `${lateCount}回`
          })
        }
      }
    }

    // ステータス連動罰金
    deductionTypes
      .filter(d => d.type === 'penalty_status' && d.attendance_status_id && (enabledIds.length === 0 || enabledIds.includes(d.id)))
      .forEach(d => {
        const count = attendanceData.filter(a => a.status_id === d.attendance_status_id).length
        if (count > 0) {
          results.push({
            name: d.name,
            amount: d.penalty_amount * count,
            count,
            detail: `${count}回 × ¥${d.penalty_amount.toLocaleString()}`
          })
        }
      })

    // 固定控除
    deductionTypes
      .filter(d => d.type === 'fixed' && (enabledIds.length === 0 || enabledIds.includes(d.id)))
      .forEach(d => {
        if (d.default_amount > 0) {
          results.push({
            name: d.name,
            amount: d.default_amount
          })
        }
      })

    // 源泉徴収（%計算）- 総支給額に対して計算
    const percentageDeductions = deductionTypes.filter(d => d.type === 'percentage' && d.percentage && (enabledIds.length === 0 || enabledIds.includes(d.id)))
    percentageDeductions.forEach(d => {
      // 総支給額に対して源泉徴収を計算（他の控除を引く前）
      const amount = Math.round(summary.grossEarnings * (d.percentage || 0) / 100)
      if (amount > 0) {
        results.push({
          name: d.name,
          amount,
          detail: `${d.percentage}%`
        })
      }
    })

    return results
  }, [deductionTypes, attendanceData, latePenaltyRules, compensationSettings, summary.grossEarnings, calculateLatePenalty])

  // 控除合計・差引支給額
  const totalDeduction = deductions.reduce((sum, d) => sum + d.amount, 0)
  const netEarnings = summary.grossEarnings - totalDeduction

  // 日別明細データ
  const dailyDetails = useMemo(() => {
    const days = eachDayOfInterval({
      start: startOfMonth(selectedMonth),
      end: endOfMonth(selectedMonth)
    })

    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd')
      const stats = dailyStats.find(s => s.date === dateStr)
      const attendance = attendanceData.find(a => a.date === dateStr)
      const sales = dailySalesData.get(dateStr)

      return {
        date: dateStr,
        dayOfMonth: format(day, 'd'),
        dayOfWeek: format(day, 'E', { locale: ja }),
        workHours: stats?.work_hours || 0,
        wageAmount: stats?.wage_amount || 0,
        sales: sales?.totalSales || 0,
        productBack: sales?.productBack || 0,
        dailyPayment: attendance?.daily_payment || 0,
        lateMinutes: attendance?.late_minutes || 0
      }
    }).filter(d => d.workHours > 0 || d.dailyPayment > 0 || d.lateMinutes > 0 || d.sales > 0)
  }, [selectedMonth, dailyStats, attendanceData, dailySalesData])

  const selectedCast = casts.find(c => c.id === selectedCastId)

  // 商品バック詳細データを生成
  const productBackDetailsData = useMemo(() => {
    const allItems: ProductBackItem[] = []
    dailySalesData.forEach(day => {
      allItems.push(...day.items)
    })

    // 商品名+カテゴリ+売上タイプでグループ化
    const grouped = new Map<string, {
      product_name: string
      category: string | null
      sales_type: 'self' | 'help'
      quantity: number
      subtotal: number
      back_ratio: number
      back_amount: number
    }>()

    allItems.forEach(item => {
      const key = `${item.category || ''}:${item.productName}:${item.salesType}`
      const existing = grouped.get(key)
      if (existing) {
        existing.quantity += item.quantity
        existing.subtotal += item.subtotal
        existing.back_amount += item.backAmount
      } else {
        grouped.set(key, {
          product_name: item.productName,
          category: item.category,
          sales_type: item.salesType,
          quantity: item.quantity,
          subtotal: item.subtotal,
          back_ratio: item.backRatio,
          back_amount: item.backAmount,
        })
      }
    })

    return Array.from(grouped.values()).sort((a, b) => b.back_amount - a.back_amount)
  }, [dailySalesData])

  // 報酬明細を保存
  const savePayslip = useCallback(async (finalize: boolean = false) => {
    if (!selectedCastId) return

    setSaving(true)
    try {
      const yearMonth = format(selectedMonth, 'yyyy-MM')
      const workDays = dailyDetails.filter(d => d.workHours > 0).length
      const averageHourlyWage = summary.useWageData && summary.totalWorkHours > 0
        ? Math.round(summary.totalWageAmount / summary.totalWorkHours)
        : 0

      // 日別詳細データ
      const dailyDetailsData = dailyDetails
        .filter(d => d.workHours > 0)
        .map(d => ({
          date: d.date,
          hours: summary.useWageData ? d.workHours : 0,
          hourly_wage: summary.useWageData && d.workHours > 0 ? Math.round(d.wageAmount / d.workHours) : 0,
          hourly_income: summary.useWageData ? d.wageAmount : 0,
          sales: d.sales,
          back: d.productBack,
          daily_payment: d.dailyPayment
        }))

      // 控除詳細データ
      const deductionDetailsData = deductions.map(d => ({
        name: d.name,
        type: d.detail?.includes('%') ? 'percentage' : 'other',
        count: d.count,
        percentage: d.detail?.includes('%') ? parseFloat(d.detail) : undefined,
        amount: d.amount
      }))

      const payslipData = {
        cast_id: selectedCastId,
        store_id: storeId,
        year_month: yearMonth,
        status: finalize ? 'finalized' : 'draft',
        work_days: workDays,
        total_hours: summary.useWageData ? summary.totalWorkHours : 0,
        average_hourly_wage: averageHourlyWage,
        hourly_income: summary.useWageData ? summary.totalWageAmount : 0,
        sales_back: summary.salesBack,
        product_back: summary.totalProductBack,
        fixed_amount: summary.fixedAmount,
        gross_total: summary.grossEarnings,
        total_deduction: totalDeduction,
        net_payment: netEarnings,
        daily_details: dailyDetailsData,
        product_back_details: productBackDetailsData,
        deduction_details: deductionDetailsData,
        finalized_at: finalize ? new Date().toISOString() : null
      }

      const { data, error } = await supabase
        .from('payslips')
        .upsert(payslipData, {
          onConflict: 'cast_id,store_id,year_month'
        })
        .select()
        .single()

      if (error) {
        console.error('報酬明細保存エラー:', error)
        alert('保存に失敗しました')
      } else {
        setSavedPayslip(data as SavedPayslip)
        alert(finalize ? '月次確定しました' : '保存しました')
      }
    } finally {
      setSaving(false)
    }
  }, [selectedCastId, selectedMonth, storeId, summary, dailyDetails, deductions, totalDeduction, netEarnings, productBackDetailsData])

  // 確定解除
  const unfinalizePayslip = useCallback(async () => {
    if (!savedPayslip) return

    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('payslips')
        .update({
          status: 'draft',
          finalized_at: null
        })
        .eq('id', savedPayslip.id)
        .select()
        .single()

      if (error) {
        console.error('確定解除エラー:', error)
        alert('確定解除に失敗しました')
      } else {
        setSavedPayslip(data as SavedPayslip)
        alert('確定解除しました')
      }
    } finally {
      setSaving(false)
    }
  }, [savedPayslip])

  // 全キャスト再計算（当月のみ）
  const recalculateAll = useCallback(async () => {
    // 当月以外は再計算不可
    const now = new Date()
    const isCurrentMonth = selectedMonth.getFullYear() === now.getFullYear() && selectedMonth.getMonth() === now.getMonth()
    if (!isCurrentMonth) {
      alert('過去の月は再計算できません')
      return
    }

    setRecalculating(true)
    try {
      const res = await fetch('/api/payslips/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId })
      })

      const result = await res.json()
      if (result.success) {
        alert(`${result.processed}件の報酬明細を保存しました`)
        // 現在のキャストのデータを再読み込み
        if (selectedCastId) {
          await loadPayslip(selectedCastId, selectedMonth)
        }
      } else {
        alert('再計算に失敗しました: ' + (result.error || ''))
      }
    } catch (err) {
      console.error('再計算エラー:', err)
      alert('再計算に失敗しました')
    } finally {
      setRecalculating(false)
    }
  }, [storeId, selectedCastId, selectedMonth, loadPayslip])

  // PDF出力
  const handleExportPDF = useCallback(async () => {
    if (!printRef.current || !selectedCastId) return

    const cast = casts.find(c => c.id === selectedCastId)
    if (!cast) return

    setExporting(true)
    try {
      await exportToPDF(printRef.current, {
        filename: `報酬明細_${cast.name}_${format(selectedMonth, 'yyyy年MM月')}.pdf`,
        orientation: 'portrait',
        margin: 10
      })
    } catch (error) {
      console.error('PDF出力エラー:', error)
      alert('PDF出力に失敗しました')
    } finally {
      setExporting(false)
    }
  }, [selectedCastId, casts, selectedMonth])

  // 全キャストCSV一括出力
  const handleExportAllCSV = useCallback(async () => {
    setCsvExporting(true)
    try {
      const yearMonth = format(selectedMonth, 'yyyy-MM')

      // 全キャストの報酬明細を取得
      const { data: allPayslips, error } = await supabase
        .from('payslips')
        .select('*, casts!inner(name, status)')
        .eq('store_id', storeId)
        .eq('year_month', yearMonth)
        .order('casts(name)')

      if (error) throw error

      if (!allPayslips || allPayslips.length === 0) {
        alert('エクスポートするデータがありません')
        return
      }

      // CSVヘッダー
      const headers = [
        'キャスト名',
        'ステータス',
        '出勤日数',
        '総勤務時間',
        '平均時給',
        '時給収入',
        '売上バック',
        '商品バック',
        '固定給',
        '総支給額',
        '日払い',
        '源泉徴収',
        'その他控除',
        '控除合計',
        '差引支給額',
      ]

      // データ行を作成
      const rows = allPayslips.map(payslip => {
        const cast = payslip.casts as { name: string; status: string }
        const deductions = (payslip.deduction_details || []) as { name: string; type: string; amount: number }[]

        // 日払い
        const dailyPayment = deductions
          .filter(d => d.type === 'daily_payment' || d.name?.includes('日払い'))
          .reduce((sum, d) => sum + (d.amount || 0), 0)

        // 源泉徴収
        const withholdingTax = deductions
          .filter(d => d.name?.includes('源泉') || d.name?.includes('所得税'))
          .reduce((sum, d) => sum + (d.amount || 0), 0)

        // その他控除
        const otherDeductions = deductions
          .filter(d => d.type !== 'daily_payment' && !d.name?.includes('日払い') && !d.name?.includes('源泉') && !d.name?.includes('所得税'))
          .reduce((sum, d) => sum + (d.amount || 0), 0)

        return [
          cast.name,
          cast.status || '',
          payslip.work_days || 0,
          payslip.total_hours || 0,
          payslip.average_hourly_wage || 0,
          payslip.hourly_income || 0,
          payslip.sales_back || 0,
          payslip.product_back || 0,
          payslip.fixed_amount || 0,
          payslip.gross_total || 0,
          dailyPayment,
          withholdingTax,
          otherDeductions,
          payslip.total_deduction || 0,
          payslip.net_payment || 0,
        ]
      })

      // CSV文字列生成
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n')

      // BOM付きUTF-8でダウンロード
      const bom = '\uFEFF'
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `報酬明細一覧_${format(selectedMonth, 'yyyy年MM月')}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('CSV出力エラー:', error)
      alert('CSV出力に失敗しました')
    } finally {
      setCsvExporting(false)
    }
  }, [storeId, selectedMonth])

  // 個人CSV出力
  const handleExportIndividualCSV = useCallback(async () => {
    if (!selectedCastId || !savedPayslip) {
      alert('キャストを選択してください')
      return
    }

    const cast = casts.find(c => c.id === selectedCastId)
    if (!cast) return

    setCsvExporting(true)
    setShowExportModal(false)
    try {
      const payslip = savedPayslip
      const deductions = (payslip.deduction_details || []) as { name: string; type: string; amount: number }[]

      // 日払い
      const dailyPayment = deductions
        .filter(d => d.type === 'daily_payment' || d.name?.includes('日払い'))
        .reduce((sum, d) => sum + (d.amount || 0), 0)

      // 源泉徴収
      const withholdingTax = deductions
        .filter(d => d.name?.includes('源泉') || d.name?.includes('所得税'))
        .reduce((sum, d) => sum + (d.amount || 0), 0)

      // その他控除
      const otherDeductions = deductions
        .filter(d => d.type !== 'daily_payment' && !d.name?.includes('日払い') && !d.name?.includes('源泉') && !d.name?.includes('所得税'))
        .reduce((sum, d) => sum + (d.amount || 0), 0)

      // CSVヘッダー
      const headers = [
        'キャスト名',
        'ステータス',
        '出勤日数',
        '総勤務時間',
        '平均時給',
        '時給収入',
        '売上バック',
        '商品バック',
        '固定給',
        '総支給額',
        '日払い',
        '源泉徴収',
        'その他控除',
        '控除合計',
        '差引支給額',
      ]

      const row = [
        cast.name,
        cast.status || '',
        payslip.work_days || 0,
        payslip.total_hours || 0,
        payslip.average_hourly_wage || 0,
        payslip.hourly_income || 0,
        payslip.sales_back || 0,
        payslip.product_back || 0,
        payslip.fixed_amount || 0,
        payslip.gross_total || 0,
        dailyPayment,
        withholdingTax,
        otherDeductions,
        payslip.total_deduction || 0,
        payslip.net_payment || 0,
      ]

      // CSV文字列生成
      const csvContent = [
        headers.join(','),
        row.map(cell => `"${cell}"`).join(',')
      ].join('\n')

      // BOM付きUTF-8でダウンロード
      const bom = '\uFEFF'
      const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `報酬明細_${cast.name}_${format(selectedMonth, 'yyyy年MM月')}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('CSV出力エラー:', error)
      alert('CSV出力に失敗しました')
    } finally {
      setCsvExporting(false)
    }
  }, [selectedCastId, savedPayslip, casts, selectedMonth])

  // 全キャストPDF出力
  const handleExportAllPDF = useCallback(async () => {
    setExporting(true)
    setShowExportModal(false)
    try {
      const yearMonth = format(selectedMonth, 'yyyy-MM')

      // 全キャストの報酬明細を取得
      const { data: allPayslips, error } = await supabase
        .from('payslips')
        .select('*, casts!inner(name, status)')
        .eq('store_id', storeId)
        .eq('year_month', yearMonth)
        .order('casts(name)')

      if (error) throw error

      if (!allPayslips || allPayslips.length === 0) {
        alert('エクスポートするデータがありません')
        return
      }

      // 各キャストごとにPDF出力を実行
      for (const payslip of allPayslips) {
        // そのキャストを選択して表示
        setSelectedCastId(payslip.cast_id)
        // 少し待機してDOM更新を待つ
        await new Promise(resolve => setTimeout(resolve, 500))

        if (printRef.current) {
          const castName = (payslip.casts as { name: string }).name
          await exportToPDF(printRef.current, {
            filename: `報酬明細_${castName}_${format(selectedMonth, 'yyyy年MM月')}.pdf`,
            orientation: 'portrait',
            margin: 10
          })
          // 連続ダウンロード間隔
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      }

      alert(`${allPayslips.length}件のPDFをダウンロードしました`)
    } catch (error) {
      console.error('全PDF出力エラー:', error)
      alert('PDF出力に失敗しました')
    } finally {
      setExporting(false)
    }
  }, [storeId, selectedMonth])

  if (loading && casts.length === 0) {
    return (
      <div style={styles.container}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div style={styles.pageWrapper}>
      {/* 左側：キャスト一覧サイドバー */}
      <div style={styles.sidebar}>
        <h3 style={styles.sidebarTitle}>キャスト選択</h3>

        {/* 検索 */}
        <input
          type="text"
          placeholder="名前で検索..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={styles.searchInput}
        />

        {/* ステータスフィルター */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="">全て</option>
          <option value="在籍">在籍</option>
          <option value="体験">体験</option>
          <option value="退店">退店</option>
        </select>

        <div style={styles.castList}>
          {filteredCasts.map((cast) => (
            <button
              key={cast.id}
              onClick={() => setSelectedCastId(cast.id)}
              style={{
                ...styles.castItem,
                ...(selectedCastId === cast.id ? styles.castItemActive : {}),
              }}
            >
              <div style={styles.castInfo}>
                <span style={styles.castName}>{cast.name}</span>
                <span style={{
                  ...styles.castStatus,
                  color: cast.status === '在籍' ? '#10b981' : cast.status === '体験' ? '#f59e0b' : '#94a3b8',
                }}>
                  {cast.status}
                </span>
              </div>
            </button>
          ))}
          {filteredCasts.length === 0 && (
            <p style={styles.noResults}>該当するキャストがいません</p>
          )}
        </div>
      </div>

      {/* 右側：コンテンツ */}
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>{selectedCast?.name || ''}</h1>
            <div style={styles.subtitle}>報酬明細</div>
          </div>
          <div style={styles.monthSelector}>
            <button
              onClick={() => setSelectedMonth(prev => subMonths(prev, 1))}
              style={styles.monthButton}
            >
              ◀
            </button>
            <span style={styles.monthLabel}>
              {format(selectedMonth, 'yyyy年M月', { locale: ja })}
            </span>
            <button
              onClick={() => setSelectedMonth(prev => addMonths(prev, 1))}
              style={styles.monthButton}
            >
              ▶
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* ステータス表示 */}
            {savedPayslip ? (
              <span style={{
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '600',
                backgroundColor: savedPayslip.status === 'finalized' ? '#dcfce7' : '#dbeafe',
                color: savedPayslip.status === 'finalized' ? '#166534' : '#1d4ed8'
              }}>
                {savedPayslip.status === 'finalized' ? '確定済み' : '自動保存済み'}
              </span>
            ) : (
              <span style={{
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '500',
                backgroundColor: '#f3f4f6',
                color: '#6b7280'
              }}>
                10分ごとに自動保存
              </span>
            )}
            {/* 全キャスト再計算ボタン */}
            <button
              onClick={recalculateAll}
              disabled={recalculating}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: recalculating ? 'wait' : 'pointer',
                opacity: recalculating ? 0.7 : 1
              }}
            >
              {recalculating ? '計算中...' : '全キャスト再計算'}
            </button>
            {/* エクスポートボタン */}
            <button
              onClick={() => setShowExportModal(true)}
              disabled={exporting || csvExporting}
              style={{
                padding: '8px 16px',
                backgroundColor: exporting || csvExporting ? '#94a3b8' : '#8b5cf6',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: exporting || csvExporting ? 'wait' : 'pointer',
                opacity: exporting || csvExporting ? 0.7 : 1
              }}
            >
              {exporting || csvExporting ? '出力中...' : 'エクスポート'}
            </button>
            {/* 月次確定 / 確定解除ボタン */}
            {savedPayslip?.status === 'finalized' ? (
              <button
                onClick={() => {
                  if (confirm('確定解除すると再編集可能になります。よろしいですか？')) {
                    unfinalizePayslip()
                  }
                }}
                disabled={saving}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  opacity: saving ? 0.7 : 1
                }}
              >
                確定解除
              </button>
            ) : (
              <button
                onClick={() => {
                  if (confirm('月次確定すると編集できなくなります。よろしいですか？')) {
                    savePayslip(true)
                  }
                }}
                disabled={saving}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#059669',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  opacity: saving ? 0.7 : 1
                }}
              >
                月次確定
              </button>
            )}
          </div>
        </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div ref={printRef} style={{ backgroundColor: 'white' }}>
          {/* 報酬形態表示 */}
          {activeCompensationType && (
            <div style={styles.compensationTypeLabel}>
              適用報酬形態: {activeCompensationType.name}
              {(() => {
                const parts: string[] = []
                if (activeCompensationType.hourly_rate > 0) parts.push('時給')
                if (activeCompensationType.commission_rate > 0 || activeCompensationType.use_sliding_rate) {
                  parts.push(activeCompensationType.use_sliding_rate
                    ? 'スライド式売上バック'
                    : `売上バック${activeCompensationType.commission_rate}%`)
                }
                if (activeCompensationType.use_product_back) parts.push('商品バック')
                if (activeCompensationType.fixed_amount > 0) {
                  parts.push(`固定額${currencyFormatter.format(activeCompensationType.fixed_amount)}`)
                }
                return parts.length > 0 ? `（${parts.join(' + ')}）` : ''
              })()}
            </div>
          )}

          {/* サマリーカード */}
          <div style={styles.summarySection}>
            <div style={styles.summaryGrid}>
              {summary.useWageData && (
                <div
                  style={{ ...styles.summaryCard, cursor: 'pointer' }}
                  onClick={() => setShowDailyWageModal(true)}
                >
                  <div style={styles.summaryLabel}>勤務時間 / 平均時給 ▶</div>
                  <div style={styles.summaryValue}>
                    {summary.totalWorkHours}h / {summary.totalWorkHours > 0
                      ? currencyFormatter.format(Math.round(summary.totalWageAmount / summary.totalWorkHours))
                      : '—'}
                  </div>
                </div>
              )}
              <div
                style={{ ...styles.summaryCard, cursor: summary.useWageData ? 'pointer' : 'default' }}
                onClick={() => summary.useWageData && setShowDailyWageModal(true)}
              >
                <div style={styles.summaryLabel}>出勤日数{summary.useWageData ? ' ▶' : ''}</div>
                <div style={styles.summaryValue}>{dailyDetails.filter(d => d.workHours > 0).length}日</div>
              </div>
              {summary.useWageData && (
                <div style={styles.summaryCard}>
                  <div style={styles.summaryLabel}>時給収入</div>
                  <div style={styles.summaryValue}>{currencyFormatter.format(summary.totalWageAmount)}</div>
                </div>
              )}
            </div>
            <div style={styles.summaryGrid}>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>売上</div>
                <div style={styles.summaryValue}>{currencyFormatter.format(summary.totalSales)}</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>売上バック</div>
                <div style={{ ...styles.summaryValue, color: '#007AFF' }}>{currencyFormatter.format(summary.salesBack)}</div>
              </div>
              <div style={styles.summaryCard}>
                <div style={styles.summaryLabel}>商品バック</div>
                <div style={{ ...styles.summaryValue, color: '#FF9500' }}>{currencyFormatter.format(summary.totalProductBack)}</div>
              </div>
            </div>
            {summary.fixedAmount > 0 && (
              <div style={styles.summaryGrid}>
                <div style={styles.summaryCard}>
                  <div style={styles.summaryLabel}>固定額</div>
                  <div style={{ ...styles.summaryValue, color: '#34C759' }}>{currencyFormatter.format(summary.fixedAmount)}</div>
                </div>
              </div>
            )}
            <div style={styles.grossEarningsCard}>
              <div style={styles.grossLabel}>総支給額</div>
              <div style={styles.grossValue}>{currencyFormatter.format(summary.grossEarnings)}</div>
            </div>
          </div>

          {/* 日別明細 */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>日別明細</h2>
            {dailyDetails.length > 0 ? (
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={styles.th}>日付</th>
                      {summary.useWageData && <th style={{ ...styles.th, textAlign: 'right' }}>時間</th>}
                      {summary.useWageData && <th style={{ ...styles.th, textAlign: 'right' }}>時給額</th>}
                      <th style={{ ...styles.th, textAlign: 'right' }}>売上</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>商品バック</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>日払い</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyDetails.map((day, i) => (
                      <tr
                        key={day.date}
                        style={{
                          ...(i % 2 === 0 ? styles.tableRowEven : styles.tableRow),
                          cursor: (day.sales > 0 || day.productBack > 0) ? 'pointer' : 'default'
                        }}
                        onClick={() => {
                          if (day.sales > 0 || day.productBack > 0) {
                            setSelectedDayDetail(day.date)
                          }
                        }}
                        onMouseEnter={(e) => {
                          if (day.sales > 0 || day.productBack > 0) {
                            e.currentTarget.style.backgroundColor = '#f0f7ff'
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#fafafa' : 'transparent'
                        }}
                      >
                        <td style={styles.td}>{day.dayOfMonth}日({day.dayOfWeek})</td>
                        {summary.useWageData && <td style={{ ...styles.td, textAlign: 'right' }}>{day.workHours > 0 ? `${day.workHours}h` : '-'}</td>}
                        {summary.useWageData && <td style={{ ...styles.td, textAlign: 'right' }}>{day.wageAmount > 0 ? currencyFormatter.format(day.wageAmount) : '-'}</td>}
                        <td style={{ ...styles.td, textAlign: 'right' }}>{day.sales > 0 ? currencyFormatter.format(day.sales) : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: '#FF9500' }}>{day.productBack > 0 ? currencyFormatter.format(day.productBack) : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: day.dailyPayment > 0 ? '#e74c3c' : undefined }}>
                          {day.dailyPayment > 0 ? currencyFormatter.format(day.dailyPayment) : '-'}
                        </td>
                      </tr>
                    ))}
                    {/* 合計行 */}
                    <tr style={styles.tableTotal}>
                      <td style={{ ...styles.td, fontWeight: 'bold' }}>合計</td>
                      {summary.useWageData && <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>{summary.totalWorkHours}h</td>}
                      {summary.useWageData && <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>{currencyFormatter.format(summary.totalWageAmount)}</td>}
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>{currencyFormatter.format(summary.totalSales)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#FF9500' }}>{currencyFormatter.format(summary.totalProductBack)}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#e74c3c' }}>
                        {currencyFormatter.format(attendanceData.reduce((sum, a) => sum + (a.daily_payment || 0), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={styles.noData}>この月の勤務データがありません</div>
            )}
          </div>

          {/* 商品バック詳細 */}
          {summary.totalProductBack > 0 && (
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>商品バック詳細</h2>
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeader}>
                      <th style={styles.th}>商品名</th>
                      <th style={styles.th}>カテゴリ</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>数量</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>金額</th>
                      <th style={{ ...styles.th, textAlign: 'center' }}>率</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>バック</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // 全商品バックアイテムを集約
                      const allItems: ProductBackItem[] = []
                      dailySalesData.forEach(day => {
                        allItems.push(...day.items)
                      })

                      // 商品名+カテゴリ+売上タイプ+BASEフラグでグループ化
                      const grouped = new Map<string, {
                        productName: string
                        category: string | null
                        salesType: 'self' | 'help'
                        quantity: number
                        subtotal: number
                        backRatio: number
                        backAmount: number
                        isBase: boolean
                      }>()

                      allItems.forEach(item => {
                        const key = `${item.category || ''}:${item.productName}:${item.salesType}:${item.isBase ? 'base' : 'pos'}`
                        const existing = grouped.get(key)
                        if (existing) {
                          existing.quantity += item.quantity
                          existing.subtotal += item.subtotal
                          existing.backAmount += item.backAmount
                        } else {
                          grouped.set(key, {
                            productName: item.productName,
                            category: item.category,
                            salesType: item.salesType,
                            quantity: item.quantity,
                            subtotal: item.subtotal,
                            backRatio: item.backRatio,
                            backAmount: item.backAmount,
                            isBase: item.isBase || false,
                          })
                        }
                      })

                      return Array.from(grouped.values())
                        .sort((a, b) => b.backAmount - a.backAmount)
                        .map((item, i) => (
                          <tr
                            key={i}
                            style={{
                              ...(i % 2 === 0 ? styles.tableRowEven : styles.tableRow),
                              cursor: 'pointer'
                            }}
                            onClick={() => setSelectedProductDetail({
                              productName: item.productName,
                              category: item.category,
                              salesType: item.salesType
                            })}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f0f7ff'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#fafafa' : 'transparent'
                            }}
                          >
                            <td style={styles.td}>
                              {item.productName}
                              <span style={{
                                marginLeft: '6px',
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: item.salesType === 'self' ? '#d4edda' : '#fff3cd',
                                color: item.salesType === 'self' ? '#155724' : '#856404'
                              }}>
                                {item.salesType === 'self' ? '推し' : 'ヘルプ'}
                              </span>
                              {item.isBase && (
                                <span style={{
                                  marginLeft: '4px',
                                  fontSize: '11px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: '#ede9fe',
                                  color: '#6b21a8'
                                }}>
                                  BASE
                                </span>
                              )}
                            </td>
                            <td style={{ ...styles.td, color: '#86868b', fontSize: '12px' }}>{item.category || '-'}</td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>{item.quantity}</td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>{currencyFormatter.format(item.subtotal)}</td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>{item.backRatio}%</td>
                            <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600', color: '#FF9500' }}>
                              {currencyFormatter.format(item.backAmount)}
                            </td>
                          </tr>
                        ))
                    })()}
                    <tr style={styles.tableTotal}>
                      <td colSpan={5} style={{ ...styles.td, fontWeight: 'bold' }}>合計</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#FF9500' }}>
                        {currencyFormatter.format(summary.totalProductBack)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 控除内訳 */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>控除内訳</h2>
            {deductions.length > 0 ? (
              <div style={styles.deductionList}>
                {deductions.map((d, i) => (
                  <div key={i} style={styles.deductionItem}>
                    <div style={styles.deductionName}>
                      {d.name}
                      {d.detail && <span style={styles.deductionDetail}>（{d.detail}）</span>}
                    </div>
                    <div style={styles.deductionAmount}>-{currencyFormatter.format(d.amount)}</div>
                  </div>
                ))}
                <div style={styles.deductionTotal}>
                  <div style={styles.deductionName}>控除合計</div>
                  <div style={styles.deductionAmount}>-{currencyFormatter.format(totalDeduction)}</div>
                </div>
              </div>
            ) : (
              <div style={styles.noData}>控除項目がありません</div>
            )}
          </div>

          {/* 差引支給額 */}
          <div style={styles.netEarningsSection}>
            <div style={styles.netEarningsLabel}>差引支給額</div>
            <div style={styles.netEarningsValue}>{currencyFormatter.format(netEarnings)}</div>
          </div>
        </div>
      )}

      {/* エクスポートモーダル */}
      {showExportModal && (
        <>
          <div
            style={styles.modalOverlay}
            onClick={() => setShowExportModal(false)}
          />
          <div style={{
            ...styles.modal,
            maxWidth: '400px',
            width: '90%'
          }}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>エクスポート</h3>
              <button
                onClick={() => setShowExportModal(false)}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>
            <div style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {/* PDF出力オプション */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>PDF出力</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={() => {
                      setShowExportModal(false)
                      handleExportPDF()
                    }}
                    disabled={!selectedCastId}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: !selectedCastId ? '#e2e8f0' : '#8b5cf6',
                      color: !selectedCastId ? '#94a3b8' : '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: !selectedCastId ? 'not-allowed' : 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    選択中のキャスト（{casts.find(c => c.id === selectedCastId)?.name || '未選択'}）
                  </button>
                  <button
                    onClick={handleExportAllPDF}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#8b5cf6',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    全キャスト（個別ファイル）
                  </button>
                </div>
              </div>

              {/* CSV出力オプション */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>CSV出力</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={handleExportIndividualCSV}
                    disabled={!selectedCastId}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: !selectedCastId ? '#e2e8f0' : '#10b981',
                      color: !selectedCastId ? '#94a3b8' : '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: !selectedCastId ? 'not-allowed' : 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    選択中のキャスト（{casts.find(c => c.id === selectedCastId)?.name || '未選択'}）
                  </button>
                  <button
                    onClick={() => {
                      setShowExportModal(false)
                      handleExportAllCSV()
                    }}
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    全キャスト一覧
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 日別詳細モーダル */}
      {selectedDayDetail && (() => {
        const dayData = dailySalesData.get(selectedDayDetail)
        const dayDetail = dailyDetails.find(d => d.date === selectedDayDetail)
        if (!dayData && !dayDetail) return null

        return (
          <>
            <div
              style={styles.modalOverlay}
              onClick={() => setSelectedDayDetail(null)}
            />
            <div style={styles.modal}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>
                  {format(new Date(selectedDayDetail), 'M月d日(E)', { locale: ja })} - {selectedCast?.name}
                </h3>
                <button
                  onClick={() => setSelectedDayDetail(null)}
                  style={styles.modalCloseBtn}
                >
                  ✕
                </button>
              </div>

              <div style={styles.modalContent}>
                {/* サマリー */}
                <div style={styles.modalSummary}>
                  <div style={styles.modalSummaryItem}>
                    <div style={styles.modalSummaryLabel}>売上</div>
                    <div style={styles.modalSummaryValue}>
                      {currencyFormatter.format(dayData?.totalSales || 0)}
                    </div>
                  </div>
                  <div style={styles.modalSummaryItem}>
                    <div style={styles.modalSummaryLabel}>商品バック</div>
                    <div style={{ ...styles.modalSummaryValue, color: '#FF9500' }}>
                      {currencyFormatter.format(dayData?.productBack || 0)}
                    </div>
                  </div>
                </div>

                {/* 売上内訳 */}
                {dayData && (dayData.selfSales > 0 || dayData.helpSales > 0) && (
                  <div style={styles.modalSection}>
                    <div style={styles.modalSectionTitle}>売上内訳</div>
                    <div style={styles.modalGrid}>
                      <div style={styles.modalGridItem}>
                        <span style={{ color: '#34C759' }}>推し売上</span>
                        <span style={{ fontWeight: '600' }}>{currencyFormatter.format(dayData.selfSales)}</span>
                      </div>
                      <div style={styles.modalGridItem}>
                        <span style={{ color: '#FF9500' }}>ヘルプ売上</span>
                        <span style={{ fontWeight: '600' }}>{currencyFormatter.format(dayData.helpSales)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 商品バック詳細 */}
                {dayData && dayData.items.length > 0 && (
                  <div style={styles.modalSection}>
                    <div style={styles.modalSectionTitle}>商品バック詳細</div>
                    <div style={styles.modalItemList}>
                      {dayData.items.map((item, idx) => (
                        <div key={idx} style={styles.modalItem}>
                          <div style={styles.modalItemMain}>
                            <div style={styles.modalItemName}>
                              {item.productName}
                              <span style={{
                                marginLeft: '6px',
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: item.salesType === 'self' ? '#d4edda' : '#fff3cd',
                                color: item.salesType === 'self' ? '#155724' : '#856404'
                              }}>
                                {item.salesType === 'self' ? '推し' : 'ヘルプ'}
                              </span>
                            </div>
                            <div style={styles.modalItemCategory}>{item.category || '-'}</div>
                          </div>
                          <div style={styles.modalItemDetail}>
                            <div style={{ fontSize: '12px', color: '#86868b' }}>
                              {item.quantity}個 × {currencyFormatter.format(Math.floor(item.subtotal / item.quantity))} = {currencyFormatter.format(item.subtotal)}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '12px', color: '#86868b' }}>{item.backRatio}%</span>
                              <span style={{ fontWeight: '600', color: '#FF9500' }}>
                                {currencyFormatter.format(item.backAmount)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 勤務情報 */}
                {dayDetail && (dayDetail.workHours > 0 || dayDetail.dailyPayment > 0) && (
                  <div style={styles.modalSection}>
                    <div style={styles.modalSectionTitle}>勤務情報</div>
                    <div style={styles.modalGrid}>
                      {dayDetail.workHours > 0 && (
                        <div style={styles.modalGridItem}>
                          <span>勤務時間</span>
                          <span style={{ fontWeight: '600' }}>{dayDetail.workHours}h</span>
                        </div>
                      )}
                      {dayDetail.wageAmount > 0 && (
                        <div style={styles.modalGridItem}>
                          <span>時給額</span>
                          <span style={{ fontWeight: '600' }}>{currencyFormatter.format(dayDetail.wageAmount)}</span>
                        </div>
                      )}
                      {dayDetail.dailyPayment > 0 && (
                        <div style={styles.modalGridItem}>
                          <span style={{ color: '#e74c3c' }}>日払い</span>
                          <span style={{ fontWeight: '600', color: '#e74c3c' }}>{currencyFormatter.format(dayDetail.dailyPayment)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div style={styles.modalFooter}>
                <button
                  onClick={() => setSelectedDayDetail(null)}
                  style={styles.modalButton}
                >
                  閉じる
                </button>
              </div>
            </div>
          </>
        )
      })()}

      {/* 商品別詳細モーダル */}
      {selectedProductDetail && (() => {
        // 選択した商品の日別明細を抽出
        const dailyBreakdown: { date: string; quantity: number; subtotal: number; backAmount: number }[] = []

        dailySalesData.forEach((dayData, dateStr) => {
          const matchingItems = dayData.items.filter(item =>
            item.productName === selectedProductDetail.productName &&
            item.category === selectedProductDetail.category &&
            item.salesType === selectedProductDetail.salesType
          )

          if (matchingItems.length > 0) {
            const totalQuantity = matchingItems.reduce((sum, item) => sum + item.quantity, 0)
            const totalSubtotal = matchingItems.reduce((sum, item) => sum + item.subtotal, 0)
            const totalBack = matchingItems.reduce((sum, item) => sum + item.backAmount, 0)

            dailyBreakdown.push({
              date: dateStr,
              quantity: totalQuantity,
              subtotal: totalSubtotal,
              backAmount: totalBack
            })
          }
        })

        // 日付順にソート
        dailyBreakdown.sort((a, b) => a.date.localeCompare(b.date))

        const totalQuantity = dailyBreakdown.reduce((sum, d) => sum + d.quantity, 0)
        const totalSubtotal = dailyBreakdown.reduce((sum, d) => sum + d.subtotal, 0)
        const totalBack = dailyBreakdown.reduce((sum, d) => sum + d.backAmount, 0)

        return (
          <>
            <div
              style={styles.modalOverlay}
              onClick={() => setSelectedProductDetail(null)}
            />
            <div style={styles.modal}>
              <div style={{ ...styles.modalHeader, backgroundColor: '#FF9500' }}>
                <h3 style={styles.modalTitle}>
                  {selectedProductDetail.productName}
                  <span style={{
                    marginLeft: '8px',
                    fontSize: '12px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(255,255,255,0.2)',
                  }}>
                    {selectedProductDetail.salesType === 'self' ? '推し' : 'ヘルプ'}
                  </span>
                </h3>
                <button
                  onClick={() => setSelectedProductDetail(null)}
                  style={styles.modalCloseBtn}
                >
                  ✕
                </button>
              </div>

              <div style={styles.modalContent}>
                {/* サマリー */}
                <div style={styles.modalSummary}>
                  <div style={styles.modalSummaryItem}>
                    <div style={styles.modalSummaryLabel}>合計数量</div>
                    <div style={styles.modalSummaryValue}>{totalQuantity}個</div>
                  </div>
                  <div style={styles.modalSummaryItem}>
                    <div style={styles.modalSummaryLabel}>合計バック</div>
                    <div style={{ ...styles.modalSummaryValue, color: '#FF9500' }}>
                      {currencyFormatter.format(totalBack)}
                    </div>
                  </div>
                </div>

                {/* 日別明細 */}
                <div style={styles.modalSection}>
                  <div style={styles.modalSectionTitle}>日別明細</div>
                  <div style={styles.tableWrapper}>
                    <table style={{ ...styles.table, fontSize: '13px' }}>
                      <thead>
                        <tr style={styles.tableHeader}>
                          <th style={styles.th}>日付</th>
                          <th style={{ ...styles.th, textAlign: 'right' }}>数量</th>
                          <th style={{ ...styles.th, textAlign: 'right' }}>金額</th>
                          <th style={{ ...styles.th, textAlign: 'right' }}>バック</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyBreakdown.map((day, i) => (
                          <tr
                            key={day.date}
                            style={{
                              ...(i % 2 === 0 ? styles.tableRowEven : styles.tableRow),
                              cursor: 'pointer'
                            }}
                            onClick={() => {
                              const dayData = dailySalesData.get(day.date)
                              if (dayData) {
                                const matchingItem = dayData.items.find(item =>
                                  item.productName === selectedProductDetail.productName &&
                                  item.category === selectedProductDetail.category &&
                                  item.salesType === selectedProductDetail.salesType
                                )
                                if (matchingItem) {
                                  setSelectedOrderId(matchingItem.orderId)
                                }
                              }
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#fff5e6'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#fafafa' : 'transparent'
                            }}
                          >
                            <td style={styles.td}>
                              {format(new Date(day.date), 'M/d(E)', { locale: ja })}
                            </td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>{day.quantity}</td>
                            <td style={{ ...styles.td, textAlign: 'right' }}>{currencyFormatter.format(day.subtotal)}</td>
                            <td style={{ ...styles.td, textAlign: 'right', color: '#FF9500', fontWeight: '600' }}>
                              {currencyFormatter.format(day.backAmount)}
                            </td>
                          </tr>
                        ))}
                        <tr style={styles.tableTotal}>
                          <td style={{ ...styles.td, fontWeight: 'bold' }}>合計</td>
                          <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>{totalQuantity}</td>
                          <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>{currencyFormatter.format(totalSubtotal)}</td>
                          <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#FF9500' }}>
                            {currencyFormatter.format(totalBack)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div style={styles.modalFooter}>
                <button
                  onClick={() => setSelectedProductDetail(null)}
                  style={{ ...styles.modalButton, backgroundColor: '#FF9500' }}
                >
                  閉じる
                </button>
              </div>
            </div>
          </>
        )
      })()}

      {/* 伝票詳細モーダル */}
      {selectedOrderId && orderDetail && (
        <>
          <div
            style={styles.modalOverlay}
            onClick={() => setSelectedOrderId(null)}
          />
          <div style={{ ...styles.modal, maxWidth: '550px' }}>
            <div style={{ ...styles.modalHeader, backgroundColor: '#5856D6' }}>
              <h3 style={styles.modalTitle}>
                伝票詳細
                {orderDetail.receipt_number && (
                  <span style={{ marginLeft: '8px', fontSize: '13px', opacity: 0.9 }}>
                    #{orderDetail.receipt_number}
                  </span>
                )}
              </h3>
              <button
                onClick={() => setSelectedOrderId(null)}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={styles.modalContent}>
              {/* 基本情報 */}
              <div style={styles.modalSection}>
                <div style={styles.modalSectionTitle}>基本情報</div>
                <div style={styles.modalGrid}>
                  {orderDetail.guest_name && (
                    <div style={styles.modalGridItem}>
                      <span>お客様</span>
                      <span style={{ fontWeight: '600' }}>{orderDetail.guest_name}</span>
                    </div>
                  )}
                  {orderDetail.staff_name && (
                    <div style={styles.modalGridItem}>
                      <span>推し</span>
                      <span style={{ fontWeight: '600' }}>{orderDetail.staff_name}</span>
                    </div>
                  )}
                  {orderDetail.table_number && (
                    <div style={styles.modalGridItem}>
                      <span>卓番</span>
                      <span style={{ fontWeight: '600' }}>{orderDetail.table_number}</span>
                    </div>
                  )}
                  <div style={styles.modalGridItem}>
                    <span>日時</span>
                    <span style={{ fontWeight: '600' }}>
                      {format(new Date(orderDetail.order_date), 'M/d(E) HH:mm', { locale: ja })}
                    </span>
                  </div>
                </div>
              </div>

              {/* 商品一覧 */}
              <div style={styles.modalSection}>
                <div style={styles.modalSectionTitle}>注文商品</div>
                <div style={styles.tableWrapper}>
                  <table style={{ ...styles.table, fontSize: '13px' }}>
                    <thead>
                      <tr style={styles.tableHeader}>
                        <th style={styles.th}>商品名</th>
                        <th style={{ ...styles.th, textAlign: 'center' }}>数量</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>単価</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>小計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderDetail.order_items.map((item, i) => (
                        <tr key={item.id} style={i % 2 === 0 ? styles.tableRowEven : styles.tableRow}>
                          <td style={styles.td}>
                            <div>{item.product_name}</div>
                            {item.cast_name && item.cast_name.length > 0 && (
                              <div style={{ fontSize: '11px', color: '#86868b' }}>
                                {item.cast_name.join(', ')}
                              </div>
                            )}
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center' }}>{item.quantity}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>{currencyFormatter.format(item.unit_price)}</td>
                          <td style={{ ...styles.td, textAlign: 'right' }}>{currencyFormatter.format(item.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 金額明細 */}
              <div style={styles.modalSection}>
                <div style={styles.modalSectionTitle}>金額明細</div>
                <div style={styles.modalGrid}>
                  <div style={styles.modalGridItem}>
                    <span>小計（税抜）</span>
                    <span>{currencyFormatter.format(orderDetail.subtotal_excl_tax || 0)}</span>
                  </div>
                  {(orderDetail.service_charge || 0) > 0 && (
                    <div style={styles.modalGridItem}>
                      <span>サービス料</span>
                      <span>{currencyFormatter.format(orderDetail.service_charge)}</span>
                    </div>
                  )}
                  <div style={styles.modalGridItem}>
                    <span>消費税</span>
                    <span>{currencyFormatter.format(orderDetail.tax_amount || 0)}</span>
                  </div>
                  <div style={{
                    ...styles.modalGridItem,
                    borderTop: '2px solid #e5e5e5',
                    paddingTop: '8px',
                    marginTop: '4px'
                  }}>
                    <span style={{ fontWeight: '600' }}>合計</span>
                    <span style={{ fontWeight: '700', fontSize: '18px', color: '#5856D6' }}>
                      {currencyFormatter.format(orderDetail.total_incl_tax || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button
                onClick={() => setSelectedOrderId(null)}
                style={{ ...styles.modalButton, backgroundColor: '#5856D6' }}
              >
                閉じる
              </button>
            </div>
          </div>
        </>
      )}

      {/* 日別勤務時間・時給モーダル */}
      {showDailyWageModal && (
        <>
          <div
            style={styles.modalOverlay}
            onClick={() => setShowDailyWageModal(false)}
          />
          <div style={{ ...styles.modal, maxWidth: '700px' }}>
            <div style={{ ...styles.modalHeader, backgroundColor: '#34C759' }}>
              <h3 style={styles.modalTitle}>日別勤務時間</h3>
              <button
                onClick={() => setShowDailyWageModal(false)}
                style={styles.modalCloseBtn}
              >
                ✕
              </button>
            </div>

            <div style={styles.modalContent}>
              {/* サマリー */}
              <div style={styles.modalSummary}>
                <div style={styles.modalSummaryItem}>
                  <div style={styles.modalSummaryLabel}>出勤日数</div>
                  <div style={styles.modalSummaryValue}>{dailyDetails.filter(d => d.workHours > 0).length}日</div>
                </div>
                {summary.useWageData && (
                  <>
                    <div style={styles.modalSummaryItem}>
                      <div style={styles.modalSummaryLabel}>勤務時間</div>
                      <div style={styles.modalSummaryValue}>{summary.totalWorkHours}h</div>
                    </div>
                    <div style={styles.modalSummaryItem}>
                      <div style={styles.modalSummaryLabel}>平均時給</div>
                      <div style={{ ...styles.modalSummaryValue, color: '#34C759' }}>
                        {summary.totalWorkHours > 0
                          ? currencyFormatter.format(Math.round(summary.totalWageAmount / summary.totalWorkHours))
                          : '—'}
                      </div>
                    </div>
                    <div style={styles.modalSummaryItem}>
                      <div style={styles.modalSummaryLabel}>時給収入</div>
                      <div style={styles.modalSummaryValue}>
                        {currencyFormatter.format(summary.totalWageAmount)}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 日別一覧 */}
              <div style={styles.modalSection}>
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={styles.tableHeader}>
                        <th style={styles.th}>日付</th>
                        <th style={styles.th}>出勤時間</th>
                        <th style={styles.th}>ステータス</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>休憩</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>遅刻</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>時間</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>時給額</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>時給</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyDetails
                        .filter(d => d.workHours > 0)
                        .map((day, i) => {
                          const attendance = attendanceData.find(a => a.date === day.date)
                          const hourlyRate = day.workHours > 0
                            ? Math.round(day.wageAmount / day.workHours)
                            : 0

                          // 出勤時間のフォーマット
                          let timeRange = '—'
                          if (attendance?.check_in_datetime && attendance?.check_out_datetime) {
                            const checkIn = new Date(attendance.check_in_datetime)
                            const checkOut = new Date(attendance.check_out_datetime)
                            timeRange = `${format(checkIn, 'HH:mm')}〜${format(checkOut, 'HH:mm')}`
                          }

                          return (
                            <tr
                              key={day.date}
                              style={i % 2 === 0 ? styles.tableRowEven : styles.tableRow}
                            >
                              <td style={styles.td}>
                                {format(new Date(day.date), 'M/d(E)', { locale: ja })}
                              </td>
                              <td style={{ ...styles.td, fontSize: '12px' }}>{timeRange}</td>
                              <td style={styles.td}>
                                <span style={{
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  backgroundColor: attendance?.status === '遅刻' ? '#FFE5E5' :
                                                   attendance?.status === '早退' ? '#FFF3E5' :
                                                   attendance?.status === '欠勤' ? '#FFE5E5' : '#E5F6E5',
                                  color: attendance?.status === '遅刻' ? '#D32F2F' :
                                         attendance?.status === '早退' ? '#F57C00' :
                                         attendance?.status === '欠勤' ? '#D32F2F' : '#388E3C'
                                }}>
                                  {attendance?.status || '出勤'}
                                </span>
                              </td>
                              <td style={{ ...styles.td, textAlign: 'right', fontSize: '12px' }}>
                                {attendance?.break_minutes ? `${attendance.break_minutes}分` : '—'}
                              </td>
                              <td style={{ ...styles.td, textAlign: 'right', fontSize: '12px', color: attendance?.late_minutes ? '#D32F2F' : undefined }}>
                                {attendance?.late_minutes ? `${attendance.late_minutes}分` : '—'}
                              </td>
                              <td style={{ ...styles.td, textAlign: 'right' }}>{day.workHours}h</td>
                              <td style={{ ...styles.td, textAlign: 'right' }}>
                                {currencyFormatter.format(day.wageAmount)}
                              </td>
                              <td style={{ ...styles.td, textAlign: 'right', color: '#34C759', fontWeight: '600' }}>
                                {currencyFormatter.format(hourlyRate)}
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div style={styles.modalFooter}>
              <button
                onClick={() => setShowDailyWageModal(false)}
                style={{ ...styles.modalButton, backgroundColor: '#34C759' }}
              >
                閉じる
              </button>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  pageWrapper: {
    display: 'flex',
    gap: '20px',
    padding: '20px',
    backgroundColor: '#f5f6fa',
    minHeight: '100vh'
  },
  sidebar: {
    width: '200px',
    flexShrink: 0,
    backgroundColor: 'white',
    borderRadius: '10px',
    padding: '15px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    maxHeight: 'calc(100vh - 60px)',
    overflowY: 'auto' as const
  },
  sidebarTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#7f8c8d',
    marginBottom: '15px',
    marginTop: 0,
    textTransform: 'uppercase' as const
  },
  searchInput: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    marginBottom: '10px',
    boxSizing: 'border-box' as const
  },
  filterSelect: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    marginBottom: '15px',
    backgroundColor: 'white',
    cursor: 'pointer'
  },
  castList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '5px'
  },
  castItem: {
    padding: '10px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#f8f9fa',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: '14px',
    color: '#2c3e50',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'all 0.2s',
    width: '100%'
  },
  castItemActive: {
    backgroundColor: '#3498db',
    color: 'white'
  },
  castInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    flex: 1,
    minWidth: 0
  },
  castName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const
  },
  castStatus: {
    fontSize: '11px',
    fontWeight: '500'
  },
  noResults: {
    textAlign: 'center' as const,
    color: '#95a5a6',
    fontSize: '13px',
    padding: '20px 0'
  },
  container: {
    flex: 1,
    maxWidth: '900px',
    backgroundColor: 'white',
    borderRadius: '10px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  subtitle: {
    fontSize: '14px',
    color: '#86868b',
    marginTop: '4px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px'
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#1d1d1f',
    margin: 0
  },
  controls: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  select: {
    padding: '8px 12px',
    fontSize: '14px',
    borderRadius: '8px',
    border: '1px solid #d1d1d6',
    backgroundColor: 'white',
    cursor: 'pointer',
    minWidth: '120px'
  },
  monthSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  monthButton: {
    padding: '8px 12px',
    fontSize: '14px',
    borderRadius: '8px',
    border: '1px solid #d1d1d6',
    backgroundColor: 'white',
    cursor: 'pointer'
  },
  monthLabel: {
    fontSize: '16px',
    fontWeight: '600',
    minWidth: '100px',
    textAlign: 'center'
  },
  compensationTypeLabel: {
    backgroundColor: '#f0f7ff',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#007AFF',
    marginBottom: '16px'
  },
  summarySection: {
    marginBottom: '24px'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
    marginBottom: '12px'
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#86868b',
    marginBottom: '4px'
  },
  summaryValue: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1d1d1f'
  },
  grossEarningsCard: {
    backgroundColor: '#007AFF',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  grossLabel: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'white'
  },
  grossValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'white'
  },
  section: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1d1d1f',
    marginTop: 0,
    marginBottom: '16px'
  },
  tableWrapper: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px'
  },
  tableHeader: {
    borderBottom: '2px solid #e5e5e5'
  },
  th: {
    padding: '10px 8px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#86868b',
    whiteSpace: 'nowrap'
  },
  tableRow: {
    borderBottom: '1px solid #f0f0f0'
  },
  tableRowEven: {
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa'
  },
  tableTotal: {
    borderTop: '2px solid #333',
    backgroundColor: '#f0f0f0'
  },
  td: {
    padding: '10px 8px',
    whiteSpace: 'nowrap'
  },
  noData: {
    textAlign: 'center',
    color: '#86868b',
    padding: '20px'
  },
  deductionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  deductionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #f0f0f0'
  },
  deductionName: {
    fontSize: '14px',
    color: '#1d1d1f'
  },
  deductionDetail: {
    fontSize: '12px',
    color: '#86868b',
    marginLeft: '4px'
  },
  deductionAmount: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#e74c3c'
  },
  deductionTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderTop: '2px solid #e5e5e5',
    marginTop: '8px',
    fontWeight: '600'
  },
  netEarningsSection: {
    backgroundColor: '#34C759',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  netEarningsLabel: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'white'
  },
  netEarningsValue: {
    fontSize: '32px',
    fontWeight: '700',
    color: 'white'
  },
  // Modal styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1000
  },
  modal: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#f5f5f7',
    borderRadius: '16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    zIndex: 1001,
    width: '90%',
    maxWidth: '500px',
    maxHeight: '85vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  },
  modalHeader: {
    padding: '16px 20px',
    background: '#007AFF',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  modalTitle: {
    margin: 0,
    fontSize: '17px',
    fontWeight: '600',
    color: 'white'
  },
  modalCloseBtn: {
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '6px 10px',
    borderRadius: '6px',
    color: 'white'
  },
  modalContent: {
    padding: '16px',
    overflowY: 'auto',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  modalSummary: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px'
  },
  modalSummaryItem: {
    background: 'white',
    borderRadius: '10px',
    padding: '12px',
    textAlign: 'center'
  },
  modalSummaryLabel: {
    fontSize: '12px',
    color: '#86868b',
    marginBottom: '4px'
  },
  modalSummaryValue: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1d1d1f'
  },
  modalSection: {
    background: 'white',
    borderRadius: '10px',
    padding: '14px'
  },
  modalSectionTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#86868b',
    marginBottom: '10px'
  },
  modalGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  modalGridItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '14px'
  },
  modalItemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  modalItem: {
    borderBottom: '1px solid #f0f0f0',
    paddingBottom: '10px'
  },
  modalItemMain: {
    marginBottom: '4px'
  },
  modalItemName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#1d1d1f'
  },
  modalItemCategory: {
    fontSize: '12px',
    color: '#86868b'
  },
  modalItemDetail: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  modalFooter: {
    padding: '12px 16px',
    borderTop: '1px solid #e5e5e5'
  },
  modalButton: {
    width: '100%',
    padding: '12px',
    fontSize: '15px',
    fontWeight: '600',
    backgroundColor: '#007AFF',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer'
  }
}
