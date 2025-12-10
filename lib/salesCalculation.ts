/**
 * 売上計算ロジック
 * - SELF/HELP判定
 * - 端数処理
 * - バック計算
 */

import {
  SalesSettings,
  CastBackRate,
  RoundingMethod,
  SalesType,
  CalculatedSalesItem,
  CastSalesSummary,
} from '@/types'

// Order Item with extended fields from DB
interface OrderItemWithTax {
  id: number
  order_id: string
  product_name: string
  category: string | null
  cast_name: string | null
  quantity: number
  unit_price: number
  unit_price_excl_tax: number
  subtotal: number
  tax_amount: number
}

// Order with staff_name
interface OrderWithStaff {
  id: string
  staff_name: string | null
  order_date: string
  order_items: OrderItemWithTax[]
}

// Cast info for lookup
interface CastInfo {
  id: number
  name: string
}

/**
 * 端数処理を適用
 */
export function applyRounding(amount: number, method: RoundingMethod): number {
  switch (method) {
    case 'floor_100':
      return Math.floor(amount / 100) * 100
    case 'floor_10':
      return Math.floor(amount / 10) * 10
    case 'round':
      return Math.round(amount)
    case 'none':
    default:
      return amount
  }
}

/**
 * SELF/HELP判定
 * - order.staff_name === order_item.cast_name → SELF
 * - それ以外 → HELP
 */
export function determineSalesType(
  orderStaffName: string | null,
  itemCastName: string | null
): SalesType {
  if (!orderStaffName || !itemCastName) {
    // キャスト名がない場合はSELF扱い（担当キャストが不明）
    return 'self'
  }
  return orderStaffName === itemCastName ? 'self' : 'help'
}

/**
 * キャストのバック率を取得
 * 優先順位: 商品名完全一致 > カテゴリ一致 > デフォルト
 */
export function getBackRatio(
  castId: number,
  category: string | null,
  productName: string,
  salesType: SalesType,
  backRates: CastBackRate[],
  salesSettings: SalesSettings
): number {
  // キャストのバック率をフィルタ
  const castRates = backRates.filter(r => r.cast_id === castId && r.is_active)

  // 1. 商品名完全一致を探す
  const exactMatch = castRates.find(
    r => r.product_name === productName && r.category === category
  )
  if (exactMatch) {
    return getApplicableRatio(exactMatch, salesType, salesSettings)
  }

  // 2. カテゴリ一致（商品名なし）を探す
  const categoryMatch = castRates.find(
    r => r.category === category && !r.product_name
  )
  if (categoryMatch) {
    return getApplicableRatio(categoryMatch, salesType, salesSettings)
  }

  // 3. 全カテゴリ対象（category=null, product_name=null）を探す
  const defaultMatch = castRates.find(
    r => !r.category && !r.product_name
  )
  if (defaultMatch) {
    return getApplicableRatio(defaultMatch, salesType, salesSettings)
  }

  // 4. バック率設定がない場合はsalesSettingsのhelp_ratioを使用（HELP時）
  if (salesType === 'help') {
    return salesSettings.help_ratio
  }

  // SELF時はデフォルト100%
  return 100
}

/**
 * バック率設定からSELF/HELP別のバック率を取得
 */
function getApplicableRatio(
  backRate: CastBackRate,
  salesType: SalesType,
  salesSettings: SalesSettings
): number {
  if (salesType === 'self') {
    // SELF時: self_back_ratioがあれば使用、なければback_ratio
    return backRate.self_back_ratio ?? backRate.back_ratio
  } else {
    // HELP時: help_back_ratioがあれば使用、なければsalesSettings.help_ratio
    return backRate.help_back_ratio ?? salesSettings.help_ratio
  }
}

/**
 * 売上を計算してキャスト別に集計
 */
