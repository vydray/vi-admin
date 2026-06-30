import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateAdminSession, canAccessStore } from '@/lib/adminSession'

// Service Role Key でRLSをバイパス
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST: 指定期間のデータを確定
export async function POST(request: NextRequest) {
  const session = await validateAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { store_id, year_month, date_from, date_to, unfinalize } = body

    const storeId = store_id || session.storeId

    // 操作対象店舗へのアクセス権を照合（super_adminは全店OK、store_adminは自店のみ）
    if (!canAccessStore(session, storeId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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
