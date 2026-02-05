/**
 * 売上再計算のコアロジック
 * API RouteとCron Jobから共通で使用
 */

import { createClient } from '@supabase/supabase-js'
import { calculateCastSalesByPublishedMethod, getDefaultSalesSettings } from './salesCalculation'
import { SalesSettings, CastSalesSummary } from '@/types'

// Service Role Key でRLSをバイパス
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 日付をYYYY-MM-DD形式に変換
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

interface OrderItemWithTax {
  id: number
  order_id: string
  product_name: string
  category: string | null
  cast_name: string[] | null
  quantity: number
  unit_price: number
  subtotal: number
}

interface OrderWithStaff {
  id: string
  staff_name: string | null
  order_date: string
  guest_count: number | null
  table_number: string | null
  guest_name: string | null
  order_items: OrderItemWithTax[]
}

interface Cast {
  id: number
  name: string
  store_id: number
}

interface Attendance {
  cast_name: string
  check_in_datetime: string | null
  check_out_datetime: string | null
  costume_id: number | null
}

interface CompensationSettingsWage {
  cast_id: number
  status_id: number | null
  hourly_wage_override: number | null
}

interface WageStatus {
  id: number
  hourly_wage: number
}

interface SpecialWageDay {
  wage_adjustment: number
}

interface CastDailyItemData {
  cast_id: number
  help_cast_id: number | null
  store_id: number
  date: string
  order_id: string | null
  table_number: string | null
  guest_name: string | null
  category: string | null
  product_name: string
  quantity: number
  self_sales: number
  help_sales: number
  needs_cast: boolean
  subtotal: number
  // バック率・バック額（計算時点の値）
  self_back_rate: number
  self_back_amount: number
  help_back_rate: number
  help_back_amount: number
  is_self: boolean
  // 売上集計方法別の売上額
  self_sales_item_based: number
  self_sales_receipt_based: number
}

// cast_back_ratesの型
interface CastBackRate {
  cast_id: number
  product_name: string | null
  self_back_ratio: number
  help_back_ratio: number | null
}

