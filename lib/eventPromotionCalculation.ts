/**
 * イベント特典計算ロジック
 */

import { applyRoundingNew } from './salesCalculation'
import type {
  EventPromotion,
  PromotionThreshold,
  PromotionAchievement,
  PromotionRoundingMethod,
} from '@/types/database'

// 計算用の注文アイテム型
interface OrderItemForPromotion {
  category: string | null
  unit_price: number
  quantity: number
  subtotal: number
}

// 計算用の注文型
interface OrderForPromotion {
  id: string
  table_number: string
  guest_name: string | null
  staff_name: string | string[] | null
  checkout_datetime: string
  total_incl_tax: number
  order_items: OrderItemForPromotion[]
}

/**
 * 対象金額を計算する
 * - カテゴリベース: 対象カテゴリの商品のみ集計
 * - 合計ベース: 伝票全体の金額を使用
 * - 税抜き/丸め処理を適用
 */
export function calculatePromotionAmount(
  order: OrderForPromotion,
  promotion: EventPromotion,
  taxRate: number = 0.1
): number {
  let amount = 0

  if (promotion.aggregation_type === 'total_based') {
    // 伝票全体の金額を使用
    amount = order.total_incl_tax
  } else {
    // カテゴリベース: 対象カテゴリの商品のみ集計
    const targetCategories = promotion.target_categories || []

    order.order_items.forEach(item => {
      // カテゴリが指定されていない場合は全商品対象
      if (targetCategories.length === 0 ||
          (item.category && targetCategories.includes(item.category))) {
        amount += item.subtotal
      }
    })
  }

  // 税抜き計算
  if (promotion.exclude_tax) {
    amount = Math.floor(amount / (1 + taxRate))
  }

  // 丸め処理
  amount = applyRoundingNew(
    amount,
    promotion.rounding_position,
    promotion.rounding_method as 'floor' | 'ceil' | 'round' | 'none'
  )

  return amount
}

/**
 * 達成した閾値を取得する
 * 金額が大きい順にソートして、最初にマッチする閾値を返す
 */
export function getAchievedThreshold(
  amount: number,
  thresholds: PromotionThreshold[]
): PromotionThreshold | null {
  if (!thresholds || thresholds.length === 0) return null

  // 金額が大きい順にソート
  const sorted = [...thresholds].sort((a, b) => b.min_amount - a.min_amount)

  for (const threshold of sorted) {
    if (amount >= threshold.min_amount) {
      // max_amountがnullなら上限なし
      if (threshold.max_amount === null || amount < threshold.max_amount) {
        return threshold
      }
    }
  }

  return null
}

/**
 * 次の閾値を取得する
 * 現在の金額より大きいmin_amountを持つ最小の閾値を探す
 */
export function getNextThreshold(
  amount: number,
  thresholds: PromotionThreshold[]
): { threshold: PromotionThreshold; remaining: number } | null {
  if (!thresholds || thresholds.length === 0) return null

  // 金額が小さい順にソート
  const sorted = [...thresholds].sort((a, b) => a.min_amount - b.min_amount)

  for (const threshold of sorted) {
    if (threshold.min_amount > amount) {
      return {
        threshold,
        remaining: threshold.min_amount - amount
      }
    }
  }

  return null
}

/**
 * 伝票の達成状況を計算する
 */
export function calculateAchievement(
  order: OrderForPromotion,
  promotion: EventPromotion,
  taxRate: number = 0.1
): PromotionAchievement {
  const targetAmount = calculatePromotionAmount(order, promotion, taxRate)
  const achieved = getAchievedThreshold(targetAmount, promotion.thresholds)
  const next = getNextThreshold(targetAmount, promotion.thresholds)

  // staff_name が配列の場合はカンマ区切りで結合
  const staffName = Array.isArray(order.staff_name)
    ? order.staff_name.join(', ')
    : order.staff_name

  return {
    order_id: order.id,
    table_number: order.table_number,
    guest_name: order.guest_name,
    staff_name: staffName,
    checkout_datetime: order.checkout_datetime,
    target_amount: targetAmount,
    achieved_threshold: achieved,
    next_threshold: next?.threshold || null,
    remaining_amount: next?.remaining || null,
  }
}

/**
 * 複数の伝票の達成状況を一括計算する
 */
export function calculateAllAchievements(
  orders: OrderForPromotion[],
  promotion: EventPromotion,
  taxRate: number = 0.1
): PromotionAchievement[] {
  return orders.map(order => calculateAchievement(order, promotion, taxRate))
}

/**
 * 達成状況の集計（統計情報）
 */
export interface PromotionStats {
  totalOrders: number
  achievedOrders: number
  achievementRate: number  // 達成率（%）
  totalTargetAmount: number
  averageTargetAmount: number
  thresholdCounts: { [rewardName: string]: number }  // 閾値別達成数
}

export function calculatePromotionStats(
  achievements: PromotionAchievement[]
): PromotionStats {
  const totalOrders = achievements.length
  const achievedOrders = achievements.filter(a => a.achieved_threshold !== null).length
  const totalTargetAmount = achievements.reduce((sum, a) => sum + a.target_amount, 0)

  // 閾値別の達成数をカウント
  const thresholdCounts: { [rewardName: string]: number } = {}
  achievements.forEach(a => {
    if (a.achieved_threshold) {
      const name = a.achieved_threshold.reward_name
      thresholdCounts[name] = (thresholdCounts[name] || 0) + 1
    }
  })

  return {
    totalOrders,
    achievedOrders,
    achievementRate: totalOrders > 0 ? Math.round((achievedOrders / totalOrders) * 100) : 0,
    totalTargetAmount,
    averageTargetAmount: totalOrders > 0 ? Math.round(totalTargetAmount / totalOrders) : 0,
    thresholdCounts,
  }
}

/**
 * 達成状況をCSV形式に変換
 */
export function achievementsToCSV(
  achievements: PromotionAchievement[],
  promotionName: string
): string {
  const headers = [
    'テーブル',
    'お客様名',
    '推し',
    '会計日時',
    '対象金額',
    '達成特典',
    '次の特典',
    'あと金額',
  ]

  const rows = achievements.map(a => [
    a.table_number,
    a.guest_name || '',
    a.staff_name || '',
    a.checkout_datetime,
    a.target_amount.toString(),
    a.achieved_threshold?.reward_name || '(未達成)',
    a.next_threshold?.reward_name || '',
    a.remaining_amount?.toString() || '',
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  // BOM付きUTF-8
  return '\uFEFF' + csvContent
}
