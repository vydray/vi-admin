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
 * 端数処理を適用（レガシー）
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
 * 端数処理を適用（新形式: position + type）
 */
export function applyRoundingNew(
  amount: number,
  position: number,
  type: 'floor' | 'ceil' | 'round' | 'none'
): number {
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

/**
 * RoundingMethodをposition+typeに変換
 */
function parseRoundingMethod(method: RoundingMethod): { position: number; type: 'floor' | 'ceil' | 'round' | 'none' } {
  switch (method) {
    case 'floor_100':
      return { position: 100, type: 'floor' }
    case 'floor_10':
      return { position: 10, type: 'floor' }
    case 'floor_1':
      return { position: 1, type: 'floor' }
    case 'ceil_100':
      return { position: 100, type: 'ceil' }
    case 'ceil_10':
      return { position: 10, type: 'ceil' }
    case 'ceil_1':
      return { position: 1, type: 'ceil' }
    case 'round':
      return { position: 1, type: 'round' }
    case 'none':
    default:
      return { position: 1, type: 'none' }
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
 * 推し小計（item_based）の計算
 * - 各商品ごとにキャストへ売上を分配
 * - 商品についているキャストに売上が入る
 */
export function calculateItemBased(
  orders: OrderWithStaff[],
  casts: CastInfo[],
  settings: SalesSettings,
  nominations: string[], // その日の推し（通常はorder.staff_name）
  taxRate: number = 0.1,
  serviceRate: number = 0
): CastSalesSummary[] {
  const castNameMap = new Map(casts.map(c => [c.name, c]))
  const summaryMap = new Map<number, CastSalesSummary>()
  const nonHelpNames = settings.non_help_staff_names || []

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

  // 設定を取得
  const excludeTax = settings.item_exclude_consumption_tax ?? settings.use_tax_excluded ?? false
  const { position: roundingPosition, type: roundingType } = parseRoundingMethod(settings.item_rounding_method)
  const roundingTiming = settings.item_rounding_timing ?? 'per_item'
  const helpDistMethod = settings.item_help_distribution_method ?? 'all_to_nomination'
  const includeHelpItems = settings.item_help_sales_inclusion === 'both'
  const giveHelpSales = includeHelpItems

  // 税計算・端数処理を適用する関数
  const applyTaxAndRounding = (amount: number) => {
    let result = amount
    if (excludeTax) {
      const taxPercent = Math.round(taxRate * 100)
      result = Math.floor(result * 100 / (100 + taxPercent))
    }
    return applyRoundingNew(result, roundingPosition, roundingType)
  }

  // 各オーダーの商品を処理
  orders.forEach(order => {
    const orderNominations = order.staff_name ? [order.staff_name] : []
    const allNominations = [...new Set([...orderNominations, ...nominations])]

    // ヘルプ除外名を推しから除外（実在キャストの推しのみ残す）
    const realNominations = allNominations.filter(n => !nonHelpNames.includes(n))
    // 推しがヘルプ除外名のみの場合（フリーなど）
    const nominationIsNonHelpOnly = allNominations.length > 0 && realNominations.length === 0

    order.order_items.forEach(item => {
      if (!item.cast_name) return // キャスト紐付けなしはスキップ

      const castsOnItem = item.cast_name ? [item.cast_name] : []
      if (castsOnItem.length === 0) return

      // SELF/HELP判定
      // nominationIsNonHelpOnlyの場合は、商品についてる実キャスト全員がSELF
      // ※nonHelpNames自体は売上対象外（SELFにもHELPにも含めない）
      const realCastsOnItem = castsOnItem.filter(c => !nonHelpNames.includes(c))

      const selfCasts = nominationIsNonHelpOnly
        ? realCastsOnItem // フリー推しの場合は商品の実キャスト全員がSELF
        : realCastsOnItem.filter(c => realNominations.includes(c))
      const helpCasts = nominationIsNonHelpOnly
        ? [] // フリー推しの場合はヘルプなし
        : realCastsOnItem.filter(c => !realNominations.includes(c))

      const isSelfOnly = selfCasts.length > 0 && helpCasts.length === 0
      const isHelpOnly = helpCasts.length > 0 && selfCasts.length === 0
      const isMixed = selfCasts.length > 0 && helpCasts.length > 0

      // 商品金額
      let itemAmount = item.unit_price * item.quantity

      // 商品ごとのタイミングの場合、税計算と端数処理を適用
      if (roundingTiming === 'per_item') {
        itemAmount = applyTaxAndRounding(itemAmount)
      }

      // 売上分配
      if (isSelfOnly) {
        // SELF商品 → 商品のキャストに全額
        selfCasts.forEach(castName => {
          const cast = castNameMap.get(castName)
          if (cast) {
            const summary = summaryMap.get(cast.id)
            if (summary) {
              const amount = Math.floor(itemAmount / selfCasts.length)
              summary.self_sales += amount
            }
          }
        })
      } else if (isHelpOnly) {
        // HELP商品
        if (includeHelpItems) {
          // ヘルプも含める → 分配方法による
          if (helpDistMethod === 'all_to_nomination') {
            // 全額推しに → 何もしない（推しが商品にいないので）
          } else {
            // ヘルプにも分配
            if (giveHelpSales) {
              helpCasts.forEach(castName => {
                const cast = castNameMap.get(castName)
                if (cast) {
                  const summary = summaryMap.get(cast.id)
                  if (summary) {
                    const amount = Math.floor(itemAmount / helpCasts.length)
                    summary.help_sales += amount
                  }
                }
              })
            }
          }
        }
        // 含めない場合は何もしない
      } else if (isMixed) {
        // 混在
        if (helpDistMethod === 'all_to_nomination') {
          // 全額推しに
          selfCasts.forEach(castName => {
            const cast = castNameMap.get(castName)
            if (cast) {
              const summary = summaryMap.get(cast.id)
              if (summary) {
                const amount = Math.floor(itemAmount / selfCasts.length)
                summary.self_sales += amount
              }
            }
          })
        } else if (helpDistMethod === 'equal') {
          // 推しとヘルプで50:50
          const selfShare = Math.floor(itemAmount / 2)
          const helpShare = itemAmount - selfShare

          selfCasts.forEach(castName => {
            const cast = castNameMap.get(castName)
            if (cast) {
              const summary = summaryMap.get(cast.id)
              if (summary) {
                summary.self_sales += Math.floor(selfShare / selfCasts.length)
              }
            }
          })

          if (giveHelpSales) {
            helpCasts.forEach(castName => {
              const cast = castNameMap.get(castName)
              if (cast) {
                const summary = summaryMap.get(cast.id)
                if (summary) {
                  summary.help_sales += Math.floor(helpShare / helpCasts.length)
                }
              }
            })
          }
        } else if (helpDistMethod === 'equal_per_person') {
          // 全員で均等割
          const allCasts = [...selfCasts, ...helpCasts]
          const perPerson = Math.floor(itemAmount / allCasts.length)

          selfCasts.forEach(castName => {
            const cast = castNameMap.get(castName)
            if (cast) {
              const summary = summaryMap.get(cast.id)
              if (summary) {
                summary.self_sales += perPerson
              }
            }
          })

          if (giveHelpSales) {
            helpCasts.forEach(castName => {
              const cast = castNameMap.get(castName)
              if (cast) {
                const summary = summaryMap.get(cast.id)
                if (summary) {
                  summary.help_sales += perPerson
                }
              }
            })
          }
        }
      }
    })
  })

  // 合計時の端数処理
  if (roundingTiming === 'total') {
    summaryMap.forEach(summary => {
      summary.self_sales = applyTaxAndRounding(summary.self_sales)
      summary.help_sales = applyTaxAndRounding(summary.help_sales)
    })
  }

  // total_salesを計算
  summaryMap.forEach(summary => {
    summary.total_sales = summary.self_sales + summary.help_sales
  })

  return Array.from(summaryMap.values())
    .filter(s => s.total_sales > 0)
    .sort((a, b) => b.total_sales - a.total_sales)
}

/**
 * 伝票小計（receipt_based）の計算
 * - 伝票全体の売上を推しに分配
 * - 選択された推し全員に売上が入る
 */
export function calculateReceiptBased(
  orders: OrderWithStaff[],
  casts: CastInfo[],
  settings: SalesSettings,
  taxRate: number = 0.1,
  serviceRate: number = 0
): CastSalesSummary[] {
  const castNameMap = new Map(casts.map(c => [c.name, c]))
  const summaryMap = new Map<number, CastSalesSummary>()
  const nonHelpNames = settings.non_help_staff_names || []

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

  // 設定を取得
  const excludeTax = settings.receipt_exclude_consumption_tax ?? settings.use_tax_excluded ?? false
  const { position: roundingPosition, type: roundingType } = parseRoundingMethod(settings.receipt_rounding_method)
  const roundingTiming = settings.receipt_rounding_timing ?? 'per_item'
  const helpDistMethod = settings.receipt_help_distribution_method ?? 'all_to_nomination'
  const includeHelpItems = settings.receipt_help_sales_inclusion === 'both'
  const giveHelpSales = includeHelpItems
  const helpRatio = settings.receipt_help_ratio ?? 50

  // 税計算・端数処理を適用する関数
  const applyTaxAndRounding = (amount: number) => {
    let result = amount
    if (excludeTax) {
      const taxPercent = Math.round(taxRate * 100)
      result = Math.floor(result * 100 / (100 + taxPercent))
    }
    return applyRoundingNew(result, roundingPosition, roundingType)
  }

  // 各オーダー（伝票）を処理
  orders.forEach(order => {
    // 推し（担当）
    const allNominations = order.staff_name ? [order.staff_name] : []
    if (allNominations.length === 0) return // 推しがいない伝票はスキップ

    // ヘルプ除外名を推しから除外（実在キャストの推しのみ残す）
    const realNominations = allNominations.filter(n => !nonHelpNames.includes(n))
    // 推しがヘルプ除外名のみの場合（フリーなど）
    const nominationIsNonHelpOnly = allNominations.length > 0 && realNominations.length === 0

    // 伝票内の全商品を集計
    let receiptTotalRaw = 0
    let selfTotalRaw = 0
    let helpTotalRaw = 0
    const helpCastsInReceipt: string[] = []
    const selfCastsInReceipt: string[] = []

    order.order_items.forEach(item => {
      const itemAmount = item.unit_price * item.quantity
      receiptTotalRaw += itemAmount

      const castsOnItem = item.cast_name ? [item.cast_name] : []

      // nonHelpNamesは売上対象外なので除外
      const realCastsOnItem = castsOnItem.filter(c => !nonHelpNames.includes(c))

      // nominationIsNonHelpOnlyの場合は、商品についてる実キャスト全員がSELF扱い
      const selfCasts = nominationIsNonHelpOnly
        ? realCastsOnItem // フリー推しの場合は商品の実キャスト全員がSELF
        : realCastsOnItem.filter(c => realNominations.includes(c))
      const helpCasts = nominationIsNonHelpOnly
        ? [] // フリー推しの場合はヘルプなし
        : realCastsOnItem.filter(c => !realNominations.includes(c))

      if (selfCasts.length > 0 && helpCasts.length === 0) {
        selfTotalRaw += itemAmount
        selfCasts.forEach(c => {
          if (!selfCastsInReceipt.includes(c)) selfCastsInReceipt.push(c)
        })
      } else if (helpCasts.length > 0 && selfCasts.length === 0) {
        helpTotalRaw += itemAmount
        helpCasts.forEach(c => {
          if (!helpCastsInReceipt.includes(c)) helpCastsInReceipt.push(c)
        })
      } else if (selfCasts.length > 0 && helpCasts.length > 0) {
        // 混在 → 両方に分類
        selfTotalRaw += itemAmount
        selfCasts.forEach(c => {
          if (!selfCastsInReceipt.includes(c)) selfCastsInReceipt.push(c)
        })
        helpCasts.forEach(c => {
          if (!helpCastsInReceipt.includes(c)) helpCastsInReceipt.push(c)
        })
      } else {
        // キャストなし → 誰にも計上しない（フリー推しでもフリーに売上をつけない）
      }
    })

    // 税計算・端数処理
    let receiptTotal: number
    if (roundingTiming === 'per_item') {
      // 商品ごとに既に処理済みと仮定して合計
      receiptTotal = applyTaxAndRounding(receiptTotalRaw)
    } else {
      receiptTotal = applyTaxAndRounding(receiptTotalRaw)
    }

    // ヘルプ分配計算
    let nominationShare = receiptTotal
    let helpShare = 0

    // 分配先を決定（nominationIsNonHelpOnlyの場合は商品上のキャスト、それ以外は実推し）
    const distributeTargets = nominationIsNonHelpOnly ? selfCastsInReceipt : realNominations

    if (helpTotalRaw > 0 && includeHelpItems) {
      switch (helpDistMethod) {
        case 'all_to_nomination':
          nominationShare = receiptTotal
          helpShare = 0
          break
        case 'equal':
          nominationShare = Math.floor(receiptTotal / 2)
          helpShare = receiptTotal - nominationShare
          break
        case 'ratio':
          helpShare = Math.floor(receiptTotal * helpRatio / 100)
          nominationShare = receiptTotal - helpShare
          break
        case 'equal_per_person':
          const allCasts = [...distributeTargets, ...helpCastsInReceipt]
          if (allCasts.length > 0) {
            const perPerson = Math.floor(receiptTotal / allCasts.length)
            nominationShare = perPerson * distributeTargets.length
            helpShare = receiptTotal - nominationShare
          }
          break
      }
    }

    // 推しへの分配（nominationIsNonHelpOnlyの場合は商品上のキャストに分配）
    if (distributeTargets.length > 0) {
      const perNomination = Math.floor(nominationShare / distributeTargets.length)
      distributeTargets.forEach((nomName: string) => {
        const cast = castNameMap.get(nomName)
        if (cast) {
          const summary = summaryMap.get(cast.id)
          if (summary) {
            summary.self_sales += perNomination
          }
        }
      })
    }

    // ヘルプへの分配
    if (giveHelpSales && helpShare > 0 && helpCastsInReceipt.length > 0) {
      const perHelp = Math.floor(helpShare / helpCastsInReceipt.length)
      helpCastsInReceipt.forEach(helpName => {
        const cast = castNameMap.get(helpName)
        if (cast) {
          const summary = summaryMap.get(cast.id)
          if (summary) {
            summary.help_sales += perHelp
          }
        }
      })
    }
  })

  // total_salesを計算
  summaryMap.forEach(summary => {
    summary.total_sales = summary.self_sales + summary.help_sales
  })

  return Array.from(summaryMap.values())
    .filter(s => s.total_sales > 0)
    .sort((a, b) => b.total_sales - a.total_sales)
}

/**
 * 公開設定に基づいて売上を計算
 */
export function calculateCastSalesByPublishedMethod(
  orders: OrderWithStaff[],
  casts: CastInfo[],
  settings: SalesSettings,
  taxRate: number = 0.1,
  serviceRate: number = 0
): CastSalesSummary[] {
  const method = settings.published_aggregation ?? 'item_based'

  // 公表しない場合は空配列を返す
  if (method === 'none') {
    return []
  }

  if (method === 'receipt_based') {
    return calculateReceiptBased(orders, casts, settings, taxRate, serviceRate)
  } else {
    // 推し小計の場合、各オーダーの推しを集める
    const nominations = [...new Set(orders.map(o => o.staff_name).filter(Boolean) as string[])]
    return calculateItemBased(orders, casts, settings, nominations, taxRate, serviceRate)
  }
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