// 商品別キャスト売上を集計（cast_daily_items用）
function aggregateCastDailyItems(
  orders: OrderWithStaff[],
  castMap: Map<string, Cast>,
  storeId: number,
  date: string,
  salesSettings: SalesSettings,
  taxRate: number = 0.1,
  productNeedsCastMap: Map<string, boolean> = new Map()
): CastDailyItemData[] {
  const itemsMap = new Map<string, CastDailyItemData>()
  const method = salesSettings.published_aggregation ?? 'item_based'
  const nonHelpNames = salesSettings.non_help_staff_names || []

  const isItemBased = method === 'item_based'
  const excludeTax = isItemBased
    ? (salesSettings.item_exclude_consumption_tax ?? salesSettings.use_tax_excluded ?? false)
    : (salesSettings.receipt_exclude_consumption_tax ?? salesSettings.use_tax_excluded ?? false)
  const helpDistMethod = isItemBased
    ? (salesSettings.item_help_distribution_method ?? 'all_to_nomination')
    : (salesSettings.receipt_help_distribution_method ?? 'all_to_nomination')
  const giveHelpSales = isItemBased
    ? (salesSettings.item_help_sales_inclusion === 'both')
    : (salesSettings.receipt_help_sales_inclusion === 'both')
  const helpRatio = isItemBased
    ? (salesSettings.item_help_ratio ?? 50)
    : (salesSettings.receipt_help_ratio ?? 50)

  const roundingMethod = isItemBased
    ? (salesSettings.item_rounding_method ?? 'floor_100')
    : (salesSettings.receipt_rounding_method ?? 'floor_100')
  const roundingPosition = isItemBased
    ? (salesSettings.item_rounding_position ?? 100)
    : (salesSettings.receipt_rounding_position ?? 100)

  const applyRounding = (amount: number) => {
    if (roundingPosition <= 0) return amount
    if (roundingMethod.startsWith('floor')) {
      return Math.floor(amount / roundingPosition) * roundingPosition
    } else if (roundingMethod.startsWith('ceil')) {
      return Math.ceil(amount / roundingPosition) * roundingPosition
    } else if (roundingMethod === 'round') {
      return Math.round(amount / roundingPosition) * roundingPosition
    }
    return amount
  }

  const applyTaxAndRounding = (amount: number) => {
    let result = amount
    if (excludeTax) {
      const taxPercent = Math.round(taxRate * 100)
      result = Math.floor(result * 100 / (100 + taxPercent))
    }
    return applyRounding(result)
  }

  for (const order of orders) {
    const staffNames = order.staff_name?.split(',').map(n => n.trim()) || []
    const realNominations = staffNames.filter(n => !nonHelpNames.includes(n))

    if (realNominations.length === 0) continue

    const nominationCastIds = realNominations
      .map(name => castMap.get(name)?.id)
      .filter((id): id is number => id !== undefined)

    if (nominationCastIds.length === 0) continue

    for (const item of order.order_items || []) {
      const castsOnItem = item.cast_name || []
      const realCastsOnItem = castsOnItem.filter(c => !nonHelpNames.includes(c))

      const rawAmount = (item.unit_price || 0) * (item.quantity || 0)
      const itemAmount = applyTaxAndRounding(rawAmount)
      const adjustedSubtotal = applyTaxAndRounding(item.subtotal)

      const selfCastsOnItem = realCastsOnItem.filter(c => realNominations.includes(c))
      const helpCastsOnItem = realCastsOnItem.filter(c => !realNominations.includes(c))
      const noCast = realCastsOnItem.length === 0

      if (isItemBased) {
        for (const nominationName of realNominations) {
          const nominationCast = castMap.get(nominationName)
          if (!nominationCast) continue

          if (noCast) {
            const key = `${order.id}:${nominationCast.id}:null:${item.product_name}:${item.category || ''}`
            if (itemsMap.has(key)) {
              const existing = itemsMap.get(key)!
              existing.quantity += item.quantity
              existing.subtotal += adjustedSubtotal
            } else {
              itemsMap.set(key, {
                cast_id: nominationCast.id,
                help_cast_id: null,
                store_id: storeId,
                date: date,
                order_id: order.id,
                table_number: order.table_number,
                guest_name: order.guest_name,
                category: item.category,
                product_name: item.product_name,
                quantity: item.quantity,
                self_sales: 0,
                help_sales: 0,
                needs_cast: productNeedsCastMap.get(item.product_name) ?? true,
                subtotal: adjustedSubtotal,
                self_back_rate: 0,
                self_back_amount: 0,
                help_back_rate: 0,
                help_back_amount: 0,
                is_self: true,
                self_sales_item_based: 0,
                self_sales_receipt_based: 0
              })
            }
            continue
          }

          if (selfCastsOnItem.includes(nominationName)) {
            const perCast = Math.floor(itemAmount / selfCastsOnItem.length)
            const key = `${order.id}:${nominationCast.id}:null:${item.product_name}:${item.category || ''}`
            if (itemsMap.has(key)) {
              const existing = itemsMap.get(key)!
              existing.quantity += item.quantity
              existing.self_sales += perCast
              existing.subtotal += adjustedSubtotal
            } else {
              itemsMap.set(key, {
                cast_id: nominationCast.id,
                help_cast_id: null,
                store_id: storeId,
                date: date,
                order_id: order.id,
                table_number: order.table_number,
                guest_name: order.guest_name,
                category: item.category,
                product_name: item.product_name,
                quantity: item.quantity,
                self_sales: perCast,
                help_sales: 0,
                needs_cast: productNeedsCastMap.get(item.product_name) ?? true,
                subtotal: adjustedSubtotal,
                self_back_rate: 0,
                self_back_amount: 0,
                help_back_rate: 0,
                help_back_amount: 0,
                is_self: true,
                self_sales_item_based: 0,
                self_sales_receipt_based: 0
              })
            }
          }

          for (const helpCastName of helpCastsOnItem) {
            const helpCast = castMap.get(helpCastName)
            if (!helpCast) continue

            let selfShare = 0
            let helpShare = 0
            const perItem = Math.floor(itemAmount / helpCastsOnItem.length)

            switch (helpDistMethod) {
              case 'all_to_nomination':
                selfShare = perItem
                helpShare = 0
                break
              case 'equal':
                selfShare = Math.floor(perItem / 2)
                helpShare = giveHelpSales ? perItem - selfShare : 0
                break
              case 'ratio':
                const helpAmount = Math.floor(perItem * helpRatio / 100)
                selfShare = perItem - helpAmount
                helpShare = giveHelpSales ? helpAmount : 0
                break
              case 'equal_per_person':
                const total = realNominations.length + 1
                selfShare = Math.floor(perItem / total)
                helpShare = giveHelpSales ? Math.floor(perItem / total) : 0
                break
              default:
                selfShare = perItem
                helpShare = 0
            }

            const key = `${order.id}:${nominationCast.id}:${helpCast.id}:${item.product_name}:${item.category || ''}`
            if (itemsMap.has(key)) {
              const existing = itemsMap.get(key)!
              existing.quantity += item.quantity
              existing.self_sales += selfShare
              existing.help_sales += helpShare
              existing.subtotal += adjustedSubtotal
            } else {
              itemsMap.set(key, {
                cast_id: nominationCast.id,
                help_cast_id: helpCast.id,
                store_id: storeId,
                date: date,
                order_id: order.id,
                table_number: order.table_number,
                guest_name: order.guest_name,
                category: item.category,
                product_name: item.product_name,
                quantity: item.quantity,
                self_sales: selfShare,
                help_sales: helpShare,
                needs_cast: productNeedsCastMap.get(item.product_name) ?? true,
                subtotal: adjustedSubtotal,
                self_back_rate: 0,
                self_back_amount: 0,
                help_back_rate: 0,
                help_back_amount: 0,
                is_self: false,
                self_sales_item_based: 0,
                self_sales_receipt_based: 0
              })
            }
          }
        }
        continue
      }

      // receipt_based
      const isSelfOnly = selfCastsOnItem.length > 0 && helpCastsOnItem.length === 0
      const isHelpOnly = helpCastsOnItem.length > 0 && selfCastsOnItem.length === 0
      const isMixed = selfCastsOnItem.length > 0 && helpCastsOnItem.length > 0

      for (const nominationName of realNominations) {
        const nominationCast = castMap.get(nominationName)
        if (!nominationCast) continue

        if (noCast) {
          const perNomination = Math.floor(itemAmount / realNominations.length)
          const key = `${order.id}:${nominationCast.id}:null:${item.product_name}:${item.category || ''}`

          if (itemsMap.has(key)) {
            const existing = itemsMap.get(key)!
            existing.quantity += item.quantity
            existing.self_sales += perNomination
            existing.subtotal += adjustedSubtotal
          } else {
            itemsMap.set(key, {
              cast_id: nominationCast.id,
              help_cast_id: null,
              store_id: storeId,
              date: date,
              order_id: order.id,
              table_number: order.table_number,
              guest_name: order.guest_name,
              category: item.category,
              product_name: item.product_name,
              quantity: item.quantity,
              self_sales: perNomination,
              help_sales: 0,
              needs_cast: productNeedsCastMap.get(item.product_name) ?? true,
              subtotal: adjustedSubtotal,
              self_back_rate: 0,
              self_back_amount: 0,
              help_back_rate: 0,
              help_back_amount: 0,
              is_self: true,
              self_sales_item_based: 0,
              self_sales_receipt_based: 0
            })
          }
          continue
        }

        if (isSelfOnly) {
          const perNomination = Math.floor(itemAmount / realNominations.length)
          const key = `${order.id}:${nominationCast.id}:null:${item.product_name}:${item.category || ''}`

          if (itemsMap.has(key)) {
            const existing = itemsMap.get(key)!
            existing.quantity += item.quantity
            existing.self_sales += perNomination
            existing.subtotal += adjustedSubtotal
          } else {
            itemsMap.set(key, {
              cast_id: nominationCast.id,
              help_cast_id: null,
              store_id: storeId,
              date: date,
              order_id: order.id,
              table_number: order.table_number,
              guest_name: order.guest_name,
              category: item.category,
              product_name: item.product_name,
              quantity: item.quantity,
              self_sales: perNomination,
              help_sales: 0,
              needs_cast: productNeedsCastMap.get(item.product_name) ?? true,
              subtotal: adjustedSubtotal,
              self_back_rate: 0,
              self_back_amount: 0,
              help_back_rate: 0,
              help_back_amount: 0,
              is_self: true,
              self_sales_item_based: 0,
              self_sales_receipt_based: 0
            })
          }
        }

        if (isHelpOnly || isMixed) {
          let selfShare = 0
          let helpSharePerCast = 0
          const perNominationBase = Math.floor(itemAmount / realNominations.length)

          switch (helpDistMethod) {
            case 'all_to_nomination':
              selfShare = perNominationBase
              helpSharePerCast = 0
              break
            case 'equal':
              selfShare = Math.floor(perNominationBase / 2)
              helpSharePerCast = giveHelpSales
                ? Math.floor((perNominationBase - selfShare) / helpCastsOnItem.length)
                : 0
              break
            case 'ratio':
              const helpShareTotal = Math.floor(perNominationBase * helpRatio / 100)
              selfShare = perNominationBase - helpShareTotal
              helpSharePerCast = giveHelpSales
                ? Math.floor(helpShareTotal / helpCastsOnItem.length)
                : 0
              break
            case 'equal_per_person':
              const allCastsCount = realNominations.length + helpCastsOnItem.length
              const perPerson = Math.floor(itemAmount / allCastsCount)
              selfShare = perPerson
              helpSharePerCast = giveHelpSales ? perPerson : 0
              break
            default:
              selfShare = perNominationBase
              helpSharePerCast = 0
          }

          for (const helpCastName of helpCastsOnItem) {
            const helpCast = castMap.get(helpCastName)
            if (!helpCast) continue

            const key = `${order.id}:${nominationCast.id}:${helpCast.id}:${item.product_name}:${item.category || ''}`

            if (itemsMap.has(key)) {
              const existing = itemsMap.get(key)!
              existing.quantity += item.quantity
              existing.self_sales += selfShare
              existing.help_sales += helpSharePerCast
              existing.subtotal += adjustedSubtotal
            } else {
              itemsMap.set(key, {
                cast_id: nominationCast.id,
                help_cast_id: helpCast.id,
                store_id: storeId,
                date: date,
                order_id: order.id,
                table_number: order.table_number,
                guest_name: order.guest_name,
                category: item.category,
                product_name: item.product_name,
                quantity: item.quantity,
                self_sales: selfShare,
                help_sales: helpSharePerCast,
                needs_cast: productNeedsCastMap.get(item.product_name) ?? true,
                subtotal: adjustedSubtotal,
                self_back_rate: 0,
                self_back_amount: 0,
                help_back_rate: 0,
                help_back_amount: 0,
                is_self: false,
                self_sales_item_based: 0,
                self_sales_receipt_based: 0
              })
            }
          }

          if (isMixed && selfCastsOnItem.includes(nominationName)) {
            const selfKey = `${order.id}:${nominationCast.id}:null:${item.product_name}:${item.category || ''}`
            const selfAmount = Math.floor(itemAmount / (selfCastsOnItem.length + helpCastsOnItem.length))

            if (itemsMap.has(selfKey)) {
              const existing = itemsMap.get(selfKey)!
              existing.quantity += item.quantity
              existing.self_sales += selfAmount
              existing.subtotal += adjustedSubtotal
            } else {
              itemsMap.set(selfKey, {
                cast_id: nominationCast.id,
                help_cast_id: null,
                store_id: storeId,
                date: date,
                order_id: order.id,
                table_number: order.table_number,
                guest_name: order.guest_name,
                category: item.category,
                product_name: item.product_name,
                quantity: item.quantity,
                self_sales: selfAmount,
                help_sales: 0,
                needs_cast: productNeedsCastMap.get(item.product_name) ?? true,
                subtotal: adjustedSubtotal,
                self_back_rate: 0,
                self_back_amount: 0,
                help_back_rate: 0,
                help_back_amount: 0,
                is_self: true,
                self_sales_item_based: 0,
                self_sales_receipt_based: 0
              })
            }
          }
        }
      }
    }
  }

  // 売上集計方法別のフィールドを設定
  const items = Array.from(itemsMap.values())
  for (const item of items) {
    // item_based: needs_cast=true の商品のみ売上計上
    item.self_sales_item_based = item.needs_cast ? item.self_sales : 0
    // receipt_based: 全商品を売上計上（self_salesは現在のモードで計算済み、needs_cast=falseはsubtotalを使用）
    item.self_sales_receipt_based = item.needs_cast ? item.self_sales : item.subtotal
  }

  return items
}

