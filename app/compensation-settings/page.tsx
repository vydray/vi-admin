'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/contexts/StoreContext'
import {
  CompensationSettings,
  SlidingRate,
  DeductionItem,
  SalesTargetType,
  DeductionType,
  PayType,
  Product,
  Category,
  CastBackRate,
} from '@/types'
import LoadingSpinner from '@/components/LoadingSpinner'
import Button from '@/components/Button'
import HelpTooltip from '@/components/HelpTooltip'
import toast from 'react-hot-toast'

// 端数処理メソッドをパース
function parseRoundingMethod(method: string): { position: number; type: 'floor' | 'ceil' | 'round' | 'none' } {
  if (method === 'none') return { position: 1, type: 'none' }
  if (method === 'round') return { position: 1, type: 'round' }
  const match = method.match(/^(floor|ceil|round)_(\d+)$/)
  if (match) {
    return { type: match[1] as 'floor' | 'ceil' | 'round', position: parseInt(match[2]) }
  }
  return { position: 100, type: 'floor' }
}

// 端数処理を適用
function applyRounding(amount: number, position: number, type: 'floor' | 'ceil' | 'round' | 'none'): number {
  if (type === 'none' || position <= 0) return amount
  switch (type) {
    case 'floor':
      return Math.floor(amount / position) * position
    case 'ceil':
      return Math.ceil(amount / position) * position
    case 'round':
      return Math.round(amount / position) * position
    default:
      return amount
  }
}

// バック率を取得するヘルパー関数
function getBackRate(
  backRates: CastBackRate[],
  castId: number,
  category: string,
  productName: string,
  isSelf: boolean
): { rate: number; type: 'ratio' | 'fixed'; fixedAmount: number } | null {
  // 1. 商品名で完全マッチ
  const productMatch = backRates.find(
    r => r.cast_id === castId && r.category === category && r.product_name === productName && r.is_active
  )
  if (productMatch) {
    const rate = isSelf
      ? (productMatch.self_back_ratio ?? productMatch.back_ratio)
      : (productMatch.help_back_ratio ?? productMatch.back_ratio)
    return {
      rate,
      type: productMatch.back_type === 'fixed' ? 'fixed' : 'ratio',
      fixedAmount: productMatch.back_fixed_amount,
    }
  }

  // 2. カテゴリ全体（product_name = null）
  const categoryMatch = backRates.find(
    r => r.cast_id === castId && r.category === category && r.product_name === null && r.is_active
  )
  if (categoryMatch) {
    const rate = isSelf
      ? (categoryMatch.self_back_ratio ?? categoryMatch.back_ratio)
      : (categoryMatch.help_back_ratio ?? categoryMatch.back_ratio)
    return {
      rate,
      type: categoryMatch.back_type === 'fixed' ? 'fixed' : 'ratio',
      fixedAmount: categoryMatch.back_fixed_amount,
    }
  }

  // 3. 全カテゴリデフォルト（category = null, product_name = null）
  const defaultMatch = backRates.find(
    r => r.cast_id === castId && r.category === null && r.product_name === null && r.is_active
  )
  if (defaultMatch) {
    const rate = isSelf
      ? (defaultMatch.self_back_ratio ?? defaultMatch.back_ratio)
      : (defaultMatch.help_back_ratio ?? defaultMatch.back_ratio)
    return {
      rate,
      type: defaultMatch.back_type === 'fixed' ? 'fixed' : 'ratio',
      fixedAmount: defaultMatch.back_fixed_amount,
    }
  }

  return null
}

interface CastWithStatus {
  id: number
  name: string
  status: string | null
}

// UI用の設定状態（チェックボックス管理用）
interface SettingsState {
  // 基本設定
  useHourly: boolean
  useFixed: boolean
  useSales: boolean
  hourlyRate: number
  fixedAmount: number
  commissionRate: number
  salesTarget: SalesTargetType

  // 報酬形態2（比較用）
  useComparison: boolean
  compareUseHourly: boolean
  compareUseFixed: boolean
  compareUseSales: boolean
  compareUseProductBack: boolean
  compareHourlyRate: number
  compareFixedAmount: number
  compareCommissionRate: number
  compareSalesTarget: SalesTargetType

  // スライド率テーブル
  slidingRates: SlidingRate[] | null

  // 控除
  deductionItems: DeductionItem[] | null

  // 商品別バック
  useProductBack: boolean

  // その他
  validFrom: string
  validTo: string | null
  isActive: boolean
}

// デフォルトの設定
const getDefaultSettingsState = (): SettingsState => ({
  useHourly: false,
  useFixed: false,
  useSales: true,
  hourlyRate: 1500,
  fixedAmount: 0,
  commissionRate: 50,
  salesTarget: 'cast_sales',

  useComparison: false,
  compareUseHourly: false,
  compareUseFixed: false,
  compareUseSales: false,
  compareUseProductBack: false,
  compareHourlyRate: 1500,
  compareFixedAmount: 0,
  compareCommissionRate: 50,
  compareSalesTarget: 'cast_sales',

  slidingRates: null,
  deductionItems: null,

  useProductBack: false,

  validFrom: new Date().toISOString().split('T')[0],
  validTo: null,
  isActive: true,
})

// DBデータをUI状態に変換
const dbToState = (data: CompensationSettings): SettingsState => {
  const payType = data.pay_type || 'commission'
  return {
    useHourly: payType === 'hourly' || payType === 'hourly_plus_commission',
    useFixed: (data.fixed_amount ?? 0) > 0,
    useSales: payType === 'commission' || payType === 'hourly_plus_commission' || payType === 'sliding',
    hourlyRate: data.hourly_rate ?? 1500,
    fixedAmount: data.fixed_amount ?? 0,
    commissionRate: data.commission_rate ?? 50,
    salesTarget: data.sales_target || 'cast_sales',

    useComparison: data.use_sliding_comparison ?? false,
    compareUseHourly: (data.compare_hourly_rate ?? 0) > 0,
    compareUseFixed: (data.compare_fixed_amount ?? 0) > 0,
    compareUseSales: (data.compare_commission_rate ?? 0) > 0,
    compareUseProductBack: data.compare_use_product_back ?? false,
    compareHourlyRate: data.compare_hourly_rate ?? 1500,
    compareFixedAmount: data.compare_fixed_amount ?? 0,
    compareCommissionRate: data.compare_commission_rate ?? 50,
    compareSalesTarget: data.compare_sales_target || 'cast_sales',

    slidingRates: data.sliding_rates,
    deductionItems: data.deduction_items,

    useProductBack: data.use_product_back ?? false,

    validFrom: data.valid_from,
    validTo: data.valid_to,
    isActive: data.is_active,
  }
}

// UI状態をDBデータに変換
const stateToDb = (state: SettingsState, castId: number, storeId: number, existingId?: number): Partial<CompensationSettings> => {
  // pay_typeを決定
  let payType: PayType = 'commission'
  if (state.useHourly && state.useSales) {
    payType = 'hourly_plus_commission'
  } else if (state.useHourly) {
    payType = 'hourly'
  } else if (state.useSales && state.slidingRates && state.slidingRates.length > 0) {
    payType = 'sliding'
  } else if (state.useSales) {
    payType = 'commission'
  }

  return {
    ...(existingId ? { id: existingId } : {}),
    cast_id: castId,
    store_id: storeId,
    pay_type: payType,
    hourly_rate: state.useHourly ? state.hourlyRate : 0,
    fixed_amount: state.useFixed ? state.fixedAmount : 0,
    commission_rate: state.useSales ? state.commissionRate : 0,
    sales_target: state.salesTarget,
    use_sliding_comparison: state.useComparison,
    compare_hourly_rate: state.useComparison && state.compareUseHourly ? state.compareHourlyRate : 0,
    compare_fixed_amount: state.useComparison && state.compareUseFixed ? state.compareFixedAmount : 0,
    compare_commission_rate: state.useComparison && state.compareUseSales ? state.compareCommissionRate : 0,
    compare_sales_target: state.compareSalesTarget,
    compare_use_product_back: state.useComparison && state.compareUseProductBack,
    sliding_rates: state.slidingRates,
    deduction_enabled: (state.deductionItems && state.deductionItems.length > 0) ? true : false,
    deduction_items: state.deductionItems,
    use_product_back: state.useProductBack,
    valid_from: state.validFrom,
    valid_to: state.validTo,
    is_active: state.isActive,
  }
}

