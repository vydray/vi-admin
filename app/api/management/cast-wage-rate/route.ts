import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase'
import type { CastWageRateResponse, CastWageRateRow } from '@/types/management'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface StatRow {
  cast_id: number
  total_sales_item_based: number | null
  total_sales_receipt_based: number | null
  help_sales_item_based: number | null
  help_sales_receipt_based: number | null
}
interface OrderRow {
  staff_name: string | null
  total_incl_tax: number | null
  guest_count: number | null
  order_date: string | null
}
const ABSENCE_CODES = new Set(['same_day_absence', 'advance_absence', 'no_call_no_show', 'excused'])

export async function POST(request: NextRequest) {
  // ===== 認証: super_admin 専用 =====
  const cookieStore = await cookies()
  const sc = cookieStore.get('admin_session')
  if (!sc) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let session: { role?: string; store_id?: number | string; permissions?: Record<string, boolean> }
  try {
    session = JSON.parse(sc.value)
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
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
    if (typeof body.year_month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.year_month)) {
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

  const supabase = getSupabaseServerClient()

  const [payslipsRes, statsRes, ordersRes, castsRes, settingsRes, shiftsRes, attendanceRes, attStatusRes, reservationsRes, itemsRes] =
    await Promise.all([
      supabase.from('payslips').select('cast_id, gross_total').eq('store_id', storeId).eq('year_month', yearMonth),
      supabase
        .from('cast_daily_stats')
        .select('cast_id, total_sales_item_based, total_sales_receipt_based, help_sales_item_based, help_sales_receipt_based')
        .eq('store_id', storeId)
        .gte('date', monthStart)
        .lte('date', monthEnd),
      supabase
        .from('orders')
        .select('staff_name, total_incl_tax, guest_count, order_date')
        .eq('store_id', storeId)
        .gte('order_date', monthStart)
        .lte('order_date', monthEnd + 'T23:59:59')
        .is('deleted_at', null),
      supabase.from('casts').select('id, name').eq('store_id', storeId),
      supabase.from('sales_settings').select('published_aggregation').eq('store_id', storeId).maybeSingle(),
      supabase.from('shifts').select('cast_id, date').eq('store_id', storeId).gte('date', monthStart).lte('date', monthEnd),
      supabase.from('attendance').select('cast_name, date, status_id').eq('store_id', storeId).gte('date', monthStart).lte('date', monthEnd),
      supabase.from('attendance_statuses').select('id, code').eq('store_id', storeId).eq('is_active', true),
      supabase
        .from('visitor_reservations')
        .select('cast_id, guest_count, source')
        .eq('store_id', storeId)
        .eq('source', 'line')
        .gte('date', monthStart)
        .lte('date', monthEnd),
      // ヘルプ明細（自分の卓以外で入れた商品）。1000件超を range で全件取得
      supabase
        .from('cast_daily_items')
        .select('help_cast_id, subtotal')
        .eq('store_id', storeId)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .not('help_cast_id', 'is', null)
        .range(0, 9999),
    ])

  const itemAxis = settingsRes.data?.published_aggregation === 'receipt_based'
  const salesAxis: keyof StatRow = itemAxis ? 'total_sales_receipt_based' : 'total_sales_item_based'

  // 給与（cast_id 別）
  const grossByCast = new Map<number, number>()
  for (const p of payslipsRes.data ?? []) {
    grossByCast.set(p.cast_id, (grossByCast.get(p.cast_id) ?? 0) + (p.gross_total || 0))
  }

  // ① キャスト売上・ヘルプ売上（cast_id 別）
  const salesByCast = new Map<number, number>()
  for (const s of (statsRes.data ?? []) as StatRow[]) {
    salesByCast.set(s.cast_id, (salesByCast.get(s.cast_id) ?? 0) + (Number(s[salesAxis]) || 0))
  }
  // ヘルプ = そのキャストがヘルプで入った商品の金額（help_cast_id 別 subtotal 合計）
  // みすみら式で help_sales=0 でも、関わった商品量を捉えるため明細の subtotal で集計
  const helpByCast = new Map<number, number>()
  for (const it of (itemsRes.data ?? []) as { help_cast_id: number | null; subtotal: number | null }[]) {
    if (it.help_cast_id != null) {
      helpByCast.set(it.help_cast_id, (helpByCast.get(it.help_cast_id) ?? 0) + (Number(it.subtotal) || 0))
    }
  }

  // cast_id <-> cast_name
  const nameToId = new Map<string, number>()
  const idToName = new Map<number, string>()
  for (const c of castsRes.data ?? []) {
    nameToId.set(c.name, c.id)
    idToName.set(c.id, c.name)
  }

  // ② 推し卓の伝票合計 + 実来店客数（orders.staff_name にそのキャストが含まれる卓）
  const tableByCast = new Map<number, number>()
  const nominatedGuestsByCast = new Map<number, number>()
  for (const o of (ordersRes.data ?? []) as OrderRow[]) {
    if (!o.staff_name) continue
    const total = Number(o.total_incl_tax) || 0
    const guests = Number(o.guest_count) || 0
    const names = o.staff_name.split(',').map((n) => n.trim()).filter(Boolean)
    for (const name of names) {
      const id = nameToId.get(name)
      if (id != null) {
        tableByCast.set(id, (tableByCast.get(id) ?? 0) + total)
        nominatedGuestsByCast.set(id, (nominatedGuestsByCast.get(id) ?? 0) + guests)
      }
    }
  }

  // 最終営業日（売上のあった最後の日）= orders の最大 order_date。
  // まだ営業していない未来日のシフトを出勤率の分母から外すために使う
  let maxBusinessDate = monthStart
  for (const o of (ordersRes.data ?? []) as OrderRow[]) {
    const d = (o.order_date ?? '').slice(0, 10)
    if (d && d > maxBusinessDate) maxBusinessDate = d
  }

  // シフト予定日数（cast_id 別・distinct date・最終営業日まで＝未来シフトは除外）
  const shiftDaysByCast = new Map<number, Set<string>>()
  for (const s of shiftsRes.data ?? []) {
    if (s.date > maxBusinessDate) continue // まだ来ていない未来日のシフトは出勤率の分母に入れない
    if (!shiftDaysByCast.has(s.cast_id)) shiftDaysByCast.set(s.cast_id, new Set())
    shiftDaysByCast.get(s.cast_id)!.add(s.date)
  }

  // 出勤扱いステータス（欠勤系を除外）
  const workDayStatusIds = new Set(
    (attStatusRes.data ?? []).filter((s) => !ABSENCE_CODES.has(s.code ?? '')).map((s) => String(s.id))
  )
  // 欠勤系ステータス（当欠・無連絡欠勤等）
  const absenceStatusIds = new Set(
    (attStatusRes.data ?? []).filter((s) => ABSENCE_CODES.has(s.code ?? '')).map((s) => String(s.id))
  )
  // 実出勤日数（cast_name→cast_id・出勤扱い・distinct date）
  const attendedByCast = new Map<number, Set<string>>()
  for (const a of attendanceRes.data ?? []) {
    if (!a.status_id || !workDayStatusIds.has(String(a.status_id))) continue
    const id = nameToId.get(a.cast_name)
    if (id == null) continue
    if (!attendedByCast.has(id)) attendedByCast.set(id, new Set())
    attendedByCast.get(id)!.add(a.date)
  }
  // 欠勤日数（cast_name→cast_id・欠勤系・distinct date）
  const absentByCast = new Map<number, Set<string>>()
  for (const a of attendanceRes.data ?? []) {
    if (!a.status_id || !absenceStatusIds.has(String(a.status_id))) continue
    const id = nameToId.get(a.cast_name)
    if (id == null) continue
    if (!absentByCast.has(id)) absentByCast.set(id, new Set())
    absentByCast.get(id)!.add(a.date)
  }

  // 公式LINE予定客数（cast_id 別）
  const lineByCast = new Map<number, number>()
  for (const r of reservationsRes.data ?? []) {
    if (r.cast_id == null) continue
    lineByCast.set(r.cast_id, (lineByCast.get(r.cast_id) ?? 0) + (Number(r.guest_count) || 0))
  }

  const castIds = new Set<number>([
    ...grossByCast.keys(),
    ...salesByCast.keys(),
    ...tableByCast.keys(),
    ...shiftDaysByCast.keys(),
    ...lineByCast.keys(),
  ])
  const rows: CastWageRateRow[] = [...castIds]
    .map((id) => {
      const gross = grossByCast.get(id) ?? 0
      const castSales = salesByCast.get(id) ?? 0
      const helpSales = helpByCast.get(id) ?? 0
      const tableTotal = tableByCast.get(id) ?? 0
      const shiftDays = shiftDaysByCast.get(id)?.size ?? 0
      const attendedDays = attendedByCast.get(id)?.size ?? 0
      const absentDays = absentByCast.get(id)?.size ?? 0
      const lineReserved = lineByCast.get(id) ?? 0
      const nominatedGuests = nominatedGuestsByCast.get(id) ?? 0
      return {
        castId: id,
        castName: idToName.get(id) ?? `#${id}`,
        gross,
        castSales,
        helpSales,
        tableTotal,
        rate1: castSales > 0 ? gross / castSales : null,
        rate2: tableTotal > 0 ? gross / tableTotal : null,
        shiftDays,
        attendedDays,
        absentDays,
        attendanceRate: shiftDays > 0 ? attendedDays / shiftDays : null,
        lineReserved,
        nominatedGuests,
        callRate: lineReserved > 0 ? nominatedGuests / lineReserved : null,
      }
    })
    .sort((a, b) => b.castSales - a.castSales)

  const response: CastWageRateResponse = {
    storeId,
    yearMonth,
    axis: salesAxis === 'total_sales_receipt_based' ? 'total_sales_receipt_based' : 'total_sales_item_based',
    rows,
  }
  return NextResponse.json(response)
}
