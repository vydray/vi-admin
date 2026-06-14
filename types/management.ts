// 経営ダッシュボード（/management）API 型
// app/api/management/daily-pl の入出力

export interface DailyPlRequest {
  store_id: number
  year_month: string // "YYYY-MM"
}

// 日毎の経営数値1行
export interface DailyPlRow {
  date: string // "YYYY-MM-DD"
  day: number // 1..末日
  eventName: string | null
  // 売上（店舗=orders）
  sales: number // Σ total_incl_tax
  cashSales: number // Σ(cash_amount - change_amount)
  cardSales: number // Σ credit_card_amount
  otherSales: number // Σ other_payment_amount
  baseSales: number // BASE売上 Σ(base_price * quantity)
  totalSales: number // sales + baseSales
  // 客
  orderCount: number // 会計数（伝票件数）
  guests: number // 来店人数 Σ guest_count
  firstTimeGuests: number
  returnGuests: number
  regularGuests: number
  avgSpend: number // 客単価 = sales / orderCount（店舗売上ベース）
  // 人件費（発生ベース gross）
  laborCost: number
  laborCostRate: number | null // laborCost / totalSales
  // 経費（参考・粗利には含めない）
  expense: number
  expenseRate: number | null // expense / totalSales
  // 利益（粗利 = totalSales - laborCost。経費は含めない）
  grossProfit: number
  // 出勤
  shiftCount: number // 予定シフトのキャスト数
  attendanceCount: number // 実出勤のキャスト数
  attendanceRate: number | null // attendanceCount / shiftCount
  // 予約
  lineReservedGuests: number // 公式LINE予定客数
}

export interface DailyPlSummary {
  // 合計
  sales: number
  cashSales: number
  cardSales: number
  otherSales: number
  baseSales: number
  totalSales: number
  orderCount: number
  guests: number
  firstTimeGuests: number
  returnGuests: number
  regularGuests: number
  laborCost: number
  expense: number
  grossProfit: number
  shiftCount: number
  attendanceCount: number
  lineReservedGuests: number
  // 月次の率・客単価（合計から再計算）
  avgSpend: number
  laborCostRate: number | null
  expenseRate: number | null
  attendanceRate: number | null
  // 平均（営業日=売上のあった日数で割る）
  businessDays: number
  avgDailySales: number
  avgDailyGuests: number
}

export interface LaborComponentRecon {
  expected: number
  computed: number
}

// 人件費の日次展開が payslips 月次と一致しているかの検証
export interface LaborReconciliation {
  ok: boolean // Σ(日次人件費) === Σ(payslips.gross_total)
  expectedGrossTotal: number
  computedGrossTotal: number
  diff: number
  perComponent: {
    hourly: LaborComponentRecon
    salesBack: LaborComponentRecon
    productBack: LaborComponentRecon
    fixed: LaborComponentRecon
    perAttendance: LaborComponentRecon
    bonus: LaborComponentRecon
  }
  warnings: string[]
}

export interface DailyPlResponse {
  storeId: number
  yearMonth: string
  rows: DailyPlRow[]
  summary: DailyPlSummary
  labor: LaborReconciliation
  meta: { payslipCount: number; recalculated: boolean }
}
