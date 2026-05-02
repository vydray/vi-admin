import { NextRequest, NextResponse } from 'next/server'
import { format, startOfMonth, endOfMonth, parse } from 'date-fns'
import { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase'

// Supabase デフォルトの max-rows (1000) を超えるデータを全件取得
async function fetchAll<T>(
  supabase: SupabaseClient,
  build: (q: ReturnType<SupabaseClient['from']>) => unknown,
  table: string,
): Promise<T[]> {
  const PAGE_SIZE = 1000
  const all: T[] = []
  let from = 0
  while (true) {
    const q = build(supabase.from(table)) as { range: (a: number, b: number) => Promise<{ data: T[] | null; error: unknown }> }
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1)
    if (error || !data) {
      if (error) console.error(`fetchAll ${table} error`, error)
      break
    }
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const storeId = Number(searchParams.get('store_id'))
  const yearMonth = searchParams.get('year_month')

  if (!storeId || !yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
    return NextResponse.json(
      { error: 'store_id, year_month (YYYY-MM) required' },
      { status: 400 },
    )
  }

  const supabase = getSupabaseServerClient()
  const month = parse(yearMonth, 'yyyy-MM', new Date())
  const startDate = format(startOfMonth(month), 'yyyy-MM-dd')
  const endDate = format(endOfMonth(month), 'yyyy-MM-dd')

  const [attendanceRows, payslipRowsRaw, castRows] = await Promise.all([
    fetchAll<{ cast_name: string; daily_payment: number | null; late_minutes: number | null }>(
      supabase,
      (q) =>
        q
          .select('cast_name, daily_payment, late_minutes')
          .eq('store_id', storeId)
          .gte('date', startDate)
          .lte('date', endDate),
      'attendance',
    ),
    fetchAll<{ cast_id: number; daily_payment: number | null; casts: { name: string } | { name: string }[] | null }>(
      supabase,
      (q) =>
        q
          .select('cast_id, daily_payment, casts(name)')
          .eq('store_id', storeId)
          .eq('year_month', yearMonth),
      'payslips',
    ),
    fetchAll<{ id: number; name: string }>(
      supabase,
      (q) => q.select('id, name').eq('store_id', storeId),
      'casts',
    ),
  ])

  const payslipRows = payslipRowsRaw

  // cast_id → name の lookup
  const castNameById = new Map<number, string>()
  for (const c of castRows) castNameById.set(c.id, c.name)

  // attendance 集計
  const attendanceByCast = new Map<string, { daily_payment: number; days: number }>()
  for (const a of attendanceRows) {
    const existing = attendanceByCast.get(a.cast_name) || { daily_payment: 0, days: 0 }
    existing.daily_payment += a.daily_payment || 0
    existing.days += 1
    attendanceByCast.set(a.cast_name, existing)
  }

  const attendanceDailyPaymentSum = attendanceRows.reduce(
    (s, a) => s + (a.daily_payment || 0),
    0,
  )
  const attendanceCastCount = attendanceByCast.size

  // payslip 集計
  const payslipDailyPaymentSum = payslipRows.reduce(
    (s, p) => s + (p.daily_payment || 0),
    0,
  )
  const payslipCastCount = payslipRows.length
  const payslipCastNames = new Set<string>()
  for (const p of payslipRows) {
    const name = castNameById.get(p.cast_id)
    if (name) payslipCastNames.add(name)
  }

  // casts に存在するか check
  const castNameSet = new Set(castRows.map((c) => c.name))

  // attendance に出てるが payslips に出てないキャスト
  const missingFromPayslip: Array<{
    cast_name: string
    daily_payment: number
    days: number
    in_casts_table: boolean
  }> = []
  for (const [castName, agg] of attendanceByCast.entries()) {
    if (!payslipCastNames.has(castName)) {
      missingFromPayslip.push({
        cast_name: castName,
        daily_payment: agg.daily_payment,
        days: agg.days,
        in_casts_table: castNameSet.has(castName),
      })
    }
  }

  return NextResponse.json({
    attendance: {
      daily_payment_sum: attendanceDailyPaymentSum,
      cast_count: attendanceCastCount,
    },
    payslip: {
      daily_payment_sum: payslipDailyPaymentSum,
      cast_count: payslipCastCount,
    },
    daily_payment_match: attendanceDailyPaymentSum === payslipDailyPaymentSum,
    daily_payment_diff: attendanceDailyPaymentSum - payslipDailyPaymentSum,
    missing_from_payslip: missingFromPayslip,
  })
}
