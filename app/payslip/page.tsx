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

interface WageStatus {
  id: number
  name: string
  hourly_wage: number
}

interface DailyStats {
  date: string
  work_hours: number
  wage_amount: number
  total_sales_item_based: number
  total_sales_receipt_based: number
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
  type: 'percentage' | 'fixed' | 'penalty_status' | 'penalty_late' | 'daily_payment' | 'manual' | 'per_attendance'
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
  status_id: number | null
  hourly_wage_override: number | null
}

// 伝票ごとの商品データ（日別詳細モーダル用）
interface CastDailyItem {
  id: number
  date: string
  order_id: string | null
  table_number: string | null
  guest_name: string | null
  product_name: string
  category: string | null
  quantity: number
  subtotal: number
  is_self: boolean
  self_sales: number
  help_sales: number
  needs_cast: boolean
  cast_id: number
  help_cast_id: number | null
  // 売上集計方法別の値
  self_sales_item_based: number
  self_sales_receipt_based: number
  // 商品バック情報（計算時点の値）
  self_back_rate: number
  self_back_amount: number
  help_back_rate: number
  help_back_amount: number
}

// 伝票ごとにグループ化したデータ
interface OrderGroup {
  orderId: string
  tableNumber: string | null
  guestName: string | null
  items: CastDailyItem[]
  totalSales: number
  totalBack: number
  type: 'self' | 'help'
  oshiCastId?: number
  oshiCastName?: string
}

