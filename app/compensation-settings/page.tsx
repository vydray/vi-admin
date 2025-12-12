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
  CompensationType,
  PaymentSelectionMethod,
  SalesAggregationMethod,
  HelpBackCalculationMethod,
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
  // 支給方法設定（新構造）
  paymentSelectionMethod: PaymentSelectionMethod  // 'highest' | 'specific'
  selectedCompensationTypeId: string | null       // specific時に使用する報酬形態ID
  compensationTypes: CompensationType[]           // 報酬形態の配列

  // 控除（共通設定）
  deductionItems: DeductionItem[] | null

  // その他
  validFrom: string
  validTo: string | null
  isActive: boolean

  // === 以下レガシー（後方互換用、新UIでは非表示） ===
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

  // 商品別バック
  useProductBack: boolean
  useHelpProductBack: boolean
  helpBackCalculationMethod: HelpBackCalculationMethod
}

// デフォルトの報酬形態を生成
const createDefaultCompensationType = (index: number): CompensationType => ({
  id: crypto.randomUUID(),
  name: `報酬形態${index + 1}`,
  order_index: index,
  is_enabled: true,
  sales_aggregation: index === 0 ? 'item_based' : 'receipt_based',
  hourly_rate: 0,
  commission_rate: 50,
  fixed_amount: 0,
  use_sliding_rate: false,
  sliding_rates: null,
  use_product_back: false,
  use_help_product_back: false,
  help_back_calculation_method: 'sales_based',
})

// デフォルトの設定
const getDefaultSettingsState = (): SettingsState => ({
  // 新構造
  paymentSelectionMethod: 'highest',
  selectedCompensationTypeId: null,
  compensationTypes: [createDefaultCompensationType(0)],

  // 共通設定
  deductionItems: null,
  validFrom: new Date().toISOString().split('T')[0],
  validTo: null,
  isActive: true,

  // レガシー（後方互換用）
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

  useProductBack: false,
  useHelpProductBack: false,
  helpBackCalculationMethod: 'sales_based',
})

// レガシーデータから報酬形態を生成
const legacyToCompensationTypes = (data: CompensationSettings): CompensationType[] => {
  const types: CompensationType[] = []

  // 報酬形態1（メイン）
  const type1: CompensationType = {
    id: crypto.randomUUID(),
    name: '報酬形態1',
    order_index: 0,
    is_enabled: true,
    sales_aggregation: data.sales_target === 'receipt_total' ? 'receipt_based' : 'item_based',
    hourly_rate: data.hourly_rate ?? 0,
    commission_rate: data.commission_rate ?? 50,
    fixed_amount: data.fixed_amount ?? 0,
    use_sliding_rate: (data.sliding_rates?.length ?? 0) > 0,
    sliding_rates: data.sliding_rates,
    use_product_back: data.use_product_back ?? false,
    use_help_product_back: data.use_help_product_back ?? false,
    help_back_calculation_method: data.help_back_calculation_method || 'sales_based',
  }
  types.push(type1)

  // 報酬形態2（比較用がある場合）
  if (data.use_sliding_comparison) {
    const type2: CompensationType = {
      id: crypto.randomUUID(),
      name: '報酬形態2',
      order_index: 1,
      is_enabled: true,
      sales_aggregation: data.compare_sales_target === 'receipt_total' ? 'receipt_based' : 'item_based',
      hourly_rate: data.compare_hourly_rate ?? 0,
      commission_rate: data.compare_commission_rate ?? 50,
      fixed_amount: data.compare_fixed_amount ?? 0,
      use_sliding_rate: false,
      sliding_rates: null,
      use_product_back: data.compare_use_product_back ?? false,
      use_help_product_back: false,
      help_back_calculation_method: 'sales_based',
    }
    types.push(type2)
  }

  return types
}

// DBデータをUI状態に変換
const dbToState = (data: CompensationSettings): SettingsState => {
  const payType = data.pay_type || 'commission'

  // 新構造のデータがあれば使用、なければレガシーから変換
  const compensationTypes = data.compensation_types && data.compensation_types.length > 0
    ? data.compensation_types
    : legacyToCompensationTypes(data)

  return {
    // 新構造
    paymentSelectionMethod: data.payment_selection_method || 'highest',
    selectedCompensationTypeId: data.selected_compensation_type_id || null,
    compensationTypes,

    // 共通設定
    deductionItems: data.deduction_items,
    validFrom: data.valid_from,
    validTo: data.valid_to,
    isActive: data.is_active,

    // レガシー（後方互換用）
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

    useProductBack: data.use_product_back ?? false,
    useHelpProductBack: data.use_help_product_back ?? false,
    helpBackCalculationMethod: data.help_back_calculation_method || 'sales_based',
  }
}

