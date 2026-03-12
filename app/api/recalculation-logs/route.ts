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

  if (!storeId) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 })
  }

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
