// 人件費の日次展開
// payslips(月次確定値)を成分ごとに日次へ配分し、全キャスト合算する。
// 各成分の日次合計は payslips の各カラムに厳密一致(残差は最終配分日に寄せる)ため、
// 日次人件費の合計は payslips.gross_total と1円もズレない。
//
// 設計の根拠(recalculate/route.ts を精読 + 実DB検証):
// - gross_total = hourly_income + sales_back + product_back + fixed_amount
//                 + per_attendance_income + bonus_total (全店全月で恒等式が成立)
// - daily_details[].hourly_income / back は採用報酬形態non-awareの生値なので、
//   採用形態(compensation_breakdown.is_selected)の hourly_income / product_back が
//   0なら全日0にする(金額で判定。use_product_back キーは存在しない)
// - 売上バックは月末確定率を各日の売上へ適用 = 売上比按分(平均率方式なので厳密一致)

import type { Payslip } from '@/types/database'
import type { LaborReconciliation } from '@/types/management'

type Weight = { date: string; weight: number }

// total を weights の比率で日次配分。合計は必ず total に一致する。
// (floor の端数残差は最終の正weight日に寄せる。weightが全て0以下なら fallbackDate に全額)
function distribute(total: number, weights: Weight[], fallbackDate: string | null): Map<string, number> {
  const result = new Map<string, number>()
  if (!total) return result
  const sumW = weights.reduce((s, w) => s + (w.weight > 0 ? w.weight : 0), 0)
  if (sumW <= 0) {
    if (fallbackDate) result.set(fallbackDate, total)
    return result
  }
  let allocated = 0
  for (const w of weights) {
    if (w.weight <= 0) continue
    const amt = Math.floor((total * w.weight) / sumW)
    result.set(w.date, (result.get(w.date) ?? 0) + amt)
    allocated += amt
  }
  const residual = total - allocated
  if (residual !== 0) {
    const lastDate = [...weights].reverse().find((w) => w.weight > 0)?.date ?? fallbackDate
    if (lastDate) result.set(lastDate, (result.get(lastDate) ?? 0) + residual)
  }
  return result
}

const COMP_KEYS = ['hourly', 'salesBack', 'productBack', 'fixed', 'perAttendance', 'bonus'] as const
type CompKey = (typeof COMP_KEYS)[number]
type Components = Record<CompKey, number>

interface CastExpansion {
  byDate: Map<string, number>
  components: Components
  warnings: string[]
}