export function calculateCastSales(
  orders: OrderWithStaff[],
  casts: CastInfo[],
  salesSettings: SalesSettings,
  backRates: CastBackRate[]
): CastSalesSummary[] {
  // キャスト名からIDへのマップ
  const castNameMap = new Map(casts.map(c => [c.name, c]))

  // キャストID別の集計結果
  const summaryMap = new Map<number, CastSalesSummary>()

  // 初期化
  casts.forEach(cast => {
    summaryMap.set(cast.id, {
      cast_id: cast.id,
      cast_name: cast.name,
      self_sales: 0,
      help_sales: 0,
      total_sales: 0,
      total_back: 0,
      items: [],
    })
  })

  // 各オーダーの商品を処理
  orders.forEach(order => {
    order.order_items.forEach(item => {
      if (!item.cast_name) return // キャスト紐付けなしはスキップ

      const cast = castNameMap.get(item.cast_name)
      if (!cast) return // 該当キャストなし

      const summary = summaryMap.get(cast.id)
      if (!summary) return

      // SELF/HELP判定
      const salesType = determineSalesType(order.staff_name, item.cast_name)

      // 税抜き金額を使用するか判定
      const unitPrice = salesSettings.use_tax_excluded
        ? item.unit_price_excl_tax
        : item.unit_price

      let subtotal = unitPrice * item.quantity

      // 商品ごとの端数処理（per_itemの場合）
      if (salesSettings.rounding_timing === 'per_item') {
        subtotal = applyRounding(subtotal, salesSettings.rounding_method)
      }

      // バック率を取得
      const backRatio = getBackRatio(
        cast.id,
        item.category,
        item.product_name,
        salesType,
        backRates,
        salesSettings
      )

      // バック金額を計算
      let backAmount = subtotal * (backRatio / 100)
      if (salesSettings.rounding_timing === 'per_item') {
        backAmount = applyRounding(backAmount, salesSettings.rounding_method)
      }

      // 集計に追加
      const calculatedItem: CalculatedSalesItem = {
        order_item_id: item.id,
        cast_id: cast.id,
        cast_name: cast.name,
        product_name: item.product_name,
        category: item.category,
        quantity: item.quantity,
        unit_price_excl_tax: unitPrice,
        subtotal_excl_tax: subtotal,
        sales_type: salesType,
        back_ratio: backRatio,
        back_amount: backAmount,
      }

      summary.items.push(calculatedItem)

      if (salesType === 'self') {
        summary.self_sales += subtotal
      } else {
        summary.help_sales += subtotal
      }
      summary.total_back += backAmount
    })
  })

  // 合計時の端数処理（totalの場合）
  if (salesSettings.rounding_timing === 'total') {
    summaryMap.forEach(summary => {
      summary.self_sales = applyRounding(summary.self_sales, salesSettings.rounding_method)
      summary.help_sales = applyRounding(summary.help_sales, salesSettings.rounding_method)
      summary.total_back = applyRounding(summary.total_back, salesSettings.rounding_method)
    })
  }

  // total_salesを計算
  summaryMap.forEach(summary => {
    summary.total_sales = summary.self_sales + summary.help_sales
  })

  // 売上順にソート
  return Array.from(summaryMap.values())
    .filter(s => s.total_sales > 0 || s.items.length > 0)
    .sort((a, b) => b.total_sales - a.total_sales)
}

/**
 * デフォルトの売上設定を取得
 */
export function getDefaultSalesSettings(storeId: number): Omit<SalesSettings, 'id' | 'created_at' | 'updated_at'> {
  return {
    store_id: storeId,

    // キャスト商品のみの集計設定
    item_use_tax_excluded: true,
    item_exclude_consumption_tax: true,
    item_exclude_service_charge: false,
    item_multi_cast_distribution: 'nomination_only',
    item_non_nomination_sales_handling: 'share_only',
    item_help_distribution_method: 'equal_all',
    item_help_sales_inclusion: 'both',
    item_help_calculation_method: 'ratio',
    item_help_ratio: 50,
    item_help_fixed_amount: 0,
    item_rounding_method: 'floor_100',
    item_rounding_position: 100,
    item_rounding_timing: 'per_item',
    item_nomination_distribute_all: false,

    // 伝票全体の集計設定
    receipt_use_tax_excluded: true,
    receipt_exclude_consumption_tax: true,
    receipt_exclude_service_charge: false,
    receipt_multi_cast_distribution: 'nomination_only',
    receipt_non_nomination_sales_handling: 'share_only',
    receipt_help_distribution_method: 'equal_all',
    receipt_help_sales_inclusion: 'both',
    receipt_help_calculation_method: 'ratio',
    receipt_help_ratio: 50,
    receipt_help_fixed_amount: 0,
    receipt_rounding_method: 'floor_100',
    receipt_rounding_position: 100,
    receipt_rounding_timing: 'per_item',
    receipt_nomination_distribute_all: false,
    receipt_deduct_item_sales: false,

    // 公開設定
    published_aggregation: 'item_based',

    // 共通設定
    non_help_staff_names: [],
    multi_nomination_ratios: [50, 50],

    // レガシー設定（後方互換用）
    rounding_method: 'floor_100',
    rounding_timing: 'total',
    distribute_to_help: true,
    help_calculation_method: 'ratio',
    help_ratio: 50,
    help_fixed_amount: 0,
    use_tax_excluded: true,
    exclude_consumption_tax: true,
    exclude_service_charge: true,
    description: null,
  }
}
