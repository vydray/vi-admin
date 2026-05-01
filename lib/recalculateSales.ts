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
  priority: number
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

// compensation_settingsの型（help_back_calculation_method用）
interface CompensationType {
  id: string
  name: string
  is_enabled: boolean
  help_back_calculation_method?: string
  use_help_product_back?: boolean
}

interface CompensationSettingsFull {
  cast_id: number
  selected_compensation_type_id: string | null
  compensation_types: CompensationType[] | null
  help_back_calculation_method?: string
  use_help_product_back?: boolean
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

  // 診断ログ: 売上計算で使われている設定値を確認するため
  console.log(`[aggregateCastDailyItems] store=${storeId} date=${date} method=${method} isItemBased=${isItemBased} helpDistMethod=${helpDistMethod} helpRatio=${helpRatio} giveHelpSales=${giveHelpSales} item_help_distribution_method=${salesSettings.item_help_distribution_method} item_help_ratio=${salesSettings.item_help_ratio} item_help_sales_inclusion=${salesSettings.item_help_sales_inclusion}`)

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

    // フリー卓（推しなし）でもorder_itemsにcast_nameがあれば処理する
    const isFreeTabe = realNominations.length === 0

    if (isFreeTabe) {
      // フリー卓の場合：cast_nameが割り当てられたアイテムはヘルプとして扱う
      // 商品バックは付くが、売上（推し小計・伝票小計）には含めない
      for (const item of order.order_items || []) {
        const castsOnItem = item.cast_name || []
        const realCastsOnItem = castsOnItem.filter(c => !nonHelpNames.includes(c))
        if (realCastsOnItem.length === 0) continue  // チャージなどcast_name無しはスキップ

        const rawAmount = (item.unit_price || 0) * (item.quantity || 0)
        const itemAmount = applyTaxAndRounding(rawAmount)
        const adjustedSubtotal = applyTaxAndRounding(item.subtotal)
        const perCast = Math.floor(itemAmount / realCastsOnItem.length)

        for (const castName of realCastsOnItem) {
          const cast = castMap.get(castName)
          if (!cast) continue

          // フリー卓用のキー（ヘルプとして区別）
          const key = `${order.id}:${cast.id}:${cast.id}:${item.product_name}:${item.category || ''}:free_help`
          if (itemsMap.has(key)) {
            const existing = itemsMap.get(key)!
            existing.quantity += item.quantity
            existing.help_sales += perCast  // ヘルプ売上として加算
            existing.subtotal += adjustedSubtotal
          } else {
            itemsMap.set(key, {
              cast_id: cast.id,
              help_cast_id: cast.id,  // 同じキャスト（ヘルプとして自分を記録）
              store_id: storeId,
              date: date,
              order_id: order.id,
              table_number: order.table_number,
              guest_name: order.guest_name,
              category: item.category,
              product_name: item.product_name,
              quantity: item.quantity,
              self_sales: 0,
              help_sales: perCast,  // ヘルプ売上として設定
              needs_cast: productNeedsCastMap.get(item.product_name) ?? true,
              subtotal: adjustedSubtotal,
              self_back_rate: 0,
              self_back_amount: 0,
              help_back_rate: 0,
              help_back_amount: 0,
              is_self: false,  // ヘルプとして扱う
              self_sales_item_based: 0,  // 売上には含めない
              self_sales_receipt_based: 0  // 売上には含めない
            })
          }
        }
      }
      continue
    }

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
    // フリー卓マーカー（-1）の場合は売上0にする（商品バックのみ）
    if (item.self_sales_item_based === -1) {
      item.self_sales_item_based = 0
      item.self_sales_receipt_based = 0
      continue
    }
    // フリー卓のヘルプアイテム（cast_id === help_cast_id）は売上に含めない（商品バックのみ）
    if (item.cast_id === item.help_cast_id && !item.is_self) {
      item.self_sales_item_based = 0
      item.self_sales_receipt_based = 0
      continue
    }
    // item_based: needs_cast=true かつ キャストが割り当てられている商品のみ売上計上
    item.self_sales_item_based = item.needs_cast ? item.self_sales : 0
    // receipt_based: 伝票上の全商品を売上計上
    // キャストが割り当てられている場合はself_sales、そうでなければsubtotalを使用
    // （例：セットなどneeds_cast=trueでもキャスト未割当の場合はsubtotalで計上）
    item.self_sales_receipt_based = item.self_sales > 0 ? item.self_sales : item.subtotal
  }

  return items
}

