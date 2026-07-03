// 入店祝い金の該当判定ロジック（純関数・Mary Mare/store7 で運用）
//
// ルール:
//  - 入店日から丸2ヶ月(まる2ヶ月)の窓内に月売上ランクを達成 → 窓内で達成した「最高ランク」の額
//  - 窓内で未達成 → その後「初めて達成した月」のランクの額
//  - 1人1回限り
//  - 30万→5万 / 40万→10万 / 50万→15万
//
// 「月売上」= その暦月の cast_daily_stats 合計（store7は item_based の total）。
// 部分入社月もカウントする（入社月の暦月から窓に含める）＝現行v1の解釈。後で調整可。

import { addMonths, format, parseISO, startOfMonth } from 'date-fns'

// 高い順（達成判定は上から）
export const ENTRY_BONUS_TIERS = [
  { threshold: 500000, amount: 150000, rank: 50 },
  { threshold: 400000, amount: 100000, rank: 40 },
  { threshold: 300000, amount: 50000, rank: 30 },
] as const

export function tierForSales(monthlySales: number) {
  for (const t of ENTRY_BONUS_TIERS) {
    if (monthlySales >= t.threshold) return t
  }
  return null
}

export type EntryBonusStatus =
  | 'confirmed' // 額確定（最高ランク到達 or 窓終了 or 窓後初達成）
  | 'pending'   // まだ上がりうる／窓進行中で達成待ち
  | 'none'      // 未達成（監視対象だが現時点0）

export interface EntryBonusResult {
  amount: number
  rank: number | null
  achievedYm: string | null
  status: EntryBonusStatus
  reason: 'in_window' | 'after_window' | 'none'
  windowStartYm: string
  windowEndYm: string
  months: Array<{ ym: string; sales: number; rank: number | null }> // 判定窓内の各月の売上とランク
}

// ym: 'YYYY-MM'。salesByYm はその月の月売上。today は 'YYYY-MM-DD'。
export function computeEntryBonus(
  hireDate: string | null,
  salesByYm: Record<string, number>,
  today: string,
  ruleStartDate?: string // 祝い金プログラムの適用開始日。入社日がこれより前なら開始日から判定
): EntryBonusResult | null {
  if (!hireDate) return null

  // 適用開始日フロア: 入社日が開始日より前（=一括移行の4/23組など）は開始日から2ヶ月窓で判定
  const effectiveStart = ruleStartDate && ruleStartDate > hireDate ? ruleStartDate : hireDate
  const hire = parseISO(effectiveStart)
  const windowStartYm = format(hire, 'yyyy-MM')
  const windowEnd = addMonths(hire, 2) // 丸2ヶ月
  const windowEndYm = format(windowEnd, 'yyyy-MM')
  const todayYm = format(parseISO(today), 'yyyy-MM')
  const windowClosed = format(startOfMonth(parseISO(today)), 'yyyy-MM') > windowEndYm

  // 窓に含まれる暦月（入社月〜窓終了月）を列挙
  const windowMonths: string[] = []
  {
    let cur = startOfMonth(hire)
    const endMonth = startOfMonth(windowEnd)
    while (format(cur, 'yyyy-MM') <= format(endMonth, 'yyyy-MM')) {
      windowMonths.push(format(cur, 'yyyy-MM'))
      cur = addMonths(cur, 1)
    }
  }

  // 窓内各月の売上とランク（表示用）
  const months = windowMonths.map((ym) => {
    const sales = salesByYm[ym] ?? 0
    return { ym, sales, rank: tierForSales(sales)?.rank ?? null }
  })

  // 窓内の最高ランク（同ランクなら最も早い月を達成月とする）
  let best: { rank: number; amount: number; ym: string } | null = null
  for (const ym of windowMonths) {
    const tier = tierForSales(salesByYm[ym] ?? 0)
    if (tier && (!best || tier.rank > best.rank)) {
      best = { rank: tier.rank, amount: tier.amount, ym }
    }
  }

  if (best) {
    const maxTierReached = best.rank === ENTRY_BONUS_TIERS[0].rank
    return {
      amount: best.amount,
      rank: best.rank,
      achievedYm: best.ym,
      status: maxTierReached || windowClosed ? 'confirmed' : 'pending',
      reason: 'in_window',
      windowStartYm,
      windowEndYm,
      months,
    }
  }

  // 窓内で未達成 → 窓後に初めて達成した月を探す
  const postMonths = Object.keys(salesByYm)
    .filter((ym) => ym > windowEndYm && ym <= todayYm)
    .sort()
  for (const ym of postMonths) {
    const tier = tierForSales(salesByYm[ym] ?? 0)
    if (tier) {
      return {
        amount: tier.amount,
        rank: tier.rank,
        achievedYm: ym,
        status: 'confirmed', // 窓後の初達成でロック
        reason: 'after_window',
        windowStartYm,
        windowEndYm,
        months,
      }
    }
  }

  // 現時点で未達成
  return {
    amount: 0,
    rank: null,
    achievedYm: null,
    status: 'none',
    reason: 'none',
    windowStartYm,
    windowEndYm,
    months,
  }
}
