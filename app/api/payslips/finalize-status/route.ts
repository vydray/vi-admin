import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * 月次確定の状況を取得
 * GET ?store_id=...&year_month=YYYY-MM → { total, finalized }
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const storeId = url.searchParams.get('store_id')
  const yearMonth = url.searchParams.get('year_month')

  if (!storeId || !yearMonth) {
    return NextResponse.json({ error: 'store_id と year_month は必須' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('payslips')
    .select('status')
    .eq('store_id', Number(storeId))
    .eq('year_month', yearMonth)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const total = data?.length ?? 0
  const finalized = (data || []).filter(p => p.status === 'finalized').length

  return NextResponse.json({ total, finalized })
}
