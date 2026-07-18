import { getSupabaseServerClient } from '@/lib/supabase'

/**
 * デイリー異常チェック（read-only 集計のみ）
 *
 * 毎日の店舗オペレーションの異常を検知する。DBへの書き込みは一切しない。
 * ホーム表示・Discord通知の両方から同じこの関数を呼ぶ。
 *
 * 検知項目（Phase 1: ①③④⑤⑥⑦。②経費ズレは再計算が必要なため別途）:
 *  ① 入力漏れ（営業したのに日報/レジ締め無し）
 *  ③ 現金差異（レジ理論値とのズレ）
 *  ④ ASK伝票（金額未確定の疑い）
 *  ⑤ 釣銭不足（翌日の小銭が足りない）
 *  ⑥ 退勤打刻漏れ
 *  ⑦ 不明金・未収・不明伝票
 *  ⑧ 勤怠登録の不備（勤怠未登録 / 衣装未選択）※他項目と違い「月初〜昨日」窓
 */

export type Severity = 'critical' | 'warning' | 'ok'

export interface Finding {
  store_id: number
  store_name: string
  date: string
  message: string
  amount?: number
}

export interface CheckResult {
  key: string
  label: string
  severity: Severity
  findings: Finding[]
}

export interface DailyCheckReport {
  from: string
  to: string
  results: CheckResult[]
}

// ⑤ 釣銭不足の閾値（運用で調整可能）
const SMALL_CASH_THRESHOLD = 25000 // 小銭がこれ未満で警告
const BIG_DAY_COLLECTION = 500000 // 現金回収がこれ超の大金日は除外

// ⑥ 退勤打刻漏れの対象ステータス（出勤系のみ。欠勤系は check_out 無しが当然）
const PRESENT_STATUSES = ['出勤', '遅刻', '早退', 'リクエスト出勤']

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * @param todayStr 実行基準日 'YYYY-MM-DD'（省略時は呼び出し側で渡す。テスト容易性のため引数化）
 * @param windowDays 何日遡って見るか（デフォルト3。後追い入力があるため前日だけだと取りこぼす）
 * @param storeIds 対象店舗（省略時は active 全店）
 */
