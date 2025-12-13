import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Service Role Key でRLSをバイパス
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// セッション検証
async function validateSession(): Promise<{ storeId: number; isAllStore: boolean } | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return null

  try {
    const session = JSON.parse(sessionCookie.value)
    return {
      storeId: session.storeId,
      isAllStore: session.isAllStore || false
    }
  } catch {
    return null
  }
}

// POST: 指定期間のデータを確定
export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { store_id, year_month, date_from, date_to, unfinalize } = body

    const storeId = store_id || session.storeId
    const isUnfinalize = unfinalize === true

    let startDate: string
    let endDate: string

    // year_month形式（2024-12）または日付範囲
    if (year_month) {
      const [year, month] = year_month.split('-').map(Number)
      startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate()
      endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
    } else if (date_from && date_to) {
      startDate = date_from
      endDate = date_to
    } else {
      return NextResponse.json({ error: 'year_month or date_from/date_to is required' }, { status: 400 })
    }

    // cast_daily_statsを更新
    const { data: statsData, error: statsError } = await supabaseAdmin
      .from('cast_daily_stats')
      .update({
        is_finalized: !isUnfinalize,
        finalized_at: isUnfinalize ? null : new Date().toISOString()
      })
      .eq('store_id', storeId)
      .gte('date', startDate)
      .lte('date', endDate)
      .select()

    if (statsError) throw statsError

    return NextResponse.json({
      success: true,
      action: isUnfinalize ? 'unfinalized' : 'finalized',
      period: { from: startDate, to: endDate },
      recordsUpdated: statsData?.length || 0
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