export default function CompensationSettingsPage() {
  const { storeId, storeName } = useStore()
  const [casts, setCasts] = useState<CastWithStatus[]>([])
  const [selectedCastId, setSelectedCastId] = useState<number | null>(null)
  const [settingsState, setSettingsState] = useState<SettingsState | null>(null)
  const [existingId, setExistingId] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 店舗共通設定
  const [payDay, setPayDay] = useState<number>(25)
  const [savingPayDay, setSavingPayDay] = useState(false)

  // 年月選択
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1)
  const [isLocked, setIsLocked] = useState<boolean>(false)

  // キャスト選択ドロップダウン
  const [showCastDropdown, setShowCastDropdown] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('在籍')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCastDropdown(false)
      }
    }
    if (showCastDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCastDropdown])

  // スライド率テーブル編集
  const [showSlidingModal, setShowSlidingModal] = useState(false)
  const [editingSlidingRates, setEditingSlidingRates] = useState<SlidingRate[]>([])

  // 控除項目編集
  const [showDeductionModal, setShowDeductionModal] = useState(false)
  const [editingDeductions, setEditingDeductions] = useState<DeductionItem[]>([])

  // 商品マスタ・カテゴリ・バック率
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [backRates, setBackRates] = useState<CastBackRate[]>([])

  // サンプル伝票（売上設定のプレビューと同じ形式）
  const [sampleNominations, setSampleNominations] = useState<string[]>(['A']) // 推しキャスト（複数選択可能）
  const [sampleItems, setSampleItems] = useState<{
    id: number
    productId: number | null
    name: string
    category: string
    basePrice: number
    castNames: string[]
  }[]>([
    { id: 1, productId: null, name: 'セット料金 60分', category: '', basePrice: 3300, castNames: [] },
    { id: 2, productId: null, name: 'キャストドリンク', category: '', basePrice: 1100, castNames: ['A'] },
    { id: 3, productId: null, name: 'シャンパン', category: '', basePrice: 11000, castNames: ['A'] },
    { id: 4, productId: null, name: 'チェキ', category: '', basePrice: 1500, castNames: ['B'] },
    { id: 5, productId: null, name: 'ヘルプドリンク', category: '', basePrice: 1100, castNames: ['C'] },
  ])
  const [savingSampleReceipt, setSavingSampleReceipt] = useState(false)
  const [nonHelpStaffNames, setNonHelpStaffNames] = useState<string[]>([])
  // 推し小計 / 伝票小計 切り替えタブ
  const [salesViewMode, setSalesViewMode] = useState<'item_based' | 'receipt_based'>('item_based')

  // システム設定（税率・サービス料率）
  const [systemSettings, setSystemSettings] = useState<{
    tax_rate: number
    service_fee_rate: number
    rounding_unit: number
    rounding_method: number
  }>({
    tax_rate: 10,
    service_fee_rate: 0,
    rounding_unit: 1,
    rounding_method: 1, // 0=切り上げ, 1=切り捨て, 2=四捨五入
  })

  // 売上設定（計算ロジック用）
  const [salesSettings, setSalesSettings] = useState<{
    // 推し小計用
    item_exclude_consumption_tax: boolean
    item_exclude_service_charge: boolean
    item_rounding_method: string
    item_rounding_position: number
    item_rounding_timing: string
    item_help_distribution_method: string
    item_multi_cast_distribution: string
    item_help_sales_inclusion: string
    item_help_ratio: number
    item_nomination_distribute_all: boolean
    // 伝票小計用
    receipt_exclude_consumption_tax: boolean
    receipt_exclude_service_charge: boolean
    receipt_rounding_method: string
    receipt_rounding_position: number
    receipt_rounding_timing: string
    receipt_help_distribution_method: string
    receipt_multi_cast_distribution: string
    receipt_help_sales_inclusion: string
    receipt_help_ratio: number
  }>({
    item_exclude_consumption_tax: true,
    item_exclude_service_charge: false,
    item_rounding_method: 'floor_100',
    item_rounding_position: 100,
    item_rounding_timing: 'per_item',
    item_help_distribution_method: 'all_to_nomination',
    item_multi_cast_distribution: 'nomination_only',
    item_help_sales_inclusion: 'both',
    item_help_ratio: 100,
    item_nomination_distribute_all: false,
    receipt_exclude_consumption_tax: true,
    receipt_exclude_service_charge: false,
    receipt_rounding_method: 'floor_100',
    receipt_rounding_position: 100,
    receipt_rounding_timing: 'per_item',
    receipt_help_distribution_method: 'all_to_nomination',
    receipt_multi_cast_distribution: 'nomination_only',
    receipt_help_sales_inclusion: 'both',
    receipt_help_ratio: 100,
  })

  // シミュレーション
  const [simWorkHours, setSimWorkHours] = useState<number>(8)
  const [simSales, setSimSales] = useState<number>(100000)
  const [simProductBack, setSimProductBack] = useState<number>(0)
  const [simDeductions, setSimDeductions] = useState<number>(0)

  // シミュレーション計算結果
  const simulationResult = useMemo(() => {
    if (!settingsState) return null

    // 基本給の計算
    let hourlyPay = 0
    let fixedPay = 0
    let salesCommission = 0

    if (settingsState.useHourly) {
      hourlyPay = settingsState.hourlyRate * simWorkHours
    }

    if (settingsState.useFixed) {
      fixedPay = settingsState.fixedAmount
    }

    if (settingsState.useSales) {
      // スライド率テーブルがある場合
      if (settingsState.slidingRates && settingsState.slidingRates.length > 0) {
        const matchingRate = settingsState.slidingRates.find(rate => {
          if (rate.max === 0 || rate.max === null) {
            return simSales >= rate.min
          }
          return simSales >= rate.min && simSales < rate.max
        })
        // 最後のレートを適用（見つからない場合）
        const appliedRate = matchingRate || settingsState.slidingRates[settingsState.slidingRates.length - 1]
        salesCommission = Math.floor(simSales * (appliedRate.rate / 100))
      } else {
        salesCommission = Math.floor(simSales * (settingsState.commissionRate / 100))
      }
    }

    const basePay = hourlyPay + fixedPay + salesCommission

    // 比較対象の計算（スライド制の場合）
    let comparePay = 0
    if (settingsState.useComparison) {
      if (settingsState.compareUseHourly) {
        comparePay += settingsState.compareHourlyRate * simWorkHours
      }
      if (settingsState.compareUseFixed) {
        comparePay += settingsState.compareFixedAmount
      }
      if (settingsState.compareUseSales) {
        comparePay += Math.floor(simSales * (settingsState.compareCommissionRate / 100))
      }
    }

    // スライド制の場合、高い方を採用
    const selectedPay = settingsState.useComparison ? Math.max(basePay, comparePay) : basePay
    const isBaseHigher = basePay >= comparePay

    // 商品バック
    const productBackAmount = settingsState.useProductBack ? simProductBack : 0

    // 総支給額（控除前）
    const totalBeforeDeduction = selectedPay + productBackAmount

    // 固定控除額（設定された控除）
    let fixedDeductions = 0
    if (settingsState.deductionItems) {
      for (const item of settingsState.deductionItems) {
        if (!item.isVariable) {
          fixedDeductions += item.amount
        }
      }
    }

    // 総控除額
    const totalDeductions = fixedDeductions + simDeductions

    // 最終支給額
    const finalPay = totalBeforeDeduction - totalDeductions

    return {
      hourlyPay,
      fixedPay,
      salesCommission,
      basePay,
      comparePay,
      selectedPay,
      isBaseHigher,
      productBackAmount,
      totalBeforeDeduction,
      fixedDeductions,
      variableDeductions: simDeductions,
      totalDeductions,
      finalPay,
    }
  }, [settingsState, simWorkHours, simSales, simProductBack, simDeductions])

  // 給料日設定を読み込み
  const loadPayDay = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('store_id', storeId)
        .eq('setting_key', 'pay_day')
        .maybeSingle()

      if (error) throw error
      if (data) {
        setPayDay(Number(data.setting_value) || 25)
      }
    } catch (error) {
      console.error('給料日設定読み込みエラー:', error)
    }
  }, [storeId])

  // 給料日設定を保存
  const savePayDay = async () => {
    setSavingPayDay(true)
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert(
          { store_id: storeId, setting_key: 'pay_day', setting_value: payDay },
          { onConflict: 'store_id,setting_key' }
        )

      if (error) throw error
      toast.success('給料日を保存しました')
    } catch (error) {
      console.error('給料日保存エラー:', error)
      toast.error('給料日の保存に失敗しました')
    } finally {
      setSavingPayDay(false)
    }
  }

  // システム設定を読み込み（税率・サービス料率）
  const loadSystemSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('setting_key, setting_value')
        .eq('store_id', storeId)
        .in('setting_key', ['tax_rate', 'service_fee_rate', 'rounding_unit', 'rounding_method'])

      if (error) throw error
      if (data) {
        const settings: Record<string, string | number> = {}
        data.forEach(item => {
          settings[item.setting_key] = item.setting_value
        })
        setSystemSettings({
          tax_rate: Number(settings.tax_rate) || 10,
          service_fee_rate: Number(settings.service_fee_rate) || 0,
          rounding_unit: Number(settings.rounding_unit) || 1,
          rounding_method: Number(settings.rounding_method) || 1,
        })
      }
    } catch (error) {
      console.error('システム設定読み込みエラー:', error)
    }
  }, [storeId])

  // 商品マスタを読み込み
  const loadProducts = useCallback(async () => {
    try {
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, name, price, category_id, store_id')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('display_order')

      if (productsError) throw productsError
      setProducts(productsData || [])

      // カテゴリ一覧
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('product_categories')
        .select('id, name, store_id')
        .eq('store_id', storeId)
        .order('display_order')

      if (categoriesError) throw categoriesError
      setCategories(categoriesData || [])
    } catch (error) {
      console.error('商品マスタ読み込みエラー:', error)
    }
  }, [storeId])

  // バック率設定を読み込み
  const loadBackRates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('cast_back_rates')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error
      setBackRates((data || []) as CastBackRate[])
    } catch (error) {
      console.error('バック率設定読み込みエラー:', error)
    }
  }, [storeId])

  // サンプル伝票を読み込み
  const loadSampleReceipt = useCallback(async () => {
    try {
      // まず既存のサンプル伝票を取得
      const { data: receiptData, error: receiptError } = await supabase
        .from('compensation_sample_receipts')
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (receiptError) throw receiptError

      if (receiptData) {
        // サンプル伝票が存在する場合、推しと商品アイテムを読み込む
        setSampleNominations(receiptData.nominations || ['A'])

        const { data: itemsData, error: itemsError } = await supabase
          .from('compensation_sample_items')
          .select('*')
          .eq('receipt_id', receiptData.id)
          .order('sort_order')

        if (itemsError) throw itemsError

        if (itemsData && itemsData.length > 0) {
          setSampleItems(itemsData.map((item, index) => ({
            id: item.id || index + 1,
            productId: item.product_id,
            name: item.product_name,
            category: item.category || '',
            basePrice: item.base_price,
            castNames: item.cast_names || [],
          })))
        }
      }
    } catch (error) {
      console.error('サンプル伝票読み込みエラー:', error)
    }
  }, [storeId])

  // サンプル伝票を保存
  const saveSampleReceipt = async () => {
    setSavingSampleReceipt(true)
    try {
      // 既存のサンプル伝票を削除
      await supabase
        .from('compensation_sample_receipts')
        .delete()
        .eq('store_id', storeId)

      // 新しいサンプル伝票を作成
      const { data: newReceipt, error: receiptError } = await supabase
        .from('compensation_sample_receipts')
        .insert({
          store_id: storeId,
          name: 'デフォルト',
          nominations: sampleNominations,
        })
        .select()
        .single()

      if (receiptError) throw receiptError

      // サンプルアイテムを保存
      const itemsToInsert = sampleItems.map((item, index) => ({
        receipt_id: newReceipt.id,
        product_id: item.productId,
        product_name: item.name,
        category: item.category,
        base_price: item.basePrice,
        cast_names: item.castNames,
        sort_order: index,
      }))

      const { error: itemsError } = await supabase
        .from('compensation_sample_items')
        .insert(itemsToInsert)

      if (itemsError) throw itemsError

      toast.success('サンプル伝票を保存しました')
    } catch (error) {
      console.error('サンプル伝票保存エラー:', error)
      toast.error('サンプル伝票の保存に失敗しました')
    } finally {
      setSavingSampleReceipt(false)
    }
  }

  const loadCasts = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('casts')
        .select('id, name, status')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('name')

      if (error) throw error
      setCasts(data || [])
    } catch (error) {
      console.error('キャスト読み込みエラー:', error)
      toast.error('キャストの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [storeId])

  // 売上設定を取得（ヘルプ除外名、集計方法など）
  const loadSalesSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sales_settings')
        .select('*')
        .eq('store_id', storeId)
        .maybeSingle()

      if (error) throw error
      if (data) {
        console.log('=== 売上設定 (from DB) ===', {
          item_help_distribution_method: data.item_help_distribution_method,
          item_rounding_method: data.item_rounding_method,
          item_rounding_position: data.item_rounding_position,
          published_aggregation: data.published_aggregation,
        })
        if (data.non_help_staff_names) {
          setNonHelpStaffNames(data.non_help_staff_names)
        }
        // 売上設定の集計方法をタブの初期値に反映（'none'の場合はitem_basedをデフォルトに）
        if (data.published_aggregation && data.published_aggregation !== 'none') {
          setSalesViewMode(data.published_aggregation as 'item_based' | 'receipt_based')
        }
        // 計算ロジック用の設定を保存
        const newSettings = {
          item_exclude_consumption_tax: data.item_exclude_consumption_tax ?? true,
          item_exclude_service_charge: data.item_exclude_service_charge ?? false,
          item_rounding_method: data.item_rounding_method ?? 'floor_100',
          item_rounding_position: data.item_rounding_position ?? 100,
          item_rounding_timing: data.item_rounding_timing ?? 'per_item',
          item_help_distribution_method: data.item_help_distribution_method ?? 'all_to_nomination',
          item_multi_cast_distribution: data.item_multi_cast_distribution ?? 'nomination_only',
          item_help_sales_inclusion: data.item_help_sales_inclusion ?? 'both',
          item_help_ratio: data.item_help_ratio ?? 100,
          item_nomination_distribute_all: data.item_nomination_distribute_all ?? false,
          receipt_exclude_consumption_tax: data.receipt_exclude_consumption_tax ?? true,
          receipt_exclude_service_charge: data.receipt_exclude_service_charge ?? false,
          receipt_rounding_method: data.receipt_rounding_method ?? 'floor_100',
          receipt_rounding_position: data.receipt_rounding_position ?? 100,
          receipt_rounding_timing: data.receipt_rounding_timing ?? 'per_item',
          receipt_help_distribution_method: data.receipt_help_distribution_method ?? 'all_to_nomination',
          receipt_multi_cast_distribution: data.receipt_multi_cast_distribution ?? 'nomination_only',
          receipt_help_sales_inclusion: data.receipt_help_sales_inclusion ?? 'both',
          receipt_help_ratio: data.receipt_help_ratio ?? 100,
        }
        console.log('=== 適用する設定 ===', newSettings)
        setSalesSettings(newSettings)
      }
    } catch (error) {
      console.error('売上設定読み込みエラー:', error)
    }
  }, [storeId])

  const loadSettings = useCallback(async (castId: number, year: number, month: number) => {
    try {
      // まず指定年月の設定を探す
      let { data, error } = await supabase
        .from('compensation_settings')
        .select('*')
        .eq('cast_id', castId)
        .eq('store_id', storeId)
        .eq('target_year', year)
        .eq('target_month', month)
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error

      // 年月指定の設定がない場合、デフォルト設定（target_year/month = null）を探す
      if (!data) {
        const { data: defaultData, error: defaultError } = await supabase
          .from('compensation_settings')
          .select('*')
          .eq('cast_id', castId)
          .eq('store_id', storeId)
          .is('target_year', null)
          .is('target_month', null)
          .eq('is_active', true)
          .maybeSingle()

        if (defaultError) throw defaultError
        data = defaultData
      }

      if (data) {
        setSettingsState(dbToState(data))
        setIsLocked(data.is_locked ?? false)
        setExistingId(data.id)
      } else {
        // 新規設定
        setSettingsState(getDefaultSettingsState())
        setExistingId(undefined)
      }
    } catch (error) {
      console.error('設定読み込みエラー:', error)
      setSettingsState(getDefaultSettingsState())
      setExistingId(undefined)
    }
  }, [storeId])

  useEffect(() => {
    loadCasts()
    loadPayDay()
    loadSalesSettings()
    loadSystemSettings()
    loadProducts()
    loadBackRates()
    loadSampleReceipt()
  }, [loadCasts, loadPayDay, loadSalesSettings, loadSystemSettings, loadProducts, loadBackRates, loadSampleReceipt])

  useEffect(() => {
    if (selectedCastId) {
      loadSettings(selectedCastId, selectedYear, selectedMonth)
    }
  }, [selectedCastId, selectedYear, selectedMonth, loadSettings])

  // フィルター済みキャスト一覧
  const filteredCasts = useMemo(() => {
    return casts.filter(cast => {
      if (statusFilter && cast.status !== statusFilter) return false
      if (searchText && !cast.name.toLowerCase().includes(searchText.toLowerCase())) return false
      return true
    })
  }, [casts, statusFilter, searchText])

  const selectedCast = useMemo(() => {
    return casts.find(c => c.id === selectedCastId)
  }, [casts, selectedCastId])

  // キャスト選択肢（選択中キャスト名 + A〜D + ヘルプ除外名）
  const availableCastOptions = useMemo(() => {
    const baseCasts = ['A', 'B', 'C', 'D']
    const options = new Set<string>()

    // 選択中キャスト名を追加
    if (selectedCast) {
      options.add(selectedCast.name)
    }

    // A〜Dを追加
    baseCasts.forEach(c => options.add(c))

    // ヘルプ除外名を追加
    nonHelpStaffNames.forEach(name => options.add(name))

    return Array.from(options)
  }, [selectedCast, nonHelpStaffNames])


  // サンプル伝票のプレビューデータ（sales-settingsと完全に同じロジック）
  const previewData = useMemo(() => {
    const isItemBased = salesViewMode === 'item_based'
    const taxRate = systemSettings.tax_rate / 100
    const serviceRate = systemSettings.service_fee_rate / 100
    const receiptSubtotal = sampleItems.reduce((sum, item) => sum + item.basePrice, 0)

    // =========================================
    // 推し小計（item_based）ロジック
    // =========================================
    if (isItemBased) {
      const excludeTax = salesSettings.item_exclude_consumption_tax
      const excludeService = salesSettings.item_exclude_service_charge
      const roundingPosition = salesSettings.item_rounding_position ?? 100
      const roundingMethod = salesSettings.item_rounding_method ?? 'floor_100'
      const roundingTiming = salesSettings.item_rounding_timing ?? 'per_item'
      const { type: roundingType } = parseRoundingMethod(roundingMethod)

      const salesAttribution = salesSettings.item_multi_cast_distribution ?? 'nomination_only'
      const helpDistMethod = salesSettings.item_help_distribution_method ?? 'all_to_nomination'
      const helpRatio = salesSettings.item_help_ratio ?? 100
      const giveHelpSales = salesSettings.item_help_sales_inclusion === 'both'
      const nominationDistributeAll = salesSettings.item_nomination_distribute_all ?? false

      const items = sampleItems.map(item => {
        // キャスト商品のみの場合、キャスト名が入っていない商品は除外
        if (item.castNames.length === 0) {
          return { ...item, castBreakdown: [] as { cast: string; sales: number; isSelf: boolean }[], notIncluded: true }
        }

        // 実推し（ヘルプ除外名を除く）
        const realNominations = sampleNominations.filter(n => !nonHelpStaffNames.includes(n))
        // 推しがヘルプ扱いにしない推し名のみの場合（例：フリー）
        const nominationIsNonHelpOnly = sampleNominations.length > 0 && realNominations.length === 0

        // 商品上の実キャスト（nonHelpStaffNamesを除外）
        const realCastsOnItem = item.castNames.filter(c => !nonHelpStaffNames.includes(c))

        // 商品上の推しキャスト
        // nominationIsNonHelpOnlyの場合は商品上の実キャスト全員がSELF
        const nominationCastsOnItem = nominationIsNonHelpOnly
          ? realCastsOnItem
          : realCastsOnItem.filter(c => realNominations.includes(c))
        // 商品上のヘルプキャスト
        const helpCastsOnItem = nominationIsNonHelpOnly
          ? []
          : realCastsOnItem.filter(c => !realNominations.includes(c))

        let calcPrice = item.basePrice
        let afterTaxPrice = item.basePrice
        let afterTaxRounded = item.basePrice

        // 「商品ごと」の場合のみ、商品単位で計算基準と端数処理を適用
        if (roundingTiming === 'per_item') {
          if (excludeTax) {
            const taxPercent = Math.round(taxRate * 100)
            calcPrice = Math.floor(calcPrice * 100 / (100 + taxPercent))
            afterTaxPrice = calcPrice
          }
          afterTaxRounded = applyRounding(afterTaxPrice, roundingPosition, roundingType)
          if (excludeService && serviceRate > 0) {
            const servicePercent = Math.round(serviceRate * 100)
            const afterServicePrice = Math.floor(afterTaxRounded * (100 + servicePercent) / 100)
            calcPrice = applyRounding(afterServicePrice, roundingPosition, roundingType)
          } else {
            calcPrice = afterTaxRounded
          }
        }

        const roundedBase = roundingTiming === 'per_item'
          ? applyRounding(calcPrice, roundingPosition, roundingType)
          : calcPrice

        const castBreakdown: { cast: string; sales: number; isSelf: boolean; backAmount?: number }[] = []

        if (salesAttribution === 'all_equal') {
          // ヘルプ商品も売上に含める
          let nominationShare = roundedBase
          let helpShare = 0

          // 推しがいるかどうか（nominationIsNonHelpOnlyの場合は商品上のキャストで判定）
          const hasRealNomination = nominationIsNonHelpOnly
            ? nominationCastsOnItem.length > 0
            : (nominationCastsOnItem.length > 0 || realNominations.length > 0)

          if (helpDistMethod === 'equal') {
            const hasHelp = helpCastsOnItem.length > 0
            if (hasRealNomination && hasHelp) {
              nominationShare = Math.floor(roundedBase / 2)
              helpShare = roundedBase - nominationShare
            } else if (hasRealNomination) {
              nominationShare = roundedBase
            } else {
              nominationShare = 0
              helpShare = roundedBase
            }
          } else if (helpDistMethod === 'ratio') {
            const hasHelp = helpCastsOnItem.length > 0
            if (hasRealNomination && hasHelp) {
              nominationShare = Math.floor(roundedBase * helpRatio / 100)
              helpShare = roundedBase - nominationShare
            } else if (hasRealNomination) {
              nominationShare = roundedBase
            } else {
              nominationShare = 0
              helpShare = roundedBase
            }
          } else if (helpDistMethod === 'equal_per_person') {
            // 均等割: 実キャスト全員で等分（nonHelpStaffNamesは除外）
            // 商品についていない推しも含めるか判定
            const shouldIncludeAllNominations = nominationDistributeAll || nominationCastsOnItem.length === 0
            const nominationsNotOnItem = realNominations.filter(n => !item.castNames.includes(n))

            if (shouldIncludeAllNominations && !nominationIsNonHelpOnly && nominationsNotOnItem.length > 0) {
              // 全員（商品上 + 商品外の実推し）で計算
              const totalPeople = realCastsOnItem.length + nominationsNotOnItem.length
              const perPersonAmountAll = Math.floor(roundedBase / totalPeople)
              // 推し→ヘルプの順番で追加
              nominationCastsOnItem.forEach(c => {
                castBreakdown.push({ cast: c, sales: perPersonAmountAll, isSelf: true })
              })
              nominationsNotOnItem.forEach(nom => {
                castBreakdown.push({ cast: nom, sales: perPersonAmountAll, isSelf: true })
              })
              helpCastsOnItem.forEach(c => {
                castBreakdown.push({ cast: c, sales: giveHelpSales ? perPersonAmountAll : 0, isSelf: false })
              })
            } else if (realCastsOnItem.length > 0) {
              // 商品上のキャストのみで計算
              const perPersonAmount = Math.floor(roundedBase / realCastsOnItem.length)
              // 推し→ヘルプの順番で追加
              nominationCastsOnItem.forEach(c => {
                castBreakdown.push({ cast: c, sales: perPersonAmount, isSelf: true })
              })
              helpCastsOnItem.forEach(c => {
                castBreakdown.push({ cast: c, sales: giveHelpSales ? perPersonAmount : 0, isSelf: false })
              })
            }
          }

          // equal_per_person以外の場合の分配ロジック
          if (helpDistMethod !== 'equal_per_person') {
            // 商品についていない推しも含めるか判定
            const shouldIncludeAllNominations = nominationDistributeAll || nominationCastsOnItem.length === 0

            if (shouldIncludeAllNominations && !nominationIsNonHelpOnly && realNominations.length > 0) {
              // 全推しに分配
              const perNominationAmount = Math.floor(nominationShare / realNominations.length)
              realNominations.forEach(nom => {
                castBreakdown.push({ cast: nom, sales: perNominationAmount, isSelf: true })
              })
            } else if (nominationCastsOnItem.length > 0) {
              // 商品についている推しのみに分配
              const perNominationAmount = Math.floor(nominationShare / nominationCastsOnItem.length)
              nominationCastsOnItem.forEach(c => {
                castBreakdown.push({ cast: c, sales: perNominationAmount, isSelf: true })
              })
            }
            // ヘルプへの分配
            if (helpCastsOnItem.length > 0) {
              const perHelpAmount = giveHelpSales ? Math.floor(helpShare / helpCastsOnItem.length) : 0
              helpCastsOnItem.forEach(c => {
                castBreakdown.push({ cast: c, sales: perHelpAmount, isSelf: false })
              })
            }
          }
        } else {
          // 推しのみ: 推しの分だけ計上（ヘルプは売上0）
          const shouldIncludeAllNominations = nominationDistributeAll || nominationCastsOnItem.length === 0

          if (shouldIncludeAllNominations && !nominationIsNonHelpOnly && realNominations.length > 0) {
            // 全推しに分配（設定ON または 商品に推しがいない場合）
            const perNominationAmount = Math.floor(roundedBase / realNominations.length)
            realNominations.forEach(nom => {
              castBreakdown.push({ cast: nom, sales: perNominationAmount, isSelf: true })
            })
          } else if (nominationCastsOnItem.length > 0) {
            // 商品についている推しのみに分配
            const perNominationAmount = Math.floor(roundedBase / nominationCastsOnItem.length)
            nominationCastsOnItem.forEach(c => {
              castBreakdown.push({ cast: c, sales: perNominationAmount, isSelf: true })
            })
          }
          // ヘルプは売上0
          helpCastsOnItem.forEach(c => {
            castBreakdown.push({ cast: c, sales: 0, isSelf: false })
          })
        }

        // 商品バックの計算（商品バックが有効な場合）
        const showProductBack = settingsState?.useProductBack || settingsState?.compareUseProductBack
        const castBreakdownWithBack = castBreakdown.map(cb => {
          if (!showProductBack || cb.sales === 0) {
            return { ...cb, backAmount: 0 }
          }
          // キャスト名からキャストIDを取得
          const castInfo = casts.find(c => c.name === cb.cast)
          if (!castInfo) {
            return { ...cb, backAmount: 0 }
          }
          // バック率を取得
          const backRateInfo = getBackRate(backRates, castInfo.id, item.category, item.name, cb.isSelf)
          if (!backRateInfo) {
            return { ...cb, backAmount: 0 }
          }
          // バック金額を計算
          const backAmount = backRateInfo.type === 'fixed'
            ? backRateInfo.fixedAmount
            : Math.floor(cb.sales * backRateInfo.rate / 100)
          return { ...cb, backAmount }
        })

        return { ...item, castBreakdown: castBreakdownWithBack, notIncluded: false }
      })

      // 売上集計
      let selfSales = 0
      let helpSales = 0
      let totalProductBack = 0
      items.forEach(item => {
        if (item.notIncluded) return
        item.castBreakdown.forEach((cb: { cast: string; sales: number; isSelf: boolean; backAmount?: number }) => {
          if (cb.isSelf) selfSales += cb.sales
          else helpSales += cb.sales
          totalProductBack += cb.backAmount || 0
        })
      })

      // 伝票合計の計算（サービス料・端数処理込み）
      const receiptServiceFee = Math.floor(receiptSubtotal * serviceRate)
      const receiptBeforeRounding = receiptSubtotal + receiptServiceFee
      const applySystemRounding = (amount: number) => {
        const unit = systemSettings.rounding_unit || 1
        switch (systemSettings.rounding_method) {
          case 0: return Math.ceil(amount / unit) * unit
          case 1: return Math.floor(amount / unit) * unit
          case 2: return Math.round(amount / unit) * unit
          default: return amount
        }
      }
      const receiptTotal = applySystemRounding(receiptBeforeRounding)
      const receiptRoundingDiff = receiptTotal - receiptBeforeRounding

      return {
        items,
        receiptSubtotal,
        receiptServiceFee,
        receiptBeforeRounding,
        receiptTotal,
        receiptRoundingDiff,
        selfSales,
        helpSales,
        totalSales: selfSales + helpSales,
        totalProductBack,
        receiptTotalExcludingTax: sampleItems.reduce((sum, item) => sum + Math.floor(item.basePrice * 100 / 110), 0),
      }
    }

    // =========================================
    // 伝票小計（receipt_based）ロジック
    // =========================================
    const excludeTax = salesSettings.receipt_exclude_consumption_tax
    const roundingPosition = salesSettings.receipt_rounding_position ?? 100
    const roundingMethod = salesSettings.receipt_rounding_method ?? 'floor_100'
    const roundingTiming = salesSettings.receipt_rounding_timing ?? 'per_item'
    const { type: roundingType } = parseRoundingMethod(roundingMethod)
    const includeHelpItems = salesSettings.receipt_multi_cast_distribution === 'all_equal'
    const helpDistMethod = salesSettings.receipt_help_distribution_method ?? 'all_to_nomination'
    const helpRatio = salesSettings.receipt_help_ratio ?? 50
    const giveHelpSales = salesSettings.receipt_help_sales_inclusion === 'both'

    const items = sampleItems.map(item => {
      const castsOnItem = item.castNames.filter(c => c !== '-')

      // 実推し（ヘルプ除外名を除く）
      const realNominations = sampleNominations.filter(n => !nonHelpStaffNames.includes(n))
      // 推しがヘルプ扱いにしない推し名のみの場合（例：フリー）
      const nominationIsNonHelpOnly = sampleNominations.length > 0 && realNominations.length === 0

      // 商品上の実キャスト（nonHelpStaffNamesを除外）
      const realCastsOnItem = castsOnItem.filter(c => !nonHelpStaffNames.includes(c))

      // 推しに該当するキャスト
      // nominationIsNonHelpOnlyの場合は商品上の実キャスト全員がSELF
      const selfCasts = nominationIsNonHelpOnly
        ? realCastsOnItem
        : realCastsOnItem.filter(c => realNominations.includes(c))
      // ヘルプに該当するキャスト
      const helpCasts = nominationIsNonHelpOnly
        ? []
        : realCastsOnItem.filter(c => !realNominations.includes(c))

      const isSelfOnly = realCastsOnItem.length === 0 || (selfCasts.length > 0 && helpCasts.length === 0)
      const isHelpOnly = helpCasts.length > 0 && selfCasts.length === 0
      const isMixed = selfCasts.length > 0 && helpCasts.length > 0

      const castBreakdown: { cast: string; sales: number; isSelf: boolean; backAmount?: number }[] = []

      // 商品ごとに税計算・端数処理を適用
      let itemAmount = item.basePrice

      if (roundingTiming === 'per_item') {
        if (excludeTax) {
          const taxPercent = Math.round(taxRate * 100)
          itemAmount = Math.floor(itemAmount * 100 / (100 + taxPercent))
        }
        itemAmount = applyRounding(itemAmount, roundingPosition, roundingType)
      }

      // 分配先を決定（nominationIsNonHelpOnlyの場合は商品上のキャスト、それ以外は実推し）
      const distributeTargets = nominationIsNonHelpOnly ? selfCasts : realNominations

      if (realCastsOnItem.length > 0) {
        // 商品上のキャストごとの内訳（推し→ヘルプ順）
        selfCasts.forEach(c => {
          castBreakdown.push({ cast: c, isSelf: true, sales: 0 })
        })
        helpCasts.forEach(c => {
          castBreakdown.push({ cast: c, isSelf: false, sales: 0 })
        })

        // 伝票小計では常に選択された推し全員に分配する
        // 商品についていない実推しも追加（nominationIsNonHelpOnlyの場合は追加しない）
        if (!nominationIsNonHelpOnly) {
          const nominationsNotInBreakdown = realNominations.filter(
            nom => !castBreakdown.some(cb => cb.cast === nom)
          )
          nominationsNotInBreakdown.forEach(nom => {
            castBreakdown.push({ cast: nom, isSelf: true, sales: 0 })
          })
        }

        if (isHelpOnly && !includeHelpItems) {
          // ヘルプのみの商品で、含めない設定 → 売上0
        } else if (isSelfOnly) {
          // 推しのみの商品 → 分配先全員に等分
          if (distributeTargets.length > 0) {
            const perNomAmount = Math.floor(itemAmount / distributeTargets.length)
            let nomIdx = 0
            castBreakdown.forEach(cb => {
              if (cb.isSelf) {
                cb.sales = nomIdx === distributeTargets.length - 1
                  ? itemAmount - perNomAmount * (distributeTargets.length - 1)
                  : perNomAmount
                nomIdx++
              }
            })
          }
        } else if (isMixed || (isHelpOnly && includeHelpItems)) {
          // 混在 or ヘルプのみで含める設定 → 分配方法による
          const helpCount = helpCasts.length

          if (helpDistMethod === 'all_to_nomination') {
            if (distributeTargets.length > 0) {
              const perNomAmount = Math.floor(itemAmount / distributeTargets.length)
              let nomIdx = 0
              castBreakdown.forEach(cb => {
                if (cb.isSelf) {
                  cb.sales = nomIdx === distributeTargets.length - 1
                    ? itemAmount - perNomAmount * (distributeTargets.length - 1)
                    : perNomAmount
                  nomIdx++
                }
              })
            }
          } else if (helpDistMethod === 'equal') {
            const selfShare = Math.floor(itemAmount / 2)
            const helpShare = itemAmount - selfShare

            if (distributeTargets.length > 0) {
              const perNomAmount = Math.floor(selfShare / distributeTargets.length)
              let nomIdx = 0
              castBreakdown.forEach(cb => {
                if (cb.isSelf) {
                  cb.sales = nomIdx === distributeTargets.length - 1
                    ? selfShare - perNomAmount * (distributeTargets.length - 1)
                    : perNomAmount
                  nomIdx++
                }
              })
            }
            if (helpCount > 0 && giveHelpSales) {
              const perHelpAmount = Math.floor(helpShare / helpCount)
              castBreakdown.forEach(cb => {
                if (!cb.isSelf) cb.sales = perHelpAmount
              })
            }
          } else if (helpDistMethod === 'equal_per_person') {
            const totalPeople = distributeTargets.length + helpCount
            const perPerson = Math.floor(itemAmount / totalPeople)

            let idx = 0
            castBreakdown.forEach(cb => {
              if (cb.isSelf || giveHelpSales) {
                cb.sales = idx === totalPeople - 1
                  ? itemAmount - perPerson * (totalPeople - 1)
                  : perPerson
                idx++
              }
            })
          } else if (helpDistMethod === 'ratio') {
            const selfShare = Math.floor(itemAmount * helpRatio / 100)
            const helpShare = itemAmount - selfShare

            if (distributeTargets.length > 0) {
              const perNomAmount = Math.floor(selfShare / distributeTargets.length)
              let nomIdx = 0
              castBreakdown.forEach(cb => {
                if (cb.isSelf) {
                  cb.sales = nomIdx === distributeTargets.length - 1
                    ? selfShare - perNomAmount * (distributeTargets.length - 1)
                    : perNomAmount
                  nomIdx++
                }
              })
            }
            if (helpCount > 0 && giveHelpSales) {
              const perHelpAmount = Math.floor(helpShare / helpCount)
              castBreakdown.forEach(cb => {
                if (!cb.isSelf) cb.sales = perHelpAmount
              })
            }
          }
        }
      } else {
        // キャスト名なしの場合
        // nominationIsNonHelpOnly（フリー推し）の場合は誰にも計上しない
        // それ以外は実推しに分配
        if (!nominationIsNonHelpOnly && realNominations.length > 0) {
          const perNomAmount = Math.floor(itemAmount / realNominations.length)
          realNominations.forEach((nom, idx) => {
            const sales = idx === realNominations.length - 1
              ? itemAmount - perNomAmount * (realNominations.length - 1)
              : perNomAmount
            castBreakdown.push({ cast: nom, isSelf: true, sales })
          })
        }
        // フリー推しでキャスト名なしの場合はcastBreakdownは空（誰にも計上しない）
      }

      // 商品バックの計算（商品バックが有効な場合）
      const showProductBack = settingsState?.useProductBack || settingsState?.compareUseProductBack
      const castBreakdownWithBack = castBreakdown.map(cb => {
        if (!showProductBack || cb.sales === 0) {
          return { ...cb, backAmount: 0 }
        }
        // キャスト名からキャストIDを取得
        const castInfo = casts.find(c => c.name === cb.cast)
        if (!castInfo) {
          return { ...cb, backAmount: 0 }
        }
        // バック率を取得
        const backRateInfo = getBackRate(backRates, castInfo.id, item.category, item.name, cb.isSelf)
        if (!backRateInfo) {
          return { ...cb, backAmount: 0 }
        }
        // バック金額を計算
        const backAmount = backRateInfo.type === 'fixed'
          ? backRateInfo.fixedAmount
          : Math.floor(cb.sales * backRateInfo.rate / 100)
        return { ...cb, backAmount }
      })

      return { ...item, castBreakdown: castBreakdownWithBack, notIncluded: false }
    })

    // 売上集計
    let selfSales = 0
    let helpSales = 0
    let totalProductBack = 0
    items.forEach(item => {
      item.castBreakdown.forEach((cb: { cast: string; sales: number; isSelf: boolean; backAmount?: number }) => {
        if (cb.isSelf) selfSales += cb.sales
        else helpSales += cb.sales
        totalProductBack += cb.backAmount || 0
      })
    })

    // 伝票合計の計算（サービス料・端数処理込み）
    const receiptServiceFee = Math.floor(receiptSubtotal * serviceRate)
    const receiptBeforeRounding = receiptSubtotal + receiptServiceFee
    const applySystemRounding = (amount: number) => {
      const unit = systemSettings.rounding_unit || 1
      switch (systemSettings.rounding_method) {
        case 0: return Math.ceil(amount / unit) * unit
        case 1: return Math.floor(amount / unit) * unit
        case 2: return Math.round(amount / unit) * unit
        default: return amount
      }
    }
    const receiptTotal = applySystemRounding(receiptBeforeRounding)
    const receiptRoundingDiff = receiptTotal - receiptBeforeRounding

    return {
      items,
      receiptSubtotal,
      receiptServiceFee,
      receiptBeforeRounding,
      receiptTotal,
      receiptRoundingDiff,
      selfSales,
      helpSales,
      totalSales: selfSales + helpSales,
      totalProductBack,
      receiptTotalExcludingTax: sampleItems.reduce((sum, item) => sum + Math.floor(item.basePrice * 100 / 110), 0),
    }
  }, [sampleItems, sampleNominations, nonHelpStaffNames, salesViewMode, salesSettings, systemSettings, settingsState, casts, backRates])

  // カテゴリ別の商品リスト
  const productsByCategory = useMemo(() => {
    const grouped: { [categoryId: number]: { category: Category; products: Product[] } } = {}
    products.forEach(product => {
      if (!grouped[product.category_id]) {
        const category = categories.find(c => c.id === product.category_id)
        if (category) {
          grouped[product.category_id] = { category, products: [] }
        }
      }
      if (grouped[product.category_id]) {
        grouped[product.category_id].products.push(product)
      }
    })
    return Object.values(grouped)
  }, [products, categories])

  // ヘルパー関数
  const selectProduct = (itemId: number, productId: number | null) => {
    if (productId === null) {
      // カスタム商品（手入力）
      setSampleItems(items => items.map(item =>
        item.id === itemId ? { ...item, productId: null, name: '新商品', category: '', basePrice: 1000 } : item
      ))
    } else {
      const product = products.find(p => p.id === productId)
      if (product) {
        const category = categories.find(c => c.id === product.category_id)
        setSampleItems(items => items.map(item =>
          item.id === itemId ? {
            ...item,
            productId: product.id,
            name: product.name,
            category: category?.name || '',
            basePrice: product.price,
          } : item
        ))
      }
    }
  }

  const updateItemName = (id: number, name: string) => {
    setSampleItems(items => items.map(item =>
      item.id === id ? { ...item, name, productId: null } : item
    ))
  }

  const updateItemPrice = (id: number, basePrice: number) => {
    setSampleItems(items => items.map(item =>
      item.id === id ? { ...item, basePrice } : item
    ))
  }

  const toggleItemCast = (id: number, cast: string) => {
    if (cast === '-') {
      // クリア
      setSampleItems(items => items.map(item =>
        item.id === id ? { ...item, castNames: [] } : item
      ))
    } else {
      setSampleItems(items => items.map(item => {
        if (item.id !== id) return item
        const newCastNames = item.castNames.includes(cast)
          ? item.castNames.filter(c => c !== cast)
          : [...item.castNames, cast]
        return { ...item, castNames: newCastNames }
      }))
    }
  }

  const removePreviewItem = (id: number) => {
    setSampleItems(items => items.filter(item => item.id !== id))
  }

  const addPreviewItem = () => {
    const newId = Math.max(...sampleItems.map(i => i.id), 0) + 1
    setSampleItems([...sampleItems, { id: newId, productId: null, name: '新商品', category: '', basePrice: 1000, castNames: [] }])
  }

  // 設定を保存
  const saveSettings = async () => {
    if (!settingsState || !selectedCastId) return

    // ロック中は保存不可
    if (isLocked) {
      toast.error('この月の設定はロックされています')
      return
    }

    setSaving(true)
    try {
      const saveData = {
        ...stateToDb(settingsState, selectedCastId, storeId, existingId),
        target_year: selectedYear,
        target_month: selectedMonth,
      }

      if (existingId) {
        // 更新
        const { error } = await supabase
          .from('compensation_settings')
          .update(saveData)
          .eq('id', existingId)

        if (error) throw error
      } else {
        // 新規作成
        const { error } = await supabase
          .from('compensation_settings')
          .insert(saveData)

        if (error) throw error
      }

      toast.success('設定を保存しました')
      await loadSettings(selectedCastId, selectedYear, selectedMonth)
    } catch (error) {
      console.error('保存エラー:', error)
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // スライド率テーブルを開く
  const openSlidingModal = () => {
    setEditingSlidingRates(settingsState?.slidingRates || [
      { min: 0, max: 100000, rate: 40 },
      { min: 100000, max: 200000, rate: 45 },
      { min: 200000, max: 300000, rate: 50 },
      { min: 300000, max: 0, rate: 55 },
    ])
    setShowSlidingModal(true)
  }

  // スライド率を保存
  const saveSlidingRates = () => {
    setSettingsState(prev => prev ? { ...prev, slidingRates: editingSlidingRates } : null)
    setShowSlidingModal(false)
  }

  // 控除項目を開く
  const openDeductionModal = () => {
    setEditingDeductions(settingsState?.deductionItems || [])
    setShowDeductionModal(true)
  }

  // 控除項目を追加
  const addDeduction = () => {
    setEditingDeductions(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type: 'misc' as DeductionType,
        name: '',
        amount: 0,
        isVariable: true,
      }
    ])
  }

  // 控除項目を削除
  const removeDeduction = (id: string) => {
    setEditingDeductions(prev => prev.filter(d => d.id !== id))
  }

  // 控除項目を保存
  const saveDeductions = () => {
    const validDeductions = editingDeductions.filter(d => d.name.trim())
    setSettingsState(prev => prev ? {
      ...prev,
      deductionItems: validDeductions.length > 0 ? validDeductions : null
    } : null)
    setShowDeductionModal(false)
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>報酬計算設定</h1>
          <p style={styles.subtitle}>店舗: {storeName}</p>
        </div>
        <div style={styles.headerRight}>
          {/* キャスト選択ドロップダウン */}
          <div style={styles.castSelectorWrapper} ref={dropdownRef}>
            <button
              onClick={() => setShowCastDropdown(!showCastDropdown)}
              style={styles.castSelectorBtn}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2980b9'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3498db'}
            >
              <span style={styles.castSelectorIcon}>👤</span>
              <span style={styles.castSelectorText}>
                {selectedCast ? selectedCast.name : 'キャストを選択'}
              </span>
              <span style={styles.castSelectorArrow}>{showCastDropdown ? '▲' : '▼'}</span>
            </button>

            {showCastDropdown && (
              <div style={styles.castDropdown}>
                <input
                  type="text"
                  placeholder="名前で検索..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  style={styles.dropdownSearch}
                  autoFocus
                />
                <div style={styles.dropdownFilters}>
                  {['在籍', '体験', '退店', ''].map((status) => (
                    <button
                      key={status || 'all'}
                      onClick={() => setStatusFilter(status)}
                      style={{
                        ...styles.filterBtn,
                        ...(statusFilter === status ? styles.filterBtnActive : {}),
                      }}
                      onMouseEnter={(e) => {
                        if (statusFilter !== status) {
                          e.currentTarget.style.backgroundColor = '#e2e8f0'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (statusFilter !== status) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      {status || '全員'}
                    </button>
                  ))}
                </div>
                <div style={styles.dropdownList}>
                  {filteredCasts.map((cast) => (
                    <button
                      key={cast.id}
                      onClick={() => {
                        setSelectedCastId(cast.id)
                        setShowCastDropdown(false)
                        setSearchText('')
                      }}
                      style={{
                        ...styles.dropdownItem,
                        ...(selectedCastId === cast.id ? styles.dropdownItemActive : {}),
                      }}
                      onMouseEnter={(e) => {
                        if (selectedCastId !== cast.id) {
                          e.currentTarget.style.backgroundColor = '#f1f5f9'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedCastId !== cast.id) {
                          e.currentTarget.style.backgroundColor = 'white'
                        }
                      }}
                    >
                      <span style={styles.dropdownItemName}>{cast.name}</span>
                      <span style={{
                        ...styles.dropdownItemStatus,
                        color: cast.status === '在籍' ? '#10b981' : cast.status === '体験' ? '#f59e0b' : '#94a3b8',
                      }}>
                        {cast.status}
                      </span>
                    </button>
                  ))}
                  {filteredCasts.length === 0 && (
                    <p style={styles.dropdownEmpty}>該当するキャストがいません</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 店舗共通設定 */}
          <div style={styles.headerBox}>
            <span style={styles.headerBoxLabel}>給料日</span>
            <select
              value={payDay}
              onChange={(e) => setPayDay(Number(e.target.value))}
              style={styles.headerSelect}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>{day}日</option>
              ))}
              <option value={0}>末日</option>
            </select>
            <Button
              onClick={savePayDay}
              variant="primary"
              size="small"
              disabled={savingPayDay}
            >
              {savingPayDay ? '...' : '保存'}
            </Button>
          </div>

          {/* 対象年月 */}
          <div style={styles.headerBox}>
            <span style={styles.headerBoxLabel}>対象年月</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={styles.headerSelect}
            >
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map((year) => (
                <option key={year} value={year}>{year}年</option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              style={styles.headerSelectSmall}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <option key={month} value={month}>{month}月</option>
              ))}
            </select>
            {isLocked && (
              <span style={styles.lockedBadge}>ロック中</span>
            )}
          </div>
        </div>
      </div>

      <div style={styles.layout}>
        {/* メインコンテンツ */}
        <div style={styles.main}>
          {selectedCast && settingsState ? (
            <>
              <div style={styles.mainHeader}>
                <h2 style={styles.mainTitle}>{selectedCast.name} の報酬設定</h2>
              </div>

              {/* 報酬形態1 */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>
                  報酬形態1
                  <HelpTooltip
                    text="チェックを入れた項目の合計が報酬形態1になります。複数選択可能です。"
                    width={280}
                  />
                </h3>

                {/* 時給 */}
                <div style={styles.payRow}>
                  <label style={styles.payLabel}>
                    <input
                      type="checkbox"
                      checked={settingsState.useHourly}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, useHourly: e.target.checked } : null)}
                      style={styles.checkbox}
                    />
                    <span>時給</span>
                  </label>
                  <div style={styles.payInputGroup}>
                    <input
                      type="number"
                      value={settingsState.hourlyRate}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, hourlyRate: Number(e.target.value) } : null)}
                      style={styles.payInput}
                      disabled={!settingsState.useHourly}
                    />
                    <span style={styles.payUnit}>円/時</span>
                  </div>
                </div>

                {/* 固定額 */}
                <div style={styles.payRow}>
                  <label style={styles.payLabel}>
                    <input
                      type="checkbox"
                      checked={settingsState.useFixed}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, useFixed: e.target.checked } : null)}
                      style={styles.checkbox}
                    />
                    <span>固定額</span>
                  </label>
                  <div style={styles.payInputGroup}>
                    <input
                      type="number"
                      value={settingsState.fixedAmount}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, fixedAmount: Number(e.target.value) } : null)}
                      style={styles.payInput}
                      disabled={!settingsState.useFixed}
                    />
                    <span style={styles.payUnit}>円</span>
                  </div>
                </div>

                {/* 売上ベース */}
                <div style={styles.payRow}>
                  <label style={styles.payLabel}>
                    <input
                      type="checkbox"
                      checked={settingsState.useSales}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, useSales: e.target.checked } : null)}
                      style={styles.checkbox}
                    />
                    <span>売上</span>
                  </label>
                  <div style={styles.payInputGroup}>
                    <select
                      value={settingsState.salesTarget}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, salesTarget: e.target.value as SalesTargetType } : null)}
                      style={styles.paySelect}
                      disabled={!settingsState.useSales}
                    >
                      <option value="cast_sales">推し小計売上</option>
                      <option value="receipt_total">伝票小計売上</option>
                    </select>
                    <span style={styles.payTimes}>×</span>
                    <input
                      type="number"
                      value={settingsState.commissionRate}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, commissionRate: Number(e.target.value) } : null)}
                      style={{ ...styles.payInput, width: '70px' }}
                      disabled={!settingsState.useSales}
                    />
                    <span style={styles.payUnit}>%</span>
                  </div>
                </div>

                {/* 商品別バック */}
                <div style={styles.payRow}>
                  <label style={styles.payLabel}>
                    <input
                      type="checkbox"
                      checked={settingsState.useProductBack}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, useProductBack: e.target.checked } : null)}
                      style={styles.checkbox}
                    />
                    <span>商品バック</span>
                  </label>
                  <div style={styles.payInputGroup}>
                    <span style={styles.productBackHint}>
                      バック率設定ページで設定した商品別バック率を使用
                    </span>
                  </div>
                </div>
              </div>

              {/* 報酬形態2（高い方を支給） */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={settingsState.useComparison}
                      onChange={(e) => setSettingsState(prev => prev ? { ...prev, useComparison: e.target.checked } : null)}
                      style={styles.checkbox}
                    />
                    報酬形態2（高い方を支給）
                  </label>
                  <HelpTooltip
                    text="報酬形態1と報酬形態2を比べ、高い方を支給します。"
                    width={280}
                  />
                </h3>

                {settingsState.useComparison && (
                  <div style={styles.compareSection}>
                    {/* 比較用: 時給 */}
                    <div style={styles.payRow}>
                      <label style={styles.payLabel}>
                        <input
                          type="checkbox"
                          checked={settingsState.compareUseHourly}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareUseHourly: e.target.checked } : null)}
                          style={styles.checkbox}
                        />
                        <span>時給</span>
                      </label>
                      <div style={styles.payInputGroup}>
                        <input
                          type="number"
                          value={settingsState.compareHourlyRate}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareHourlyRate: Number(e.target.value) } : null)}
                          style={styles.payInput}
                          disabled={!settingsState.compareUseHourly}
                        />
                        <span style={styles.payUnit}>円/時</span>
                      </div>
                    </div>

                    {/* 比較用: 固定額 */}
                    <div style={styles.payRow}>
                      <label style={styles.payLabel}>
                        <input
                          type="checkbox"
                          checked={settingsState.compareUseFixed}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareUseFixed: e.target.checked } : null)}
                          style={styles.checkbox}
                        />
                        <span>固定額</span>
                      </label>
                      <div style={styles.payInputGroup}>
                        <input
                          type="number"
                          value={settingsState.compareFixedAmount}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareFixedAmount: Number(e.target.value) } : null)}
                          style={styles.payInput}
                          disabled={!settingsState.compareUseFixed}
                        />
                        <span style={styles.payUnit}>円</span>
                      </div>
                    </div>

                    {/* 比較用: 売上 */}
                    <div style={styles.payRow}>
                      <label style={styles.payLabel}>
                        <input
                          type="checkbox"
                          checked={settingsState.compareUseSales}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareUseSales: e.target.checked } : null)}
                          style={styles.checkbox}
                        />
                        <span>売上</span>
                      </label>
                      <div style={styles.payInputGroup}>
                        <select
                          value={settingsState.compareSalesTarget}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareSalesTarget: e.target.value as SalesTargetType } : null)}
                          style={styles.paySelect}
                          disabled={!settingsState.compareUseSales}
                        >
                          <option value="cast_sales">推し小計売上</option>
                          <option value="receipt_total">伝票小計売上</option>
                        </select>
                        <input
                          type="number"
                          value={settingsState.compareCommissionRate}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareCommissionRate: Number(e.target.value) } : null)}
                          style={{ ...styles.payInput, width: '70px' }}
                          disabled={!settingsState.compareUseSales}
                        />
                        <span style={styles.payUnit}>%</span>
                      </div>
                    </div>

                    {/* 比較用: 商品バック */}
                    <div style={styles.payRow}>
                      <label style={styles.payLabel}>
                        <input
                          type="checkbox"
                          checked={settingsState.compareUseProductBack}
                          onChange={(e) => setSettingsState(prev => prev ? { ...prev, compareUseProductBack: e.target.checked } : null)}
                          style={styles.checkbox}
                        />
                        <span>商品バック</span>
                      </label>
                      <div style={styles.payInputGroup}>
                        <span style={styles.productBackHint}>
                          バック率設定ページで設定した商品別バック率を使用
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* スライド率テーブル */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>
                  スライド率テーブル
                  <button onClick={openSlidingModal} style={styles.editBtn}>
                    設定
                  </button>
                  <HelpTooltip
                    text="売上に応じてバック率が変動します。設定すると上記の売上バック率の代わりにこのテーブルが使用されます。"
                    width={300}
                  />
                </h3>

                {settingsState.slidingRates && settingsState.slidingRates.length > 0 ? (
                  <div style={styles.slidingPreview}>
                    {settingsState.slidingRates.map((rate, idx) => (
                      <div key={idx} style={styles.slidingPreviewRow}>
                        {rate.max > 0
                          ? `${(rate.min / 10000).toFixed(0)}万〜${(rate.max / 10000).toFixed(0)}万: ${rate.rate}%`
                          : `${(rate.min / 10000).toFixed(0)}万〜: ${rate.rate}%`
                        }
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={styles.noDeductions}>スライド率テーブルは未設定です（固定バック率を使用）</p>
                )}
              </div>

              {/* 控除設定 */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>
                  控除項目
                  <button onClick={openDeductionModal} style={styles.editBtn}>
                    編集
                  </button>
                </h3>

                {settingsState.deductionItems && settingsState.deductionItems.length > 0 ? (
                  <div style={styles.deductionList}>
                    {settingsState.deductionItems.map((item) => (
                      <div key={item.id} style={styles.deductionItem}>
                        <span style={styles.deductionName}>{item.name}</span>
                        <span style={styles.deductionAmount}>
                          {item.isVariable ? '変動' : `${item.amount.toLocaleString()}円`}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={styles.noDeductions}>控除項目はありません</p>
                )}
              </div>

              {/* 保存ボタン */}
              <div style={styles.saveArea}>
                <Button
                  onClick={saveSettings}
                  variant="primary"
                  size="large"
                  disabled={saving}
                >
                  {saving ? '保存中...' : '設定を保存'}
                </Button>
              </div>
            </>
          ) : (
            <div style={styles.emptyState}>
              <p style={styles.emptyIcon}>👤</p>
              <p style={styles.emptyText}>上部のボタンからキャストを選択してください</p>
            </div>
          )}
        </div>

        {/* サンプル伝票パネル */}
        <div style={styles.receiptPanelWrapper}>
          {/* タブ切り替え（パネル外） */}
          <div style={styles.salesTabs}>
            <button
              onClick={() => setSalesViewMode('item_based')}
              style={{
                ...styles.salesTab,
                ...(salesViewMode === 'item_based' ? styles.salesTabActive : {}),
              }}
            >
              推し小計
            </button>
            <button
              onClick={() => setSalesViewMode('receipt_based')}
              style={{
                ...styles.salesTab,
                ...(salesViewMode === 'receipt_based' ? styles.salesTabActive : {}),
              }}
            >
              伝票小計
            </button>
          </div>

          <div style={styles.receiptPanel}>
          {/* 推しキャスト選択（複数選択可能） */}
          <div style={styles.nominationSelectWrapper}>
            <span style={styles.nominationLabel}>推し（複数選択可）:</span>
            <div style={styles.nominationSelect}>
              {availableCastOptions.map(cast => (
                <button
                  key={cast}
                  onClick={() => {
                    if (sampleNominations.includes(cast)) {
                      setSampleNominations(sampleNominations.filter(n => n !== cast))
                    } else {
                      setSampleNominations([...sampleNominations, cast])
                    }
                  }}
                  style={{
                    ...styles.nominationBtn,
                    ...(sampleNominations.includes(cast) ? styles.nominationBtnActive : {}),
                    ...(nonHelpStaffNames.includes(cast) ? styles.nominationBtnNonHelp : {}),
                    ...(sampleNominations.includes(cast) && nonHelpStaffNames.includes(cast) ? styles.nominationBtnNonHelpActive : {}),
                  }}
                >
                  {cast}
                </button>
              ))}
            </div>
          </div>

          {/* サンプル伝票プレビュー */}
          <div style={styles.receiptPreview}>
            <div style={styles.receiptHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>サンプル伝票</span>
                <Button
                  onClick={saveSampleReceipt}
                  variant="secondary"
                  size="small"
                  disabled={savingSampleReceipt}
                >
                  {savingSampleReceipt ? '保存中...' : '保存'}
                </Button>
              </div>
              <span style={styles.oshiLabel}>
                推し: {sampleNominations.length > 0 ? sampleNominations.join(', ') : 'なし'}
              </span>
            </div>

            <div style={styles.tableHeader}>
              <span style={styles.tableHeaderName}>商品名</span>
              <span style={styles.tableHeaderCast}>キャスト</span>
              <span style={styles.tableHeaderPrice}>金額</span>
            </div>

            <div style={styles.receiptItemsScroll}>
              {previewData.items.map((item) => (
                <div key={item.id} style={styles.receiptItem}>
                  <div style={styles.receiptItemRow}>
                    <div style={styles.itemNameCol}>
                      {products.length > 0 ? (
                        <select
                          value={item.productId || 'custom'}
                          onChange={(e) => {
                            const value = e.target.value
                            if (value === 'custom') {
                              selectProduct(item.id, null)
                            } else {
                              selectProduct(item.id, parseInt(value))
                            }
                          }}
                          style={styles.productSelect}
                        >
                          <option value="custom">カスタム商品</option>
                          {productsByCategory.map(group => (
                            <optgroup key={group.category.id} label={group.category.name}>
                              {group.products.map(product => (
                                <option key={product.id} value={product.id}>
                                  {product.name} (¥{product.price.toLocaleString()})
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItemName(item.id, e.target.value)}
                          style={styles.itemNameInput}
                        />
                      )}
                      {item.productId === null && products.length > 0 && (
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItemName(item.id, e.target.value)}
                          style={{ ...styles.itemNameInput, marginTop: '4px' }}
                          placeholder="商品名を入力"
                        />
                      )}
                    </div>
                    <div style={styles.itemCastCol}>
                      <span style={styles.itemCastDisplay}>
                        {item.castNames.length > 0 ? item.castNames.join(',') : '-'}
                      </span>
                    </div>
                    <div style={styles.itemPriceCol}>
                      <input
                        type="number"
                        value={item.basePrice}
                        onChange={(e) => updateItemPrice(item.id, parseInt(e.target.value) || 0)}
                        style={styles.itemPriceInput}
                      />
                    </div>
                    <button
                      onClick={() => removePreviewItem(item.id)}
                      style={styles.removeItemBtn}
                      title="削除"
                    >
                      ×
                    </button>
                  </div>
                  <div style={styles.castSelectRow}>
                    <span style={styles.castSelectLabel}>キャスト:</span>
                    {availableCastOptions.map(cast => (
                      <button
                        key={cast}
                        onClick={() => toggleItemCast(item.id, cast)}
                        style={{
                          ...styles.castSelectBtn,
                          ...(item.castNames.includes(cast) ? styles.castSelectBtnActive : {}),
                        }}
                      >
                        {cast}
                      </button>
                    ))}
                    {item.castNames.length > 0 && (
                      <button
                        onClick={() => toggleItemCast(item.id, '-')}
                        style={styles.clearCastBtn}
                        title="キャストをクリア"
                      >
                        クリア
                      </button>
                    )}
                  </div>
                  <div style={styles.receiptItemDetails}>
                    {item.notIncluded ? (
                      <span style={styles.skipTag}>売上対象外</span>
                    ) : item.castBreakdown && item.castBreakdown.length > 0 ? (
                      <div style={styles.castBreakdownContainer}>
                        {item.castBreakdown.map((cb: { cast: string; sales: number; isSelf: boolean; backAmount?: number }, idx) => (
                          <div key={idx} style={styles.castBreakdownRow}>
                            <span style={{
                              ...styles.castBreakdownName,
                              color: cb.isSelf ? '#ec4899' : '#64748b',
                            }}>
                              {cb.cast}
                              <span style={styles.castBreakdownType}>
                                ({cb.isSelf ? '推し' : 'ヘルプ'})
                              </span>
                            </span>
                            <span style={{
                              ...styles.castBreakdownSales,
                              color: cb.sales > 0 ? '#10b981' : '#94a3b8',
                            }}>
                              売上: ¥{cb.sales.toLocaleString()}
                              {cb.backAmount && cb.backAmount > 0 && (
                                <span style={{ color: '#f59e0b', marginLeft: '8px' }}>
                                  → バック: ¥{cb.backAmount.toLocaleString()}
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        キャストなし
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={addPreviewItem} style={styles.addItemBtn}>
                + 商品を追加
              </button>
            </div>

            {/* 伝票合計 */}
            <div style={styles.receiptTotal}>
              <div style={styles.subtotalRow}>
                <span>小計（税込）</span>
                <span>¥{previewData.receiptSubtotal.toLocaleString()}</span>
              </div>
              {/* サービス料 */}
              {previewData.receiptServiceFee > 0 && (
                <div style={styles.subtotalRow}>
                  <span>サービス料（{systemSettings.service_fee_rate}%）</span>
                  <span>¥{previewData.receiptServiceFee.toLocaleString()}</span>
                </div>
              )}
              {/* 端数処理 */}
              {previewData.receiptRoundingDiff !== 0 && (
                <div style={styles.subtotalRow}>
                  <span>端数処理（{systemSettings.rounding_unit}の位で{
                    systemSettings.rounding_method === 0 ? '切り上げ' :
                    systemSettings.rounding_method === 1 ? '切り捨て' : '四捨五入'
                  }）</span>
                  <span style={{ color: previewData.receiptRoundingDiff > 0 ? '#10b981' : '#ef4444' }}>
                    {previewData.receiptRoundingDiff > 0 ? '+' : ''}¥{previewData.receiptRoundingDiff.toLocaleString()}
                  </span>
                </div>
              )}
              <div style={styles.totalRow}>
                <span>伝票合計</span>
                <span>¥{previewData.receiptTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* 売上サマリー */}
          <div style={styles.salesSummary}>
            <div style={styles.salesSummaryHeader}>
              {salesViewMode === 'item_based' ? '推し小計' : '伝票小計'}の売上
            </div>
            <div style={styles.salesSummaryRow}>
              <span>推し売上（税抜）</span>
              <span style={styles.salesAmount}>{previewData.selfSales.toLocaleString()}円</span>
            </div>
            {salesViewMode === 'item_based' && (
              <div style={styles.salesSummaryRow}>
                <span>ヘルプ売上（税抜）</span>
                <span style={styles.salesAmount}>{previewData.helpSales.toLocaleString()}円</span>
              </div>
            )}
            <div style={styles.salesSummaryTotal}>
              <span>合計</span>
              <span style={styles.salesTotalAmount}>{previewData.totalSales.toLocaleString()}円</span>
            </div>
          </div>
        </div>
        </div>

        {/* シミュレーションパネル */}
        <div style={styles.simulationPanel}>
          <h3 style={styles.simulationTitle}>シミュレーション</h3>

          {selectedCast && settingsState ? (
            <>
            <div style={styles.simInputSection}>
              <div style={styles.simInputRow}>
                <label style={styles.simLabel}>勤務時間</label>
                <div style={styles.simInputGroup}>
                  <input
                    type="number"
                    value={simWorkHours}
                    onChange={(e) => setSimWorkHours(Number(e.target.value))}
                    style={styles.simInput}
                    min={0}
                    step={0.5}
                  />
                  <span style={styles.simUnit}>時間</span>
                </div>
              </div>

              <div style={styles.simInputRow}>
                <label style={styles.simLabel}>売上金額</label>
                <div style={styles.simInputGroup}>
                  <input
                    type="number"
                    value={simSales}
                    onChange={(e) => setSimSales(Number(e.target.value))}
                    style={styles.simInput}
                    min={0}
                    step={1000}
                  />
                  <span style={styles.simUnit}>円</span>
                </div>
              </div>

              {settingsState.useProductBack && (
                <div style={styles.simInputRow}>
                  <label style={styles.simLabel}>商品バック</label>
                  <div style={styles.simInputGroup}>
                    <input
                      type="number"
                      value={simProductBack}
                      onChange={(e) => setSimProductBack(Number(e.target.value))}
                      style={styles.simInput}
                      min={0}
                      step={100}
                    />
                    <span style={styles.simUnit}>円</span>
                  </div>
                </div>
              )}

              <div style={styles.simInputRow}>
                <label style={styles.simLabel}>変動控除</label>
                <div style={styles.simInputGroup}>
                  <input
                    type="number"
                    value={simDeductions}
                    onChange={(e) => setSimDeductions(Number(e.target.value))}
                    style={styles.simInput}
                    min={0}
                    step={100}
                  />
                  <span style={styles.simUnit}>円</span>
                </div>
              </div>
            </div>

            {simulationResult && (
              <div style={styles.simResultSection}>
                <h4 style={styles.simResultTitle}>計算結果</h4>

                {/* 基本給内訳 */}
                <div style={styles.simBreakdown}>
                  {settingsState.useHourly && (
                    <div style={styles.simBreakdownRow}>
                      <span>時給分</span>
                      <span>{simulationResult.hourlyPay.toLocaleString()}円</span>
                    </div>
                  )}
                  {settingsState.useFixed && (
                    <div style={styles.simBreakdownRow}>
                      <span>固定額</span>
                      <span>{simulationResult.fixedPay.toLocaleString()}円</span>
                    </div>
                  )}
                  {settingsState.useSales && (
                    <div style={styles.simBreakdownRow}>
                      <span>売上バック</span>
                      <span>{simulationResult.salesCommission.toLocaleString()}円</span>
                    </div>
                  )}
                  <div style={styles.simBreakdownSubtotal}>
                    <span>基本給計</span>
                    <span>{simulationResult.basePay.toLocaleString()}円</span>
                  </div>
                </div>

                {/* スライド制の比較 */}
                {settingsState.useComparison && (
                  <div style={styles.simComparison}>
                    <div style={styles.simCompareRow}>
                      <span style={simulationResult.isBaseHigher ? styles.simCompareWinner : undefined}>
                        基本: {simulationResult.basePay.toLocaleString()}円
                      </span>
                      <span style={styles.simCompareVs}>vs</span>
                      <span style={!simulationResult.isBaseHigher ? styles.simCompareWinner : undefined}>
                        比較: {simulationResult.comparePay.toLocaleString()}円
                      </span>
                    </div>
                    <div style={styles.simCompareResult}>
                      → {simulationResult.isBaseHigher ? '基本給' : '比較対象'}を採用
                    </div>
                  </div>
                )}

                {/* 商品バック */}
                {settingsState.useProductBack && simulationResult.productBackAmount > 0 && (
                  <div style={styles.simBreakdownRow}>
                    <span>商品バック</span>
                    <span>+{simulationResult.productBackAmount.toLocaleString()}円</span>
                  </div>
                )}

                {/* 控除 */}
                {simulationResult.totalDeductions > 0 && (
                  <div style={styles.simDeductionSection}>
                    {simulationResult.fixedDeductions > 0 && (
                      <div style={styles.simBreakdownRow}>
                        <span style={styles.simDeductionText}>固定控除</span>
                        <span style={styles.simDeductionText}>-{simulationResult.fixedDeductions.toLocaleString()}円</span>
                      </div>
                    )}
                    {simulationResult.variableDeductions > 0 && (
                      <div style={styles.simBreakdownRow}>
                        <span style={styles.simDeductionText}>変動控除</span>
                        <span style={styles.simDeductionText}>-{simulationResult.variableDeductions.toLocaleString()}円</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 最終支給額 */}
                <div style={styles.simFinalPay}>
                  <span>最終支給額</span>
                  <span style={styles.simFinalPayAmount}>
                    {simulationResult.finalPay.toLocaleString()}円
                  </span>
                </div>
              </div>
            )}
            </>
          ) : (
            <div style={styles.simEmptyState}>
              <p style={styles.simEmptyText}>キャストを選択してください</p>
            </div>
          )}
        </div>
      </div>

      {/* スライド率テーブル編集モーダル */}
      {showSlidingModal && (
        <div style={styles.modalOverlay} onClick={() => setShowSlidingModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>スライド率テーブル設定</h3>
            <p style={styles.modalHint}>売上に応じてバック率が変動します</p>

            <div style={styles.slidingTable}>
              <div style={styles.slidingHeader}>
                <span style={styles.slidingHeaderCell}>売上下限</span>
                <span style={styles.slidingHeaderCell}>売上上限</span>
                <span style={styles.slidingHeaderCell}>バック率</span>
                <span style={{ width: '40px' }}></span>
              </div>
              {editingSlidingRates.map((rate, idx) => (
                <div key={idx} style={styles.slidingRow}>
                  <input
                    type="number"
                    value={rate.min}
                    onChange={(e) => {
                      const newRates = [...editingSlidingRates]
                      newRates[idx].min = Number(e.target.value)
                      setEditingSlidingRates(newRates)
                    }}
                    style={styles.slidingInput}
                    placeholder="0"
                  />
                  <input
                    type="number"
                    value={rate.max || ''}
                    onChange={(e) => {
                      const newRates = [...editingSlidingRates]
                      newRates[idx].max = Number(e.target.value) || 0
                      setEditingSlidingRates(newRates)
                    }}
                    style={styles.slidingInput}
                    placeholder="上限なし"
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="number"
                      value={rate.rate}
                      onChange={(e) => {
                        const newRates = [...editingSlidingRates]
                        newRates[idx].rate = Number(e.target.value)
                        setEditingSlidingRates(newRates)
                      }}
                      style={{ ...styles.slidingInput, width: '60px' }}
                    />
                    <span>%</span>
                  </div>
                  <button
                    onClick={() => {
                      setEditingSlidingRates(prev => prev.filter((_, i) => i !== idx))
                    }}
                    style={styles.removeBtn}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                const lastRate = editingSlidingRates[editingSlidingRates.length - 1]
                setEditingSlidingRates(prev => [
                  ...prev,
                  { min: lastRate?.max || 0, max: 0, rate: (lastRate?.rate || 40) + 5 }
                ])
              }}
              style={styles.addRowBtn}
            >
              + 行を追加
            </button>

            <div style={styles.modalActions}>
              <Button onClick={() => setShowSlidingModal(false)} variant="outline" size="medium">
                キャンセル
              </Button>
              <Button
                onClick={() => {
                  setSettingsState(prev => prev ? { ...prev, slidingRates: null } : null)
                  setShowSlidingModal(false)
                }}
                variant="outline"
                size="medium"
              >
                クリア
              </Button>
              <Button onClick={saveSlidingRates} variant="primary" size="medium">
                適用
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 控除項目編集モーダル */}
      {showDeductionModal && (
        <div style={styles.modalOverlay} onClick={() => setShowDeductionModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>控除項目設定</h3>

            <div style={styles.deductionTable}>
              {editingDeductions.map((item) => (
                <div key={item.id} style={styles.deductionRow}>
                  <select
                    value={item.type}
                    onChange={(e) => {
                      setEditingDeductions(prev => prev.map(d =>
                        d.id === item.id ? { ...d, type: e.target.value as DeductionType } : d
                      ))
                    }}
                    style={styles.deductionSelect}
                  >
                    <option value="daily_payment">日払い</option>
                    <option value="penalty">罰金</option>
                    <option value="misc">雑費</option>
                  </select>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => {
                      setEditingDeductions(prev => prev.map(d =>
                        d.id === item.id ? { ...d, name: e.target.value } : d
                      ))
                    }}
                    placeholder="項目名"
                    style={styles.deductionNameInput}
                  />
                  <label style={styles.variableLabel}>
                    <input
                      type="checkbox"
                      checked={item.isVariable}
                      onChange={(e) => {
                        setEditingDeductions(prev => prev.map(d =>
                          d.id === item.id ? { ...d, isVariable: e.target.checked } : d
                        ))
                      }}
                    />
                    変動
                  </label>
                  {!item.isVariable && (
                    <input
                      type="number"
                      value={item.amount}
                      onChange={(e) => {
                        setEditingDeductions(prev => prev.map(d =>
                          d.id === item.id ? { ...d, amount: Number(e.target.value) } : d
                        ))
                      }}
                      placeholder="金額"
                      style={styles.deductionAmountInput}
                    />
                  )}
                  <button onClick={() => removeDeduction(item.id)} style={styles.removeBtn}>
                    ×
                  </button>
                </div>
              ))}
            </div>

            <button onClick={addDeduction} style={styles.addRowBtn}>
              + 控除項目を追加
            </button>

            <div style={styles.modalActions}>
              <Button onClick={() => setShowDeductionModal(false)} variant="outline" size="medium">
                キャンセル
              </Button>
              <Button onClick={saveDeductions} variant="primary" size="medium">
                適用
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '20px',
    maxWidth: '1600px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap' as const,
    gap: '16px',
  },
  headerLeft: {
    flex: '1 1 auto',
  },
  headerRight: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  headerBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#fff',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  // キャスト選択ドロップダウン
  castSelectorWrapper: {
    position: 'relative' as const,
  },
  castSelectorBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    backgroundColor: '#3498db',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    minWidth: '180px',
    transition: 'background-color 0.1s ease',
  },
  castSelectorIcon: {
    fontSize: '16px',
  },
  castSelectorText: {
    flex: 1,
    textAlign: 'left' as const,
  },
  castSelectorArrow: {
    fontSize: '10px',
    opacity: 0.8,
  },
  castDropdown: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    marginTop: '4px',
    backgroundColor: 'white',
    borderRadius: '10px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    width: '280px',
    zIndex: 100,
    overflow: 'hidden',
    animation: 'none',
  },
  dropdownSearch: {
    width: '100%',
    padding: '12px 16px',
    border: 'none',
    borderBottom: '1px solid #e2e8f0',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  dropdownFilters: {
    display: 'flex',
    gap: '4px',
    padding: '8px 12px',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
  },
  filterBtn: {
    padding: '4px 10px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#64748b',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'background-color 0.1s ease',
  },
  filterBtnActive: {
    backgroundColor: '#3498db',
    color: 'white',
  },
  dropdownList: {
    maxHeight: '300px',
    overflowY: 'auto' as const,
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '12px 16px',
    border: 'none',
    backgroundColor: 'white',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'background-color 0.1s ease',
  },
  dropdownItemActive: {
    backgroundColor: '#eff6ff',
  },
  dropdownItemName: {
    fontWeight: '500',
    color: '#1e293b',
  },
  dropdownItemStatus: {
    fontSize: '12px',
    fontWeight: '500',
  },
  dropdownEmpty: {
    padding: '20px',
    textAlign: 'center' as const,
    color: '#94a3b8',
    fontSize: '13px',
  },
  headerBoxLabel: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#64748b',
    whiteSpace: 'nowrap' as const,
  },
  headerSelect: {
    padding: '6px 10px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
  },
  headerSelectSmall: {
    padding: '6px 10px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
    width: '70px',
  },
  lockedBadge: {
    fontSize: '11px',
    color: '#fff',
    backgroundColor: '#ef4444',
    padding: '2px 8px',
    borderRadius: '4px',
    fontWeight: '600',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#2c3e50',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#7f8c8d',
    marginTop: '5px',
  },
  layout: {
    display: 'flex',
    gap: '20px',
  },
  sidebar: {
    width: '250px',
    flexShrink: 0,
    backgroundColor: '#f8f9fa',
    borderRadius: '10px',
    padding: '15px',
  },
  storeSettingsBox: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '20px',
    border: '1px solid #e2e8f0',
  },
  storeSettingsTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#64748b',
    margin: '0 0 10px 0',
    textTransform: 'uppercase' as const,
  },
  payDayRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  payDayLabel: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#374151',
    whiteSpace: 'nowrap' as const,
  },
  payDayInputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
  },
  payDaySelect: {
    flex: 1,
    padding: '6px 8px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
  },
  payDayHint: {
    fontSize: '11px',
    color: '#94a3b8',
    marginTop: '8px',
    marginBottom: 0,
    lineHeight: '1.4',
  },
  yearMonthRow: {
    display: 'flex',
    gap: '8px',
  },
  yearSelect: {
    flex: 1,
    padding: '6px 8px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
  },
  monthSelect: {
    width: '70px',
    padding: '6px 8px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
  },
  lockedHint: {
    fontSize: '11px',
    color: '#ef4444',
    marginTop: '8px',
    marginBottom: 0,
    fontWeight: '500',
  },
  sidebarTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#7f8c8d',
    marginBottom: '15px',
    textTransform: 'uppercase' as const,
  },
  searchInput: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    marginBottom: '10px',
    boxSizing: 'border-box' as const,
  },
  filterSelect: {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    marginBottom: '15px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  castList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '5px',
    maxHeight: 'calc(100vh - 300px)',
    overflowY: 'auto' as const,
  },
  castItem: {
    padding: '10px 12px',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
    textAlign: 'left' as const,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'background-color 0.2s',
  },
  castItemActive: {
    backgroundColor: '#3498db',
    color: 'white',
  },
  castInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  castName: {
    fontWeight: '500',
  },
  castStatus: {
    fontSize: '11px',
    fontWeight: '500',
  },
  noResults: {
    fontSize: '13px',
    color: '#94a3b8',
    textAlign: 'center' as const,
    padding: '15px 0',
  },
  main: {
    flex: '0 1 600px',
    minWidth: '400px',
    backgroundColor: 'white',
    borderRadius: '10px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  mainHeader: {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #ecf0f1',
  },
  mainTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#2c3e50',
    margin: 0,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '80px 20px',
    color: '#7f8c8d',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  emptyText: {
    fontSize: '16px',
    color: '#94a3b8',
  },
  section: {
    marginBottom: '30px',
    padding: '20px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#334155',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  payRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '12px',
  },
  payLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100px',
    cursor: 'pointer',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  payInputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  payInput: {
    width: '100px',
    padding: '8px 10px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
  },
  paySelect: {
    padding: '8px 10px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  payUnit: {
    fontSize: '14px',
    color: '#64748b',
  },
  payTimes: {
    fontSize: '16px',
    color: '#64748b',
  },
  productBackHint: {
    fontSize: '13px',
    color: '#64748b',
    fontStyle: 'italic',
  },
  compareSection: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px dashed #cbd5e1',
  },
  compareLabel: {
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '12px',
  },
  slidingPreview: {
    padding: '10px',
    backgroundColor: '#eff6ff',
    borderRadius: '6px',
    fontSize: '13px',
  },
  slidingPreviewRow: {
    color: '#3b82f6',
    marginBottom: '4px',
  },
  editBtn: {
    padding: '4px 10px',
    fontSize: '12px',
    border: '1px solid #64748b',
    borderRadius: '4px',
    backgroundColor: 'white',
    color: '#64748b',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  deductionList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  deductionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 12px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
  },
  deductionName: {
    fontWeight: '500',
  },
  deductionAmount: {
    color: '#ef4444',
  },
  noDeductions: {
    color: '#94a3b8',
    fontSize: '14px',
  },
  saveArea: {
    marginTop: '30px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    width: '500px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    overflowY: 'auto' as const,
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '8px',
  },
  modalHint: {
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '16px',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '20px',
  },
  slidingTable: {
    marginBottom: '12px',
  },
  slidingHeader: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
    fontWeight: '500',
    fontSize: '13px',
    color: '#64748b',
  },
  slidingHeaderCell: {
    flex: 1,
  },
  slidingRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
    alignItems: 'center',
  },
  slidingInput: {
    flex: 1,
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
  },
  addRowBtn: {
    padding: '8px 16px',
    fontSize: '13px',
    border: '1px dashed #94a3b8',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    width: '100%',
  },
  removeBtn: {
    width: '28px',
    height: '28px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#fee2e2',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '16px',
  },
  deductionTable: {
    marginBottom: '12px',
  },
  deductionRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
    alignItems: 'center',
  },
  deductionSelect: {
    width: '100px',
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
  },
  deductionNameInput: {
    flex: 1,
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
  },
  deductionAmountInput: {
    width: '100px',
    padding: '8px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
  },
  variableLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '13px',
    whiteSpace: 'nowrap' as const,
  },
  // シミュレーションパネル
  simulationPanel: {
    width: '300px',
    flexShrink: 0,
    backgroundColor: '#f0f9ff',
    borderRadius: '10px',
    padding: '20px',
    border: '1px solid #bae6fd',
    alignSelf: 'flex-start',
    position: 'sticky' as const,
    top: '20px',
  },
  simulationTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#0369a1',
    marginBottom: '16px',
    margin: '0 0 16px 0',
  },
  simInputSection: {
    marginBottom: '20px',
  },
  simInputRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  simLabel: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#334155',
  },
  simInputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  simInput: {
    width: '100px',
    padding: '6px 8px',
    fontSize: '13px',
    border: '1px solid #94a3b8',
    borderRadius: '4px',
    textAlign: 'right' as const,
  },
  simUnit: {
    fontSize: '12px',
    color: '#64748b',
    width: '30px',
  },
  simResultSection: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid #e2e8f0',
  },
  simResultTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#334155',
    marginBottom: '12px',
    margin: '0 0 12px 0',
  },
  simBreakdown: {
    marginBottom: '12px',
    paddingBottom: '12px',
    borderBottom: '1px solid #e2e8f0',
  },
  simBreakdownRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '6px',
  },
  simBreakdownSubtotal: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    fontWeight: '600',
    color: '#334155',
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px dashed #cbd5e1',
  },
  simComparison: {
    backgroundColor: '#fef3c7',
    borderRadius: '6px',
    padding: '10px',
    marginBottom: '12px',
    fontSize: '12px',
  },
  simCompareRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  simCompareVs: {
    color: '#92400e',
    fontWeight: '600',
  },
  simCompareWinner: {
    color: '#059669',
    fontWeight: '600',
  },
  simCompareResult: {
    textAlign: 'center' as const,
    color: '#92400e',
    fontWeight: '500',
  },
  simDeductionSection: {
    marginBottom: '12px',
  },
  simDeductionText: {
    color: '#ef4444',
  },
  simFinalPay: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#f0fdf4',
    borderRadius: '6px',
    marginTop: '8px',
  },
  simFinalPayAmount: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#059669',
  },
  simEmptyState: {
    padding: '40px 20px',
    textAlign: 'center' as const,
  },
  simEmptyText: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: 0,
  },
  // 伝票詳細パネルWrapper（タブを外に配置）
  receiptPanelWrapper: {
    flex: '1 1 520px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignSelf: 'flex-start',
    position: 'sticky' as const,
    top: '20px',
  },
  // 伝票詳細パネル
  receiptPanel: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: '0 8px 8px 8px',
    padding: '16px',
    border: '1px solid #e2e8f0',
    maxHeight: 'calc(100vh - 200px)',
    overflowY: 'auto' as const,
  },
  receiptPanelTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: '16px',
    margin: '0 0 16px 0',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  salesTabs: {
    display: 'flex',
    gap: '0',
    marginBottom: '-1px', // パネルと繋げる
    paddingLeft: '0',
    position: 'relative' as const,
    zIndex: 1,
  },
  salesTab: {
    padding: '10px 20px',
    fontSize: '13px',
    fontWeight: '500',
    border: '1px solid #e2e8f0',
    borderBottom: '1px solid #e2e8f0',
    borderRadius: '8px 8px 0 0',
    backgroundColor: '#f8fafc',
    color: '#64748b',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    marginRight: '-1px',
    position: 'relative' as const,
  },
  salesTabActive: {
    backgroundColor: 'white',
    color: '#1e293b',
    fontWeight: '600',
    borderBottom: '1px solid white',
    zIndex: 2,
  },
  receiptLoading: {
    padding: '40px 20px',
    textAlign: 'center' as const,
    color: '#94a3b8',
  },
  salesSummary: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    border: '1px solid #e2e8f0',
  },
  salesSummaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '8px',
  },
  salesAmount: {
    fontWeight: '500',
    color: '#334155',
  },
  salesSummaryTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    fontWeight: '600',
    color: '#334155',
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid #e2e8f0',
  },
  salesTotalAmount: {
    color: '#7c3aed',
    fontSize: '16px',
  },
  noSalesData: {
    padding: '20px',
    textAlign: 'center' as const,
    color: '#94a3b8',
    fontSize: '13px',
    backgroundColor: 'white',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  receiptListSection: {
    marginTop: '8px',
  },
  receiptListTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#64748b',
    margin: '0 0 10px 0',
  },
  receiptList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  receiptItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  receiptDate: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#334155',
  },
  receiptType: {
    fontSize: '10px',
    fontWeight: '600',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  receiptItemBody: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  receiptNomination: {
    fontSize: '12px',
    color: '#64748b',
  },
  receiptAmount: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#334155',
  },
  receiptItemProduct: {
    fontSize: '11px',
    color: '#94a3b8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  receiptMoreItems: {
    fontSize: '11px',
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  noReceipts: {
    padding: '20px',
    textAlign: 'center' as const,
    color: '#94a3b8',
    fontSize: '13px',
    margin: 0,
  },
  receiptEmptyState: {
    padding: '40px 20px',
    textAlign: 'center' as const,
  },
  receiptEmptyText: {
    fontSize: '14px',
    color: '#94a3b8',
    margin: 0,
  },
  // サンプル伝票エディター（sales-settings準拠）
  nominationSelectWrapper: {
    marginBottom: '16px',
  },
  nominationLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#64748b',
    marginBottom: '8px',
    display: 'block',
  },
  nominationSelect: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  nominationBtn: {
    minWidth: '36px',
    height: '32px',
    padding: '0 12px',
    borderRadius: '16px',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#e2e8f0',
    backgroundColor: 'white',
    color: '#64748b',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap' as const,
  },
  nominationBtnActive: {
    borderColor: '#ec4899',
    backgroundColor: '#fdf2f8',
    color: '#ec4899',
  },
  nominationBtnNonHelp: {
    borderColor: '#f97316',
    color: '#f97316',
  },
  nominationBtnNonHelpActive: {
    borderColor: '#f97316',
    backgroundColor: '#fff7ed',
    color: '#f97316',
  },
  receiptPreview: {
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    padding: '15px',
    marginBottom: '15px',
  },
  receiptHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '14px',
    fontWeight: '600',
    color: '#475569',
    paddingBottom: '10px',
    borderBottom: '1px dashed #cbd5e1',
    marginBottom: '10px',
  },
  oshiLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#ec4899',
    backgroundColor: '#fdf2f8',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #e2e8f0',
    marginBottom: '10px',
    fontSize: '11px',
    fontWeight: '600',
    color: '#64748b',
    gap: '8px',
  },
  tableHeaderName: {
    flex: 1,
    minWidth: 0,
  },
  tableHeaderCast: {
    width: '80px',
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  tableHeaderPrice: {
    width: '80px',
    textAlign: 'right' as const,
    flexShrink: 0,
    paddingRight: '28px',
  },
  receiptItemsScroll: {
  },
  receiptItem: {
    marginBottom: '12px',
    paddingBottom: '12px',
    borderBottom: '1px solid #e2e8f0',
  },
  receiptItemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  itemNameCol: {
    flex: 1,
    minWidth: 0,
  },
  itemCastCol: {
    width: '80px',
    flexShrink: 0,
    textAlign: 'center' as const,
  },
  itemCastDisplay: {
    fontSize: '12px',
    color: '#64748b',
    fontWeight: '500',
  },
  itemPriceCol: {
    width: '80px',
    flexShrink: 0,
  },
  itemNameInput: {
    width: '100%',
    padding: '4px 6px',
    fontSize: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    backgroundColor: 'white',
    boxSizing: 'border-box' as const,
  },
  productSelect: {
    width: '100%',
    padding: '4px 6px',
    fontSize: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    backgroundColor: 'white',
    boxSizing: 'border-box' as const,
    cursor: 'pointer',
  },
  itemPriceInput: {
    width: '100%',
    padding: '4px 6px',
    fontSize: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    backgroundColor: 'white',
    textAlign: 'right' as const,
    boxSizing: 'border-box' as const,
  },
  removeItemBtn: {
    width: '20px',
    height: '20px',
    padding: 0,
    border: 'none',
    borderRadius: '50%',
    backgroundColor: '#fee2e2',
    color: '#ef4444',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  castSelectRow: {
    display: 'flex',
    gap: '4px',
    marginTop: '4px',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  castSelectLabel: {
    fontSize: '11px',
    color: '#94a3b8',
    marginRight: '4px',
  },
  castSelectBtn: {
    padding: '2px 8px',
    fontSize: '11px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e2e8f0',
    borderRadius: '12px',
    backgroundColor: 'white',
    color: '#64748b',
    cursor: 'pointer',
  },
  castSelectBtnActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
    color: '#3b82f6',
  },
  clearCastBtn: {
    padding: '2px 6px',
    fontSize: '10px',
    border: 'none',
    borderRadius: '12px',
    backgroundColor: '#f1f5f9',
    color: '#94a3b8',
    cursor: 'pointer',
  },
  addItemBtn: {
    width: '100%',
    padding: '8px',
    marginTop: '8px',
    fontSize: '12px',
    border: '1px dashed #cbd5e1',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
  },
  receiptItemDetails: {
    display: 'flex',
    flexDirection: 'column' as const,
    fontSize: '12px',
    color: '#64748b',
    marginTop: '6px',
  },
  skipTag: {
    fontSize: '10px',
    color: '#94a3b8',
    backgroundColor: '#f1f5f9',
    padding: '2px 6px',
    borderRadius: '4px',
    display: 'inline-block',
  },
  castBreakdownContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    width: '100%',
  },
  castBreakdownRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '3px 0',
    borderBottom: '1px dotted #e2e8f0',
  },
  castBreakdownName: {
    fontSize: '11px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  castBreakdownType: {
    fontSize: '10px',
    fontWeight: '400',
    color: '#94a3b8',
  },
  castBreakdownSales: {
    fontWeight: '500',
    fontSize: '11px',
  },
  receiptTotal: {
    paddingTop: '10px',
    borderTop: '2px solid #cbd5e1',
  },
  subtotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: '13px',
    color: '#64748b',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: '15px',
    fontWeight: '700',
    color: '#1e293b',
    borderTop: '1px solid #e2e8f0',
    marginTop: '4px',
  },
  receiptTotalSection: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px',
    border: '1px solid #e2e8f0',
  },
  receiptTotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#64748b',
    marginBottom: '6px',
  },
  salesSummaryHeader: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#7c3aed',
    marginBottom: '10px',
    paddingBottom: '8px',
    borderBottom: '1px solid #e9d5ff',
  },
}