export async function runDailyCheck(
  todayStr: string,
  windowDays = 3,
  storeIds?: number[]
): Promise<DailyCheckReport> {
  const supabase = getSupabaseServerClient()

  const today = new Date(`${todayStr}T00:00:00`)
  const fromDate = new Date(today)
  fromDate.setDate(fromDate.getDate() - windowDays)
  const from = toDateStr(fromDate)
  const to = todayStr // [from, to)

  // 店舗名マップ
  const { data: storesData } = await supabase
    .from('stores')
    .select('id, store_name, is_active')
  const storeNameMap = new Map<number, string>()
  for (const s of storesData || []) storeNameMap.set(s.id, s.store_name)
  const targetStoreIds =
    storeIds ?? (storesData || []).filter(s => s.is_active).map(s => s.id)
  const sname = (id: number) => storeNameMap.get(id) || `店舗${id}`
  const inScope = (id: number) => targetStoreIds.includes(id)

  // ---- データ取得（read-only） ----
  const [ordersRes, reportsRes, cashRes, attRes, itemsRes] = await Promise.all([
    supabase
      // 現金売上は daily_reports.cash_sales 列を使わない。この列は vi-admin では書き込まず
      // POS/日報フロー依存で店により未入力（Mary Mare は 0 のまま）。ホーム(app/page.tsx)と
      // 同様に payments から算出する（cash_amount - change_amount）。
      .from('orders')
      .select('store_id, order_date, payments(cash_amount, change_amount)')
      .is('deleted_at', null)
      .gte('order_date', from)
      .lt('order_date', `${to}T23:59:59`),
    supabase
      // cash_sales 列は上記理由で参照しない（現金売上は payments から算出）
      .from('daily_reports')
      .select('store_id, business_date, expense_amount, unpaid_amount, unknown_amount, unknown_receipt')
      .gte('business_date', from)
      .lte('business_date', to),
    supabase
      .from('cash_counts')
      .select('store_id, business_date, total_amount, register_amount, cash_collection, bill_10000, bill_5000, bill_2000, bill_1000, coin_500, coin_100, coin_50, coin_10, coin_5, coin_1')
      .gte('business_date', from)
      .lte('business_date', to),
    supabase
      .from('attendance')
      .select('store_id, date, cast_name, status, check_in_datetime, check_out_datetime, daily_payment')
      .gte('date', from)
      .lte('date', to),
    supabase
      .from('order_items')
      .select('store_id, product_name, subtotal, created_at')
      .ilike('product_name', '%ask%')
      .gte('created_at', from)
      .lt('created_at', `${to}T23:59:59`),
  ])

  const orders = (ordersRes.data || []).filter(o => inScope(o.store_id))
  const reports = (reportsRes.data || []).filter(r => inScope(r.store_id))
  const cashCounts = (cashRes.data || []).filter(c => inScope(c.store_id))
  const attendance = (attRes.data || []).filter(a => inScope(a.store_id))
  const askItems = (itemsRes.data || []).filter(i => inScope(i.store_id))

  // 日報・レジ締めの存在 Set（store_id|date）
  const reportSet = new Set(reports.map(r => `${r.store_id}|${r.business_date}`))
  const cashSet = new Set(cashCounts.map(c => `${c.store_id}|${c.business_date}`))
  const reportMap = new Map(reports.map(r => [`${r.store_id}|${r.business_date}`, r]))

  // 営業日 Set + 現金売上マップ（store_id|date）
  // 現金売上 = Σ(payments.cash_amount - change_amount)。ホーム app/page.tsx:919 と同一ロジック。
  // （1注文=1payment行前提で payments[0] を採用。order_date は timestamp なので date 部分を取る）
  const bizDays = new Set<string>()
  const cashSalesMap = new Map<string, number>()
  for (const o of orders) {
    const d = String(o.order_date).slice(0, 10)
    const k = `${o.store_id}|${d}`
    bizDays.add(k)
    const payment = Array.isArray(o.payments) ? o.payments[0] : o.payments
    const cash = (Number(payment?.cash_amount) || 0) - (Number(payment?.change_amount) || 0)
    if (cash !== 0) cashSalesMap.set(k, (cashSalesMap.get(k) || 0) + cash)
  }

  // ---- ① 入力漏れ ----
  const missingInput: Finding[] = []
  for (const key of Array.from(bizDays).sort().reverse()) {
    const [sidStr, d] = key.split('|')
    const sid = Number(sidStr)
    if (!reportSet.has(key)) {
      missingInput.push({ store_id: sid, store_name: sname(sid), date: d, message: '業務日報 未入力' })
    }
    if (!cashSet.has(key)) {
      missingInput.push({ store_id: sid, store_name: sname(sid), date: d, message: 'レジ締め 未入力' })
    }
  }

  // ---- ③ 現金差異 ----
  // 日払いは attendance.daily_payment を store|date で合算（指示書準拠）
  const dpMap = new Map<string, number>()
  for (const a of attendance) {
    const k = `${a.store_id}|${a.date}`
    dpMap.set(k, (dpMap.get(k) || 0) + (a.daily_payment || 0))
  }
  const cashDiff: Finding[] = []
  for (const c of cashCounts) {
    const k = `${c.store_id}|${c.business_date}`
    const r = reportMap.get(k)
    if (!r) continue // 日報が無い日は①で別途検出
    const dp = dpMap.get(k) || 0
    const theoretical =
      (c.register_amount || 0) +
      (cashSalesMap.get(k) || 0) -
      dp -
      Number(r.expense_amount || 0) -
      Number(r.unpaid_amount || 0) -
      Number(r.unknown_amount || 0)
    const diff = (c.total_amount || 0) - theoretical
    if (diff !== 0) {
      cashDiff.push({
        store_id: c.store_id,
        store_name: sname(c.store_id),
        date: c.business_date,
        message: diff < 0 ? `現金不足 ¥${Math.abs(diff).toLocaleString()}` : `現金過剰 ¥${diff.toLocaleString()}`,
        amount: diff,
      })
    }
  }
  cashDiff.sort((a, b) => (a.date < b.date ? 1 : -1))

  // ---- ④ ASK伝票 ----
  const askFindings: Finding[] = askItems
    .map(i => ({
      store_id: i.store_id,
      store_name: sname(i.store_id),
      date: String(i.created_at).slice(0, 10),
      message: `ASK伝票 ${i.product_name}`,
      amount: Number(i.subtotal || 0),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  // ---- ⑤ 釣銭不足 ----
  const smallCashFindings: Finding[] = []
  for (const c of cashCounts) {
    const smallCash =
      (c.bill_5000 || 0) * 5000 +
      (c.bill_2000 || 0) * 2000 +
      (c.bill_1000 || 0) * 1000 +
      (c.coin_500 || 0) * 500 +
      (c.coin_100 || 0) * 100 +
      (c.coin_50 || 0) * 50 +
      (c.coin_10 || 0) * 10 +
      (c.coin_5 || 0) * 5 +
      (c.coin_1 || 0)
    if (smallCash < SMALL_CASH_THRESHOLD && (c.cash_collection || 0) < BIG_DAY_COLLECTION) {
      smallCashFindings.push({
        store_id: c.store_id,
        store_name: sname(c.store_id),
        date: c.business_date,
        message: `釣銭(小銭)不足 ¥${smallCash.toLocaleString()}`,
        amount: smallCash,
      })
    }
  }
  smallCashFindings.sort((a, b) => (a.date < b.date ? 1 : -1))

  // ---- ⑥ 退勤打刻漏れ ----
  const checkoutMissing: Finding[] = attendance
    .filter(a => a.check_in_datetime && !a.check_out_datetime && PRESENT_STATUSES.includes(a.status))
    .map(a => ({
      store_id: a.store_id,
      store_name: sname(a.store_id),
      date: a.date,
      message: `退勤打刻漏れ ${a.cast_name}`,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  // ---- ⑦ 不明金・未収・不明伝票 ----
  const anomalyFindings: Finding[] = []
  for (const r of reports) {
    const parts: string[] = []
    if (Number(r.unknown_amount || 0) !== 0) parts.push(`不明金 ¥${Number(r.unknown_amount).toLocaleString()}`)
    if (Number(r.unpaid_amount || 0) !== 0) parts.push(`未収 ¥${Number(r.unpaid_amount).toLocaleString()}`)
    if (Number(r.unknown_receipt || 0) !== 0) parts.push(`不明伝票 ¥${Number(r.unknown_receipt).toLocaleString()}`)
    if (parts.length > 0) {
      anomalyFindings.push({
        store_id: r.store_id,
        store_name: sname(r.store_id),
        date: r.business_date,
        message: parts.join(' / '),
      })
    }
  }
  anomalyFindings.sort((a, b) => (a.date < b.date ? 1 : -1))

  // ---- ⑧ 勤怠登録の不備（勤怠未登録 / 衣装未選択）----
  // 他項目と違い「月初〜昨日」を通して見る。理由:
  //  - 快晟の運用リマインドが「今月の頭から見直し」であり、月末の報酬計算前に潰す必要がある
  //  - 直っていない古い漏れ（例: 月初の未登録）を3日窓だと取りこぼす。直るまで毎日出続ける
  // 当日は営業中で入力途中のため除外する（当日を入れると毎日必ず誤検知が出る）。
  const monthStart = `${todayStr.slice(0, 7)}-01`
  const yesterdayDate = new Date(today)
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const checkTo = toDateStr(yesterdayDate)

  const attendanceGaps: Finding[] = []
  const costumeMissing: Finding[] = []

  // 月初 = 当日 の場合（毎月1日）、対象期間が空になるのでスキップ
  if (monthStart <= checkTo) {
    const [shiftsRes, castsRes, attMonthRes, uniformSetRes] = await Promise.all([
      supabase
        .from('shifts')
        .select('store_id, date, cast_id, is_cancelled')
        .gte('date', monthStart)
        .lte('date', checkTo),
      supabase
        .from('casts')
        .select('id, store_id, name, is_admin, is_manager')
        .in('store_id', targetStoreIds),
      supabase
        .from('attendance')
        .select('store_id, date, cast_name, status, costume_id')
        .gte('date', monthStart)
        .lte('date', checkTo),
      supabase.from('store_uniform_settings').select('store_id, is_enabled'),
    ])

    const castById = new Map<number, { store_id: number; name: string }>()
    // 内勤(admin/manager)は衣装を着ないため衣装チェックから除外する。
    // attendance は cast_id ではなく cast_name 参照なので store_id|name をキーにする
    // （同名キャストが別店舗に存在するため store_id を必ず含める）。
    const staffKeys = new Set<string>()
    for (const c of castsRes.data || []) {
      castById.set(c.id, { store_id: c.store_id, name: c.name })
      if (c.is_admin || c.is_manager) staffKeys.add(`${c.store_id}|${c.name}`)
    }

    const attMonth = (attMonthRes.data || []).filter(a => inScope(a.store_id))
    const attKeys = new Set(attMonth.map(a => `${a.store_id}|${a.date}|${a.cast_name}`))

    // A. 勤怠未登録: シフトが入っている(キャンセル済みを除く)のに勤怠レコードが無い。
    //    欠勤(当欠/公欠/事前欠勤)は勤怠レコード自体は存在するのでここには出ない。
    for (const s of shiftsRes.data || []) {
      if (s.is_cancelled) continue
      if (!inScope(s.store_id)) continue
      const c = castById.get(s.cast_id)
      if (!c) continue
      if (attKeys.has(`${s.store_id}|${s.date}|${c.name}`)) continue
      attendanceGaps.push({
        store_id: s.store_id,
        store_name: sname(s.store_id),
        date: s.date,
        message: `勤怠未登録 ${c.name}（シフトあり）`,
      })
    }
    attendanceGaps.sort((a, b) => (a.date < b.date ? 1 : -1))

    // B. 衣装未選択: 衣装を運用している店舗のみ対象（store_uniform_settings.is_enabled）。
    //    店ごとにルールが違い、衣装マスタを持たない店で全行を誤検知させないため。
    //    Mary Mare は衣装クラス(A/B/C)が時給に直結する(use_uniform_based_wage)ので実害あり。
    const uniformStores = new Set(
      (uniformSetRes.data || []).filter(u => u.is_enabled).map(u => u.store_id)
    )
    for (const a of attMonth) {
      if (!uniformStores.has(a.store_id)) continue
      if (!PRESENT_STATUSES.includes(a.status)) continue // 欠勤系は衣装不要
      if (a.costume_id != null) continue
      if (staffKeys.has(`${a.store_id}|${a.cast_name}`)) continue // 内勤は衣装なしが正常
      costumeMissing.push({
        store_id: a.store_id,
        store_name: sname(a.store_id),
        date: a.date,
        message: `衣装未選択 ${a.cast_name}（${a.status}）`,
      })
    }
    costumeMissing.sort((a, b) => (a.date < b.date ? 1 : -1))
  }

  const sev = (findings: Finding[], onHit: Severity): Severity =>
    findings.length > 0 ? onHit : 'ok'

  const results: CheckResult[] = [
    { key: 'missing_input', label: '入力漏れ', severity: sev(missingInput, 'warning'), findings: missingInput },
    { key: 'cash_diff', label: '現金差異', severity: sev(cashDiff, 'critical'), findings: cashDiff },
    { key: 'ask_receipt', label: 'ASK伝票', severity: sev(askFindings, 'warning'), findings: askFindings },
    { key: 'small_cash', label: '釣銭不足', severity: sev(smallCashFindings, 'warning'), findings: smallCashFindings },
    { key: 'checkout_missing', label: '退勤打刻漏れ', severity: sev(checkoutMissing, 'warning'), findings: checkoutMissing },
    { key: 'anomaly', label: '不明金・未収・不明伝票', severity: sev(anomalyFindings, 'warning'), findings: anomalyFindings },
    // ⑧ は月初〜昨日窓のため、ラベルに期間を明示する（他項目は from〜to の3日窓）
    { key: 'attendance_gap', label: '勤怠未登録（今月分）', severity: sev(attendanceGaps, 'warning'), findings: attendanceGaps },
    { key: 'costume_missing', label: '衣装未選択（今月分・時給に影響）', severity: sev(costumeMissing, 'warning'), findings: costumeMissing },
  ]

  return { from, to, results }
}