// cast_back_ratesからバック率・バック額を計算して設定
function calculateBackRatesAndAmounts(
  items: CastDailyItemData[],
  castBackRates: CastBackRate[]
): CastDailyItemData[] {
  // cast_id + product_name をキーにしたMapを作成（検索高速化）
  const backRateMap = new Map<string, CastBackRate>()
  for (const rate of castBackRates) {
    if (rate.product_name) {
      const key = `${rate.cast_id}:${rate.product_name}`
      backRateMap.set(key, rate)
    }
  }

  for (const item of items) {
    // 1. 推しバック率を取得
    const selfKey = `${item.cast_id}:${item.product_name}`
    const selfBackRate = backRateMap.get(selfKey)
    if (selfBackRate) {
      item.self_back_rate = selfBackRate.self_back_ratio ?? 0
      item.self_back_amount = Math.floor(item.self_sales * item.self_back_rate / 100)
    }

    // 2. ヘルプバック率を取得（help_cast_idがある場合のみ）
    if (item.help_cast_id) {
      const helpKey = `${item.help_cast_id}:${item.product_name}`
      const helpBackRate = backRateMap.get(helpKey)
      if (helpBackRate) {
        item.help_back_rate = helpBackRate.help_back_ratio ?? 0
        item.help_back_amount = Math.floor(item.help_sales * item.help_back_rate / 100)
      }
    }
  }

  return items
}