// 単一キャストの月次payslipを日次展開
function expandCast(payslip: Payslip, monthEndDate: string): CastExpansion {
  const dd = payslip.daily_details ?? []
  const sel = payslip.compensation_breakdown?.find((c) => c.is_selected) ?? null
  const workDays = dd.filter((d) => (d.hours ?? 0) > 0) // 出勤日

  // 配分のフォールバック先(出勤日/明細が全く無い月でも合計を保つため)
  const lastWorkDate = workDays.length ? workDays[workDays.length - 1].date : null
  const lastDdDate = dd.length ? dd[dd.length - 1].date : null
  const fallback = lastWorkDate ?? lastDdDate ?? monthEndDate

  // 売上バックの集計軸(item/receipt)を採用形態の total_sales との一致度で逆算
  const itemSum = dd.reduce((s, d) => s + (d.sales_item_based ?? 0), 0)
  const receiptSum = dd.reduce((s, d) => s + (d.sales_receipt_based ?? 0), 0)
  const totalSales = sel?.total_sales ?? 0
  const useReceipt = Math.abs(receiptSum - totalSales) <= Math.abs(itemSum - totalSales)

  // 時給収入: 採用形態が時給非使用(use_wage=false)なら全日0。それ以外は日次の生値を比重に配分
  const hourlyMap = distribute(
    payslip.hourly_income,
    dd.map((d) => ({ date: d.date, weight: sel?.use_wage === false ? 0 : d.hourly_income ?? 0 })),
    fallback
  )
  // 商品バック: payslip.product_back が0(非使用形態)なら total=0で全日0
  const productMap = distribute(
    payslip.product_back,
    dd.map((d) => ({ date: d.date, weight: d.back ?? 0 })),
    fallback
  )
  // 売上バック: 月末確定額を各日の売上(採用軸)へ比例配分
  const salesBackMap = distribute(
    payslip.sales_back,
    dd.map((d) => ({ date: d.date, weight: (useReceipt ? d.sales_receipt_based : d.sales_item_based) ?? 0 })),
    fallback
  )
  // 固定額 / 出勤ごと報酬 / 賞与: 出勤日に均等配分
  const fixedMap = distribute(payslip.fixed_amount, workDays.map((d) => ({ date: d.date, weight: 1 })), fallback)
  const perAttMap = distribute(payslip.per_attendance_income, workDays.map((d) => ({ date: d.date, weight: 1 })), fallback)
  const bonusMap = distribute(payslip.bonus_total, workDays.map((d) => ({ date: d.date, weight: 1 })), fallback)

  const byDate = new Map<string, number>()
  for (const m of [hourlyMap, productMap, salesBackMap, fixedMap, perAttMap, bonusMap]) {
    for (const [date, amt] of m) byDate.set(date, (byDate.get(date) ?? 0) + amt)
  }

  const sum = (m: Map<string, number>) => {
    let s = 0
    for (const v of m.values()) s += v
    return s
  }
  const components: Components = {
    hourly: sum(hourlyMap),
    salesBack: sum(salesBackMap),
    productBack: sum(productMap),
    fixed: sum(fixedMap),
    perAttendance: sum(perAttMap),
    bonus: sum(bonusMap),
  }

  const warnings: string[] = []
  const componentSum =
    payslip.hourly_income +
    payslip.sales_back +
    payslip.product_back +
    payslip.fixed_amount +
    payslip.per_attendance_income +
    payslip.bonus_total
  if (componentSum !== payslip.gross_total) {
    warnings.push(`cast ${payslip.cast_id}: 成分和 ${componentSum} != gross_total ${payslip.gross_total}`)
  }
  const distributed = sum(byDate)
  if (distributed !== componentSum) {
    warnings.push(`cast ${payslip.cast_id}: 日次配分後 ${distributed} != 成分和 ${componentSum}`)
  }

  return { byDate, components, warnings }
}

// 全キャストの payslips を日次展開して合算 + 突合検証
export function computeDailyLaborCost(
  payslips: Payslip[],
  allDates: string[]
): { byDate: Map<string, number>; reconciliation: LaborReconciliation } {
  const monthEnd = allDates[allDates.length - 1] ?? ''
  const byDate = new Map<string, number>()
  const computed: Components = { hourly: 0, salesBack: 0, productBack: 0, fixed: 0, perAttendance: 0, bonus: 0 }
  const expected: Components = { hourly: 0, salesBack: 0, productBack: 0, fixed: 0, perAttendance: 0, bonus: 0 }
  const warnings: string[] = []
  let expectedGross = 0

  for (const p of payslips) {
    expectedGross += p.gross_total
    expected.hourly += p.hourly_income
    expected.salesBack += p.sales_back
    expected.productBack += p.product_back
    expected.fixed += p.fixed_amount
    expected.perAttendance += p.per_attendance_income
    expected.bonus += p.bonus_total

    const r = expandCast(p, monthEnd)
    for (const [date, amt] of r.byDate) byDate.set(date, (byDate.get(date) ?? 0) + amt)
    computed.hourly += r.components.hourly
    computed.salesBack += r.components.salesBack
    computed.productBack += r.components.productBack
    computed.fixed += r.components.fixed
    computed.perAttendance += r.components.perAttendance
    computed.bonus += r.components.bonus
    warnings.push(...r.warnings)
  }

  let computedGross = 0
  for (const v of byDate.values()) computedGross += v

  const reconciliation: LaborReconciliation = {
    ok: computedGross === expectedGross,
    expectedGrossTotal: expectedGross,
    computedGrossTotal: computedGross,
    diff: computedGross - expectedGross,
    perComponent: {
      hourly: { expected: expected.hourly, computed: computed.hourly },
      salesBack: { expected: expected.salesBack, computed: computed.salesBack },
      productBack: { expected: expected.productBack, computed: computed.productBack },
      fixed: { expected: expected.fixed, computed: computed.fixed },
      perAttendance: { expected: expected.perAttendance, computed: computed.perAttendance },
      bonus: { expected: expected.bonus, computed: computed.bonus },
    },
    warnings,
  }

  return { byDate, reconciliation }
}
