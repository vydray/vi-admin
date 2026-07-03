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
  // 日別目標（daily_targets）。未設定=null
  target: number | null // 売上目標
  achievementRate: number | null // 売上達成率 = totalSales / target
  targetAttendance: number | null // 目標出勤人数
  achievementRateAttendance: number | null // 出勤達成率 = attendanceCount / targetAttendance
  targetGuests: number | null // 目標来客数
  achievementRateGuests: number | null // 来客達成率 = guests / targetGuests
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
  // 日別目標（月合計・全体達成率）
  targetTotal: number // Σ 売上目標
  achievementRate: number | null // 売上 全体達成率 = totalSales / targetTotal
  targetAttendanceTotal: number // Σ 目標出勤人数
  achievementRateAttendance: number | null // 出勤 全体達成率 = Σ出勤 / Σ目標出勤
  targetGuestsTotal: number // Σ 目標来客数
  achievementRateGuests: number | null // 来客 全体達成率 = Σ来店 / Σ目標来客
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

// キャスト別 給与率（月次）
export interface CastWageRateRow {
  castId: number
  castName: string
  gross: number // 総支給額
  castSales: number // ① キャスト売上（推し/ヘルプ仕分け後）
  helpSales: number // うちヘルプ売上
  tableTotal: number // ② 自分の卓の伝票合計（推しの卓の会計総額）
  rate1: number | null // gross / castSales
  rate2: number | null // gross / tableTotal
  shiftDays: number // シフト予定日数（最終営業日まで・未来シフトは除外）
  attendedDays: number // 実出勤日数（出勤扱い）
  absentDays: number // 欠勤日数（当欠・無連絡欠勤等）
  attendanceRate: number | null // attendedDays / shiftDays
  lineReserved: number // 公式LINE予定客数（月合計）
  nominatedGuests: number // 推し卓の実来店客数
  callRate: number | null // 来店実現率 = nominatedGuests / lineReserved（LINE予定を実来店に変えられた率）
  cumulativeHours: number // 累計出勤時間（全期間・月フィルタなし）。保証時給の閾値到達判定用
  hasGuaranteedType: boolean // 保証時給の報酬形態（use_guaranteed_wage_only）を持っているか
  hireDate: string | null // 入社日 casts.hire_date
}

export interface CastWageRateResponse {
  storeId: number
  yearMonth: string
  axis: 'total_sales_item_based' | 'total_sales_receipt_based'
  rows: CastWageRateRow[]
  guaranteedThresholdHours: number | null // 保証時給の閾値（店舗単位・時間）。null=保証運用なし
}
