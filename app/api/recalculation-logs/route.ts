import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  // 認証チェック
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('store_id')
  const castId = searchParams.get('cast_id')
  const yearMonth = searchParams.get('year_month')
  const mode = searchParams.get('mode') // 'batches' | 'compare' | null(default: logs)

  if (!storeId) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 })
  }

  // バッチ一覧モード: その月のバッチをグルーピングして返す
  if (mode === 'batches' && yearMonth) {
    const { data, error } = await supabaseAdmin
      .from('payslip_recalculation_logs')
      .select('batch_id, triggered_by, created_at, cast_name')
      .eq('store_id', Number(storeId))
      .eq('year_month', yearMonth)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch batches' }, { status: 500 })
    }

    // batch_idでグルーピング
    const batchMap = new Map<string, { batch_id: string; triggered_by: string; created_at: string; cast_count: number }>()
    for (const row of data || []) {
      if (!batchMap.has(row.batch_id)) {
        batchMap.set(row.batch_id, {
          batch_id: row.batch_id,
          triggered_by: row.triggered_by,
          created_at: row.created_at,
          cast_count: 1,
        })
      } else {
        batchMap.get(row.batch_id)!.cast_count++
      }
    }

    return NextResponse.json({ batches: Array.from(batchMap.values()) })
  }

  // 比較モード: 2つのバッチ間の差分を返す
  if (mode === 'compare' && yearMonth) {
    const fromBatch = searchParams.get('from_batch')
    const toBatch = searchParams.get('to_batch') // null = 現在のpayslip値

    // "from" のログを取得
    let fromValues: Record<number, { cast_name: string; values: Record<string, number> }> = {}
    if (fromBatch) {
      const { data } = await supabaseAdmin
        .from('payslip_recalculation_logs')
        .select('cast_id, cast_name, after_values')
        .eq('batch_id', fromBatch)
      for (const row of data || []) {
        fromValues[row.cast_id] = { cast_name: row.cast_name, values: row.after_values }
      }
    }

    // "to" の値を取得
    let toValues: Record<number, { cast_name: string; values: Record<string, number> }> = {}
    if (toBatch && toBatch !== 'current') {
      const { data } = await supabaseAdmin
        .from('payslip_recalculation_logs')
        .select('cast_id, cast_name, after_values')
        .eq('batch_id', toBatch)
      for (const row of data || []) {
        toValues[row.cast_id] = { cast_name: row.cast_name, values: row.after_values }
      }
    } else {
      // 現在のpayslip値を取得
      const { data } = await supabaseAdmin
        .from('payslips')
        .select('cast_id, gross_total, hourly_income, sales_back, product_back, fixed_amount, bonus_total, total_deduction, net_payment, casts(name)')
        .eq('store_id', Number(storeId))
        .eq('year_month', yearMonth)
      for (const row of data || []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const castName = ((row as any).casts as { name: string } | null)?.name || ''
        toValues[row.cast_id] = {
          cast_name: castName,
          values: {
            gross_total: row.gross_total ?? 0,
            hourly_income: row.hourly_income ?? 0,
            sales_back: row.sales_back ?? 0,
            product_back: row.product_back ?? 0,
            fixed_amount: row.fixed_amount ?? 0,
            bonus_total: row.bonus_total ?? 0,
            total_deduction: row.total_deduction ?? 0,
            net_payment: row.net_payment ?? 0,
          }
        }
      }
    }

    // fromが未指定の場合: 最新の全体バッチのbefore_valuesを使う
    if (!fromBatch) {
      // 最新バッチを取得
      const { data: latestLogs } = await supabaseAdmin
        .from('payslip_recalculation_logs')
        .select('batch_id, cast_id, cast_name, before_values, created_at')
        .eq('store_id', Number(storeId))
        .eq('year_month', yearMonth)
        .order('created_at', { ascending: false })
        .limit(50)

      if (latestLogs && latestLogs.length > 0) {
        // 最新バッチのbefore_valuesを使う
        const latestBatchId = latestLogs[0].batch_id
        for (const row of latestLogs) {
          if (row.batch_id === latestBatchId) {
            fromValues[row.cast_id] = { cast_name: row.cast_name, values: row.before_values }
          }
        }
      }
    }

    // 全キャストの差分を作成
    const allCastIds = new Set([...Object.keys(fromValues).map(Number), ...Object.keys(toValues).map(Number)])
    const comparisons: {
      cast_id: number
      cast_name: string
      from_values: Record<string, number>
      to_values: Record<string, number>
    }[] = []

    for (const castId of allCastIds) {
      const from = fromValues[castId]
      const to = toValues[castId]
      if (!from && !to) continue

      const emptyValues = { gross_total: 0, hourly_income: 0, sales_back: 0, product_back: 0, fixed_amount: 0, bonus_total: 0, total_deduction: 0, net_payment: 0 }
      comparisons.push({
        cast_id: castId,
        cast_name: to?.cast_name || from?.cast_name || '',
        from_values: from?.values || emptyValues,
        to_values: to?.values || emptyValues,
      })
    }

    comparisons.sort((a, b) => a.cast_name.localeCompare(b.cast_name, 'ja'))

    return NextResponse.json({ comparisons })
  }

  // デフォルト: 個別キャストのログ一覧
  let query = supabaseAdmin
    .from('payslip_recalculation_logs')
    .select('*')
    .eq('store_id', Number(storeId))
    .order('created_at', { ascending: false })

  if (castId) {
    query = query.eq('cast_id', Number(castId))
  }
  if (yearMonth) {
    query = query.eq('year_month', yearMonth)
  }

  const { data, error } = await query.limit(100)

  if (error) {
    console.error('Recalculation logs fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
  }

  return NextResponse.json({ logs: data })
}