// ヘルプキャストのhelp_back_calculation_methodを取得
function getHelpBackCalculationMethod(
  compSettings: CompensationSettingsFull | undefined
): string {
  if (!compSettings) return 'sales_based'

  // selected_compensation_type_idがある場合、該当する報酬形態から取得
  if (compSettings.selected_compensation_type_id && compSettings.compensation_types) {
    const selectedType = compSettings.compensation_types.find(
      t => t.id === compSettings.selected_compensation_type_id
    )
    if (selectedType?.help_back_calculation_method) {
      return selectedType.help_back_calculation_method
    }
  }

  // 選択されていない場合、最初の有効な報酬形態から取得
  if (compSettings.compensation_types) {
    const enabledType = compSettings.compensation_types.find(t => t.is_enabled)
    if (enabledType?.help_back_calculation_method) {
      return enabledType.help_back_calculation_method
    }
  }

  // compensation_settingsのトップレベルに設定がある場合
  if (compSettings.help_back_calculation_method) {
    return compSettings.help_back_calculation_method
  }

  return 'sales_based'
}

// cast_back_ratesからバック率・バック額を計算して設定
function calculateBackRatesAndAmounts(
  items: CastDailyItemData[],
  castBackRates: CastBackRate[],
  compensationSettingsMap: Map<number, CompensationSettingsFull>
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

        // ヘルプキャストのcompensation_settingsからhelp_back_calculation_methodを取得
        const helpCompSettings = compensationSettingsMap.get(item.help_cast_id)
        let helpBackCalcMethod = getHelpBackCalculationMethod(helpCompSettings)

        // フリー卓の場合（cast_id === help_cast_id）は強制的にsales_based方式を使用
        // （推しがいないため、distributed_amountでは計算できない）
        if (item.cast_id === item.help_cast_id) {
          helpBackCalcMethod = 'sales_based'
        }

        // help_back_calculation_methodに基づいてベース金額を決定
        let baseAmount: number
        switch (helpBackCalcMethod) {
          case 'full_amount':
            // 商品の小計金額をベースに計算
            baseAmount = item.subtotal || 0
            break
          case 'distributed_amount':
            // 推し売上（分配後）をベースに計算
            baseAmount = item.self_sales || 0
            break
          case 'sales_based':
          default:
            // ヘルプ売上をベースに計算
            baseAmount = item.help_sales || 0
            break
        }

        item.help_back_amount = Math.floor(baseAmount * item.help_back_rate / 100)
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

    // ページネーションで1000件制限を回避
    let orders: unknown[] = []
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
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1)
        if (pageError) throw pageError
        if (!page || page.length === 0) break
        orders = orders.concat(page)
        if (page.length < pageSize) break
        offset += pageSize
      }
    }

    const typedOrders = orders as unknown as OrderWithStaff[]

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

    // バック率取得（デフォルトの1000件制限を回避するためページネーション）
    let allCastBackRates: CastBackRate[] = []
    let page = 0
    const pageSize = 1000
    while (true) {
      const { data: castBackRatesPage } = await supabaseAdmin
        .from('cast_back_rates')
        .select('cast_id, product_name, self_back_ratio, help_back_ratio')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .range(page * pageSize, (page + 1) * pageSize - 1)

      if (!castBackRatesPage || castBackRatesPage.length === 0) break
      allCastBackRates = allCastBackRates.concat(castBackRatesPage as CastBackRate[])
      if (castBackRatesPage.length < pageSize) break
      page++
    }

    const typedCastBackRates = allCastBackRates

    const { data: attendances } = await supabaseAdmin
      .from('attendance')
      .select('cast_name, check_in_datetime, check_out_datetime, costume_id')
      .eq('store_id', storeId)
      .eq('date', date)

    const attendanceMap = new Map<string, Attendance>()
    attendances?.forEach((a: Attendance) => attendanceMap.set(a.cast_name, a))

    // 対象日から年月を取得
    const targetDate = new Date(date)
    const targetYear = targetDate.getFullYear()
    const targetMonth = targetDate.getMonth() + 1

    const { data: compensationSettings } = await supabaseAdmin
      .from('compensation_settings')
      .select('cast_id, status_id, hourly_wage_override, selected_compensation_type_id, compensation_types, help_back_calculation_method, use_help_product_back, target_year, target_month')
      .eq('store_id', storeId)
      .eq('is_active', true)

    // キャストごとに最適な設定を選択（フォールバックロジック）
    const compSettingsMap = new Map<number, CompensationSettingsWage>()
    const compSettingsFullMap = new Map<number, CompensationSettingsFull>()

    // キャストIDでグループ化
    const settingsByCast = new Map<number, (CompensationSettingsWage & CompensationSettingsFull & { target_year: number | null; target_month: number | null })[]>()
    compensationSettings?.forEach((c: CompensationSettingsWage & CompensationSettingsFull & { target_year: number | null; target_month: number | null }) => {
      const existing = settingsByCast.get(c.cast_id) || []
      existing.push(c)
      settingsByCast.set(c.cast_id, existing)
    })

    // 各キャストの最適な設定を選択
    settingsByCast.forEach((settings, castId) => {
      let selected: (CompensationSettingsWage & CompensationSettingsFull) | undefined

      // 1. 完全一致（対象年月）
      selected = settings.find(
        s => s.target_year === targetYear && s.target_month === targetMonth
      )

      // 2. 直近の過去設定（対象月以前で最も新しいもの）
      if (!selected) {
        selected = settings
          .filter(s => s.target_year !== null && s.target_month !== null)
          .filter(s => {
            if (s.target_year! < targetYear) return true
            if (s.target_year! === targetYear && s.target_month! <= targetMonth) return true
            return false
          })
          .sort((a, b) => {
            if (a.target_year !== b.target_year) return (b.target_year || 0) - (a.target_year || 0)
            return (b.target_month || 0) - (a.target_month || 0)
          })[0]
      }

      // 3. デフォルト設定（年月指定なし）
      if (!selected) {
        selected = settings.find(s => s.target_year === null && s.target_month === null)
      }

      // 4. 最終フォールバック（最新の設定）
      if (!selected && settings.length > 0) {
        selected = settings
          .filter(s => s.target_year !== null)
          .sort((a, b) => {
            if (a.target_year !== b.target_year) return (b.target_year || 0) - (a.target_year || 0)
            return (b.target_month || 0) - (a.target_month || 0)
          })[0] || settings[0]
      }

      if (selected) {
        compSettingsMap.set(castId, selected)
        compSettingsFullMap.set(castId, selected)
      }
    })

    const { data: wageStatuses } = await supabaseAdmin
      .from('wage_statuses')
      .select('id, hourly_wage, priority')
      .eq('store_id', storeId)
      .eq('is_active', true)

    const wageStatusMap = new Map<number, WageStatus>()
    wageStatuses?.forEach((s: WageStatus) => wageStatusMap.set(s.id, s))

    // 累計出勤日数ベースの時給判定用データを取得
    const { data: allProgress } = await supabaseAdmin
      .from('cast_status_progress')
      .select('cast_id, current_status_id, status_start_date')
      .eq('store_id', storeId)

    const progressMap = new Map<number, { current_status_id: number | null, status_start_date: string }>()
    allProgress?.forEach((p: { cast_id: number; current_status_id: number | null; status_start_date: string }) => progressMap.set(p.cast_id, p))

    // 昇格条件（累計出勤日数）を取得
    const { data: promotionConditions } = await supabaseAdmin
      .from('wage_status_conditions')
      .select('status_id, value')
      .eq('condition_direction', 'promotion')
      .eq('condition_type', 'cumulative_attendance_days')
      .eq('operator', '>=')

    // status_id → 昇格閾値
    const promotionThresholdMap = new Map<number, number>()
    promotionConditions?.forEach((c: { status_id: number; value: number }) => promotionThresholdMap.set(c.status_id, c.value))

    // 次のステータス（昇格先）・前のステータス（降格先）マップ
    const statusByPriority = (wageStatuses || [])
      .map((s: WageStatus) => ({ ...s }))
      .sort((a: WageStatus, b: WageStatus) => a.priority - b.priority)
    const nextStatusMap = new Map<number, number>()
    const prevStatusMap = new Map<number, number>()
    for (let i = 0; i < statusByPriority.length; i++) {
      if (i < statusByPriority.length - 1) nextStatusMap.set(statusByPriority[i].id, statusByPriority[i + 1].id)
      if (i > 0) prevStatusMap.set(statusByPriority[i].id, statusByPriority[i - 1].id)
    }

    // 見習い（昇格条件あり）のキャストの累計出勤日数を取得
    const castsNeedingCumulativeCheck = new Map<number, string>() // cast_id → start_date
    for (const [castId, compSettings] of compSettingsMap) {
      const statusId = compSettings.status_id
      if (!statusId || compSettings.hourly_wage_override) continue
      if (promotionThresholdMap.has(statusId)) {
        const progress = progressMap.get(castId)
        if (progress?.status_start_date && progress.status_start_date <= date) {
          castsNeedingCumulativeCheck.set(castId, progress.status_start_date)
        }
      }
    }

    // 昇格済みキャストで、対象日がstatus_start_dateより前のキャストを特定
    const castsBeforePromotion = new Set<number>()
    for (const [castId, compSettings] of compSettingsMap) {
      const statusId = compSettings.status_id
      if (!statusId || compSettings.hourly_wage_override) continue
      const progress = progressMap.get(castId)
      if (progress && progress.status_start_date > date && !promotionThresholdMap.has(statusId)) {
        castsBeforePromotion.add(castId)
      }
    }

    // 累計出勤日数を一括取得（attendanceテーブルはcast_nameベース）
    const cumulativeCountMap = new Map<number, number>()
    if (castsNeedingCumulativeCheck.size > 0) {
      // cast_id → cast_name の変換
      const castIdToName = new Map<number, string>()
      castMap.forEach((cast, name) => castIdToName.set(cast.id, name))

      const castNames = [...castsNeedingCumulativeCheck.keys()]
        .map(id => castIdToName.get(id))
        .filter((n): n is string => !!n)
      const minStartDate = [...castsNeedingCumulativeCheck.values()].sort()[0]

      // Supabaseデフォルト上限(1000行)を超える可能性があるため、ページネーションで取得
      let attendanceForCumulative: { cast_name: string; date: string }[] = []
      {
        let offset = 0
        const pageSize = 1000
        while (true) {
          const { data: page } = await supabaseAdmin
            .from('attendance')
            .select('cast_name, date')
            .eq('store_id', storeId)
            .in('cast_name', castNames)
            .gte('date', minStartDate)
            .lte('date', date)
            .not('status_id', 'is', null)
            .range(offset, offset + pageSize - 1)
          if (!page || page.length === 0) break
          attendanceForCumulative = attendanceForCumulative.concat(page)
          if (page.length < pageSize) break
          offset += pageSize
        }
      }

      for (const [castId, startDate] of castsNeedingCumulativeCheck) {
        const castName = castIdToName.get(castId)
        if (!castName) continue
        const count = attendanceForCumulative?.filter(
          (a: { cast_name: string; date: string }) => a.cast_name === castName && a.date >= startDate && a.date <= date
        ).length || 0
        cumulativeCountMap.set(castId, count)
      }
    }

    const { data: specialDay } = await supabaseAdmin
      .from('special_wage_days')
      .select('wage_adjustment')
      .eq('store_id', storeId)
      .eq('date', date)
      .eq('is_active', true)
      .single()

    const specialDayBonus = (specialDay as SpecialWageDay | null)?.wage_adjustment || 0

    const { data: costumes } = await supabaseAdmin
      .from('uniforms')
      .select('id, wage_adjustment, class_label')
      .eq('store_id', storeId)
      .eq('is_active', true)

    const costumeMap = new Map<number, number>()
    const costumeClassMap = new Map<number, string | null>()
    costumes?.forEach((c: { id: number; wage_adjustment: number | null; class_label: string | null }) => {
      costumeMap.set(c.id, c.wage_adjustment ?? 0)
      costumeClassMap.set(c.id, c.class_label)
    })

    // 売上連動時給 / 保証時給のみ を使うキャスト判定
    // selected_compensation_type_id（または最初の有効な型）の wage モードを確認
    const uniformWageCastIds = new Set<number>()
    const guaranteedOnlyCastIds = new Set<number>()
    const uniformWageAggregationMap = new Map<number, 'item_based' | 'receipt_based'>()
    for (const [castId, compFull] of compSettingsFullMap) {
      const types = (compFull.compensation_types || []) as Array<{
        id: string
        is_enabled?: boolean
        use_uniform_based_wage?: boolean
        use_guaranteed_wage_only?: boolean
        sales_aggregation?: 'item_based' | 'receipt_based'
      }>
      const selectedId = compFull.selected_compensation_type_id
      const selected = selectedId ? types.find(t => t.id === selectedId) : types.find(t => t.is_enabled !== false)
      if (selected?.use_guaranteed_wage_only) {
        guaranteedOnlyCastIds.add(castId)
      } else if (selected?.use_uniform_based_wage) {
        uniformWageCastIds.add(castId)
        uniformWageAggregationMap.set(castId, selected.sales_aggregation === 'receipt_based' ? 'receipt_based' : 'item_based')
      }
    }

    // 売上連動時給ブラケット取得（売上連動キャストが1人でもいる場合のみ）
    const wageBrackets: { bracket_min: number; bracket_max: number | null; rates: Record<string, number> }[] = []
    if (uniformWageCastIds.size > 0) {
      const { data: brackets } = await supabaseAdmin
        .from('sales_based_wage_brackets')
        .select('bracket_min, bracket_max, rates, display_order')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
      brackets?.forEach((b: { bracket_min: number; bracket_max: number | null; rates: Record<string, number> }) => {
        wageBrackets.push({ bracket_min: b.bracket_min, bracket_max: b.bracket_max, rates: b.rates })
      })
    }

    // 保証時給対象キャスト（use_guaranteed_wage_only または use_uniform_based_wage）を統合管理
    const wageModeCastIds = new Set([...uniformWageCastIds, ...guaranteedOnlyCastIds])

    // 保証時給レート + 上限 + 超過後挙動 を取得（月間売上取得の前に必要）
    let guaranteedRates: Record<string, number> | null = null
    let guaranteedThresholdHours: number | null = null
    let guaranteedAfterMode: 'zero' | 'bracket' = 'zero'
    if (wageModeCastIds.size > 0) {
      const { data: storeWageSettings } = await supabaseAdmin
        .from('store_wage_settings')
        .select('guaranteed_wage_threshold_hours, guaranteed_wage_rates, guaranteed_wage_after_threshold')
        .eq('store_id', storeId)
        .maybeSingle()
      if (storeWageSettings?.guaranteed_wage_rates) {
        guaranteedRates = storeWageSettings.guaranteed_wage_rates as Record<string, number>
        guaranteedThresholdHours = storeWageSettings.guaranteed_wage_threshold_hours ?? null
        const afterCfg = storeWageSettings.guaranteed_wage_after_threshold as { mode?: string } | null
        guaranteedAfterMode = afterCfg?.mode === 'bracket' ? 'bracket' : 'zero'
      }
    }

    // 売上連動キャストの月累計売上を取得（cast_daily_stats を月初〜月末で集計）
    const monthlyTotalSalesMap = new Map<number, number>()
    // 保証時給のみキャストでも after_mode='bracket' なら月間売上が必要
    const needMonthlySales = uniformWageCastIds.size > 0 || (guaranteedOnlyCastIds.size > 0 && guaranteedAfterMode === 'bracket')
    if (needMonthlySales) {
      const monthStart = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`
      const nextMonth = targetMonth === 12 ? 1 : targetMonth + 1
      const nextYear = targetMonth === 12 ? targetYear + 1 : targetYear
      const monthEndExclusive = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

      // ページネーションで cast_daily_stats を取得（月内売上集計用）
      const castIdArr = [...wageModeCastIds]
      let allMonthStats: { cast_id: number; total_sales_item_based: number | null; total_sales_receipt_based: number | null }[] = []
      let offset = 0
      const pageSize = 1000
      while (true) {
        const { data: page } = await supabaseAdmin
          .from('cast_daily_stats')
          .select('cast_id, total_sales_item_based, total_sales_receipt_based')
          .eq('store_id', storeId)
          .in('cast_id', castIdArr)
          .gte('date', monthStart)
          .lt('date', monthEndExclusive)
          .range(offset, offset + pageSize - 1)
        if (!page || page.length === 0) break
        allMonthStats = allMonthStats.concat(page)
        if (page.length < pageSize) break
        offset += pageSize
      }

      for (const castId of castIdArr) {
        const aggMode = uniformWageAggregationMap.get(castId) || 'item_based'
        const sum = allMonthStats
          .filter(r => r.cast_id === castId)
          .reduce((acc, r) => acc + ((aggMode === 'receipt_based' ? r.total_sales_receipt_based : r.total_sales_item_based) || 0), 0)
        monthlyTotalSalesMap.set(castId, sum)
      }
    }

    // 保証時給のみキャストの当日より前の累計勤務時間（上限判定用）
    const cumulativeHoursBeforeMap = new Map<number, number>()
    if (guaranteedOnlyCastIds.size > 0 && guaranteedThresholdHours != null) {
      const castIdArr = [...guaranteedOnlyCastIds]
      let allHistoryHours: { cast_id: number; work_hours: number | null }[] = []
      let offset = 0
      const pageSize = 1000
      while (true) {
        const { data: page } = await supabaseAdmin
          .from('cast_daily_stats')
          .select('cast_id, work_hours')
          .eq('store_id', storeId)
          .in('cast_id', castIdArr)
          .lt('date', date)
          .range(offset, offset + pageSize - 1)
        if (!page || page.length === 0) break
        allHistoryHours = allHistoryHours.concat(page)
        if (page.length < pageSize) break
        offset += pageSize
      }
      for (const castId of castIdArr) {
        const sum = allHistoryHours
          .filter(r => r.cast_id === castId)
          .reduce((acc, r) => acc + Number(r.work_hours || 0), 0)
        cumulativeHoursBeforeMap.set(castId, sum)
      }
    }

    // 売上連動時給 / 保証時給のみ の wage計算ヘルパー
    // 設計: 「保証時給」と「売上連動時給」は完全に独立した報酬形態として比較される。
    //       売上連動時給の中で 100h以下は保証時給にフォールバック…という自動スライドはしない。
    //       保証時給を効かせたい場合は、別の報酬形態として「保証時給のみ」を設定し highest 比較する。
    // 戻り値: { rate: 表示用の実効時給, amount: 実際のwage_amount }
    const computeUniformWage = (castId: number, costumeId: number | null, workHours: number): { rate: number; amount: number } | null => {
      const isGuaranteedOnly = guaranteedOnlyCastIds.has(castId)
      const isUniformBased = uniformWageCastIds.has(castId)
      if (!isGuaranteedOnly && !isUniformBased) return null
      if (costumeId == null) return { rate: 0, amount: 0 }  // 衣装未選択
      const classLabel = costumeClassMap.get(costumeId)
      if (!classLabel) return { rate: 0, amount: 0 }

      // 保証時給のみモード: 保証レート × 時間（累計上限あり、上限超過分は after_mode で挙動切替）
      if (isGuaranteedOnly) {
        const guaranteedRate = guaranteedRates?.[classLabel] ?? 0

        // 上限なし → 全日保証レート
        if (guaranteedThresholdHours == null) {
          return { rate: guaranteedRate, amount: Math.round(guaranteedRate * workHours) }
        }

        // 上限超過後の代替レート（bracket モードならブラケット時給、zero モードなら 0）
        const computeAfterRate = (): number => {
          if (guaranteedAfterMode !== 'bracket') return 0
          const monthlyTotal = monthlyTotalSalesMap.get(castId) || 0
          const bracket = wageBrackets.find(b =>
            monthlyTotal >= b.bracket_min && (b.bracket_max == null || monthlyTotal < b.bracket_max)
          )
          return bracket?.rates[classLabel] ?? 0
        }

        const cumulativeBefore = cumulativeHoursBeforeMap.get(castId) || 0
        if (cumulativeBefore >= guaranteedThresholdHours) {
          // 既に上限到達済み → 全日 after レート
          const afterRate = computeAfterRate()
          return { rate: afterRate, amount: Math.round(afterRate * workHours) }
        }
        const cumulativeAfter = cumulativeBefore + workHours
        if (cumulativeAfter <= guaranteedThresholdHours) {
          // 当日終了時もまだ上限内 → 全日保証レート
          return { rate: guaranteedRate, amount: Math.round(guaranteedRate * workHours) }
        }
        // 境界日: 上限まで保証、超過分は after レート（zero or bracket）
        const guaranteedHours = guaranteedThresholdHours - cumulativeBefore
        const overHours = workHours - guaranteedHours
        const afterRate = computeAfterRate()
        const amount = Math.round(guaranteedRate * guaranteedHours + afterRate * overHours)
        const effectiveRate = workHours > 0 ? Math.round(amount / workHours) : 0
        return { rate: effectiveRate, amount }
      }

      // 売上連動時給モード: ブラケット時給のみ（保証時給フォールバックなし）
      const monthlyTotal = monthlyTotalSalesMap.get(castId) || 0
      const bracket = wageBrackets.find(b =>
        monthlyTotal >= b.bracket_min && (b.bracket_max == null || monthlyTotal < b.bracket_max)
      )
      const normalRate = bracket?.rates[classLabel] ?? 0
      return { rate: normalRate, amount: Math.round(normalRate * workHours) }
    }

    const { data: existingStats } = await supabaseAdmin
      .from('cast_daily_stats')
      .select('cast_id, is_finalized')
      .eq('store_id', storeId)
      .eq('date', date)

    const finalizedCastIds = new Set(
      existingStats?.filter((s: { is_finalized: boolean }) => s.is_finalized).map((s: { cast_id: number }) => s.cast_id) || []
    )

    const nominationCountByCast = new Map<number, number>()
    for (const order of typedOrders) {
      if (!order.staff_name || !order.guest_count) continue
      const cast = castMap.get(order.staff_name)
      if (cast) {
        const current = nominationCountByCast.get(cast.id) || 0
        nominationCountByCast.set(cast.id, current + order.guest_count)
      }
    }

    // 先にdailyItemsを作成（両方の売上フィールドを持つ）
    const dailyItems = aggregateCastDailyItems(typedOrders, castMap, storeId, date, salesSettings, taxRate, productNeedsCastMap)

    // BASE注文をdailyItemsに追加
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
        existing.self_sales_item_based += amount
        existing.self_sales_receipt_based += amount
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

    // バック率・バック額を計算（help_back_calculation_methodを考慮）
    calculateBackRatesAndAmounts(allDailyItems, typedCastBackRates, compSettingsFullMap)

    // キャストごとに売上を集計（両方の方式で計算）
    const castSalesMap = new Map<number, {
      self_sales_item_based: number
      help_sales_item_based: number
      self_sales_receipt_based: number
      help_sales_receipt_based: number
      product_back: number
    }>()

    for (const item of allDailyItems) {
      // 推し（cast_id）の自己売上・自己バックを加算
      const existing = castSalesMap.get(item.cast_id)
      if (existing) {
        existing.self_sales_item_based += item.self_sales_item_based
        existing.self_sales_receipt_based += item.self_sales_receipt_based
        existing.product_back += item.self_back_amount
      } else {
        castSalesMap.set(item.cast_id, {
          self_sales_item_based: item.self_sales_item_based,
          help_sales_item_based: 0,
          self_sales_receipt_based: item.self_sales_receipt_based,
          help_sales_receipt_based: 0,
          product_back: item.self_back_amount
        })
      }

      // ヘルプ（help_cast_id）の売上・バックを加算（推しの新規/既存に関わらず必ず実行）
      // 以前は `if (existing)` 分岐の中でしか加算していなかったため、
      // 推しの当日初アイテムにヘルプが紐付いていた場合にヘルプ売上が消失していた
      if (item.help_cast_id) {
        // フリー卓のヘルプ（cast_id === help_cast_id）は売上に含めない（商品バックのみ）
        const isFreeTableHelp = item.cast_id === item.help_cast_id && !item.is_self
        const helpSalesItem = isFreeTableHelp ? 0 : (item.needs_cast ? item.help_sales : 0)
        const helpSalesReceipt = isFreeTableHelp ? 0 : item.help_sales

        const helpExisting = castSalesMap.get(item.help_cast_id)
        if (helpExisting) {
          helpExisting.help_sales_item_based += helpSalesItem
          helpExisting.help_sales_receipt_based += helpSalesReceipt
          helpExisting.product_back += item.help_back_amount
        } else {
          castSalesMap.set(item.help_cast_id, {
            self_sales_item_based: 0,
            help_sales_item_based: helpSalesItem,
            self_sales_receipt_based: 0,
            help_sales_receipt_based: helpSalesReceipt,
            product_back: item.help_back_amount
          })
        }
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

    // キャストごとにstatsを作成
    for (const [castId, sales] of castSalesMap) {
      if (finalizedCastIds.has(castId)) continue
      processedCastIds.add(castId)

      const cast = [...castMap.values()].find(c => c.id === castId)
      if (!cast) continue

      const attendance = attendanceMap.get(cast.name)
      const compSettings = compSettingsMap.get(castId)
      const workHours = calculateWorkHours(attendance?.check_in_datetime || null, attendance?.check_out_datetime || null)
      const costumeId = attendance?.costume_id || null
      const wageStatusId = compSettings?.status_id || null

      // 売上連動時給キャストはブラケット引き(+保証時給)、それ以外は従来の累計出勤日数ベース判定
      const uniformWage = computeUniformWage(castId, costumeId, workHours)
      const baseHourlyWage = uniformWage !== null ? uniformWage.rate : resolveHourlyWage(
        castId, wageStatusId, compSettings, wageStatusMap,
        promotionThresholdMap, nextStatusMap, prevStatusMap,
        cumulativeCountMap, castsBeforePromotion, progressMap
      )

      // 売上連動時給時は costume_bonus を加算しない（ブラケット時給がそのまま時給）
      const costumeBonus = uniformWage !== null ? 0 : (costumeId ? (costumeMap.get(costumeId) || 0) : 0)
      const totalHourlyWage = baseHourlyWage + specialDayBonus + costumeBonus
      // 売上連動時給(+保証時給)は分割計算済みの amount を使用、それ以外は従来通り
      const wageAmount = uniformWage !== null
        ? uniformWage.amount + Math.round(specialDayBonus * workHours)
        : Math.round(totalHourlyWage * workHours)

      statsToUpsert.push({
        cast_id: castId,
        store_id: storeId,
        date: date,
        self_sales_item_based: sales.self_sales_item_based,
        help_sales_item_based: sales.help_sales_item_based,
        total_sales_item_based: sales.self_sales_item_based + sales.help_sales_item_based,
        product_back_item_based: Math.round(sales.product_back),
        self_sales_receipt_based: sales.self_sales_receipt_based,
        help_sales_receipt_based: sales.help_sales_receipt_based,
        total_sales_receipt_based: sales.self_sales_receipt_based + sales.help_sales_receipt_based,
        product_back_receipt_based: Math.round(sales.product_back),
        work_hours: workHours,
        base_hourly_wage: baseHourlyWage,
        special_day_bonus: specialDayBonus,
        costume_bonus: costumeBonus,
        total_hourly_wage: totalHourlyWage,
        wage_amount: wageAmount,
        costume_id: costumeId,
        wage_status_id: wageStatusId,
        nomination_count: nominationCountByCast.get(castId) || 0,
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

        // 売上連動時給キャストはブラケット引き(+保証時給)、それ以外は従来の累計出勤日数ベース判定
        const uniformWage = computeUniformWage(cast.id, costumeId, workHours)
        const baseHourlyWage = uniformWage !== null ? uniformWage.rate : resolveHourlyWage(
          cast.id, wageStatusId, compSettings, wageStatusMap,
          promotionThresholdMap, nextStatusMap, prevStatusMap,
          cumulativeCountMap, castsBeforePromotion, progressMap
        )

        const costumeBonus = uniformWage !== null ? 0 : (costumeId ? (costumeMap.get(costumeId) || 0) : 0)
        const totalHourlyWage = baseHourlyWage + specialDayBonus + costumeBonus
        const wageAmount = uniformWage !== null
          ? uniformWage.amount + Math.round(specialDayBonus * workHours)
          : Math.round(totalHourlyWage * workHours)

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

    // 未処理の既存stats（出勤→公欠変更等）をゼロリセット
    const unprocessedExisting = (existingStats || []).filter(
      (s: { cast_id: number; is_finalized: boolean }) =>
        !s.is_finalized && !processedCastIds.has(s.cast_id)
    )
    for (const stat of unprocessedExisting) {
      statsToUpsert.push({
        cast_id: stat.cast_id,
        store_id: storeId,
        date: date,
        self_sales_item_based: 0,
        help_sales_item_based: 0,
        total_sales_item_based: 0,
        product_back_item_based: 0,
        self_sales_receipt_based: 0,
        help_sales_receipt_based: 0,
        total_sales_receipt_based: 0,
        product_back_receipt_based: 0,
        work_hours: 0,
        base_hourly_wage: 0,
        special_day_bonus: 0,
        costume_bonus: 0,
        total_hourly_wage: 0,
        wage_amount: 0,
        costume_id: null,
        wage_status_id: null,
        nomination_count: 0,
        is_finalized: false,
        updated_at: new Date().toISOString()
      })
    }

    if (statsToUpsert.length > 0) {
      // FK防御: costumes/wage_statusesに存在しないIDはnullに置換（attendance生データには影響しない）
      for (const stat of statsToUpsert) {
        if (stat.costume_id != null && !costumeMap.has(stat.costume_id)) {
          stat.costume_id = null
          stat.costume_bonus = 0
          stat.total_hourly_wage = stat.base_hourly_wage + stat.special_day_bonus
          stat.wage_amount = Math.round(stat.total_hourly_wage * stat.work_hours)
        }
        if (stat.wage_status_id != null && !wageStatusMap.has(stat.wage_status_id)) {
          stat.wage_status_id = null
        }
      }

      const { error: upsertError } = await supabaseAdmin
        .from('cast_daily_stats')
        .upsert(statsToUpsert, {
          onConflict: 'cast_id,store_id,date'
        })

      if (upsertError) throw upsertError
    }

    // 未処理キャストのcast_daily_itemsも削除
    if (unprocessedExisting.length > 0) {
      const unprocessedCastIds = unprocessedExisting.map((s: { cast_id: number }) => s.cast_id)
      await supabaseAdmin
        .from('cast_daily_items')
        .delete()
        .eq('store_id', storeId)
        .eq('date', date)
        .in('cast_id', unprocessedCastIds)
    }

    // cast_daily_itemsの保存
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

/**
 * 累計出勤日数ベースの時給判定
 * - 見習いステータス（昇格条件あり）: 累計出勤日数が閾値を超えたら昇格先の時給を使用
 * - 昇格済みステータス: status_start_dateより前の日付なら前のステータスの時給を使用
 */
function resolveHourlyWage(
  castId: number,
  wageStatusId: number | null,
  compSettings: CompensationSettingsWage | undefined,
  wageStatusMap: Map<number, WageStatus>,
  promotionThresholdMap: Map<number, number>,
  nextStatusMap: Map<number, number>,
  prevStatusMap: Map<number, number>,
  cumulativeCountMap: Map<number, number>,
  castsBeforePromotion: Set<number>,
  progressMap: Map<number, { current_status_id: number | null; status_start_date: string }>
): number {
  if (compSettings?.hourly_wage_override) {
    return compSettings.hourly_wage_override
  }

  if (!wageStatusId) return 0

  // 見習いステータス（昇格条件あり）の場合
  const promotionThreshold = promotionThresholdMap.get(wageStatusId)
  if (promotionThreshold !== undefined) {
    const cumulativeDays = cumulativeCountMap.get(castId) || 0
    // 閾値を超えたら昇格先の時給（例: 16日目以降は1400円）
    if (cumulativeDays > promotionThreshold) {
      const nextStatusId = nextStatusMap.get(wageStatusId)
      if (nextStatusId) {
        return wageStatusMap.get(nextStatusId)?.hourly_wage || 0
      }
    }
    return wageStatusMap.get(wageStatusId)?.hourly_wage || 0
  }

  // 昇格済みだが対象日が昇格前の場合、前のステータスの時給を使用
  if (castsBeforePromotion.has(castId)) {
    const prevStatusId = prevStatusMap.get(wageStatusId)
    if (prevStatusId) {
      return wageStatusMap.get(prevStatusId)?.hourly_wage || 0
    }
  }

  return wageStatusMap.get(wageStatusId)?.hourly_wage || 0
}