// UI状態をDBデータに変換
const stateToDb = (state: SettingsState, castId: number, storeId: number, existingId?: number): Partial<CompensationSettings> => {
  // pay_typeを決定（レガシー互換）
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

    // 新構造
    payment_selection_method: state.paymentSelectionMethod,
    selected_compensation_type_id: state.selectedCompensationTypeId,
    compensation_types: state.compensationTypes,

    // レガシー（後方互換用）
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
    use_help_product_back: state.useHelpProductBack,
    help_back_calculation_method: state.helpBackCalculationMethod,
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

  // 報酬形態タブ
  const [activeCompensationTypeId, setActiveCompensationTypeId] = useState<string | null>(null)

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
    item_help_ratio: 50,
    item_nomination_distribute_all: false,
    receipt_exclude_consumption_tax: true,
    receipt_exclude_service_charge: false,
    receipt_rounding_method: 'floor_100',
    receipt_rounding_position: 100,
    receipt_rounding_timing: 'per_item',
    receipt_help_distribution_method: 'all_to_nomination',
    receipt_multi_cast_distribution: 'nomination_only',
    receipt_help_sales_inclusion: 'both',
    receipt_help_ratio: 50,
  })

  // シミュレーション
  const [simWorkHours, setSimWorkHours] = useState<number>(8)
  const [simDeductions, setSimDeductions] = useState<number>(0)
  const [simSelectedTypeId, setSimSelectedTypeId] = useState<string | null>(null)

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
            basePrice: Number(item.base_price) || 0,
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
          item_help_ratio: data.item_help_ratio ?? 50,
          item_nomination_distribute_all: data.item_nomination_distribute_all ?? false,
          receipt_exclude_consumption_tax: data.receipt_exclude_consumption_tax ?? true,
          receipt_exclude_service_charge: data.receipt_exclude_service_charge ?? false,
          receipt_rounding_method: data.receipt_rounding_method ?? 'floor_100',
          receipt_rounding_position: data.receipt_rounding_position ?? 100,
          receipt_rounding_timing: data.receipt_rounding_timing ?? 'per_item',
          receipt_help_distribution_method: data.receipt_help_distribution_method ?? 'all_to_nomination',
          receipt_multi_cast_distribution: data.receipt_multi_cast_distribution ?? 'nomination_only',
          receipt_help_sales_inclusion: data.receipt_help_sales_inclusion ?? 'both',
          receipt_help_ratio: data.receipt_help_ratio ?? 50,
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

  // settingsStateが変わったら最初の報酬形態をアクティブに
  useEffect(() => {
    if (settingsState?.compensationTypes && settingsState.compensationTypes.length > 0) {
      if (!activeCompensationTypeId || !settingsState.compensationTypes.find(t => t.id === activeCompensationTypeId)) {
        setActiveCompensationTypeId(settingsState.compensationTypes[0].id)
      }
    }
  }, [settingsState?.compensationTypes, activeCompensationTypeId])

  // シミュレーションタブのデフォルト設定
  useEffect(() => {
    if (settingsState?.compensationTypes && settingsState.compensationTypes.length > 0) {
      if (!simSelectedTypeId || !settingsState.compensationTypes.find(t => t.id === simSelectedTypeId)) {
        setSimSelectedTypeId(settingsState.compensationTypes[0].id)
      }
    }
  }, [settingsState?.compensationTypes, simSelectedTypeId])

  // アクティブな報酬形態を取得
  const activeCompensationType = useMemo(() => {
    if (!settingsState?.compensationTypes || !activeCompensationTypeId) return null
    return settingsState.compensationTypes.find(t => t.id === activeCompensationTypeId) || null
  }, [settingsState?.compensationTypes, activeCompensationTypeId])

  // 報酬形態を更新するヘルパー関数
  const updateCompensationType = useCallback((typeId: string, updates: Partial<CompensationType>) => {
    setSettingsState(prev => {
      if (!prev) return null
      return {
        ...prev,
        compensationTypes: prev.compensationTypes.map(t =>
          t.id === typeId ? { ...t, ...updates } : t
        ),
      }
    })
  }, [])

  // 報酬形態を追加
  const addCompensationType = useCallback(() => {
    setSettingsState(prev => {
      if (!prev) return null
      const newIndex = prev.compensationTypes.length
      const newType = createDefaultCompensationType(newIndex)
      setActiveCompensationTypeId(newType.id)
      return {
        ...prev,
        compensationTypes: [...prev.compensationTypes, newType],
      }
    })
  }, [])

  // 報酬形態を削除
  const deleteCompensationType = useCallback((typeId: string) => {
    setSettingsState(prev => {
      if (!prev || prev.compensationTypes.length <= 1) return prev
      const newTypes = prev.compensationTypes.filter(t => t.id !== typeId)
      // 削除したタブがアクティブだった場合、最初のタブをアクティブに
      if (activeCompensationTypeId === typeId) {
        setActiveCompensationTypeId(newTypes[0]?.id || null)
      }
      return {
        ...prev,
        compensationTypes: newTypes,
      }
    })
  }, [activeCompensationTypeId])

  // 報酬形態ごとの報酬計算（sales_aggregationに基づいて計算）
  const calculateCompensationForType = useCallback((
    type: CompensationType,
    workHours: number,
    previewDataByMode: { item_based: ReturnType<typeof computePreviewData>; receipt_based: ReturnType<typeof computePreviewData> },
    targetCastName: string | null
  ) => {
    // 各報酬形態のsales_aggregationに基づいてデータを選択
    const data = type.sales_aggregation === 'item_based'
      ? previewDataByMode.item_based
      : previewDataByMode.receipt_based

    const hourly = type.hourly_rate * workHours
    const fixed = type.fixed_amount

    // 選択キャストの売上を計算（castBreakdownから直接取得）
    let targetCastSales = 0
    if (targetCastName) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.items.forEach((item: any) => {
        if (item.notIncluded) return
        item.castBreakdown.forEach((cb: { cast: string; sales: number; isSelf: boolean }) => {
          if (cb.cast === targetCastName && cb.isSelf) {
            targetCastSales += cb.sales
          }
        })
      })
    } else {
      targetCastSales = data.selfSales
    }

    // 売上バック計算（スライド率 or 固定率）
    let salesBack = 0
    if (type.commission_rate > 0 || type.use_sliding_rate) {
      const salesAmount = targetCastSales
      if (type.use_sliding_rate && type.sliding_rates && type.sliding_rates.length > 0) {
        // スライド率テーブルから該当するレートを取得
        const applicableRate = type.sliding_rates.find(r =>
          salesAmount >= r.min && (r.max === 0 || salesAmount < r.max)
        )
        if (applicableRate) {
          salesBack = Math.floor(salesAmount * applicableRate.rate / 100)
        }
      } else if (type.commission_rate > 0) {
        salesBack = Math.floor(salesAmount * type.commission_rate / 100)
      }
    }

    // 商品バック（推し小計モードの場合のみ商品別バックを計算）
    let selfProductBack = 0
    let helpProductBack = 0
    const itemsWithSelfBack: { name: string; back: number }[] = []
    const itemsWithHelpBack: { name: string; back: number }[] = []

    if (type.use_product_back && type.sales_aggregation === 'item_based') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data.items.forEach((item: any) => {
        if (item.notIncluded) return
        // 選択キャストのバックのみ計算
        const selfBack = item.castBreakdown
          .filter((cb: { isSelf: boolean; cast: string }) => cb.isSelf && (!targetCastName || cb.cast === targetCastName))
          .reduce((s: number, cb: { backAmount?: number }) => s + (cb.backAmount || 0), 0)
        if (selfBack > 0) {
          itemsWithSelfBack.push({ name: item.name, back: selfBack })
          selfProductBack += selfBack
        }
      })

      if (type.use_help_product_back) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.items.forEach((item: any) => {
          if (item.notIncluded) return
          // 選択キャストがヘルプとして参加している商品のバック
          const helpBack = item.castBreakdown
            .filter((cb: { isSelf: boolean; cast: string }) => !cb.isSelf && (!targetCastName || cb.cast === targetCastName))
            .reduce((s: number, cb: { backAmount?: number }) => s + (cb.backAmount || 0), 0)
          if (helpBack > 0) {
            itemsWithHelpBack.push({ name: item.name, back: helpBack })
            helpProductBack += helpBack
          }
        })
      }
    }

    const total = hourly + fixed + salesBack + selfProductBack + helpProductBack

    return {
      hourly,
      fixed,
      salesBack,
      selfProductBack,
      helpProductBack,
      itemsWithSelfBack,
      itemsWithHelpBack,
      total,
      salesAmount: targetCastSales,
      mode: type.sales_aggregation
    }
  }, [])

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

  // キャスト切り替え時に推しをリセット
  useEffect(() => {
    if (selectedCast) {
      setSampleNominations([selectedCast.name])
    }
  }, [selectedCast])

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


  // プレビューデータを計算する関数（両モードで再利用）
  const computePreviewData = useCallback((mode: 'item_based' | 'receipt_based') => {
    const isItemBased = mode === 'item_based'
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
          return { ...item, castBreakdown: [] as { cast: string; sales: number; calculatedShare: number; isSelf: boolean }[], notIncluded: true }
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

        const castBreakdown: { cast: string; sales: number; calculatedShare: number; isSelf: boolean; backAmount?: number }[] = []

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
                castBreakdown.push({ cast: c, sales: perPersonAmountAll, calculatedShare: perPersonAmountAll, isSelf: true })
              })
              nominationsNotOnItem.forEach(nom => {
                castBreakdown.push({ cast: nom, sales: perPersonAmountAll, calculatedShare: perPersonAmountAll, isSelf: true })
              })
              helpCastsOnItem.forEach(c => {
                castBreakdown.push({ cast: c, sales: giveHelpSales ? perPersonAmountAll : 0, calculatedShare: perPersonAmountAll, isSelf: false })
              })
            } else if (realCastsOnItem.length > 0) {
              // 商品上のキャストのみで計算
              const perPersonAmount = Math.floor(roundedBase / realCastsOnItem.length)
              // 推し→ヘルプの順番で追加
              nominationCastsOnItem.forEach(c => {
                castBreakdown.push({ cast: c, sales: perPersonAmount, calculatedShare: perPersonAmount, isSelf: true })
              })
              helpCastsOnItem.forEach(c => {
                castBreakdown.push({ cast: c, sales: giveHelpSales ? perPersonAmount : 0, calculatedShare: perPersonAmount, isSelf: false })
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
                castBreakdown.push({ cast: nom, sales: perNominationAmount, calculatedShare: perNominationAmount, isSelf: true })
              })
            } else if (nominationCastsOnItem.length > 0) {
              // 商品についている推しのみに分配
              const perNominationAmount = Math.floor(nominationShare / nominationCastsOnItem.length)
              nominationCastsOnItem.forEach(c => {
                castBreakdown.push({ cast: c, sales: perNominationAmount, calculatedShare: perNominationAmount, isSelf: true })
              })
            }
            // ヘルプへの分配
            if (helpCastsOnItem.length > 0) {
              const actualPerHelpAmount = Math.floor(helpShare / helpCastsOnItem.length)
              helpCastsOnItem.forEach(c => {
                castBreakdown.push({ cast: c, sales: giveHelpSales ? actualPerHelpAmount : 0, calculatedShare: actualPerHelpAmount, isSelf: false })
              })
            }
          }
        } else {
          // 推しのみ: 推しの分だけ計上（ヘルプは売上0、分配計算もなし）
          const shouldIncludeAllNominations = nominationDistributeAll || nominationCastsOnItem.length === 0

          if (shouldIncludeAllNominations && !nominationIsNonHelpOnly && realNominations.length > 0) {
            // 全推しに分配（設定ON または 商品に推しがいない場合）
            const perNominationAmount = Math.floor(roundedBase / realNominations.length)
            realNominations.forEach(nom => {
              castBreakdown.push({ cast: nom, sales: perNominationAmount, calculatedShare: perNominationAmount, isSelf: true })
            })
          } else if (nominationCastsOnItem.length > 0) {
            // 商品についている推しのみに分配
            const perNominationAmount = Math.floor(roundedBase / nominationCastsOnItem.length)
            nominationCastsOnItem.forEach(c => {
              castBreakdown.push({ cast: c, sales: perNominationAmount, calculatedShare: perNominationAmount, isSelf: true })
            })
          }
          // ヘルプは売上0（推しのみモードなので分配計算もなし）
          helpCastsOnItem.forEach(c => {
            castBreakdown.push({ cast: c, sales: 0, calculatedShare: 0, isSelf: false })
          })
        }

        // 商品バックの計算（商品バックが有効な場合）
        const showProductBack = settingsState?.useProductBack || settingsState?.compareUseProductBack
        const showHelpProductBack = settingsState?.useHelpProductBack
        const helpBackMethod = settingsState?.helpBackCalculationMethod || 'sales_based'
        const castBreakdownWithBack = castBreakdown.map(cb => {
          // ヘルプの場合、ヘルプバックが無効ならバックなし
          if (!cb.isSelf && !showHelpProductBack) {
            return cb  // backAmountを追加しない
          }
          // ヘルプでfull_amountの場合は、分配計算額0でも商品価格でバック計算
          const isHelpFullAmount = !cb.isSelf && helpBackMethod === 'full_amount'
          if (!showProductBack || (cb.calculatedShare === 0 && !isHelpFullAmount)) {
            return cb  // backAmountを追加しない
          }
          // キャスト名からキャストIDを取得
          const castInfo = casts.find(c => c.name === cb.cast)
          if (!castInfo) {
            return cb  // backAmountを追加しない
          }
          // バック率を取得
          const backRateInfo = getBackRate(backRates, castInfo.id, item.category, item.name, cb.isSelf)
          if (!backRateInfo) {
            return cb  // backAmountを追加しない
          }
          // バック金額を計算（full_amountは商品価格、sales_basedは分配計算額を使用）
          const baseForBack = isHelpFullAmount ? roundedBase : cb.calculatedShare
          const backAmount = backRateInfo.type === 'fixed'
            ? backRateInfo.fixedAmount
            : Math.floor(baseForBack * backRateInfo.rate / 100)
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
        item.castBreakdown.forEach((cb: { cast: string; sales: number; calculatedShare: number; isSelf: boolean; backAmount?: number }) => {
          if (cb.isSelf) selfSales += cb.sales
          else helpSales += cb.sales
          if (cb.backAmount) totalProductBack += cb.backAmount
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

      const castBreakdown: { cast: string; sales: number; calculatedShare: number; isSelf: boolean; backAmount?: number }[] = []

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
          castBreakdown.push({ cast: c, isSelf: true, sales: 0, calculatedShare: 0 })
        })
        helpCasts.forEach(c => {
          castBreakdown.push({ cast: c, isSelf: false, sales: 0, calculatedShare: 0 })
        })

        // 伝票小計では常に選択された推し全員に分配する
        // 商品についていない実推しも追加（nominationIsNonHelpOnlyの場合は追加しない）
        if (!nominationIsNonHelpOnly) {
          const nominationsNotInBreakdown = realNominations.filter(
            nom => !castBreakdown.some(cb => cb.cast === nom)
          )
          nominationsNotInBreakdown.forEach(nom => {
            castBreakdown.push({ cast: nom, isSelf: true, sales: 0, calculatedShare: 0 })
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
                const amount = nomIdx === distributeTargets.length - 1
                  ? itemAmount - perNomAmount * (distributeTargets.length - 1)
                  : perNomAmount
                cb.sales = amount
                cb.calculatedShare = amount
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
                  const amount = nomIdx === distributeTargets.length - 1
                    ? itemAmount - perNomAmount * (distributeTargets.length - 1)
                    : perNomAmount
                  cb.sales = amount
                  cb.calculatedShare = amount
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
                  const amount = nomIdx === distributeTargets.length - 1
                    ? selfShare - perNomAmount * (distributeTargets.length - 1)
                    : perNomAmount
                  cb.sales = amount
                  cb.calculatedShare = amount
                  nomIdx++
                }
              })
            }
            // ヘルプのcalculatedShareは常に設定（売上計上はgiveHelpSalesによる）
            if (helpCount > 0) {
              const perHelpAmount = Math.floor(helpShare / helpCount)
              castBreakdown.forEach(cb => {
                if (!cb.isSelf) {
                  cb.calculatedShare = perHelpAmount
                  if (giveHelpSales) cb.sales = perHelpAmount
                }
              })
            }
          } else if (helpDistMethod === 'equal_per_person') {
            // 全員で均等割（分配先全員 + ヘルプ）
            const totalPeople = distributeTargets.length + helpCount
            const perPerson = Math.floor(itemAmount / totalPeople)

            let idx = 0
            castBreakdown.forEach(cb => {
              if (cb.isSelf || giveHelpSales) {
                const amount = idx === totalPeople - 1
                  ? itemAmount - perPerson * (totalPeople - 1)
                  : perPerson
                cb.sales = amount
                cb.calculatedShare = amount
                idx++
              } else {
                // ヘルプに売上計上しない場合でもcalculatedShareは設定
                cb.calculatedShare = perPerson
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
                  const amount = nomIdx === distributeTargets.length - 1
                    ? selfShare - perNomAmount * (distributeTargets.length - 1)
                    : perNomAmount
                  cb.sales = amount
                  cb.calculatedShare = amount
                  nomIdx++
                }
              })
            }
            // ヘルプのcalculatedShareは常に設定（売上計上はgiveHelpSalesによる）
            if (helpCount > 0) {
              const perHelpAmount = Math.floor(helpShare / helpCount)
              castBreakdown.forEach(cb => {
                if (!cb.isSelf) {
                  cb.calculatedShare = perHelpAmount
                  if (giveHelpSales) cb.sales = perHelpAmount
                }
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
            castBreakdown.push({ cast: nom, isSelf: true, sales, calculatedShare: sales })
          })
        }
        // フリー推しでキャスト名なしの場合はcastBreakdownは空（誰にも計上しない）
      }

      // 商品バックの計算（商品バックが有効な場合）
      const showProductBack = settingsState?.useProductBack || settingsState?.compareUseProductBack
      const showHelpProductBack = settingsState?.useHelpProductBack
      const helpBackMethod = settingsState?.helpBackCalculationMethod || 'sales_based'
      const castBreakdownWithBack = castBreakdown.map(cb => {
        // ヘルプの場合、ヘルプバックが無効ならバックなし
        if (!cb.isSelf && !showHelpProductBack) {
          return { ...cb, backAmount: 0 }
        }
        // ヘルプでfull_amountの場合は、分配計算額0でも商品価格でバック計算
        const isHelpFullAmount = !cb.isSelf && helpBackMethod === 'full_amount'
        if (!showProductBack || (cb.calculatedShare === 0 && !isHelpFullAmount)) {
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
        // バック金額を計算（full_amountは商品価格、sales_basedは分配計算額を使用）
        const baseForBack = isHelpFullAmount ? itemAmount : cb.calculatedShare
        const backAmount = backRateInfo.type === 'fixed'
          ? backRateInfo.fixedAmount
          : Math.floor(baseForBack * backRateInfo.rate / 100)
        return { ...cb, backAmount }
      })

      return { ...item, castBreakdown: castBreakdownWithBack, notIncluded: false }
    })

    // 売上集計
    let selfSales = 0
    let helpSales = 0
    let totalProductBack = 0
    items.forEach(item => {
      item.castBreakdown.forEach((cb: { cast: string; sales: number; calculatedShare: number; isSelf: boolean; backAmount?: number }) => {
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
  }, [sampleItems, sampleNominations, nonHelpStaffNames, salesSettings, systemSettings, settingsState, casts, backRates])

  // 表示用のプレビューデータ（salesViewModeに基づく）
  const previewData = useMemo(() => {
    return computePreviewData(salesViewMode)
  }, [computePreviewData, salesViewMode])

  // 給料明細用のデータ（salesTargetに基づいて計算）
  const salaryData = useMemo(() => {
    if (!settingsState) return null

    // salesTargetに基づいてモードを決定
    const mode = settingsState.salesTarget === 'cast_sales' ? 'item_based' : 'receipt_based'
    const data = computePreviewData(mode)

    // カテゴリ別売上を計算
    const salesByCategory: { [key: string]: { self: number; help: number; back: number } } = {}
    data.items.forEach((item: { category: string; notIncluded?: boolean; castBreakdown: { isSelf: boolean; sales: number; calculatedShare: number; backAmount?: number }[] }) => {
      if (item.notIncluded) return
      const cat = item.category || 'その他'
      if (!salesByCategory[cat]) {
        salesByCategory[cat] = { self: 0, help: 0, back: 0 }
      }
      item.castBreakdown.forEach(cb => {
        if (cb.isSelf) salesByCategory[cat].self += cb.sales
        else salesByCategory[cat].help += cb.sales
        salesByCategory[cat].back += cb.backAmount || 0
      })
    })

    // 商品ごとの推しバック金額を集計（推し小計用、SELF分のみ）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemsWithSelfBack = data.items
      .filter((item: any) => !item.notIncluded)
      .map((item: any) => {
        const selfBack = item.castBreakdown
          .filter((cb: any) => cb.isSelf)
          .reduce((sum: number, cb: any) => sum + (cb.backAmount || 0), 0)
        return { name: item.name as string, back: selfBack as number }
      })
      .filter((item: { name: string; back: number }) => item.back > 0)

    // 推しバック合計（SELF分のみ）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selfProductBack = data.items.reduce((sum: number, item: any) => {
      if (item.notIncluded) return sum
      return sum + item.castBreakdown
        .filter((cb: any) => cb.isSelf)
        .reduce((s: number, cb: any) => s + (cb.backAmount || 0), 0)
    }, 0)

    // 商品ごとのヘルプバック金額を集計（HELP分のみ）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemsWithHelpBack = data.items
      .filter((item: any) => !item.notIncluded)
      .map((item: any) => {
        const helpBack = item.castBreakdown
          .filter((cb: any) => !cb.isSelf)
          .reduce((sum: number, cb: any) => sum + (cb.backAmount || 0), 0)
        return { name: item.name as string, back: helpBack as number }
      })
      .filter((item: { name: string; back: number }) => item.back > 0)

    // ヘルプバック合計（HELP分のみ）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const helpProductBack = data.items.reduce((sum: number, item: any) => {
      if (item.notIncluded) return sum
      return sum + item.castBreakdown
        .filter((cb: any) => !cb.isSelf)
        .reduce((s: number, cb: any) => s + (cb.backAmount || 0), 0)
    }, 0)

    return {
      selfSales: data.selfSales,
      helpSales: data.helpSales,
      totalSales: data.totalSales,
      totalProductBack: data.totalProductBack,
      selfProductBack,
      helpProductBack,
      salesByCategory,
      itemsWithSelfBack,
      itemsWithHelpBack,
      mode: mode === 'item_based' ? '推し小計' : '伝票小計',
      isItemBased: mode === 'item_based',
    }
  }, [computePreviewData, settingsState])

  // 全報酬形態の計算結果
  const compensationResults = useMemo(() => {
    if (!settingsState?.compensationTypes) return []

    // 両モードのプレビューデータを事前計算
    const previewDataByMode = {
      item_based: computePreviewData('item_based'),
      receipt_based: computePreviewData('receipt_based'),
    }

    // 選択キャスト名を取得
    const targetCastName = selectedCast?.name || null

    return settingsState.compensationTypes
      .filter(type => type.is_enabled)
      .map(type => ({
        type,
        ...calculateCompensationForType(type, simWorkHours, previewDataByMode, targetCastName)
      }))
  }, [settingsState?.compensationTypes, computePreviewData, simWorkHours, calculateCompensationForType, selectedCast])

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
    const currentRates = activeCompensationType?.sliding_rates || [
      { min: 0, max: 100000, rate: 40 },
      { min: 100000, max: 200000, rate: 45 },
      { min: 200000, max: 300000, rate: 50 },
      { min: 300000, max: 0, rate: 55 },
    ]
    setEditingSlidingRates(currentRates)
    setShowSlidingModal(true)
  }

  // スライド率を保存
  const saveSlidingRates = () => {
    if (activeCompensationType) {
      updateCompensationType(activeCompensationType.id, {
        sliding_rates: editingSlidingRates
      })
    }
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

              {/* 支給方法選択 */}
              <div style={styles.paymentMethodSection}>
                <div style={styles.paymentMethodRow}>
                  <span style={styles.paymentMethodLabel}>支給方法:</span>
                  <select
                    value={settingsState.paymentSelectionMethod === 'specific' && settingsState.selectedCompensationTypeId
                      ? `specific_${settingsState.selectedCompensationTypeId}`
                      : settingsState.paymentSelectionMethod}
                    onChange={(e) => {
                      const value = e.target.value
                      if (value === 'highest') {
                        setSettingsState(prev => prev ? { ...prev, paymentSelectionMethod: 'highest', selectedCompensationTypeId: null } : null)
                      } else if (value.startsWith('specific_')) {
                        const typeId = value.replace('specific_', '')
                        setSettingsState(prev => prev ? { ...prev, paymentSelectionMethod: 'specific', selectedCompensationTypeId: typeId } : null)
                      }
                    }}
                    style={styles.paymentMethodSelect}
                  >
                    <option value="highest">高い方を支給</option>
                    {settingsState.compensationTypes.map(type => (
                      <option key={type.id} value={`specific_${type.id}`}>
                        {type.name}を使用
                      </option>
                    ))}
                  </select>
                  <HelpTooltip
                    text="複数の報酬形態がある場合の支給方法を選択します。「高い方を支給」は全ての報酬形態を計算し、最も高い金額を支給します。"
                    width={280}
                  />
                </div>
              </div>

              {/* 報酬形態タブ */}
              <div style={styles.compensationTypeTabs}>
                {settingsState.compensationTypes.map(type => (
                  <button
                    key={type.id}
                    onClick={() => setActiveCompensationTypeId(type.id)}
                    style={{
                      ...styles.compensationTypeTab,
                      ...(activeCompensationTypeId === type.id ? styles.compensationTypeTabActive : {}),
                    }}
                  >
                    {type.name}
                    {settingsState.compensationTypes.length > 1 && (
                      <span
                        style={styles.deleteCompensationTypeBtn}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`${type.name}を削除しますか？`)) {
                            deleteCompensationType(type.id)
                          }
                        }}
                      >
                        ✕
                      </span>
                    )}
                  </button>
                ))}
                <button
                  onClick={addCompensationType}
                  style={styles.addCompensationTypeBtn}
                >
                  + 追加
                </button>
              </div>

              {/* アクティブな報酬形態の設定 */}
              {activeCompensationType && (
                <>
                  {/* 売上集計方法 */}
                  <div style={styles.section}>
                    <h3 style={styles.sectionTitle}>
                      売上集計方法
                      <HelpTooltip
                        text="売上の集計方法を選択します。この設定は売上バックや商品バックの計算に使用されます。"
                        width={280}
                      />
                    </h3>
                    <div style={styles.salesMethodToggle}>
                      <button
                        onClick={() => updateCompensationType(activeCompensationType.id, { sales_aggregation: 'item_based' })}
                        style={{
                          ...styles.salesMethodBtn,
                          ...(activeCompensationType.sales_aggregation === 'item_based' ? styles.salesMethodBtnActive : {}),
                        }}
                      >
                        推し小計
                      </button>
                      <button
                        onClick={() => updateCompensationType(activeCompensationType.id, { sales_aggregation: 'receipt_based' })}
                        style={{
                          ...styles.salesMethodBtn,
                          ...(activeCompensationType.sales_aggregation === 'receipt_based' ? styles.salesMethodBtnActive : {}),
                        }}
                      >
                        伝票小計
                      </button>
                    </div>
                    <p style={styles.salesMethodHint}>
                      {activeCompensationType.sales_aggregation === 'item_based'
                        ? '推しの商品ごとに売上を集計します'
                        : '伝票全体から推しの売上を集計します'}
                    </p>
                  </div>

                  {/* 報酬設定 */}
                  <div style={styles.section}>
                    <h3 style={styles.sectionTitle}>
                      報酬設定
                      <HelpTooltip
                        text="この報酬形態の報酬計算方法を設定します。"
                        width={280}
                      />
                    </h3>

                    {/* 時給 */}
                    <div style={styles.payRow}>
                      <label style={styles.payLabel}>
                        <input
                          type="checkbox"
                          checked={activeCompensationType.hourly_rate > 0}
                          onChange={(e) => updateCompensationType(activeCompensationType.id, {
                            hourly_rate: e.target.checked ? 1500 : 0
                          })}
                          style={styles.checkbox}
                        />
                        <span>時給</span>
                      </label>
                      <div style={styles.payInputGroup}>
                        <input
                          type="number"
                          value={activeCompensationType.hourly_rate}
                          onChange={(e) => updateCompensationType(activeCompensationType.id, {
                            hourly_rate: Number(e.target.value)
                          })}
                          style={styles.payInput}
                          disabled={activeCompensationType.hourly_rate === 0}
                        />
                        <span style={styles.payUnit}>円/時</span>
                      </div>
                    </div>

                    {/* 固定額 */}
                    <div style={styles.payRow}>
                      <label style={styles.payLabel}>
                        <input
                          type="checkbox"
                          checked={activeCompensationType.fixed_amount > 0}
                          onChange={(e) => updateCompensationType(activeCompensationType.id, {
                            fixed_amount: e.target.checked ? 10000 : 0
                          })}
                          style={styles.checkbox}
                        />
                        <span>固定額</span>
                      </label>
                      <div style={styles.payInputGroup}>
                        <input
                          type="number"
                          value={activeCompensationType.fixed_amount}
                          onChange={(e) => updateCompensationType(activeCompensationType.id, {
                            fixed_amount: Number(e.target.value)
                          })}
                          style={styles.payInput}
                          disabled={activeCompensationType.fixed_amount === 0}
                        />
                        <span style={styles.payUnit}>円</span>
                      </div>
                    </div>

                    {/* 売上バック率 */}
                    <div style={styles.payRow}>
                      <label style={styles.payLabel}>
                        <input
                          type="checkbox"
                          checked={activeCompensationType.commission_rate > 0 || activeCompensationType.use_sliding_rate}
                          onChange={(e) => {
                            if (!e.target.checked) {
                              updateCompensationType(activeCompensationType.id, {
                                commission_rate: 0,
                                use_sliding_rate: false
                              })
                            } else {
                              updateCompensationType(activeCompensationType.id, {
                                commission_rate: 50
                              })
                            }
                          }}
                          style={styles.checkbox}
                        />
                        <span>売上バック</span>
                      </label>
                      <div style={styles.payInputGroup}>
                        <input
                          type="number"
                          value={activeCompensationType.commission_rate}
                          onChange={(e) => updateCompensationType(activeCompensationType.id, {
                            commission_rate: Number(e.target.value)
                          })}
                          style={{ ...styles.payInput, width: '70px' }}
                          disabled={!activeCompensationType.commission_rate && !activeCompensationType.use_sliding_rate}
                        />
                        <span style={styles.payUnit}>%</span>
                        <button
                          onClick={openSlidingModal}
                          style={{
                            ...styles.editBtn,
                            marginLeft: '8px',
                            backgroundColor: activeCompensationType.use_sliding_rate ? '#3b82f6' : undefined,
                            color: activeCompensationType.use_sliding_rate ? 'white' : undefined,
                          }}
                          disabled={!activeCompensationType.commission_rate && !activeCompensationType.use_sliding_rate}
                        >
                          {activeCompensationType.use_sliding_rate ? 'スライド設定中' : '設定'}
                        </button>
                      </div>
                    </div>
                    {activeCompensationType.use_sliding_rate && activeCompensationType.sliding_rates && activeCompensationType.sliding_rates.length > 0 && (
                      <div style={{ marginLeft: '24px', marginTop: '8px', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '12px', color: '#64748b' }}>
                        {activeCompensationType.sliding_rates.map((rate, idx) => (
                          <span key={idx} style={{ marginRight: '12px' }}>
                            {rate.max > 0
                              ? `${(rate.min / 10000).toFixed(0)}〜${(rate.max / 10000).toFixed(0)}万: ${rate.rate}%`
                              : `${(rate.min / 10000).toFixed(0)}万〜: ${rate.rate}%`
                            }
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 商品別バック */}
                    <div style={styles.payRow}>
                      <label style={styles.payLabel}>
                        <input
                          type="checkbox"
                          checked={activeCompensationType.use_product_back}
                          onChange={(e) => updateCompensationType(activeCompensationType.id, {
                            use_product_back: e.target.checked
                          })}
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

                    {/* ヘルプバック設定 */}
                    {activeCompensationType.use_product_back && (
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={activeCompensationType.use_help_product_back}
                            onChange={(e) => updateCompensationType(activeCompensationType.id, {
                              use_help_product_back: e.target.checked
                            })}
                            style={styles.checkbox}
                          />
                          <span style={{ fontSize: '13px', fontWeight: '500', color: '#334155' }}>ヘルプバックを有効にする</span>
                          <HelpTooltip
                            text="ONにすると、ヘルプでついた卓の商品にもバックが付きます。OFFの場合は推しの商品にのみバックが付きます。"
                            width={280}
                          />
                        </label>
                        {activeCompensationType.use_help_product_back && (
                          <>
                            <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '8px', color: '#475569' }}>
                              ヘルプバック計算方法
                              <HelpTooltip
                                text="ヘルプでついた商品のバック計算方法を選択します。"
                                width={280}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => updateCompensationType(activeCompensationType.id, {
                                  help_back_calculation_method: 'sales_based'
                                })}
                                style={{
                                  flex: 1,
                                  padding: '8px 12px',
                                  fontSize: '12px',
                                  fontWeight: '500',
                                  borderWidth: '1px',
                                  borderStyle: 'solid',
                                  borderColor: activeCompensationType.help_back_calculation_method === 'sales_based' ? '#10b981' : '#cbd5e1',
                                  borderRadius: '6px',
                                  backgroundColor: activeCompensationType.help_back_calculation_method === 'sales_based' ? '#ecfdf5' : 'white',
                                  color: activeCompensationType.help_back_calculation_method === 'sales_based' ? '#059669' : '#64748b',
                                  cursor: 'pointer',
                                }}
                              >
                                売上設定に従う
                              </button>
                              <button
                                onClick={() => updateCompensationType(activeCompensationType.id, {
                                  help_back_calculation_method: 'full_amount'
                                })}
                                style={{
                                  flex: 1,
                                  padding: '8px 12px',
                                  fontSize: '12px',
                                  fontWeight: '500',
                                  borderWidth: '1px',
                                  borderStyle: 'solid',
                                  borderColor: activeCompensationType.help_back_calculation_method === 'full_amount' ? '#10b981' : '#cbd5e1',
                                  borderRadius: '6px',
                                  backgroundColor: activeCompensationType.help_back_calculation_method === 'full_amount' ? '#ecfdf5' : 'white',
                                  color: activeCompensationType.help_back_calculation_method === 'full_amount' ? '#059669' : '#64748b',
                                  cursor: 'pointer',
                                }}
                              >
                                商品全額
                              </button>
                            </div>
                            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '6px 0 0 0' }}>
                              {activeCompensationType.help_back_calculation_method === 'sales_based'
                                ? '分配後の金額 × ヘルプバック率'
                                : '商品の全額 × ヘルプバック率'}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                </>
              )}

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
                        {item.castBreakdown.map((cb: { cast: string; sales: number; calculatedShare: number; isSelf: boolean; backAmount?: number }, idx) => (
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
                              {cb.backAmount != null && cb.backAmount > 0 && (
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
              {sampleNominations.length > 0 && (
                <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '6px' }}>
                  （{sampleNominations.join(', ')}）
                </span>
              )}
            </div>
            <div style={styles.salesSummaryRow}>
              <span>{sampleNominations.length > 0 ? `${sampleNominations.join(', ')}の売上` : '推し売上'}（税抜）</span>
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

        {/* 給料明細シミュレーション */}
        <div style={styles.simulationPanel}>
          <h3 style={styles.simulationTitle}>給料明細シミュレーション</h3>

          {selectedCast && settingsState && salaryData ? (
            <div style={styles.salarySlip}>
              {/* ヘッダー */}
              <div style={styles.slipHeader}>
                <div style={styles.slipCastName}>{selectedCast.name}</div>
                <div style={styles.slipDate}>{new Date().toLocaleDateString('ja-JP')}</div>
              </div>

              {/* 勤務時間入力 */}
              <div style={styles.slipInputSection}>
                <div style={styles.slipInputRow}>
                  <span style={styles.slipInputLabel}>勤務時間</span>
                  <div style={styles.slipInputGroup}>
                    <input
                      type="number"
                      value={simWorkHours}
                      onChange={(e) => setSimWorkHours(Number(e.target.value))}
                      style={styles.slipInput}
                      min={0}
                      step={0.5}
                    />
                    <span style={styles.slipInputUnit}>時間</span>
                  </div>
                </div>
              </div>

              {/* 報酬形態タブ */}
              {compensationResults.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  {/* フォルダ風タブ */}
                  <div style={{ display: 'flex', gap: '2px', marginBottom: '-1px', position: 'relative', zIndex: 1 }}>
                    {compensationResults.map((result) => {
                      const isActive = simSelectedTypeId === result.type.id
                      return (
                        <button
                          key={result.type.id}
                          onClick={() => setSimSelectedTypeId(result.type.id)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '11px',
                            backgroundColor: isActive ? '#fff' : '#f1f5f9',
                            border: '1px solid #e5e7eb',
                            borderBottom: isActive ? '1px solid #fff' : '1px solid #e5e7eb',
                            borderRadius: '6px 6px 0 0',
                            cursor: 'pointer',
                            color: isActive ? '#3b82f6' : '#64748b',
                            fontWeight: isActive ? '600' : '400',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {result.type.name}
                        </button>
                      )
                    })}
                  </div>

                  {/* 選択中の報酬形態の内訳（枠で囲む） */}
                  {(() => {
                    const selectedResult = compensationResults.find(r => r.type.id === simSelectedTypeId)
                    if (!selectedResult) return null
                    const { type, hourly, fixed, salesBack, selfProductBack, helpProductBack, itemsWithSelfBack, itemsWithHelpBack, total, salesAmount, mode } = selectedResult

                    return (
                      <div style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '0 6px 6px 6px',
                        padding: '10px',
                        backgroundColor: '#fff',
                      }}>
                        {/* 売上集計モード表示 */}
                        <div style={{
                          marginBottom: '10px',
                          padding: '10px 12px',
                          backgroundColor: mode === 'item_based' ? '#fef3c7' : '#dbeafe',
                          borderRadius: '8px',
                          border: `1px solid ${mode === 'item_based' ? '#fcd34d' : '#93c5fd'}`,
                        }}>
                          <div style={{ fontSize: '10px', color: mode === 'item_based' ? '#92400e' : '#1e40af', marginBottom: '2px' }}>
                            {mode === 'item_based' ? '推し小計' : '伝票小計'}
                          </div>
                          <div style={{ fontSize: '16px', fontWeight: 'bold', color: mode === 'item_based' ? '#b45309' : '#1d4ed8' }}>
                            ¥{salesAmount.toLocaleString()}
                          </div>
                        </div>

                        {/* 時給・固定セクション */}
                        {(hourly > 0 || fixed > 0) && (
                          <div style={{ backgroundColor: '#f8fafc', borderLeft: '3px solid #3b82f6', padding: '8px 10px', marginBottom: '8px', borderRadius: '0 4px 4px 0' }}>
                            <div style={{ fontSize: '11px', color: '#3b82f6', marginBottom: '4px', fontWeight: 'bold' }}>時給・固定</div>
                            {hourly > 0 && (
                              <div style={styles.slipRow}>
                                <span style={{ ...styles.slipRowLabel, fontSize: '11px' }}>時給（{simWorkHours}h × ¥{type.hourly_rate.toLocaleString()}）</span>
                                <span style={{ ...styles.slipRowValue, fontSize: '11px' }}>¥{hourly.toLocaleString()}</span>
                              </div>
                            )}
                            {fixed > 0 && (
                              <div style={styles.slipRow}>
                                <span style={{ ...styles.slipRowLabel, fontSize: '11px' }}>固定額</span>
                                <span style={{ ...styles.slipRowValue, fontSize: '11px' }}>¥{fixed.toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 売上バックセクション */}
                        {(salesBack > 0 || type.commission_rate > 0 || type.use_sliding_rate) && (
                          <div style={{ backgroundColor: '#fef3c7', borderLeft: '3px solid #f59e0b', padding: '8px 10px', marginBottom: '8px', borderRadius: '0 4px 4px 0' }}>
                            <div style={{ fontSize: '11px', color: '#d97706', marginBottom: '4px', fontWeight: 'bold' }}>売上バック</div>
                            <div style={styles.slipRow}>
                              <span style={{ ...styles.slipRowLabel, fontSize: '11px' }}>
                                {type.use_sliding_rate ? 'スライド' : `${type.commission_rate}%`}
                              </span>
                              <span style={{ ...styles.slipRowValue, fontSize: '11px' }}>¥{salesBack.toLocaleString()}</span>
                            </div>
                          </div>
                        )}

                        {/* 推し商品バックセクション */}
                        {itemsWithSelfBack.length > 0 && (
                          <div style={{ backgroundColor: '#fef3c7', borderLeft: '3px solid #f59e0b', padding: '8px 10px', marginBottom: '8px', borderRadius: '0 4px 4px 0' }}>
                            <div style={{ fontSize: '11px', color: '#d97706', marginBottom: '4px', fontWeight: 'bold' }}>推し商品バック</div>
                            {itemsWithSelfBack.map((item, idx) => (
                              <div key={`self-${idx}`} style={styles.slipRow}>
                                <span style={{ ...styles.slipRowLabel, fontSize: '10px', color: '#92400e' }}>{item.name}</span>
                                <span style={{ ...styles.slipRowValue, fontSize: '10px', color: '#92400e' }}>¥{item.back.toLocaleString()}</span>
                              </div>
                            ))}
                            <div style={{ ...styles.slipRow, borderTop: '1px dashed #fcd34d', paddingTop: '4px', marginTop: '4px' }}>
                              <span style={{ ...styles.slipRowLabel, fontSize: '11px', fontWeight: '600', color: '#b45309' }}>推し計</span>
                              <span style={{ ...styles.slipRowValue, fontSize: '11px', fontWeight: '600', color: '#b45309' }}>¥{selfProductBack.toLocaleString()}</span>
                            </div>
                          </div>
                        )}

                        {/* ヘルプ商品バックセクション */}
                        {itemsWithHelpBack.length > 0 && (
                          <div style={{ backgroundColor: '#ecfdf5', borderLeft: '3px solid #10b981', padding: '8px 10px', marginBottom: '8px', borderRadius: '0 4px 4px 0' }}>
                            <div style={{ fontSize: '11px', color: '#059669', marginBottom: '4px', fontWeight: 'bold' }}>ヘルプ商品バック</div>
                            {itemsWithHelpBack.map((item, idx) => (
                              <div key={`help-${idx}`} style={styles.slipRow}>
                                <span style={{ ...styles.slipRowLabel, fontSize: '10px', color: '#065f46' }}>{item.name}</span>
                                <span style={{ ...styles.slipRowValue, fontSize: '10px', color: '#065f46' }}>¥{item.back.toLocaleString()}</span>
                              </div>
                            ))}
                            <div style={{ ...styles.slipRow, borderTop: '1px dashed #a7f3d0', paddingTop: '4px', marginTop: '4px' }}>
                              <span style={{ ...styles.slipRowLabel, fontSize: '11px', fontWeight: '600', color: '#047857' }}>ヘルプ計</span>
                              <span style={{ ...styles.slipRowValue, fontSize: '11px', fontWeight: '600', color: '#047857' }}>¥{helpProductBack.toLocaleString()}</span>
                            </div>
                          </div>
                        )}

                        <div style={styles.slipSubtotalRow}>
                          <span style={{ fontSize: '12px' }}>{type.name} 計</span>
                          <span style={{ ...styles.slipSubtotalValue, fontSize: '12px' }}>¥{total.toLocaleString()}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* 全報酬形態の比較 */}
              {compensationResults.length > 1 && (
                <div style={styles.slipCompareSection}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold' }}>報酬形態比較</div>
                  {compensationResults.map((result) => {
                    const isHighest = result.total === Math.max(...compensationResults.map(r => r.total))
                    const isSelected = settingsState.paymentSelectionMethod === 'specific' && settingsState.selectedCompensationTypeId === result.type.id
                    return (
                      <div key={result.type.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '4px 8px',
                        backgroundColor: (settingsState.paymentSelectionMethod === 'highest' && isHighest) || isSelected ? '#ecfdf5' : 'transparent',
                        borderRadius: '4px',
                        marginBottom: '2px',
                      }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '11px', color: (settingsState.paymentSelectionMethod === 'highest' && isHighest) || isSelected ? '#059669' : '#64748b' }}>
                            {result.type.name}
                            {settingsState.paymentSelectionMethod === 'highest' && isHighest && ' ★'}
                            {isSelected && ' ★'}
                          </span>
                          <span style={{ fontSize: '9px', color: '#94a3b8' }}>
                            {result.mode === 'item_based' ? '推し小計' : '伝票小計'}
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: (settingsState.paymentSelectionMethod === 'highest' && isHighest) || isSelected ? '#059669' : '#334155' }}>
                          ¥{result.total.toLocaleString()}
                        </span>
                      </div>
                    )
                  })}
                  <div style={{ marginTop: '6px', fontSize: '10px', color: '#94a3b8', textAlign: 'center' }}>
                    {settingsState.paymentSelectionMethod === 'highest' ? '高い方を採用' : '特定形態を採用'}
                  </div>
                </div>
              )}

              {/* 控除 */}
              {settingsState.deductionItems && settingsState.deductionItems.length > 0 && (
                <div style={styles.slipSection}>
                  <div style={styles.slipSectionHeader}>控除</div>
                  <div style={styles.slipDivider} />

                  {settingsState.deductionItems.map((item) => (
                    <div key={item.id} style={styles.slipRow}>
                      <span style={styles.slipRowLabel}>{item.name}</span>
                      <span style={{ ...styles.slipRowValue, color: '#ef4444' }}>
                        {item.isVariable ? '変動' : `-¥${item.amount.toLocaleString()}`}
                      </span>
                    </div>
                  ))}

                  <div style={styles.slipInputRow}>
                    <span style={styles.slipInputLabel}>変動控除</span>
                    <div style={styles.slipInputGroup}>
                      <input
                        type="number"
                        value={simDeductions}
                        onChange={(e) => setSimDeductions(Number(e.target.value))}
                        style={styles.slipInput}
                        min={0}
                        step={100}
                      />
                      <span style={styles.slipInputUnit}>円</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 最終支給額 */}
              {(() => {
                let selectedPay = 0
                if (compensationResults.length > 0) {
                  if (settingsState.paymentSelectionMethod === 'highest') {
                    selectedPay = Math.max(...compensationResults.map(r => r.total))
                  } else if (settingsState.selectedCompensationTypeId) {
                    const selected = compensationResults.find(r => r.type.id === settingsState.selectedCompensationTypeId)
                    selectedPay = selected?.total || 0
                  } else {
                    selectedPay = compensationResults[0]?.total || 0
                  }
                }

                let fixedDeductions = 0
                if (settingsState.deductionItems) {
                  for (const item of settingsState.deductionItems) {
                    if (!item.isVariable) {
                      fixedDeductions += item.amount
                    }
                  }
                }
                const totalDeductions = fixedDeductions + simDeductions
                const finalPay = selectedPay - totalDeductions

                return (
                  <div style={styles.slipFinalSection}>
                    <div style={styles.slipDividerBold} />
                    <div style={styles.slipFinalRow}>
                      <span style={styles.slipFinalLabel}>最終支給額</span>
                      <span style={styles.slipFinalValue}>¥{finalPay.toLocaleString()}</span>
                    </div>
                  </div>
                )
              })()}
            </div>
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
  // 支給方法・報酬形態タブ
  paymentMethodSection: {
    marginBottom: '16px',
    padding: '12px 16px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  paymentMethodRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  paymentMethodLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#374151',
    whiteSpace: 'nowrap' as const,
  },
  paymentMethodSelect: {
    padding: '6px 10px',
    fontSize: '13px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
    minWidth: '160px',
  },
  compensationTypeTabs: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '16px',
    borderBottom: '2px solid #e2e8f0',
    paddingBottom: '0',
  },
  compensationTypeTab: {
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#64748b',
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  compensationTypeTabActive: {
    color: '#3b82f6',
    borderBottom: '2px solid #3b82f6',
    fontWeight: '600',
  },
  addCompensationTypeBtn: {
    padding: '8px 12px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#64748b',
    backgroundColor: 'transparent',
    border: '1px dashed #cbd5e1',
    borderRadius: '6px',
    cursor: 'pointer',
    marginLeft: '8px',
    transition: 'all 0.15s ease',
  },
  deleteCompensationTypeBtn: {
    padding: '2px 6px',
    fontSize: '11px',
    color: '#ef4444',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    marginLeft: '4px',
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
    width: 'calc(100vw - 250px - 80px)',
    height: 'calc(100vh - 180px)',
    alignItems: 'stretch',
  },
  sidebar: {
    width: '250px',
    flexShrink: 0,
    backgroundColor: '#f8f9fa',
    borderRadius: '10px',
    padding: '15px',
    overflowY: 'auto' as const,
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
    flex: 1,
    minWidth: 0,
    backgroundColor: 'white',
    borderRadius: '10px',
    padding: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    overflowY: 'auto' as const,
    minHeight: 0,
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
  // 売上集計方法トグル
  salesMethodToggle: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
  },
  salesMethodBtn: {
    flex: 1,
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '500',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#cbd5e1',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#64748b',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  salesMethodBtnActive: {
    backgroundColor: '#0369a1',
    borderColor: '#0369a1',
    color: 'white',
  },
  salesMethodHint: {
    fontSize: '12px',
    color: '#64748b',
    margin: 0,
  },
  // シミュレーションパネル
  simulationPanel: {
    width: '260px',
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
  // 給料明細スタイル
  salarySlip: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid #e2e8f0',
  },
  slipHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '2px solid #0369a1',
  },
  slipCastName: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#0369a1',
  },
  slipDate: {
    fontSize: '12px',
    color: '#64748b',
  },
  slipInputSection: {
    marginBottom: '16px',
  },
  slipInputRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  slipInputLabel: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#334155',
  },
  slipInputGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  slipInput: {
    width: '80px',
    padding: '4px 8px',
    fontSize: '13px',
    border: '1px solid #94a3b8',
    borderRadius: '4px',
    textAlign: 'right' as const,
  },
  slipInputUnit: {
    fontSize: '12px',
    color: '#64748b',
    width: '30px',
  },
  slipSection: {
    marginBottom: '16px',
  },
  slipSectionHeader: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#334155',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  slipSectionMode: {
    fontSize: '11px',
    color: '#64748b',
    fontWeight: '400',
  },
  slipDivider: {
    height: '1px',
    backgroundColor: '#e2e8f0',
    marginBottom: '8px',
  },
  slipDividerBold: {
    height: '2px',
    backgroundColor: '#0369a1',
    marginBottom: '12px',
  },
  slipRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '12px',
    color: '#64748b',
    marginBottom: '4px',
    padding: '2px 0',
  },
  slipRowLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    paddingRight: '8px',
  },
  slipRowValue: {
    fontWeight: '500',
    color: '#334155',
    whiteSpace: 'nowrap' as const,
  },
  slipSubtotalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
    fontWeight: '600',
    color: '#334155',
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px dashed #cbd5e1',
  },
  slipSubtotalValue: {
    color: '#0369a1',
  },
  slipCompareSection: {
    backgroundColor: '#fef3c7',
    borderRadius: '6px',
    padding: '10px',
    marginBottom: '16px',
    fontSize: '12px',
  },
  slipCompareRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  slipCompareVs: {
    color: '#92400e',
    fontWeight: '600',
  },
  slipCompareResult: {
    textAlign: 'center' as const,
    color: '#92400e',
    fontWeight: '500',
  },
  slipFinalSection: {
    marginTop: '16px',
  },
  slipFinalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#f0fdf4',
    borderRadius: '6px',
  },
  slipFinalLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#334155',
  },
  slipFinalValue: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#059669',
  },
  // 伝票詳細パネルWrapper（タブを外に配置）
  receiptPanelWrapper: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 0,
  },
  // 伝票詳細パネル
  receiptPanel: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: '0 8px 8px 8px',
    padding: '16px',
    border: '1px solid #e2e8f0',
    overflowY: 'auto' as const,
    minHeight: 0,
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
