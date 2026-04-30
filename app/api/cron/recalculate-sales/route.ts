import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recalculateForDate } from '@/lib/recalculateSales'
import { getCurrentBusinessDay } from '@/lib/businessDay'
import { withCronLock } from '@/lib/cronLock'

// Service Role Key でRLSをバイパス
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Cron認証（Vercel Cron Jobs用）
function validateCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // CRON_SECRETが未設定の場合は全てブロック
  if (!cronSecret) {
    console.error('[Cron Auth] CRON_SECRET is not configured')
    return false
  }

  return authHeader === `Bearer ${cronSecret}`
}

// 営業日切替時刻を取得
async function getBusinessDayCutoffHour(storeId: number): Promise<number> {
  const { data } = await supabaseAdmin
    .from('system_settings')
    .select('setting_value')
    .eq('store_id', storeId)
    .eq('setting_key', 'business_day_start_hour')
    .single()

  return data?.setting_value ? parseInt(data.setting_value) : 6
}

// GET: Vercel Cron Jobsから呼ばれる
export async function GET(request: NextRequest) {
  // Cron認証
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Cron Job重複実行防止（ロック取得）
  const result = await withCronLock('recalculate-sales', async () => {
    return await executeRecalculateSales()
  }, 600) // 10分タイムアウト

  if (result === null) {
    return NextResponse.json({
      message: 'Job is already running, skipped'
    })
  }

  return result
}

async function executeRecalculateSales() {
  try {
    // 全アクティブ店舗を取得
    const { data: stores, error: storesError } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('is_active', true)

    if (storesError) throw storesError

    const results: { store_id: number; date: string; success: boolean; castsProcessed: number; itemsProcessed?: number; error?: string }[] = []

    // 各店舗の今日の売上を再計算（店舗ごとの営業日切替時刻を考慮）
    for (const store of stores || []) {
      // 店舗ごとの営業日切替時刻を取得
      const cutoffHour = await getBusinessDayCutoffHour(store.id)

      // 現在の営業日を取得
      const today = getCurrentBusinessDay(cutoffHour)

      // lib/recalculateSales.tsの共通ロジックを使用
      const result = await recalculateForDate(store.id, today)
      results.push({ store_id: store.id, date: today, ...result })

      // 未処理のBASE注文がある日付も再計算
      const { data: unprocessedDates } = await supabaseAdmin
        .from('base_orders')
        .select('business_date')
        .eq('store_id', store.id)
        .eq('is_processed', false)
        .neq('business_date', today)

      const datesAlreadyProcessed = new Set<string>([today])
      if (unprocessedDates && unprocessedDates.length > 0) {
        // 重複を除去
        const uniqueDates = [...new Set(unprocessedDates.map(d => d.business_date))]
        for (const date of uniqueDates) {
          if (date) {
            const pastResult = await recalculateForDate(store.id, date)
            results.push({ store_id: store.id, date, ...pastResult })
            datesAlreadyProcessed.add(date)
          }
        }
      }

      // 売上連動時給キャストがいる店舗は、月内全日を遡及再計算（B案: 完全遡及）
      // ブラケットが昇格したら過去日も自動反映するため
      const { data: uniformWageSettings } = await supabaseAdmin
        .from('compensation_settings')
        .select('compensation_types')
        .eq('store_id', store.id)
        .eq('is_active', true)

      const hasUniformWageCast = (uniformWageSettings || []).some(s => {
        const types = (s.compensation_types || []) as Array<{ use_uniform_based_wage?: boolean }>
        return types.some(t => t.use_uniform_based_wage === true)
      })

      if (hasUniformWageCast) {
        // todayが属する月の月初〜末日を生成
        const [yStr, mStr] = today.split('-')
        const year = Number(yStr)
        const month = Number(mStr)
        const lastDay = new Date(year, month, 0).getDate()  // month は1始まり、Date は0始まり
        for (let d = 1; d <= lastDay; d++) {
          const dateStr = `${yStr}-${mStr}-${String(d).padStart(2, '0')}`
          if (datesAlreadyProcessed.has(dateStr)) continue
          if (dateStr > today) continue  // 未来日は飛ばす
          const r = await recalculateForDate(store.id, dateStr)
          results.push({ store_id: store.id, date: dateStr, ...r })
          datesAlreadyProcessed.add(dateStr)
        }
      }
    }

    return NextResponse.json({
      success: true,
      stores_processed: results.length,
      results
    })
  } catch (error) {
    console.error('[Cron] executeRecalculateSales error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