// 勤務時間を計算（時間単位）
function calculateWorkHours(clockIn: string | null, clockOut: string | null): number {
  if (!clockIn || !clockOut) return 0
  const start = new Date(clockIn)
  let end = new Date(clockOut)

  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  }

  const diffMs = end.getTime() - start.getTime()
  const hours = diffMs / (1000 * 60 * 60)
  return Math.max(0, Math.round(hours * 100) / 100)
}

// sales_settingsを取得
async function loadSalesSettings(storeId: number): Promise<SalesSettings> {
  const { data, error } = await supabaseAdmin
    .from('sales_settings')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) {
    console.warn('売上設定の取得に失敗:', error)
  }

  if (data) {
    return data as SalesSettings
  }

  const defaults = getDefaultSalesSettings(storeId)
  return {
    id: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...defaults,
  } as SalesSettings
}

// system_settingsから税率などを取得
async function loadSystemSettings(storeId: number): Promise<{ tax_rate: number; service_fee_rate: number }> {
  const { data, error } = await supabaseAdmin
    .from('system_settings')
    .select('setting_key, setting_value')
    .eq('store_id', storeId)

  if (error) {
    console.warn('システム設定の取得に失敗:', error)
    return { tax_rate: 10, service_fee_rate: 0 }
  }

  const settings: { tax_rate: number; service_fee_rate: number } = {
    tax_rate: 10,
    service_fee_rate: 0
  }

  if (data) {
    for (const row of data) {
      if (row.setting_key === 'tax_rate') {
        settings.tax_rate = parseFloat(row.setting_value) || 10
      } else if (row.setting_key === 'service_fee_rate') {
        settings.service_fee_rate = parseFloat(row.setting_value) || 0
      }
    }
  }

  return settings
}

