import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service Role Key でRLSをバイパス
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// LINE User IDからキャスト情報を取得
async function getCastByLineUserId(lineUserId: string): Promise<{
  castId: number
  storeId: number
  name: string
} | null> {
  const { data: cast, error } = await supabaseAdmin
    .from('casts')
    .select('id, store_id, name')
    .eq('line_user_id', lineUserId)
    .eq('is_active', true)
    .single()

  if (error || !cast) return null

  return {
    castId: cast.id,
    storeId: cast.store_id,
    name: cast.name
  }
}

// 日付をYYYY-MM-DD形式に変換
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

// GET: キャストの給料情報を取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const lineUserId = searchParams.get('line_user_id')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    if (!lineUserId) {
      return NextResponse.json({ error: 'line_user_id is required' }, { status: 400 })
    }

    // LINE User IDからキャスト情報を取得
    const castInfo = await getCastByLineUserId(lineUserId)
    if (!castInfo) {
      return NextResponse.json({ error: 'Cast not found' }, { status: 404 })
    }

    // 日付範囲を決定
    let startDate: string
    let endDate: string

    if (year && month) {
      // 月指定の場合
      const y = parseInt(year)
      const m = parseInt(month)
      startDate = `${y}-${String(m).padStart(2, '0')}-01`
      const lastDay = new Date(y, m, 0).getDate()
      endDate = `${y}-${String(m).padStart(2, '0')}-${lastDay}`
    } else if (dateFrom && dateTo) {
      // 日付範囲指定の場合
      startDate = dateFrom
      endDate = dateTo
    } else {
      // デフォルト: 今月
      const now = new Date()
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      endDate = formatDate(now)
    }

    // 日別統計データを取得
    const { data: dailyStats, error: statsError } = await supabaseAdmin
      .from('cast_daily_stats')
      .select(`
        date,
        self_sales_item_based,
        help_sales_item_based,
        total_sales_item_based,
        self_sales_receipt_based,
        help_sales_receipt_based,
        total_sales_receipt_based,
        product_back_item_based,
        product_back_receipt_based,
        work_hours,
        base_hourly_wage,
        special_day_bonus,
        costume_bonus,
        total_hourly_wage,
        wage_amount,
        is_finalized
      `)
      .eq('cast_id', castInfo.castId)
      .eq('store_id', castInfo.storeId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })

    if (statsError) throw statsError

    // 集計値を計算
    const summary = {
      totalWorkHours: 0,
      totalWageAmount: 0,
      totalSalesItemBased: 0,
      totalSalesReceiptBased: 0,
      totalProductBackItemBased: 0,
      totalProductBackReceiptBased: 0,
      daysWorked: 0
    }

    if (dailyStats) {
      for (const stat of dailyStats) {
        if (stat.work_hours > 0) {
          summary.daysWorked++
        }
        summary.totalWorkHours += stat.work_hours || 0
        summary.totalWageAmount += stat.wage_amount || 0
        summary.totalSalesItemBased += stat.total_sales_item_based || 0
        summary.totalSalesReceiptBased += stat.total_sales_receipt_based || 0
        summary.totalProductBackItemBased += stat.product_back_item_based || 0
        summary.totalProductBackReceiptBased += stat.product_back_receipt_based || 0
      }
    }

    // バック率設定を取得して合計バック額を計算
    const { data: compensationSettings } = await supabaseAdmin
      .from('compensation_settings')
      .select('back_rate_self, back_rate_help')
      .eq('cast_id', castInfo.castId)
      .eq('store_id', castInfo.storeId)
      .single()

    const backRateSelf = compensationSettings?.back_rate_self || 0
    const backRateHelp = compensationSettings?.back_rate_help || 0

    // バック額を計算（売上ベース）
    const selfBackItemBased = Math.round(summary.totalSalesItemBased * backRateSelf / 100)
    const helpBackItemBased = Math.round((summary.totalSalesItemBased - summary.totalSalesItemBased * backRateSelf / 100) * backRateHelp / 100)
    const selfBackReceiptBased = Math.round(summary.totalSalesReceiptBased * backRateSelf / 100)
    const helpBackReceiptBased = Math.round((summary.totalSalesReceiptBased - summary.totalSalesReceiptBased * backRateSelf / 100) * backRateHelp / 100)

    return NextResponse.json({
      cast: {
        id: castInfo.castId,
        name: castInfo.name
      },
      period: {
        from: startDate,
        to: endDate
      },
      summary: {
        ...summary,
        // 時給収入
        totalWorkHours: Math.round(summary.totalWorkHours * 100) / 100,
        totalWageAmount: summary.totalWageAmount,
        // 売上バック（商品ベース）
        selfBackItemBased,
        helpBackItemBased,
        totalBackItemBased: selfBackItemBased + helpBackItemBased + summary.totalProductBackItemBased,
        // 売上バック（伝票ベース）
        selfBackReceiptBased,
        helpBackReceiptBased,
        totalBackReceiptBased: selfBackReceiptBased + helpBackReceiptBased + summary.totalProductBackReceiptBased,
        // 合計報酬
        totalEarningsItemBased: summary.totalWageAmount + selfBackItemBased + helpBackItemBased + summary.totalProductBackItemBased,
        totalEarningsReceiptBased: summary.totalWageAmount + selfBackReceiptBased + helpBackReceiptBased + summary.totalProductBackReceiptBased
      },
      dailyStats: dailyStats?.map(stat => ({
        date: stat.date,
        workHours: stat.work_hours,
        baseHourlyWage: stat.base_hourly_wage,
        specialDayBonus: stat.special_day_bonus,
        costumeBonus: stat.costume_bonus,
        totalHourlyWage: stat.total_hourly_wage,
        wageAmount: stat.wage_amount,
        salesItemBased: stat.total_sales_item_based,
        salesReceiptBased: stat.total_sales_receipt_based,
        productBackItemBased: stat.product_back_item_based,
        productBackReceiptBased: stat.product_back_receipt_based,
        isFinalized: stat.is_finalized
      })) || []
    })
  } catch (error) {
    console.error('Cast salary API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
