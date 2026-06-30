import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { validateAdminSession } from '@/lib/adminSession'
import { computeDailyLaborCost } from '@/lib/laborCostDaily'
import type { Payslip } from '@/types/database'
import type { DailyPlResponse, DailyPlRow, DailyPlSummary } from '@/types/management'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// orders + payments のネスト形
interface PaymentRow {
  cash_amount: number | null
  credit_card_amount: number | null
  other_payment_amount: number | null
  change_amount: number | null
}
interface OrderRow {
  total_incl_tax: number | null
  order_date: string | null
  guest_count: number | null
  visit_type: string | null
  payments: PaymentRow | PaymentRow[] | null
}

const pickPayment = (o: OrderRow): PaymentRow | undefined =>
  Array.isArray(o.payments) ? o.payments[0] : o.payments ?? undefined

export async function POST(request: NextRequest) {
  // ===== 認証: super_admin 専用 =====
  const adminSession = await validateAdminSession()
  if (!adminSession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // 既存の呼び出し側コードの形(role / store_id / permissions)を保ったまま委譲
  const session: { role?: string; store_id?: number | string; permissions?: Record<string, boolean> } = {
    role: adminSession.role,
    store_id: adminSession.storeId,
    permissions: adminSession.permissions,
  }
  // super_admin か、経営ダッシュボード権限(management)を持つ store_admin のみ
  const isSuperAdmin = session.role === 'super_admin'
  const canManage = isSuperAdmin || session.permissions?.management === true
  if (!canManage) {
    return NextResponse.json({ error: 'Forbidden: 経営ダッシュボードの権限がありません' }, { status: 403 })
  }

  // ===== パラメータ =====
  let storeId: number
  let yearMonth: string
  try {
    const body = await request.json()
    if (typeof body.store_id !== 'number' || body.store_id <= 0) {
      return NextResponse.json({ error: 'Invalid store_id' }, { status: 400 })
    }
    storeId = body.store_id
    // store_admin は自店のみ（body値を無視してセッションの店舗に強制）
    if (!isSuperAdmin) {
      storeId = Number(session.store_id)
      if (!storeId || storeId <= 0) {
        return NextResponse.json({ error: 'Forbidden: 店舗が特定できません' }, { status: 403 })
      }
    }
    const ymRegex = /^\d{4}-(0[1-9]|1[0-2])$/
    if (typeof body.year_month !== 'string' || !ymRegex.test(body.year_month)) {
      return NextResponse.json({ error: 'Invalid year_month (YYYY-MM)' }, { status: 400 })
    }
    yearMonth = body.year_month
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const [year, month] = yearMonth.split('-').map(Number)
  const lastDay = new Date(year, month, 0).getDate()
  const mm = String(month).padStart(2, '0')
  const monthStart = `${year}-${mm}-01`
  const monthEnd = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
  const allDates = Array.from({ length: lastDay }, (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, '0')}`)

  const supabase = getSupabaseServerClient()

  // ===== 並列クエリ（全て SELECT のみ） =====
  const [ordersRes, attStatusRes, attendanceRes, shiftsRes, eventsRes, expensesRes, reservationsRes, baseOrdersRes, payslipsRes, targetsRes] =
    await Promise.all([
      supabase
        .from('orders')
        .select(
          'total_incl_tax, order_date, guest_count, visit_type, payments(cash_amount, credit_card_amount, other_payment_amount, change_amount)'
        )
        .eq('store_id', storeId)
        .gte('order_date', monthStart)
        .lte('order_date', monthEnd + 'T23:59:59')
        .is('deleted_at', null),
      supabase.from('attendance_statuses').select('id, code').eq('store_id', storeId).eq('is_active', true),
      supabase.from('attendance').select('date, status_id').eq('store_id', storeId).gte('date', monthStart).lte('date', monthEnd),
      supabase.from('shifts').select('cast_id, date').eq('store_id', storeId).gte('date', monthStart).lte('date', monthEnd),
      // 告知イベント（management_events）: 期間が対象月に重なるもの
      supabase
        .from('management_events')
        .select('name, start_date, end_date')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .lte('start_date', monthEnd)
        .gte('end_date', monthStart),
      // 経費: 計上月(target_month)ベース。経費管理ページと月合計を一致させる
      supabase.from('expenses').select('amount, payment_date, target_month').eq('store_id', storeId).eq('target_month', yearMonth),
      supabase
        .from('visitor_reservations')
        .select('date, guest_count, source')
        .eq('store_id', storeId)
        .eq('source', 'line')
        .gte('date', monthStart)
        .lte('date', monthEnd),
      supabase
        .from('base_orders')
        .select('base_price, quantity, business_date')
        .eq('store_id', storeId)
        .gte('business_date', monthStart)
        .lte('business_date', monthEnd),
      supabase.from('payslips').select('*').eq('store_id', storeId).eq('year_month', yearMonth),
      // 日別目標（売上/出勤/来客）
      supabase.from('daily_targets').select('date, metric, value').eq('store_id', storeId).gte('date', monthStart).lte('date', monthEnd),
    ])

  const orders = (ordersRes.data ?? []) as unknown as OrderRow[]
  const payslips = (payslipsRes.data ?? []) as unknown as Payslip[]

  // 出勤扱いステータスID（出勤/遅刻/早退/リクエスト出勤 等。欠勤系は除外）
  // ※ store によっては欠勤系も is_active=true のため、code で欠勤を確実に除外する
  const ABSENCE_CODES = new Set(['same_day_absence', 'advance_absence', 'no_call_no_show', 'excused'])
  const workDayStatusIds = new Set(
    (attStatusRes.data ?? []).filter((s) => !ABSENCE_CODES.has(s.code ?? '')).map((s) => String(s.id))
  )

  // 出勤人数（日次）
  const attByDate = new Map<string, number>()
  for (const a of attendanceRes.data ?? []) {
    if (a.status_id && workDayStatusIds.has(String(a.status_id))) {
      attByDate.set(a.date, (attByDate.get(a.date) ?? 0) + 1)
    }
  }

  // シフト人数（日次・distinct cast_id）
  const shiftByDate = new Map<string, Set<number>>()
  for (const s of shiftsRes.data ?? []) {
    if (!shiftByDate.has(s.date)) shiftByDate.set(s.date, new Set())
    shiftByDate.get(s.date)!.add(s.cast_id)
  }

  // イベント名（日次・期間展開。同日に複数あれば連結）
  const eventByDate = new Map<string, string>()
  for (const ev of eventsRes.data ?? []) {
    const from = ev.start_date < monthStart ? monthStart : ev.start_date
    const to = ev.end_date > monthEnd ? monthEnd : ev.end_date
    for (const date of allDates) {
      if (date >= from && date <= to) {
        const cur = eventByDate.get(date)
        eventByDate.set(date, cur ? `${cur}、${ev.name}` : ev.name)
      }
    }
  }

  // 経費（日次・支払日で配置。当月外の支払日は月末に寄せて月合計を維持）
  const expenseByDate = new Map<string, number>()
  for (const e of expensesRes.data ?? []) {
    const d = e.payment_date >= monthStart && e.payment_date <= monthEnd ? e.payment_date : monthEnd
    expenseByDate.set(d, (expenseByDate.get(d) ?? 0) + (e.amount ?? 0))
  }

  // LINE予定客数（日次）
  const lineByDate = new Map<string, number>()
  for (const r of reservationsRes.data ?? []) {
    lineByDate.set(r.date, (lineByDate.get(r.date) ?? 0) + (r.guest_count ?? 0))
  }

  // BASE売上（日次）
  const baseByDate = new Map<string, number>()
  for (const b of baseOrdersRes.data ?? []) {
    baseByDate.set(b.business_date, (baseByDate.get(b.business_date) ?? 0) + (b.base_price ?? 0) * (b.quantity ?? 1))
  }

  // 日別目標（指標別・日次）
  const salesTargetByDate = new Map<string, number>()
  const attendanceTargetByDate = new Map<string, number>()
  const guestsTargetByDate = new Map<string, number>()
  for (const t of targetsRes.data ?? []) {
    const v = Number(t.value) || 0
    if (t.metric === 'sales') salesTargetByDate.set(t.date, v)
    else if (t.metric === 'attendance') attendanceTargetByDate.set(t.date, v)
    else if (t.metric === 'guests') guestsTargetByDate.set(t.date, v)
  }

  // 人件費（日次展開 + 突合検証）
  const { byDate: laborByDate, reconciliation } = computeDailyLaborCost(payslips, allDates)

  // ===== 日毎の行を組み立て =====
  const rows: DailyPlRow[] = allDates.map((date, idx) => {
    const dayOrders = orders.filter((o) => o.order_date?.startsWith(date))
    const sales = dayOrders.reduce((s, o) => s + (Number(o.total_incl_tax) || 0), 0)
    const cashSales = dayOrders.reduce((s, o) => {
      const p = pickPayment(o)
      return s + (Number(p?.cash_amount) || 0) - (Number(p?.change_amount) || 0)
    }, 0)
    const cardSales = dayOrders.reduce((s, o) => s + (Number(pickPayment(o)?.credit_card_amount) || 0), 0)
    const otherSales = dayOrders.reduce((s, o) => s + (Number(pickPayment(o)?.other_payment_amount) || 0), 0)
    const guests = dayOrders.reduce((s, o) => s + (Number(o.guest_count) || 0), 0)
    const guestsByType = (t: string) =>
      dayOrders.filter((o) => o.visit_type === t).reduce((s, o) => s + (Number(o.guest_count) || 0), 0)
    const orderCount = dayOrders.length
    const baseSales = baseByDate.get(date) ?? 0
    const totalSales = sales + baseSales
    const target = salesTargetByDate.get(date) ?? null
    const targetAttendance = attendanceTargetByDate.get(date) ?? null
    const targetGuests = guestsTargetByDate.get(date) ?? null
    const laborCost = laborByDate.get(date) ?? 0
    const expense = expenseByDate.get(date) ?? 0
    const shiftCount = shiftByDate.get(date)?.size ?? 0
    const attendanceCount = attByDate.get(date) ?? 0

    return {
      date,
      day: idx + 1,
      eventName: eventByDate.get(date) ?? null,
      sales,
      cashSales,
      cardSales,
      otherSales,
      baseSales,
      totalSales,
      orderCount,
      guests,
      firstTimeGuests: guestsByType('初回'),
      returnGuests: guestsByType('再訪'),
      regularGuests: guestsByType('常連'),
      avgSpend: orderCount > 0 ? Math.round(sales / orderCount) : 0,
      laborCost,
      laborCostRate: totalSales > 0 ? laborCost / totalSales : null,
      expense,
      expenseRate: totalSales > 0 ? expense / totalSales : null,
      grossProfit: totalSales - laborCost,
      shiftCount,
      attendanceCount,
      attendanceRate: shiftCount > 0 ? attendanceCount / shiftCount : null,
      lineReservedGuests: lineByDate.get(date) ?? 0,
      target,
      achievementRate: target && target > 0 ? totalSales / target : null,
      targetAttendance,
      achievementRateAttendance: targetAttendance && targetAttendance > 0 ? attendanceCount / targetAttendance : null,
      targetGuests,
      achievementRateGuests: targetGuests && targetGuests > 0 ? guests / targetGuests : null,
    }
  })

  // ===== サマリ（合計 + 平均 + 率の再計算） =====
  const sumOf = (f: (r: DailyPlRow) => number) => rows.reduce((s, r) => s + f(r), 0)
  const sSales = sumOf((r) => r.sales)
  const sBase = sumOf((r) => r.baseSales)
  const sTotal = sSales + sBase
  const sLabor = sumOf((r) => r.laborCost)
  const sExpense = sumOf((r) => r.expense)
  const sOrder = sumOf((r) => r.orderCount)
  const sGuests = sumOf((r) => r.guests)
  const sShift = sumOf((r) => r.shiftCount)
  const sAtt = sumOf((r) => r.attendanceCount)
  const sTarget = sumOf((r) => r.target ?? 0)
  const sTargetAtt = sumOf((r) => r.targetAttendance ?? 0)
  const sTargetGuests = sumOf((r) => r.targetGuests ?? 0)
  // 出勤率の月合計は「営業が終わった日（売上のある日）」のみで算出
  // （未来のシフト予定が分母に入って率が薄まるのを防ぐ）
  const openRows = rows.filter((r) => r.sales > 0)
  const businessDays = openRows.length
  const sShiftOpen = openRows.reduce((s, r) => s + r.shiftCount, 0)
  const sAttOpen = openRows.reduce((s, r) => s + r.attendanceCount, 0)

  const summary: DailyPlSummary = {
    sales: sSales,
    cashSales: sumOf((r) => r.cashSales),
    cardSales: sumOf((r) => r.cardSales),
    otherSales: sumOf((r) => r.otherSales),
    baseSales: sBase,
    totalSales: sTotal,
    orderCount: sOrder,
    guests: sGuests,
    firstTimeGuests: sumOf((r) => r.firstTimeGuests),
    returnGuests: sumOf((r) => r.returnGuests),
    regularGuests: sumOf((r) => r.regularGuests),
    laborCost: sLabor,
    expense: sExpense,
    grossProfit: sTotal - sLabor,
    shiftCount: sShift,
    attendanceCount: sAtt,
    lineReservedGuests: sumOf((r) => r.lineReservedGuests),
    avgSpend: sOrder > 0 ? Math.round(sSales / sOrder) : 0,
    laborCostRate: sTotal > 0 ? sLabor / sTotal : null,
    expenseRate: sTotal > 0 ? sExpense / sTotal : null,
    attendanceRate: sShiftOpen > 0 ? sAttOpen / sShiftOpen : null,
    businessDays,
    avgDailySales: businessDays > 0 ? Math.round(sSales / businessDays) : 0,
    avgDailyGuests: businessDays > 0 ? Math.round(sGuests / businessDays) : 0,
    targetTotal: sTarget,
    achievementRate: sTarget > 0 ? sTotal / sTarget : null,
    targetAttendanceTotal: sTargetAtt,
    achievementRateAttendance: sTargetAtt > 0 ? sAtt / sTargetAtt : null,
    targetGuestsTotal: sTargetGuests,
    achievementRateGuests: sTargetGuests > 0 ? sGuests / sTargetGuests : null,
  }

  const response: DailyPlResponse = {
    storeId,
    yearMonth,
    rows,
    summary,
    labor: reconciliation,
    meta: { payslipCount: payslips.length, recalculated: payslips.length > 0 },
  }

  return NextResponse.json(response)
}