/**
 * 指定日のデータを再計算して保存
 * API RouteとCron Jobから共通で使用される関数
 */
export async function recalculateForDate(storeId: number, date: string): Promise<{
  success: boolean
  castsProcessed: number
  itemsProcessed?: number
  error?: string
}> {
  try {
    const salesSettings = await loadSalesSettings(storeId)
    const systemSettings = await loadSystemSettings(storeId)
    const taxRate = systemSettings.tax_rate / 100
    const serviceRate = systemSettings.service_fee_rate / 100

    const nextDate = new Date(date)
    nextDate.setDate(nextDate.getDate() + 1)
    const nextDateStr = nextDate.toISOString().split('T')[0]

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        staff_name,
        order_date,
        guest_count,
        table_number,
        guest_name,
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
      .gte('order_date', `${date}T00:00:00Z`)
      .lt('order_date', `${nextDateStr}T00:00:00Z`)
      .is('deleted_at', null)

    if (ordersError) throw ordersError

    const typedOrders = (orders || []) as unknown as OrderWithStaff[]

    const { data: baseOrders, error: baseOrdersError } = await supabaseAdmin
      .from('base_orders')
      .select('id, cast_id, actual_price, quantity, product_name, is_processed')
      .eq('store_id', storeId)
      .eq('business_date', date)
      .not('cast_id', 'is', null)
      .not('actual_price', 'is', null)

    if (baseOrdersError) {
      console.warn('BASE orders fetch error:', baseOrdersError)
    }

    const baseSalesByCast = new Map<number, number>()
    for (const order of baseOrders || []) {
      if (order.cast_id && order.actual_price) {
        const current = baseSalesByCast.get(order.cast_id) || 0
        baseSalesByCast.set(order.cast_id, current + (order.actual_price * order.quantity))
      }
    }

    const { data: casts, error: castsError } = await supabaseAdmin
      .from('casts')
      .select('id, name, store_id')
      .eq('store_id', storeId)

    if (castsError) throw castsError

    const castMap = new Map<string, Cast>()
    casts?.forEach((c: Cast) => castMap.set(c.name, c))

    const { data: products } = await supabaseAdmin
      .from('products')
      .select('name, needs_cast')
      .eq('store_id', storeId)

    const productNeedsCastMap = new Map<string, boolean>()
    products?.forEach((p: { name: string; needs_cast: boolean | null }) => {
      productNeedsCastMap.set(p.name, p.needs_cast ?? true)
    })

    // バック率取得
    const { data: castBackRates } = await supabaseAdmin
      .from('cast_back_rates')
      .select('cast_id, product_name, self_back_ratio, help_back_ratio')
      .eq('store_id', storeId)
      .eq('is_active', true)

    const typedCastBackRates = (castBackRates || []) as CastBackRate[]

    const { data: attendances } = await supabaseAdmin
      .from('attendance')
      .select('cast_name, check_in_datetime, check_out_datetime, costume_id')
      .eq('store_id', storeId)
      .eq('date', date)

    const attendanceMap = new Map<string, Attendance>()
    attendances?.forEach((a: Attendance) => attendanceMap.set(a.cast_name, a))

    const { data: compensationSettings } = await supabaseAdmin
      .from('compensation_settings')
      .select('cast_id, status_id, hourly_wage_override')
      .eq('store_id', storeId)

    const compSettingsMap = new Map<number, CompensationSettingsWage>()
    compensationSettings?.forEach((c: CompensationSettingsWage) => compSettingsMap.set(c.cast_id, c))

    const { data: wageStatuses } = await supabaseAdmin
      .from('wage_statuses')
      .select('id, hourly_wage')
      .eq('store_id', storeId)
      .eq('is_active', true)

    const wageStatusMap = new Map<number, WageStatus>()
    wageStatuses?.forEach((s: WageStatus) => wageStatusMap.set(s.id, s))

    const { data: specialDay } = await supabaseAdmin
      .from('special_wage_days')
      .select('wage_adjustment')
      .eq('store_id', storeId)
      .eq('date', date)
      .eq('is_active', true)
      .single()

    const specialDayBonus = (specialDay as SpecialWageDay | null)?.wage_adjustment || 0

    const { data: costumes } = await supabaseAdmin
      .from('costumes')
      .select('id, wage_adjustment')
      .eq('store_id', storeId)
      .eq('is_active', true)

    const costumeMap = new Map<number, number>()
    costumes?.forEach((c: { id: number; wage_adjustment: number }) => costumeMap.set(c.id, c.wage_adjustment))

    const { data: existingStats } = await supabaseAdmin
      .from('cast_daily_stats')
      .select('cast_id, is_finalized')
      .eq('store_id', storeId)
      .eq('date', date)

    const finalizedCastIds = new Set(
      existingStats?.filter((s: { is_finalized: boolean }) => s.is_finalized).map((s: { cast_id: number }) => s.cast_id) || []
    )

    const castInfos = (casts || []).map((c: Cast) => ({ id: c.id, name: c.name }))
    const calculatedSales = calculateCastSalesByPublishedMethod(
      typedOrders,
      castInfos,
      salesSettings,
      taxRate,
      serviceRate
    )

    const salesMap = new Map<number, CastSalesSummary>()
    calculatedSales.forEach((summary: CastSalesSummary) => {
      salesMap.set(summary.cast_id, summary)
    })

    const nominationCountByCast = new Map<number, number>()
    for (const order of typedOrders) {
      if (!order.staff_name || !order.guest_count) continue
      const cast = castMap.get(order.staff_name)
      if (cast) {
        const current = nominationCountByCast.get(cast.id) || 0
        nominationCountByCast.set(cast.id, current + order.guest_count)
      }
    }

    const statsToUpsert: {
      cast_id: number
      store_id: number
      date: string
      self_sales_item_based: number
      help_sales_item_based: number
      total_sales_item_based: number
      product_back_item_based: number
      self_sales_receipt_based: number
      help_sales_receipt_based: number
      total_sales_receipt_based: number
      product_back_receipt_based: number
      work_hours: number
      base_hourly_wage: number
      special_day_bonus: number
      costume_bonus: number
      total_hourly_wage: number
      wage_amount: number
      costume_id: number | null
      wage_status_id: number | null
      nomination_count: number
      is_finalized: boolean
      updated_at: string
    }[] = []

    const processedCastIds = new Set<number>()

    for (const summary of calculatedSales) {
      if (finalizedCastIds.has(summary.cast_id)) continue
      processedCastIds.add(summary.cast_id)

      const cast = [...castMap.values()].find(c => c.id === summary.cast_id)
      if (!cast) continue

      const attendance = attendanceMap.get(cast.name)
      const compSettings = compSettingsMap.get(summary.cast_id)
      const workHours = calculateWorkHours(attendance?.check_in_datetime || null, attendance?.check_out_datetime || null)
      const costumeId = attendance?.costume_id || null
      const wageStatusId = compSettings?.status_id || null

      let baseHourlyWage = 0
      if (compSettings?.hourly_wage_override) {
        baseHourlyWage = compSettings.hourly_wage_override
      } else if (wageStatusId) {
        const wageStatus = wageStatusMap.get(wageStatusId)
        baseHourlyWage = wageStatus?.hourly_wage || 0
      }

      const costumeBonus = costumeId ? (costumeMap.get(costumeId) || 0) : 0
      const totalHourlyWage = baseHourlyWage + specialDayBonus + costumeBonus
      const wageAmount = Math.round(totalHourlyWage * workHours)

      const method = salesSettings.published_aggregation ?? 'item_based'
      const baseSales = baseSalesByCast.get(summary.cast_id) || 0
      const includeBaseInItem = salesSettings.include_base_in_item_sales ?? false
      const includeBaseInReceipt = salesSettings.include_base_in_receipt_sales ?? false

      statsToUpsert.push({
        cast_id: summary.cast_id,
        store_id: storeId,
        date: date,
        self_sales_item_based: (method === 'item_based' ? summary.self_sales : 0) + (includeBaseInItem ? baseSales : 0),
        help_sales_item_based: method === 'item_based' ? summary.help_sales : 0,
        total_sales_item_based: (method === 'item_based' ? summary.total_sales : 0) + (includeBaseInItem ? baseSales : 0),
        product_back_item_based: Math.round(summary.total_back),
        self_sales_receipt_based: (method === 'receipt_based' ? summary.self_sales : 0) + (includeBaseInReceipt ? baseSales : 0),
        help_sales_receipt_based: method === 'receipt_based' ? summary.help_sales : 0,
        total_sales_receipt_based: (method === 'receipt_based' ? summary.total_sales : 0) + (includeBaseInReceipt ? baseSales : 0),
        product_back_receipt_based: method === 'receipt_based' ? Math.round(summary.total_back) : 0,
        work_hours: workHours,
        base_hourly_wage: baseHourlyWage,
        special_day_bonus: specialDayBonus,
        costume_bonus: costumeBonus,
        total_hourly_wage: totalHourlyWage,
        wage_amount: wageAmount,
        costume_id: costumeId,
        wage_status_id: wageStatusId,
        nomination_count: nominationCountByCast.get(summary.cast_id) || 0,
        is_finalized: false,
        updated_at: new Date().toISOString()
      })
    }

    for (const [castName, attendance] of attendanceMap) {
      const cast = castMap.get(castName)
      if (!cast) continue
      if (finalizedCastIds.has(cast.id)) continue
      if (processedCastIds.has(cast.id)) continue

      if (attendance.check_in_datetime && attendance.check_out_datetime) {
        const compSettings = compSettingsMap.get(cast.id)
        const workHours = calculateWorkHours(attendance.check_in_datetime, attendance.check_out_datetime)
        const costumeId = attendance.costume_id || null
        const wageStatusId = compSettings?.status_id || null

        let baseHourlyWage = 0
        if (compSettings?.hourly_wage_override) {
          baseHourlyWage = compSettings.hourly_wage_override
        } else if (wageStatusId) {
          const wageStatus = wageStatusMap.get(wageStatusId)
          baseHourlyWage = wageStatus?.hourly_wage || 0
        }

        const costumeBonus = costumeId ? (costumeMap.get(costumeId) || 0) : 0
        const totalHourlyWage = baseHourlyWage + specialDayBonus + costumeBonus
        const wageAmount = Math.round(totalHourlyWage * workHours)

        const baseSales = baseSalesByCast.get(cast.id) || 0
        const includeBaseInItem = salesSettings.include_base_in_item_sales ?? false
        const includeBaseInReceipt = salesSettings.include_base_in_receipt_sales ?? false

        statsToUpsert.push({
          cast_id: cast.id,
          store_id: storeId,
          date: date,
          self_sales_item_based: includeBaseInItem ? baseSales : 0,
          help_sales_item_based: 0,
          total_sales_item_based: includeBaseInItem ? baseSales : 0,
          product_back_item_based: 0,
          self_sales_receipt_based: includeBaseInReceipt ? baseSales : 0,
          help_sales_receipt_based: 0,
          total_sales_receipt_based: includeBaseInReceipt ? baseSales : 0,
          product_back_receipt_based: 0,
          work_hours: workHours,
          base_hourly_wage: baseHourlyWage,
          special_day_bonus: specialDayBonus,
          costume_bonus: costumeBonus,
          total_hourly_wage: totalHourlyWage,
          wage_amount: wageAmount,
          costume_id: costumeId,
          wage_status_id: wageStatusId,
          nomination_count: nominationCountByCast.get(cast.id) || 0,
          is_finalized: false,
          updated_at: new Date().toISOString()
        })
        processedCastIds.add(cast.id)
      }
    }

    const includeBaseInItem = salesSettings.include_base_in_item_sales ?? false
    const includeBaseInReceipt = salesSettings.include_base_in_receipt_sales ?? false

    for (const [castId, baseSales] of baseSalesByCast) {
      if (processedCastIds.has(castId)) continue
      if (finalizedCastIds.has(castId)) continue

      statsToUpsert.push({
        cast_id: castId,
        store_id: storeId,
        date: date,
        self_sales_item_based: includeBaseInItem ? baseSales : 0,
        help_sales_item_based: 0,
        total_sales_item_based: includeBaseInItem ? baseSales : 0,
        product_back_item_based: 0,
        self_sales_receipt_based: includeBaseInReceipt ? baseSales : 0,
        help_sales_receipt_based: 0,
        total_sales_receipt_based: includeBaseInReceipt ? baseSales : 0,
        product_back_receipt_based: 0,
        work_hours: 0,
        base_hourly_wage: 0,
        special_day_bonus: 0,
        costume_bonus: 0,
        total_hourly_wage: 0,
        wage_amount: 0,
        costume_id: null,
        wage_status_id: null,
        nomination_count: nominationCountByCast.get(castId) || 0,
        is_finalized: false,
        updated_at: new Date().toISOString()
      })
    }

    if (statsToUpsert.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('cast_daily_stats')
        .upsert(statsToUpsert, {
          onConflict: 'cast_id,store_id,date'
        })

      if (upsertError) throw upsertError
    }

    const dailyItems = aggregateCastDailyItems(typedOrders, castMap, storeId, date, salesSettings, taxRate, productNeedsCastMap)

    const baseItemsMap = new Map<string, CastDailyItemData>()
    for (const order of baseOrders || []) {
      if (!order.cast_id || !order.product_name) continue
      const key = `${order.cast_id}:${order.product_name}`
      const amount = order.actual_price * order.quantity
      if (baseItemsMap.has(key)) {
        const existing = baseItemsMap.get(key)!
        existing.quantity += order.quantity
        existing.self_sales += amount
        existing.subtotal += amount
      } else {
        baseItemsMap.set(key, {
          cast_id: order.cast_id,
          help_cast_id: null,
          store_id: storeId,
          date: date,
          order_id: null,
          table_number: null,
          guest_name: null,
          category: 'BASE',
          product_name: order.product_name,
          quantity: order.quantity,
          self_sales: amount,
          help_sales: 0,
          needs_cast: true,
          subtotal: amount,
          self_back_rate: 0,
          self_back_amount: 0,
          help_back_rate: 0,
          help_back_amount: 0,
          is_self: true,
          self_sales_item_based: amount,
          self_sales_receipt_based: amount
        })
      }
    }
    const baseItems = Array.from(baseItemsMap.values())

    const allDailyItems = [...dailyItems, ...baseItems]

    // バック率・バック額を計算
    calculateBackRatesAndAmounts(allDailyItems, typedCastBackRates)

    if (allDailyItems.length > 0) {
      const itemsToUpsert = allDailyItems.filter(item => !finalizedCastIds.has(item.cast_id))
      if (itemsToUpsert.length > 0) {
        const castIdsToUpdate = [...new Set(itemsToUpsert.map(i => i.cast_id))]

        const { error: deleteError } = await supabaseAdmin
          .from('cast_daily_items')
          .delete()
          .eq('store_id', storeId)
          .eq('date', date)
          .in('cast_id', castIdsToUpdate)

        if (deleteError) {
          console.error('cast_daily_items delete error:', deleteError)
        }

        const { error: itemsError } = await supabaseAdmin
          .from('cast_daily_items')
          .insert(itemsToUpsert)

        if (itemsError) {
          console.error('cast_daily_items insert error:', itemsError)
          return { success: false, castsProcessed: statsToUpsert.length, itemsProcessed: 0, error: `cast_daily_items insert error: ${itemsError.message}` }
        }
      }
    }

    const unprocessedBaseOrders = (baseOrders || []).filter(o => !o.is_processed)
    if (unprocessedBaseOrders.length > 0) {
      const baseOrderIds = unprocessedBaseOrders.map(o => o.id)
      const { error: baseUpdateError } = await supabaseAdmin
        .from('base_orders')
        .update({ is_processed: true })
        .in('id', baseOrderIds)

      if (baseUpdateError) {
        console.error('BASE orders update error:', baseUpdateError)
      }
    }

    return { success: true, castsProcessed: statsToUpsert.length, itemsProcessed: allDailyItems.length }
  } catch (error) {
    console.error('Recalculate error:', error)
    return { success: false, castsProcessed: 0, error: String(error) }
  }
}