interface OrderItemWithTax {
  id: number
  order_id: string
  product_name: string
  category: string | null
  cast_name: string[] | null  // 配列として保存されている
  quantity: number
  unit_price: number
  subtotal: number
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
  totalSalesItemBased: number
  totalSalesReceiptBased: number
  productBack: number
  selfBack: number     // 推し商品バック
  helpBack: number     // ヘルプ商品バック
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
  const [workDayStatusIds, setWorkDayStatusIds] = useState<Set<string>>(new Set())
  const [compensationSettings, setCompensationSettings] = useState<CompensationSettings | null>(null)
  const compensationSettingsRef = useRef<CompensationSettings | null>(null)
  const [salesSettings, setSalesSettings] = useState<SalesSettings | null>(null)
  const [backRates, setBackRates] = useState<CastBackRate[]>([])
  const [wageStatuses, setWageStatuses] = useState<WageStatus[]>([])
  const [castDailyItems, setCastDailyItems] = useState<CastDailyItem[]>([])  // cast_daily_items データ（伝票詳細用）- 推しとして
  const [helpDailyItems, setHelpDailyItems] = useState<CastDailyItem[]>([])  // cast_daily_items データ（ヘルプとして）
  const [dailySalesData, setDailySalesData] = useState<Map<string, DailySalesData>>(new Map())
  const [savedPayslip, setSavedPayslip] = useState<SavedPayslip | null>(null)
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [recalcProgress, setRecalcProgress] = useState({ current: 0, total: 0, castName: '' })
  const [showRecalcModal, setShowRecalcModal] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [csvExporting, setCsvExporting] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)
  const [selectedDayDetail, setSelectedDayDetail] = useState<string | null>(null) // 日別詳細モーダル用
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set()) // 展開中の伝票ID
  const [showDailyWageModal, setShowDailyWageModal] = useState(false) // 日別時給モーダル用
  const [selectedProductDetail, setSelectedProductDetail] = useState<{
    productName: string
    category: string | null
    type: 'self' | 'tableHelp' | 'help'
    helpCastId?: number  // 卓内ヘルプの場合
    oshiCastId?: number  // ヘルプ商品の場合（推しキャストID）
  } | null>(null) // 商品別詳細モーダル用
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null) // 伝票詳細モーダル用
  const [orderDetail, setOrderDetail] = useState<{
    id: string
    receipt_number: string | null
    guest_name: string | null
    staff_name: string | null
    table_number: string | null
    order_date: string
    subtotal_incl_tax: number
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

    // 出勤扱いのステータスIDを取得（per_attendance控除用）
    const { data: statuses } = await supabase
      .from('attendance_statuses')
      .select('id, is_active')
      .eq('store_id', storeId)

    if (statuses) {
      const workDayIds = new Set(
        statuses
          .filter(s => s.is_active)
          .map(s => s.id)
      )
      setWorkDayStatusIds(workDayIds)
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

  // 時給ステータスを取得
  const loadWageStatuses = useCallback(async () => {
    const { data, error } = await supabase
      .from('wage_statuses')
      .select('id, name, hourly_wage')
      .eq('store_id', storeId)
      .eq('is_active', true)

    if (error) {
      console.error('時給ステータス取得エラー:', error)
    }
    setWageStatuses(data || [])
  }, [storeId])

  // キャストの報酬設定を取得
  const loadCompensationSettings = useCallback(async (castId: number): Promise<CompensationSettings | null> => {
    const { data, error } = await supabase
      .from('compensation_settings')
      .select('enabled_deduction_ids, compensation_types, payment_selection_method, selected_compensation_type_id, status_id, hourly_wage_override')
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
        total_sales_receipt_based,
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

    const { data, error} = await supabase
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

    // cast_daily_items を取得（伝票詳細表示用）
    const startDate = format(startOfMonth(month), 'yyyy-MM-dd')
    const endDate = format(endOfMonth(month), 'yyyy-MM-dd')

    // 1. 推しとして参加した分（cast_id = castId）
    const { data: dailyItems, error: dailyItemsError } = await supabase
      .from('cast_daily_items')
      .select('id, order_id, table_number, guest_name, product_name, category, quantity, subtotal, is_self, self_sales, help_sales, needs_cast, date, cast_id, help_cast_id, self_sales_item_based, self_sales_receipt_based, self_back_rate, self_back_amount, help_back_rate, help_back_amount')
      .eq('cast_id', castId)
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    if (dailyItemsError) {
      console.error('cast_daily_items取得エラー:', dailyItemsError)
      setCastDailyItems([])
    } else {
      console.log(`[DEBUG] cast_daily_items取得: castId=${castId}, 件数=${(dailyItems || []).length}`)
      if (dailyItems && dailyItems.length > 0) {
        const totalSelfBack = dailyItems.reduce((sum: number, item: { self_back_amount?: number }) => sum + (item.self_back_amount || 0), 0)
        console.log(`[DEBUG] self_back_amount合計: ${totalSelfBack}`)
      }
      setCastDailyItems((dailyItems || []) as CastDailyItem[])
    }

    // 2. ヘルプとして参加した分（help_cast_id = castId）
    const { data: helpItems, error: helpItemsError } = await supabase
      .from('cast_daily_items')
      .select('id, order_id, table_number, guest_name, product_name, category, quantity, subtotal, is_self, self_sales, help_sales, needs_cast, date, cast_id, help_cast_id, self_sales_item_based, self_sales_receipt_based, self_back_rate, self_back_amount, help_back_rate, help_back_amount')
      .eq('help_cast_id', castId)
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    if (helpItemsError) {
      console.error('cast_daily_items(help)取得エラー:', helpItemsError)
      setHelpDailyItems([])
    } else {
      console.log(`[DEBUG] cast_daily_items(help)取得: castId=${castId}, 件数=${(helpItems || []).length}`)
      if (helpItems && helpItems.length > 0) {
        const totalHelpBack = helpItems.reduce((sum: number, item: { help_back_amount?: number }) => sum + (item.help_back_amount || 0), 0)
        console.log(`[DEBUG] help_back_amount合計: ${totalHelpBack}`)
      }
      setHelpDailyItems((helpItems || []) as CastDailyItem[])
    }
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
  // cast_daily_stats + payslip_items から売上データを構築
  const calculateSummaryFromStats = useCallback(() => {
    // dailySalesDataを作成（日別データ）
    const dailyMap = new Map<string, any>()

    // savedPayslipのdaily_detailsから商品バックを取得するためのマップを作成
    const payslipBackMap = new Map<string, number>()
    if (savedPayslip?.daily_details) {
      savedPayslip.daily_details.forEach((detail: { date: string; back?: number }) => {
        payslipBackMap.set(detail.date, detail.back || 0)
      })
    }

    // cast_daily_statsから売上データを取得（推し小計・伝票小計の両方）
    dailyStats.forEach(stat => {
      // savedPayslipに商品バックがあればそれを優先、なければcast_daily_statsから
      const productBack = payslipBackMap.get(stat.date) ?? stat.product_back_item_based ?? 0

      dailyMap.set(stat.date, {
        date: stat.date,
        // 推し小計（item_based）
        totalSalesItemBased: stat.total_sales_item_based || 0,
        // 伝票小計（receipt_based）
        totalSalesReceiptBased: stat.total_sales_receipt_based || 0,
        // 従来の totalSales は推し小計をデフォルトとして使用
        totalSales: stat.total_sales_item_based || 0,
        selfSales: stat.self_sales_item_based || 0,
        helpSales: stat.help_sales_item_based || 0,
        baseSales: 0,
        storeSales: 0,
        productBack: productBack,
        selfBack: 0,   // cast_daily_itemsから計算（dailyDetailsで設定）
        helpBack: 0,   // cast_daily_itemsから計算（dailyDetailsで設定）
        workHours: stat.work_hours || 0,
        wageAmount: stat.wage_amount || 0,
        items: []
      })
    })

    setDailySalesData(dailyMap)
  }, [dailyStats, savedPayslip])

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
      await loadWageStatuses()
      setInitialized(true)
      setLoading(false)
    }
    init()
  }, [loadCasts, loadDeductionSettings, loadSalesSettings, loadBackRates, loadWageStatuses, storeLoading, storeId])

  // キャストまたは月が変わったらデータを再取得（初期ロード完了後のみ）
  // ※ キャスト切り替え時のチカチカを防ぐため、loading状態は変更しない
  useEffect(() => {
    if (!initialized) return
    if (selectedCastId && casts.length > 0) {
      const loadData = async () => {
        await loadDailyStats(selectedCastId, selectedMonth)
        await loadAttendanceData(selectedCastId, selectedMonth)
        await loadCompensationSettings(selectedCastId)
        await loadPayslip(selectedCastId, selectedMonth)
      }
      loadData()
    }
  }, [initialized, selectedCastId, selectedMonth, casts, loadDailyStats, loadAttendanceData, loadCompensationSettings, loadPayslip])

  // dailyStatsが更新されたら売上データを構築
  useEffect(() => {
    if (dailyStats.length > 0) {
      calculateSummaryFromStats()
    }
  }, [dailyStats, calculateSummaryFromStats])

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
          subtotal_incl_tax,
          service_charge,
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

  // 報酬形態ごとの総報酬額を計算する関数
  const calculateTotalCompensation = useCallback((
    compensationType: CompensationType,
    totalWorkHours: number,
    totalWageAmount: number,
    totalSalesItemBased: number,
    totalSalesReceiptBased: number,
    totalProductBack: number
  ): number => {
    let total = 0

    // 報酬形態ごとのsales_aggregationに基づいて売上を選択
    const totalSales = compensationType.sales_aggregation === 'receipt_based'
      ? totalSalesReceiptBased
      : totalSalesItemBased

    // 時給収入（時給がオンの場合のみ）
    if (compensationType.hourly_rate && compensationType.hourly_rate > 0) {
      total += totalWageAmount
    }

    // 売上バック
    if (compensationType.use_sliding_rate && compensationType.sliding_rates) {
      // スライド式
      const rate = compensationType.sliding_rates.find(
        r => totalSales >= r.min && (r.max === 0 || totalSales <= r.max)
      )
      if (rate) {
        total += Math.round(totalSales * rate.rate / 100)
      }
    } else {
      // 固定率
      total += Math.round(totalSales * compensationType.commission_rate / 100)
    }

    // 商品バック（use_product_backがtrueの場合のみ）
    if (compensationType.use_product_back) {
      total += totalProductBack
    }

    // 固定額
    total += compensationType.fixed_amount || 0

    return total
  }, [])

  // 各報酬形態の比較結果を保持
  const compensationComparison = useMemo((): Array<{ type: CompensationType; total: number }> | null => {
    if (!compensationSettings?.compensation_types) return null
    if (compensationSettings.payment_selection_method !== 'highest') return null

    const types = compensationSettings.compensation_types.filter(t => t.is_enabled)
    if (types.length === 0) return null

    // 集計データを計算
    const totalWorkHours = dailyStats.reduce((sum, d) => sum + (d.work_hours || 0), 0)
    const totalWageAmount = dailyStats.reduce((sum, d) => sum + (d.wage_amount || 0), 0)

    // 推し小計と伝票小計の両方を集計
    let totalSalesItemBased = 0
    let totalSalesReceiptBased = 0
    let totalProductBack = 0
    dailySalesData.forEach(day => {
      totalSalesItemBased += day.totalSalesItemBased || day.totalSales || 0
      totalSalesReceiptBased += day.totalSalesReceiptBased || day.totalSales || 0
      totalProductBack += day.productBack
    })

    // 各報酬形態で総報酬額を計算（それぞれのsales_aggregationを使用）
    return types.map(type => ({
      type,
      total: calculateTotalCompensation(type, totalWorkHours, totalWageAmount, totalSalesItemBased, totalSalesReceiptBased, totalProductBack)
    }))
  }, [compensationSettings, dailyStats, dailySalesData, calculateTotalCompensation])

  // アクティブな報酬形態を取得
  const activeCompensationType = useMemo((): CompensationType | null => {
    if (!compensationSettings?.compensation_types) return null

    const types = compensationSettings.compensation_types.filter(t => t.is_enabled)
    if (types.length === 0) return null

    if (compensationSettings.payment_selection_method === 'specific' && compensationSettings.selected_compensation_type_id) {
      return types.find(t => t.id === compensationSettings.selected_compensation_type_id) || types[0]
    }

    // highest: 各報酬形態で計算して最も高いものを選択
    if (compensationSettings.payment_selection_method === 'highest' && compensationComparison) {
      // 最も高い報酬額の形態を選択
      const highest = compensationComparison.reduce((max, current) =>
        current.total > max.total ? current : max
      , compensationComparison[0])

      return highest.type
    }

    // デフォルト（念のため）
    return types[0]
  }, [compensationSettings, compensationComparison])

  // 実際の時給を取得（status_idまたはhourly_wage_overrideから）
  // ※ 時給は報酬形態に関係なく、status_idから取得して表示する
  const actualHourlyWage = useMemo((): number | null => {
    // 1. hourly_wage_override が設定されていればそれを使用
    if (compensationSettings?.hourly_wage_override && compensationSettings.hourly_wage_override > 0) {
      return compensationSettings.hourly_wage_override
    }
    // 2. status_id があればwage_statusesから時給を取得
    if (compensationSettings?.status_id) {
      const wageStatus = wageStatuses.find(s => s.id === compensationSettings.status_id)
      if (wageStatus) {
        return wageStatus.hourly_wage
      }
    }
    return null
  }, [compensationSettings, wageStatuses])

  // 集計値を計算
  const summary = useMemo(() => {
    // 時給関連はcast_daily_statsから
    const totalWorkHours = dailyStats.reduce((sum, d) => sum + (d.work_hours || 0), 0)
    const totalWageAmount = dailyStats.reduce((sum, d) => sum + (d.wage_amount || 0), 0)

    // 報酬形態のsales_aggregationに基づいて売上を選択
    const salesAggregation = activeCompensationType?.sales_aggregation || 'item_based'

    // 売上はcast_daily_statsから計算（推し小計 or 伝票小計）
    let totalSales = 0
    dailySalesData.forEach(day => {
      // sales_aggregationに基づいて正しい売上を使用
      if (salesAggregation === 'receipt_based') {
        totalSales += day.totalSalesReceiptBased || day.totalSales || 0
      } else {
        totalSales += day.totalSalesItemBased || day.totalSales || 0
      }
    })

    // 商品バックはcast_daily_itemsから直接計算（推しバック + ヘルプバック）
    const totalSelfBack = castDailyItems.reduce((sum, item) => sum + (item.self_back_amount || 0), 0)
    const totalHelpBack = helpDailyItems.reduce((sum, item) => sum + (item.help_back_amount || 0), 0)
    const totalProductBack = totalSelfBack + totalHelpBack

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

    // 商品バックを総支給額に含めるかどうか（報酬形態設定）
    const useProductBackForGross = activeCompensationType?.use_product_back ?? false

    // 総支給額（商品バックは報酬形態設定に依存）
    const grossEarnings = (useWageData ? totalWageAmount : 0) + salesBack + (useProductBackForGross ? totalProductBack : 0) + fixedAmount

    return {
      totalWorkHours: Math.round(totalWorkHours * 100) / 100,
      totalWageAmount,
      totalSales,
      salesBack,
      totalProductBack,  // 表示用は常に計算値を返す
      fixedAmount,
      grossEarnings,
      useWageData: !!useWageData,
      salesAggregation
    }
  }, [dailyStats, dailySalesData, activeCompensationType, castDailyItems, helpDailyItems])

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

    // 出勤控除（1出勤あたり×出勤日数）
    deductionTypes
      .filter(d => d.type === 'per_attendance' && (enabledIds.length === 0 || enabledIds.includes(d.id)))
      .forEach(d => {
        // 出勤扱いのステータスを持つ日数をカウント
        const workDayCount = attendanceData.filter(a =>
          a.status_id && workDayStatusIds.has(a.status_id)
        ).length
        if (workDayCount > 0 && d.default_amount > 0) {
          results.push({
            name: d.name,
            amount: d.default_amount * workDayCount,
            count: workDayCount,
            detail: `${workDayCount}日 × ¥${d.default_amount.toLocaleString()}`
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
  }, [deductionTypes, attendanceData, latePenaltyRules, workDayStatusIds, compensationSettings, summary.grossEarnings, calculateLatePenalty])

  // 控除合計・差引支給額
  const totalDeduction = deductions.reduce((sum, d) => sum + d.amount, 0)
  const netEarnings = summary.grossEarnings - totalDeduction

  // 報酬形態ごとの売上集計方法を取得（異なる場合のみ複数表示）
  const salesAggregationByType = useMemo(() => {
    if (!compensationSettings?.compensation_types) return []
    const types = compensationSettings.compensation_types.filter(t => t.is_enabled)
    const typeInfo = types.map(t => ({
      id: t.id,
      name: t.name,
      aggregation: t.sales_aggregation
    }))

    // 全て同じ集計方法なら1つだけ返す
    const uniqueAggregations = new Set(typeInfo.map(t => t.aggregation))
    if (uniqueAggregations.size <= 1) {
      return typeInfo.slice(0, 1)
    }

    return typeInfo
  }, [compensationSettings])

  // 有効な全報酬形態（比較表示用）
  const allEnabledCompensationTypes = useMemo(() => {
    if (!compensationSettings?.compensation_types) return []
    return compensationSettings.compensation_types.filter(t => t.is_enabled)
  }, [compensationSettings])

  // 報酬形態ごとのカラムハイライト色
  const compensationTypeColors = useMemo(() => {
    const colors = [
      { border: '#1976d2', bg: '#e3f2fd' },  // 青
      { border: '#2e7d32', bg: '#e8f5e9' },  // 緑
      { border: '#f57c00', bg: '#fff3e0' },  // オレンジ
      { border: '#7b1fa2', bg: '#f3e5f5' },  // 紫
    ]
    const typeColorMap = new Map<string, { border: string; bg: string }>()
    allEnabledCompensationTypes.forEach((type, idx) => {
      typeColorMap.set(type.id, colors[idx % colors.length])
    })
    return typeColorMap
  }, [allEnabledCompensationTypes])

  // 各カラム/カードがどの報酬形態に使われるかをチェック
  const columnHighlights = useMemo(() => {
    const highlights = {
      wageAmount: [] as { typeId: string; name: string; color: { border: string; bg: string } }[],
      sales: [] as { typeId: string; name: string; color: { border: string; bg: string } }[],
      selfBack: [] as { typeId: string; name: string; color: { border: string; bg: string } }[],
      helpBack: [] as { typeId: string; name: string; color: { border: string; bg: string } }[],
      fixedAmount: [] as { typeId: string; name: string; color: { border: string; bg: string } }[],
      productBack: [] as { typeId: string; name: string; color: { border: string; bg: string } }[],
    }

    allEnabledCompensationTypes.forEach(type => {
      const color = compensationTypeColors.get(type.id)
      if (!color) return

      // 時間報酬: hourly_rate > 0
      if (type.hourly_rate && type.hourly_rate > 0) {
        highlights.wageAmount.push({ typeId: type.id, name: type.name, color })
      }
      // 売上: commission_rate > 0 or use_sliding_rate
      if ((type.commission_rate && type.commission_rate > 0) || type.use_sliding_rate) {
        highlights.sales.push({ typeId: type.id, name: type.name, color })
      }
      // 推し商品バック: use_product_back
      if (type.use_product_back) {
        highlights.selfBack.push({ typeId: type.id, name: type.name, color })
      }
      // ヘルプ商品バック: use_help_product_back
      if (type.use_help_product_back) {
        highlights.helpBack.push({ typeId: type.id, name: type.name, color })
      }
      // 固定額: fixed_amount > 0
      if (type.fixed_amount && type.fixed_amount > 0) {
        highlights.fixedAmount.push({ typeId: type.id, name: type.name, color })
      }
      // 商品バック（カード用）: use_product_back or use_help_product_back
      if (type.use_product_back || type.use_help_product_back) {
        highlights.productBack.push({ typeId: type.id, name: type.name, color })
      }
    })

    return highlights
  }, [allEnabledCompensationTypes, compensationTypeColors])

  // 報酬形態ごとの内訳計算（比較表示用）
  const compensationTypeBreakdowns = useMemo(() => {
    return allEnabledCompensationTypes.map(type => {
      const color = compensationTypeColors.get(type.id)
      const items: { label: string; amount: number }[] = []
      let total = 0

      // 時間報酬
      if (type.hourly_rate && type.hourly_rate > 0) {
        const amount = summary.totalWageAmount
        items.push({ label: '時間報酬', amount })
        total += amount
      }

      // 売上バック
      if ((type.commission_rate && type.commission_rate > 0) || type.use_sliding_rate) {
        const amount = summary.salesBack
        items.push({ label: '売上バック', amount })
        total += amount
      }

      // 商品バック
      if (type.use_product_back || type.use_help_product_back) {
        const amount = summary.totalProductBack
        items.push({ label: '商品バック', amount })
        total += amount
      }

      // 固定額
      if (type.fixed_amount && type.fixed_amount > 0) {
        const amount = type.fixed_amount
        items.push({ label: '固定額', amount })
        total += amount
      }

      return {
        id: type.id,
        name: type.name,
        color,
        items,
        total
      }
    })
  }, [allEnabledCompensationTypes, compensationTypeColors, summary])

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

      // 勤務時間を整形（19:00〜02:00 形式）
      let workTimeRange = ''
      if (attendance?.check_in_datetime && attendance?.check_out_datetime) {
        const checkIn = new Date(attendance.check_in_datetime)
        const checkOut = new Date(attendance.check_out_datetime)
        const checkInTime = format(checkIn, 'HH:mm')
        const checkOutTime = format(checkOut, 'HH:mm')
        workTimeRange = `${checkInTime}〜${checkOutTime}`
      }

      // 商品バックはcast_daily_itemsから直接計算（推しバック + ヘルプバック）
      const daySelfBack = castDailyItems
        .filter(item => item.date === dateStr)
        .reduce((sum, item) => sum + (item.self_back_amount || 0), 0)
      const dayHelpBack = helpDailyItems
        .filter(item => item.date === dateStr)
        .reduce((sum, item) => sum + (item.help_back_amount || 0), 0)
      const dayProductBack = daySelfBack + dayHelpBack

      return {
        date: dateStr,
        dayOfMonth: format(day, 'd'),
        dayOfWeek: format(day, 'E', { locale: ja }),
        workHours: stats?.work_hours || 0,
        workTimeRange,
        wageAmount: stats?.wage_amount || 0,
        sales: sales?.totalSales || 0,
        salesItemBased: sales?.totalSalesItemBased || 0,
        salesReceiptBased: sales?.totalSalesReceiptBased || 0,
        productBack: dayProductBack,
        selfBack: daySelfBack,
        helpBack: dayHelpBack,
        dailyPayment: attendance?.daily_payment || 0,
        lateMinutes: attendance?.late_minutes || 0
      }
    }).filter(d => d.workHours > 0 || d.dailyPayment > 0 || d.lateMinutes > 0 || d.sales > 0 || d.salesItemBased > 0 || d.salesReceiptBased > 0)
  }, [selectedMonth, dailyStats, attendanceData, dailySalesData, castDailyItems, helpDailyItems])

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

  // 全キャスト再計算
  const recalculateAll = useCallback(async () => {
    const yearMonth = format(selectedMonth, 'yyyy-MM')

    setRecalculating(true)
    setShowRecalcModal(true)

    try {
      // アクティブなキャストリストを取得（在籍中のキャスト）
      const activeCasts = casts.filter(c => c.status === '在籍')
      const total = activeCasts.length

      if (total === 0) {
        alert('再計算対象のキャストがいません')
        setRecalculating(false)
        setShowRecalcModal(false)
        return
      }

      setRecalcProgress({ current: 0, total, castName: '' })

      let successCount = 0
      let errorCount = 0

      // 各キャストについて順次計算
      for (let i = 0; i < activeCasts.length; i++) {
        const cast = activeCasts[i]
        setRecalcProgress({ current: i + 1, total, castName: cast.name })

        try {
          const res = await fetch('/api/payslips/recalculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              store_id: storeId,
              year_month: yearMonth,
              cast_id: cast.id
            })
          })

          const result = await res.json()
          if (result.success) {
            successCount++
          } else {
            errorCount++
            console.error(`${cast.name}の計算失敗:`, result.error)
          }
        } catch (err) {
          errorCount++
          console.error(`${cast.name}の計算エラー:`, err)
        }
      }

      // 完了メッセージ
      alert(`再計算完了: 成功 ${successCount}件, 失敗 ${errorCount}件`)

      // 現在のキャストのデータを再読み込み
      if (selectedCastId) {
        await loadPayslip(selectedCastId, selectedMonth)
      }
    } catch (err) {
      console.error('再計算エラー:', err)
      alert('再計算に失敗しました')
    } finally {
      setRecalculating(false)
      setShowRecalcModal(false)
    }
  }, [storeId, selectedCastId, selectedMonth, casts, loadPayslip])

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
        margin: 10,
        preview: true
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
          {/* サマリーカード */}
          <div style={styles.summarySection}>
            {/* 基本情報 */}
            <div style={styles.summaryGrid}>
              <div
                style={{ ...styles.summaryCard, cursor: 'pointer' }}
                onClick={() => setShowDailyWageModal(true)}
              >
                <div style={styles.summaryLabel}>出勤日数 ▶</div>
                <div style={styles.summaryValue}>{dailyDetails.filter(d => d.workHours > 0).length}日</div>
              </div>
              <div
                style={{ ...styles.summaryCard, cursor: 'pointer' }}
                onClick={() => setShowDailyWageModal(true)}
              >
                <div style={styles.summaryLabel}>勤務時間 ▶</div>
                <div style={styles.summaryValue}>{summary.totalWorkHours}h</div>
              </div>
              <div
                style={{ ...styles.summaryCard, cursor: 'pointer' }}
                onClick={() => setShowDailyWageModal(true)}
              >
                <div style={styles.summaryLabel}>平均時給 ▶</div>
                <div style={styles.summaryValue}>
                  {summary.totalWorkHours > 0
                    ? currencyFormatter.format(Math.round(summary.totalWageAmount / summary.totalWorkHours))
                    : '—'}
                </div>
              </div>
            </div>

            {/* 報酬形態比較 */}
            {compensationTypeBreakdowns.length > 0 && (
              <div style={{
                display: 'flex',
                gap: '24px',
                marginTop: '16px',
                flexWrap: 'wrap'
              }}>
                {compensationTypeBreakdowns.map(breakdown => (
                  <div
                    key={breakdown.id}
                    style={{
                      flex: '1 1 300px',
                      minWidth: '280px',
                      padding: '20px',
                      borderRadius: '12px',
                      backgroundColor: breakdown.color?.bg || '#f8f9fa',
                      border: `3px solid ${breakdown.color?.border || '#e0e0e0'}`
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '16px'
                    }}>
                      <div style={{
                        fontSize: '15px',
                        fontWeight: '600',
                        color: breakdown.color?.border || '#333'
                      }}>
                        {breakdown.name}
                      </div>
                      <div style={{
                        fontSize: '26px',
                        fontWeight: '700',
                        color: breakdown.color?.border || '#333'
                      }}>
                        {currencyFormatter.format(breakdown.total)}
                      </div>
                    </div>
                    <div style={{
                      display: 'flex',
                      gap: '10px',
                      flexWrap: 'wrap'
                    }}>
                      {breakdown.items.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            flex: '1',
                            minWidth: '80px',
                            padding: '10px 14px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(255,255,255,0.8)',
                            border: `1px solid ${breakdown.color?.border || '#e0e0e0'}50`
                          }}
                        >
                          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{item.label}</div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#333' }}>
                            {currencyFormatter.format(item.amount)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{
              ...styles.grossEarningsCard,
              marginTop: '20px',
              backgroundColor: activeCompensationType
                ? compensationTypeColors.get(activeCompensationType.id)?.border || '#1a365d'
                : '#1a365d'
            }}>
              <div style={styles.grossLabel}>総支給額</div>
              <div style={styles.grossValue}>{currencyFormatter.format(summary.grossEarnings)}</div>
            </div>

            {/* 控除内訳 */}
            <div style={{ marginTop: '20px' }}>
              <h2 style={{ ...styles.sectionTitle, marginBottom: '12px' }}>控除内訳</h2>
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
            <div style={{ ...styles.netEarningsSection, marginTop: '16px' }}>
              <div style={styles.netEarningsLabel}>差引支給額</div>
              <div style={styles.netEarningsValue}>{currencyFormatter.format(netEarnings)}</div>
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
                      <th style={{ ...styles.th, textAlign: 'center' }}>勤務時間</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>時間</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>時給</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>時間報酬</th>
                      {/* 報酬形態ごとに売上列を表示 */}
                      {salesAggregationByType.length > 1 ? (
                        salesAggregationByType.map((type, idx) => (
                          <th
                            key={type.id}
                            style={{
                              ...styles.th,
                              textAlign: 'right',
                              color: idx === 0 ? '#1565c0' : '#2e7d32'
                            }}
                          >
                            売上({type.name})
                          </th>
                        ))
                      ) : (
                        <th style={{ ...styles.th, textAlign: 'right' }}>売上</th>
                      )}
                      <th style={{ ...styles.th, textAlign: 'right' }}>推し商品バック</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>ヘルプ商品バック</th>
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
                        <td style={{ ...styles.td, textAlign: 'center', fontSize: '12px' }}>{day.workTimeRange || '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{day.workHours > 0 ? `${day.workHours}h` : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{actualHourlyWage ? currencyFormatter.format(actualHourlyWage) : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>{day.wageAmount > 0 ? currencyFormatter.format(day.wageAmount) : '-'}</td>
                        {/* 報酬形態ごとに売上を表示 */}
                        {salesAggregationByType.length > 1 ? (
                          salesAggregationByType.map((type, idx) => {
                            const salesValue = type.aggregation === 'item_based' ? day.salesItemBased : day.salesReceiptBased
                            return (
                              <td
                                key={type.id}
                                style={{
                                  ...styles.td,
                                  textAlign: 'right',
                                  color: idx === 0 ? '#1565c0' : '#2e7d32',
                                  fontWeight: activeCompensationType?.id === type.id ? '600' : '400'
                                }}
                              >
                                {salesValue > 0 ? currencyFormatter.format(salesValue) : '-'}
                              </td>
                            )
                          })
                        ) : (
                          (() => {
                            // 単一列の場合も報酬形態の設定に応じた売上を表示
                            const aggregation = salesAggregationByType[0]?.aggregation || 'item_based'
                            const salesValue = aggregation === 'receipt_based' ? day.salesReceiptBased : day.salesItemBased
                            return (
                              <td style={{ ...styles.td, textAlign: 'right' }}>{salesValue > 0 ? currencyFormatter.format(salesValue) : '-'}</td>
                            )
                          })()
                        )}
                        <td style={{ ...styles.td, textAlign: 'right', color: '#FF9500' }}>{day.selfBack > 0 ? currencyFormatter.format(day.selfBack) : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: '#27ae60' }}>{day.helpBack > 0 ? currencyFormatter.format(day.helpBack) : '-'}</td>
                        <td style={{ ...styles.td, textAlign: 'right', color: day.dailyPayment > 0 ? '#e74c3c' : undefined }}>
                          {day.dailyPayment > 0 ? currencyFormatter.format(day.dailyPayment) : '-'}
                        </td>
                      </tr>
                    ))}
                    {/* 合計行 */}
                    <tr style={styles.tableTotal}>
                      <td style={{ ...styles.td, fontWeight: 'bold' }}>合計</td>
                      <td style={styles.td}></td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>{summary.totalWorkHours}h</td>
                      <td style={styles.td}></td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>{currencyFormatter.format(summary.totalWageAmount)}</td>
                      {/* 報酬形態ごとに売上合計を表示 */}
                      {salesAggregationByType.length > 1 ? (
                        salesAggregationByType.map((type, idx) => {
                          const totalSalesValue = type.aggregation === 'item_based'
                            ? dailyDetails.reduce((sum, d) => sum + d.salesItemBased, 0)
                            : dailyDetails.reduce((sum, d) => sum + d.salesReceiptBased, 0)
                          return (
                            <td
                              key={type.id}
                              style={{
                                ...styles.td,
                                textAlign: 'right',
                                fontWeight: 'bold',
                                color: idx === 0 ? '#1565c0' : '#2e7d32'
                              }}
                            >
                              {currencyFormatter.format(totalSalesValue)}
                            </td>
                          )
                        })
                      ) : (
                        (() => {
                          // 単一列の場合も報酬形態の設定に応じた売上合計を表示
                          const aggregation = salesAggregationByType[0]?.aggregation || 'item_based'
                          const totalSalesValue = aggregation === 'receipt_based'
                            ? dailyDetails.reduce((sum, d) => sum + d.salesReceiptBased, 0)
                            : dailyDetails.reduce((sum, d) => sum + d.salesItemBased, 0)
                          return (
                            <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>{currencyFormatter.format(totalSalesValue)}</td>
                          )
                        })()
                      )}
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#FF9500' }}>{currencyFormatter.format(dailyDetails.reduce((sum, d) => sum + d.selfBack, 0))}</td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#27ae60' }}>{currencyFormatter.format(dailyDetails.reduce((sum, d) => sum + d.helpBack, 0))}</td>
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
              {(() => {
                // 1. 推し商品バック: 自分の卓で自分の商品 (is_self=true)
                const selfItems = castDailyItems.filter(item => item.is_self && item.self_back_amount > 0)
                const selfGrouped = new Map<string, {
                  productName: string
                  category: string | null
                  quantity: number
                  subtotal: number
                  backRate: number
                  backAmount: number
                  isBase: boolean
                }>()
                selfItems.forEach(item => {
                  const isBase = item.category === 'BASE'
                  const key = `${item.category || ''}:${item.product_name}:${isBase ? 'base' : 'pos'}`
                  const existing = selfGrouped.get(key)
                  if (existing) {
                    existing.quantity += item.quantity
                    existing.subtotal += item.self_sales
                    existing.backAmount += item.self_back_amount
                  } else {
                    selfGrouped.set(key, {
                      productName: item.product_name,
                      category: item.category,
                      quantity: item.quantity,
                      subtotal: item.self_sales,
                      backRate: item.self_back_rate,
                      backAmount: item.self_back_amount,
                      isBase
                    })
                  }
                })
                const selfList = Array.from(selfGrouped.values()).sort((a, b) => b.backAmount - a.backAmount)
                const selfTotal = selfList.reduce((sum, item) => sum + item.backAmount, 0)

                // 2. 卓内ヘルプ: 自分の卓で他キャストの商品 (is_self=false, help_cast_idあり)
                const tableHelpItems = castDailyItems.filter(item => !item.is_self && item.help_cast_id)
                const tableHelpGrouped = new Map<string, {
                  productName: string
                  category: string | null
                  quantity: number
                  selfSales: number
                  helpCastId: number
                  helpCastName: string
                  backRate: number
                  backAmount: number
                }>()
                tableHelpItems.forEach(item => {
                  const helpCast = casts.find(c => c.id === item.help_cast_id)
                  const helpCastName = helpCast?.name || '不明'
                  const key = `${item.category || ''}:${item.product_name}:${item.help_cast_id}`
                  const existing = tableHelpGrouped.get(key)
                  if (existing) {
                    existing.quantity += item.quantity
                    existing.selfSales += item.self_sales
                    existing.backAmount += item.help_back_amount
                  } else {
                    tableHelpGrouped.set(key, {
                      productName: item.product_name,
                      category: item.category,
                      quantity: item.quantity,
                      selfSales: item.self_sales,
                      helpCastId: item.help_cast_id!,
                      helpCastName,
                      backRate: item.help_back_rate,
                      backAmount: item.help_back_amount
                    })
                  }
                })
                const tableHelpList = Array.from(tableHelpGrouped.values()).sort((a, b) => b.backAmount - a.backAmount)
                const tableHelpTotal = tableHelpList.reduce((sum, item) => sum + item.backAmount, 0)

                // 3. ヘルプ商品バック: 他の推しの卓で自分がヘルプ (helpDailyItems)
                const helpGrouped = new Map<string, {
                  productName: string
                  category: string | null
                  quantity: number
                  subtotal: number
                  backRate: number
                  backAmount: number
                  oshiCastId: number
                  oshiCastName: string
                }>()
                helpDailyItems.filter(item => item.help_back_amount > 0).forEach(item => {
                  const oshiCast = casts.find(c => c.id === item.cast_id)
                  const oshiCastName = oshiCast?.name || '不明'
                  const key = `${item.category || ''}:${item.product_name}:${item.cast_id}`
                  const existing = helpGrouped.get(key)
                  if (existing) {
                    existing.quantity += item.quantity
                    existing.subtotal += item.help_sales || item.subtotal
                    existing.backAmount += item.help_back_amount
                  } else {
                    helpGrouped.set(key, {
                      productName: item.product_name,
                      category: item.category,
                      quantity: item.quantity,
                      subtotal: item.help_sales || item.subtotal,
                      backRate: item.help_back_rate,
                      backAmount: item.help_back_amount,
                      oshiCastId: item.cast_id,
                      oshiCastName
                    })
                  }
                })
                const helpList = Array.from(helpGrouped.values()).sort((a, b) => b.backAmount - a.backAmount)
                const helpTotal = helpList.reduce((sum, item) => sum + item.backAmount, 0)

                return (
                  <>
                    {/* 推し商品バック */}
                    {selfList.length > 0 && (
                      <div style={{ marginBottom: '20px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#155724' }}>
                          推し商品バック（自分の卓・自分の商品）
                        </h3>
                        <div style={styles.tableWrapper}>
                          <table style={styles.table}>
                            <thead>
                              <tr style={styles.tableHeader}>
                                <th style={styles.th}>カテゴリ</th>
                                <th style={styles.th}>商品名</th>
                                <th style={{ ...styles.th, textAlign: 'right' }}>単価</th>
                                <th style={{ ...styles.th, textAlign: 'right' }}>数量</th>
                                <th style={{ ...styles.th, textAlign: 'right' }}>金額</th>
                                <th style={{ ...styles.th, textAlign: 'center' }}>バック率</th>
                                <th style={{ ...styles.th, textAlign: 'right' }}>バック金額</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selfList.map((item, i) => (
                                <tr
                                  key={i}
                                  style={{ ...(i % 2 === 0 ? styles.tableRowEven : styles.tableRow), cursor: 'pointer' }}
                                  onClick={() => setSelectedProductDetail({
                                    productName: item.productName,
                                    category: item.category,
                                    type: 'self'
                                  })}
                                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f7ff'}
                                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#fafafa' : 'transparent'}
                                >
                                  <td style={{ ...styles.td, color: '#86868b', fontSize: '12px' }}>{item.category || '-'}</td>
                                  <td style={styles.td}>
                                    {item.productName}
                                    {item.isBase && (
                                      <span style={{
                                        marginLeft: '6px',
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
                                  <td style={{ ...styles.td, textAlign: 'right' }}>{currencyFormatter.format(item.quantity > 0 ? Math.round(item.subtotal / item.quantity) : 0)}</td>
                                  <td style={{ ...styles.td, textAlign: 'right' }}>{item.quantity}</td>
                                  <td style={{ ...styles.td, textAlign: 'right' }}>{currencyFormatter.format(item.subtotal)}</td>
                                  <td style={{ ...styles.td, textAlign: 'center' }}>{item.backRate}%</td>
                                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600', color: '#FF9500' }}>
                                    {currencyFormatter.format(item.backAmount)}
                                  </td>
                                </tr>
                              ))}
                              <tr style={styles.tableTotal}>
                                <td colSpan={6} style={{ ...styles.td, fontWeight: 'bold' }}>小計</td>
                                <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#FF9500' }}>
                                  {currencyFormatter.format(selfTotal)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* 卓内ヘルプ（参考情報） */}
                    {tableHelpList.length > 0 && (
                      <div style={{ marginBottom: '20px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#856404' }}>
                          卓内ヘルプ（自分の卓・他キャストの商品）
                        </h3>
                        <div style={styles.tableWrapper}>
                          <table style={styles.table}>
                            <thead>
                              <tr style={styles.tableHeader}>
                                <th style={styles.th}>カテゴリ</th>
                                <th style={styles.th}>商品名</th>
                                <th style={styles.th}>ヘルプ</th>
                                <th style={{ ...styles.th, textAlign: 'right' }}>単価</th>
                                <th style={{ ...styles.th, textAlign: 'right' }}>数量</th>
                                <th style={{ ...styles.th, textAlign: 'right' }}>金額</th>
                                <th style={{ ...styles.th, textAlign: 'center' }}>バック率</th>
                                <th style={{ ...styles.th, textAlign: 'right' }}>バック金額</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tableHelpList.map((item, i) => (
                                <tr
                                  key={i}
                                  style={{ ...(i % 2 === 0 ? styles.tableRowEven : styles.tableRow), cursor: 'pointer' }}
                                  onClick={() => setSelectedProductDetail({
                                    productName: item.productName,
                                    category: item.category,
                                    type: 'tableHelp',
                                    helpCastId: item.helpCastId
                                  })}
                                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f7ff'}
                                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#fafafa' : 'transparent'}
                                >
                                  <td style={{ ...styles.td, color: '#86868b', fontSize: '12px' }}>{item.category || '-'}</td>
                                  <td style={styles.td}>{item.productName}</td>
                                  <td style={{ ...styles.td, color: '#856404', fontSize: '12px' }}>{item.helpCastName}</td>
                                  <td style={{ ...styles.td, textAlign: 'right' }}>{currencyFormatter.format(item.quantity > 0 ? Math.round(item.selfSales / item.quantity) : 0)}</td>
                                  <td style={{ ...styles.td, textAlign: 'right' }}>{item.quantity}</td>
                                  <td style={{ ...styles.td, textAlign: 'right' }}>{currencyFormatter.format(item.selfSales)}</td>
                                  <td style={{ ...styles.td, textAlign: 'center' }}>{item.backRate}%</td>
                                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600', color: '#856404' }}>
                                    {currencyFormatter.format(item.backAmount)}
                                  </td>
                                </tr>
                              ))}
                              <tr style={styles.tableTotal}>
                                <td colSpan={7} style={{ ...styles.td, fontWeight: 'bold' }}>小計</td>
                                <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#856404' }}>
                                  {currencyFormatter.format(tableHelpTotal)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* ヘルプ商品バック */}
                    {helpList.length > 0 && (
                      <div style={{ marginBottom: '20px' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#0066cc' }}>
                          ヘルプ商品バック（他の推しの卓）
                        </h3>
                        <div style={styles.tableWrapper}>
                          <table style={styles.table}>
                            <thead>
                              <tr style={styles.tableHeader}>
                                <th style={styles.th}>カテゴリ</th>
                                <th style={styles.th}>商品名</th>
                                <th style={styles.th}>推し</th>
                                <th style={{ ...styles.th, textAlign: 'right' }}>単価</th>
                                <th style={{ ...styles.th, textAlign: 'right' }}>数量</th>
                                <th style={{ ...styles.th, textAlign: 'right' }}>金額</th>
                                <th style={{ ...styles.th, textAlign: 'center' }}>バック率</th>
                                <th style={{ ...styles.th, textAlign: 'right' }}>バック金額</th>
                              </tr>
                            </thead>
                            <tbody>
                              {helpList.map((item, i) => (
                                <tr
                                  key={i}
                                  style={{ ...(i % 2 === 0 ? styles.tableRowEven : styles.tableRow), cursor: 'pointer' }}
                                  onClick={() => setSelectedProductDetail({
                                    productName: item.productName,
                                    category: item.category,
                                    type: 'help',
                                    oshiCastId: item.oshiCastId
                                  })}
                                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f7ff'}
                                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = i % 2 === 0 ? '#fafafa' : 'transparent'}
                                >
                                  <td style={{ ...styles.td, color: '#86868b', fontSize: '12px' }}>{item.category || '-'}</td>
                                  <td style={styles.td}>{item.productName}</td>
                                  <td style={{ ...styles.td, color: '#0066cc', fontSize: '12px' }}>{item.oshiCastName}</td>
                                  <td style={{ ...styles.td, textAlign: 'right' }}>{currencyFormatter.format(item.quantity > 0 ? Math.round(item.subtotal / item.quantity) : 0)}</td>
                                  <td style={{ ...styles.td, textAlign: 'right' }}>{item.quantity}</td>
                                  <td style={{ ...styles.td, textAlign: 'right' }}>{currencyFormatter.format(item.subtotal)}</td>
                                  <td style={{ ...styles.td, textAlign: 'center' }}>{item.backRate}%</td>
                                  <td style={{ ...styles.td, textAlign: 'right', fontWeight: '600', color: '#0066cc' }}>
                                    {currencyFormatter.format(item.backAmount)}
                                  </td>
                                </tr>
                              ))}
                              <tr style={styles.tableTotal}>
                                <td colSpan={7} style={{ ...styles.td, fontWeight: 'bold' }}>小計</td>
                                <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#0066cc' }}>
                                  {currencyFormatter.format(helpTotal)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* 合計 */}
                    <div style={{
                      padding: '12px 16px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ fontWeight: 'bold' }}>商品バック合計</span>
                      <span style={{ fontWeight: 'bold', fontSize: '18px', color: '#FF9500' }}>
                        {currencyFormatter.format(summary.totalProductBack)}
                      </span>
                    </div>
                  </>
                )
              })()}
            </div>
          )}

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

      {/* 再計算進捗モーダル */}
      {showRecalcModal && (
        <>
          <div style={styles.modalOverlay} />
          <div style={{
            ...styles.modal,
            maxWidth: '400px',
            width: '90%'
          }}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>報酬明細を再計算中</h3>
            </div>
            <div style={{
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              alignItems: 'center'
            }}>
              {/* 進捗率 */}
              <div style={{ width: '100%', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', fontWeight: '700', color: '#007AFF' }}>
                  {recalcProgress.total > 0 ? Math.round((recalcProgress.current / recalcProgress.total) * 100) : 0}%
                </div>
                <div style={{ fontSize: '14px', color: '#86868b', marginTop: '8px' }}>
                  {recalcProgress.current} / {recalcProgress.total} 件
                </div>
              </div>

              {/* プログレスバー */}
              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: '#e5e5e5',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${recalcProgress.total > 0 ? (recalcProgress.current / recalcProgress.total) * 100 : 0}%`,
                  height: '100%',
                  backgroundColor: '#007AFF',
                  transition: 'width 0.3s ease'
                }} />
              </div>

              {/* 現在処理中のキャスト名 */}
              {recalcProgress.castName && (
                <div style={{ fontSize: '14px', color: '#1d1d1f' }}>
                  処理中: <span style={{ fontWeight: '600' }}>{recalcProgress.castName}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* 日別詳細モーダル */}
      {selectedDayDetail && (() => {
        const dayData = dailySalesData.get(selectedDayDetail)
        const dayDetail = dailyDetails.find(d => d.date === selectedDayDetail)

        // 売上集計方法（報酬形態の設定に基づく）
        const salesAggregation = activeCompensationType?.sales_aggregation || 'item_based'
        const isItemBased = salesAggregation === 'item_based'

        // cast_daily_itemsから当日のデータを取得して伝票ごとにグループ化
        // 推し小計モードの場合はneeds_cast=trueの商品のみ表示
        const dayItems = castDailyItems.filter(item =>
          item.date === selectedDayDetail && (!isItemBased || item.needs_cast)
        )
        const dayHelpItems = helpDailyItems.filter(item =>
          item.date === selectedDayDetail && (!isItemBased || item.needs_cast)
        )

        // 売上額を取得するヘルパー関数（売上集計方法に応じたフィールドを使用）
        const getSelfSales = (item: CastDailyItem) => {
          return isItemBased ? (item.self_sales_item_based || 0) : (item.self_sales_receipt_based || 0)
        }

        // 伝票ごとにグループ化（推し売上 - 伝票内の全アイテムを表示）
        const selfOrderGroups = new Map<string, OrderGroup>()

        dayItems.forEach(item => {
          // BASE売上の場合はorderIdを"BASE"にする
          const isBase = item.category === 'BASE' || (!item.order_id && !item.table_number)
          const orderId = isBase ? 'BASE-self' : (item.order_id || 'no-order') + '-self'
          const tableNumber = isBase ? 'BASE' : item.table_number
          const guestName = isBase ? null : item.guest_name

          // 伝票内の全アイテムを追加（is_selfに関係なく）
          if (!selfOrderGroups.has(orderId)) {
            selfOrderGroups.set(orderId, {
              orderId,
              tableNumber,
              guestName,
              items: [],
              totalSales: 0,
              totalBack: 0,
              type: 'self',
              oshiCastName: selectedCast?.name
            })
          }
          const group = selfOrderGroups.get(orderId)!
          group.items.push(item)
          // 推しの売上を合計に加算（is_selfに関係なく全アイテム）
          group.totalSales += getSelfSales(item)
          group.totalBack += item.self_back_amount || 0
        })

        // 伝票ごとにグループ化（ヘルプ売上）
        const helpOrderGroups = new Map<string, OrderGroup>()

        dayHelpItems.forEach(item => {
          const isBase = item.category === 'BASE' || (!item.order_id && !item.table_number)
          const orderId = isBase ? 'BASE-help-' + item.cast_id : (item.order_id || 'no-order') + '-help'
          const tableNumber = isBase ? 'BASE' : item.table_number
          const guestName = isBase ? null : item.guest_name
          const oshiCast = casts.find(c => c.id === item.cast_id)

          if (!helpOrderGroups.has(orderId)) {
            helpOrderGroups.set(orderId, {
              orderId,
              tableNumber,
              guestName,
              items: [],
              totalSales: 0,
              totalBack: 0,
              type: 'help',
              oshiCastId: item.cast_id,
              oshiCastName: oshiCast?.name || '不明'
            })
          }
          const group = helpOrderGroups.get(orderId)!
          group.items.push(item)
          // ヘルプ売上を使用（subtotalではなくhelp_sales）
          group.totalSales += item.help_sales || 0
          group.totalBack += item.help_back_amount || 0
        })

        const selfOrders = Array.from(selfOrderGroups.values())
        const helpOrders = Array.from(helpOrderGroups.values())
        const allOrders = [...selfOrders, ...helpOrders]
        const totalSelfSales = selfOrders.reduce((sum, g) => sum + g.totalSales, 0)

        // 商品バック合計（推しバック + ヘルプバック）
        const totalSelfBack = dayItems.reduce((sum, item) => sum + (item.self_back_amount || 0), 0)
        const totalHelpBack = dayHelpItems.reduce((sum, item) => sum + (item.help_back_amount || 0), 0)
        const totalProductBack = totalSelfBack + totalHelpBack

        const toggleOrder = (orderId: string) => {
          setExpandedOrders(prev => {
            const next = new Set(prev)
            if (next.has(orderId)) {
              next.delete(orderId)
            } else {
              next.add(orderId)
            }
            return next
          })
        }

        if (!dayData && !dayDetail && dayItems.length === 0) return null

        return (
          <>
            <div
              style={styles.modalOverlay}
              onClick={() => { setSelectedDayDetail(null); setExpandedOrders(new Set()) }}
            />
            <div style={{ ...styles.modal, maxWidth: '600px', maxHeight: '80vh' }}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>
                  {format(new Date(selectedDayDetail), 'M月d日(E)', { locale: ja })} - {selectedCast?.name}
                </h3>
                <button
                  onClick={() => { setSelectedDayDetail(null); setExpandedOrders(new Set()) }}
                  style={styles.modalCloseBtn}
                >
                  ✕
                </button>
              </div>

              <div style={{ ...styles.modalContent, overflowY: 'auto', maxHeight: 'calc(80vh - 140px)' }}>
                {/* サマリー */}
                <div style={{ ...styles.modalSummary, backgroundColor: '#f8f9fa', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}>推し売上合計</div>
                      <div style={{ fontSize: '24px', fontWeight: '700' }}>{currencyFormatter.format(totalSelfSales)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '20px' }}>
                      {totalSelfBack > 0 && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '12px', color: '#FF9500', marginBottom: '4px' }}>推し商品バック</div>
                          <div style={{ fontSize: '18px', fontWeight: '700', color: '#FF9500' }}>{currencyFormatter.format(totalSelfBack)}</div>
                        </div>
                      )}
                      {totalHelpBack > 0 && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '12px', color: '#27ae60', marginBottom: '4px' }}>ヘルプ商品バック</div>
                          <div style={{ fontSize: '18px', fontWeight: '700', color: '#27ae60' }}>{currencyFormatter.format(totalHelpBack)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 売上一覧（伝票ごと） */}
                {allOrders.length > 0 && (
                  <div style={styles.modalSection}>
                    <div style={styles.modalSectionTitle}>伝票一覧 ({allOrders.length}件)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {allOrders.map(order => {
                        const isExpanded = expandedOrders.has(order.orderId)
                        const backColor = order.type === 'self' ? '#FF9500' : '#27ae60'
                        return (
                          <div key={order.orderId}>
                            {/* 伝票ヘッダー */}
                            <div
                              onClick={() => toggleOrder(order.orderId)}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px',
                                backgroundColor: isExpanded ? '#f0f7ff' : 'transparent',
                                cursor: 'pointer',
                                borderBottom: '1px solid #e9ecef'
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {order.tableNumber === 'BASE' ? 'BASE' : `${order.tableNumber || '-'}番 / ${order.guestName || '無記名'}`}
                                  <span style={{
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    backgroundColor: order.type === 'self' ? '#fff3e0' : '#e8f5e9',
                                    color: order.type === 'self' ? '#e65100' : '#2e7d32'
                                  }}>
                                    推し: {order.oshiCastName}
                                  </span>
                                </div>
                                <div style={{ fontSize: '11px', color: '#6c757d' }}>
                                  #{order.orderId.slice(0, 6)}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                {order.type === 'self' ? (
                                  <div style={{ fontWeight: '600' }}>
                                    {currencyFormatter.format(order.totalSales)}
                                    <span style={{ marginLeft: '8px', color: '#6c757d' }}>{isExpanded ? '▲' : '▼'}</span>
                                  </div>
                                ) : (
                                  <span style={{ color: '#6c757d' }}>{isExpanded ? '▲' : '▼'}</span>
                                )}
                                {order.totalBack > 0 && (
                                  <div style={{ fontSize: '11px', color: backColor, fontWeight: '500' }}>
                                    {order.type === 'self' ? '推しバック' : 'ヘルプバック'}: {currencyFormatter.format(order.totalBack)}
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* 展開時の商品明細 */}
                            {isExpanded && (
                              <div style={{ backgroundColor: '#f8f9fa', padding: '8px 12px' }}>
                                {order.items.map((item, idx) => {
                                  // 表示する売上額（推し売上 or ヘルプ売上）- 報酬形態の設定に基づく
                                  const displaySales = order.type === 'self' ? getSelfSales(item) : item.help_sales
                                  const unitPrice = Math.floor(item.subtotal / item.quantity)
                                  const backRate = order.type === 'self' ? (item.self_back_rate || 0) : (item.help_back_rate || 0)
                                  const backAmount = order.type === 'self' ? (item.self_back_amount || 0) : (item.help_back_amount || 0)
                                  // 商品に付いているキャスト名を取得（help_cast_idがあればヘルパー、なければ推し）
                                  const displayCastId = item.help_cast_id || item.cast_id
                                  const itemCastName = casts.find(c => c.id === displayCastId)?.name
                                  return (
                                    <div key={idx} style={{
                                      padding: '10px 0',
                                      borderBottom: idx < order.items.length - 1 ? '1px solid #e9ecef' : 'none'
                                    }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                        <div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{
                                              fontSize: '10px',
                                              padding: '2px 6px',
                                              borderRadius: '4px',
                                              backgroundColor: '#e9ecef',
                                              color: '#495057'
                                            }}>
                                              {item.category || '-'}
                                            </span>
                                            <span style={{ fontWeight: '500' }}>{item.product_name}</span>
                                          </div>
                                          {itemCastName && (
                                            <div style={{
                                              fontSize: '11px',
                                              color: item.is_self ? '#e65100' : '#2e7d32',
                                              marginTop: '2px'
                                            }}>
                                              {item.is_self ? '推し: ' : 'ヘルプ: '}{itemCastName}
                                            </div>
                                          )}
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                          <div style={{ fontWeight: '600', fontSize: '14px' }}>
                                            {currencyFormatter.format(displaySales)}
                                          </div>
                                          <div style={{ fontSize: '11px', color: '#6c757d' }}>
                                            {currencyFormatter.format(unitPrice)} × {item.quantity}
                                          </div>
                                        </div>
                                      </div>
                                      {backAmount > 0 && (
                                        <div style={{ textAlign: 'right', fontSize: '11px', color: backColor, fontWeight: '500' }}>
                                          バック: {currencyFormatter.format(backAmount)} ({backRate}%)
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
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
                  onClick={() => { setSelectedDayDetail(null); setExpandedOrders(new Set()) }}
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
        // 選択した商品のアイテム一覧を抽出
        let matchingItems: CastDailyItem[] = []
        let typeLabel = ''
        let headerColor = '#FF9500'

        if (selectedProductDetail.type === 'self') {
          // 推し商品バック: 自分の卓で自分の商品
          matchingItems = castDailyItems.filter(item =>
            item.is_self &&
            item.product_name === selectedProductDetail.productName &&
            item.category === selectedProductDetail.category &&
            item.self_back_amount > 0
          )
          typeLabel = '推し商品'
          headerColor = '#34C759'
        } else if (selectedProductDetail.type === 'tableHelp') {
          // 卓内ヘルプ: 自分の卓で他キャストの商品
          matchingItems = castDailyItems.filter(item =>
            !item.is_self &&
            item.help_cast_id === selectedProductDetail.helpCastId &&
            item.product_name === selectedProductDetail.productName &&
            item.category === selectedProductDetail.category
          )
          typeLabel = '卓内ヘルプ'
          headerColor = '#FF9500'
        } else if (selectedProductDetail.type === 'help') {
          // ヘルプ商品バック: 他の推しの卓で自分の商品
          matchingItems = helpDailyItems.filter(item =>
            item.cast_id === selectedProductDetail.oshiCastId &&
            item.product_name === selectedProductDetail.productName &&
            item.category === selectedProductDetail.category &&
            item.help_back_amount > 0
          )
          typeLabel = 'ヘルプ商品'
          headerColor = '#5856D6'
        }

        // 日付順にソート
        matchingItems.sort((a, b) => a.date.localeCompare(b.date))

        // 合計計算
        const totalQuantity = matchingItems.reduce((sum, item) => sum + item.quantity, 0)
        const totalBack = selectedProductDetail.type === 'help'
          ? matchingItems.reduce((sum, item) => sum + (item.help_back_amount || 0), 0)
          : matchingItems.reduce((sum, item) => sum + (item.self_back_amount || 0), 0)

        return (
          <>
            <div
              style={styles.modalOverlay}
              onClick={() => setSelectedProductDetail(null)}
            />
            <div style={{ ...styles.modal, maxWidth: '600px' }}>
              <div style={{ ...styles.modalHeader, backgroundColor: headerColor }}>
                <h3 style={styles.modalTitle}>
                  {selectedProductDetail.productName}
                  <span style={{
                    marginLeft: '8px',
                    fontSize: '12px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(255,255,255,0.2)',
                  }}>
                    {typeLabel}
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
                    <div style={{ ...styles.modalSummaryValue, color: headerColor }}>
                      {currencyFormatter.format(totalBack)}
                    </div>
                  </div>
                </div>

                {/* 詳細一覧 */}
                <div style={styles.modalSection}>
                  <div style={styles.modalSectionTitle}>詳細一覧</div>
                  <div style={styles.tableWrapper}>
                    <table style={{ ...styles.table, fontSize: '13px' }}>
                      <thead>
                        <tr style={styles.tableHeader}>
                          <th style={styles.th}>日付</th>
                          <th style={styles.th}>伝票番号</th>
                          <th style={styles.th}>卓番号</th>
                          <th style={styles.th}>ゲスト名</th>
                          <th style={{ ...styles.th, textAlign: 'right' }}>数量</th>
                          <th style={{ ...styles.th, textAlign: 'right' }}>バック</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matchingItems.map((item, i) => {
                          const backAmount = selectedProductDetail.type === 'help'
                            ? item.help_back_amount || 0
                            : item.self_back_amount || 0
                          return (
                            <tr
                              key={item.id}
                              style={i % 2 === 0 ? styles.tableRowEven : styles.tableRow}
                            >
                              <td style={styles.td}>
                                {format(new Date(item.date), 'M/d(E)', { locale: ja })}
                              </td>
                              <td style={styles.td}>
                                {item.order_id ? `#${item.order_id.slice(-6)}` : '-'}
                              </td>
                              <td style={styles.td}>
                                {item.table_number || '-'}
                              </td>
                              <td style={styles.td}>
                                {item.guest_name || '-'}
                              </td>
                              <td style={{ ...styles.td, textAlign: 'right' }}>{item.quantity}</td>
                              <td style={{ ...styles.td, textAlign: 'right', color: headerColor, fontWeight: '600' }}>
                                {currencyFormatter.format(backAmount)}
                              </td>
                            </tr>
                          )
                        })}
                        {matchingItems.length === 0 && (
                          <tr>
                            <td colSpan={6} style={{ ...styles.td, textAlign: 'center', color: '#999' }}>
                              データがありません
                            </td>
                          </tr>
                        )}
                        {matchingItems.length > 0 && (
                          <tr style={styles.tableTotal}>
                            <td colSpan={4} style={{ ...styles.td, fontWeight: 'bold' }}>合計</td>
                            <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold' }}>{totalQuantity}</td>
                            <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: headerColor }}>
                              {currencyFormatter.format(totalBack)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div style={styles.modalFooter}>
                <button
                  onClick={() => setSelectedProductDetail(null)}
                  style={{ ...styles.modalButton, backgroundColor: headerColor }}
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
                    <span>メニュー合計</span>
                    <span>{currencyFormatter.format(orderDetail.subtotal_incl_tax || 0)}</span>
                  </div>
                  {(orderDetail.service_charge || 0) > 0 && (
                    <div style={styles.modalGridItem}>
                      <span>サービス料</span>
                      <span>{currencyFormatter.format(orderDetail.service_charge)}</span>
                    </div>
                  )}
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
