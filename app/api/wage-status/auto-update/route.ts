import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { WageStatusCondition, CastStatusProgress, WageStatus } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5分

/**
 * 自動昇格・降格バッチ処理
 *
 * 毎日実行されることを想定
 *
 * 処理フロー:
 * 1. 全キャストのステータス進捗を取得
 * 2. 月間出勤日数と累計出勤日数を集計
 * 3. 昇格条件をチェック（累計出勤日数など）
 * 4. 降格条件をチェック（月間出勤日数など）
 * 5. 条件を満たした場合、ステータスを変更
 * 6. 履歴を記録
 */
export async function POST(request: Request) {
  try {
    // 認証チェック（Vercel Cronからのリクエストを許可）
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results = {
      processed: 0,
      promoted: 0,
      demoted: 0,
      errors: [] as string[],
    }

    // 全店舗を取得
    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id, name')
      .eq('is_active', true)

    if (storesError) throw storesError

    for (const store of stores || []) {
      try {
        await processStore(store.id, results)
      } catch (error) {
        console.error(`Store ${store.id} processing error:`, error)
        results.errors.push(`Store ${store.name}: ${error}`)
      }
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Auto status update error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * 店舗ごとの処理
 */
async function processStore(storeId: number, results: any) {
  // 全キャストを取得
  const { data: casts, error: castsError } = await supabase
    .from('casts')
    .select('id, name')
    .eq('store_id', storeId)
    .eq('is_active', true)

  if (castsError) throw castsError

  for (const cast of casts || []) {
    try {
      await processCast(cast.id, storeId, results)
      results.processed++
    } catch (error) {
      console.error(`Cast ${cast.id} processing error:`, error)
      results.errors.push(`Cast ${cast.name}: ${error}`)
    }
  }
}

/**
 * キャスト個別の処理
 */
async function processCast(castId: number, storeId: number, results: any) {
  // ステータス進捗を取得または初期化
  let { data: progress, error: progressError } = await supabase
    .from('cast_status_progress')
    .select('*')
    .eq('cast_id', castId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (progressError) throw progressError

  // 進捗がない場合は初期化
  if (!progress) {
    // デフォルトステータスを取得
    const { data: defaultStatus } = await supabase
      .from('wage_statuses')
      .select('id')
      .eq('store_id', storeId)
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle()

    const { data: newProgress, error: insertError } = await supabase
      .from('cast_status_progress')
      .insert({
        cast_id: castId,
        store_id: storeId,
        current_status_id: defaultStatus?.id || null,
        cumulative_attendance_days: 0,
        status_start_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single()

    if (insertError) throw insertError
    progress = newProgress
  }

  // 現在のステータスがロックされている場合はスキップ
  const { data: castWageSettings } = await supabase
    .from('compensation_settings')
    .select('status_locked')
    .eq('cast_id', castId)
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('target_year', { ascending: false })
    .order('target_month', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (castWageSettings?.status_locked) {
    return // ロックされている場合はスキップ
  }

  // 出勤データを集計
  const today = new Date()
  const currentMonth = today.toISOString().slice(0, 7) // YYYY-MM

  // 月間出勤日数
  const { count: monthlyDays } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true })
    .eq('cast_id', castId)
    .eq('store_id', storeId)
    .gte('date', `${currentMonth}-01`)
    .lt('date', getNextMonthStart(currentMonth))
    .not('status_id', 'is', null)

  // 累計出勤日数の更新（ステータス開始日以降）
  const { count: cumulativeDays } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true })
    .eq('cast_id', castId)
    .eq('store_id', storeId)
    .gte('date', progress.status_start_date)
    .not('status_id', 'is', null)

  // 累計日数を更新
  await supabase
    .from('cast_status_progress')
    .update({
      cumulative_attendance_days: cumulativeDays || 0,
      last_updated_at: new Date().toISOString(),
    })
    .eq('id', progress.id)

  if (!progress.current_status_id) {
    return // ステータスが設定されていない場合はスキップ
  }

  // 現在のステータスの昇格・降格条件を取得
  const { data: conditions, error: conditionsError } = await supabase
    .from('wage_status_conditions')
    .select('*')
    .eq('status_id', progress.current_status_id)

  if (conditionsError) throw conditionsError

  // 降格条件をチェック（優先）
  const demotionConditions = conditions?.filter(c => c.condition_direction === 'demotion') || []
  if (demotionConditions.length > 0) {
    const shouldDemote = checkConditions(demotionConditions, monthlyDays || 0, cumulativeDays || 0)
    if (shouldDemote) {
      await demoteCast(castId, storeId, progress, results)
      return // 降格したので昇格チェックはスキップ
    }
  }

  // 昇格条件をチェック
  const promotionConditions = conditions?.filter(c => c.condition_direction === 'promotion') || []
  if (promotionConditions.length > 0) {
    const shouldPromote = checkConditions(promotionConditions, monthlyDays || 0, cumulativeDays || 0)
    if (shouldPromote) {
      await promoteCast(castId, storeId, progress, results)
    }
  }
}

/**
 * 条件チェック（全ての条件を満たす必要がある）
 */
function checkConditions(
  conditions: WageStatusCondition[],
  monthlyDays: number,
  cumulativeDays: number
): boolean {
  for (const condition of conditions) {
    const value = condition.condition_type === 'cumulative_attendance_days'
      ? cumulativeDays
      : monthlyDays

    const met = evaluateCondition(value, condition.operator, condition.value)
    if (!met) {
      return false // 1つでも満たさなければfalse
    }
  }
  return true // 全て満たした
}

/**
 * 条件の評価
 */
function evaluateCondition(actual: number, operator: string, expected: number): boolean {
  switch (operator) {
    case '>=': return actual >= expected
    case '>': return actual > expected
    case '=': return actual === expected
    case '<=': return actual <= expected
    case '<': return actual < expected
    default: return false
  }
}

/**
 * 昇格処理
 */
async function promoteCast(
  castId: number,
  storeId: number,
  progress: CastStatusProgress,
  results: any
) {
  // 次の優先度のステータスを取得
  const { data: currentStatus } = await supabase
    .from('wage_statuses')
    .select('priority')
    .eq('id', progress.current_status_id!)
    .single()

  const { data: nextStatus } = await supabase
    .from('wage_statuses')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .gt('priority', currentStatus?.priority || 0)
    .order('priority', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!nextStatus) {
    return // 次のステータスがない
  }

  // ステータスを更新
  await supabase
    .from('cast_status_progress')
    .update({
      current_status_id: nextStatus.id,
      cumulative_attendance_days: 0, // リセット
      status_start_date: new Date().toISOString().split('T')[0],
      last_updated_at: new Date().toISOString(),
    })
    .eq('id', progress.id)

  // 履歴を記録
  await supabase
    .from('cast_status_history')
    .insert({
      cast_id: castId,
      store_id: storeId,
      previous_status_id: progress.current_status_id,
      new_status_id: nextStatus.id,
      reason: '自動昇格: 条件を満たしました',
      trigger_type: 'auto',
    })

  // compensation_settingsも更新
  await supabase
    .from('compensation_settings')
    .update({ status_id: nextStatus.id })
    .eq('cast_id', castId)
    .eq('store_id', storeId)
    .eq('is_active', true)

  results.promoted++
}

/**
 * 降格処理
 */
async function demoteCast(
  castId: number,
  storeId: number,
  progress: CastStatusProgress,
  results: any
) {
  // 前の優先度のステータスを取得
  const { data: currentStatus } = await supabase
    .from('wage_statuses')
    .select('priority')
    .eq('id', progress.current_status_id!)
    .single()

  const { data: prevStatus } = await supabase
    .from('wage_statuses')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .lt('priority', currentStatus?.priority || 0)
    .order('priority', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!prevStatus) {
    return // 前のステータスがない
  }

  // ステータスを更新
  await supabase
    .from('cast_status_progress')
    .update({
      current_status_id: prevStatus.id,
      cumulative_attendance_days: 0, // リセット
      status_start_date: new Date().toISOString().split('T')[0],
      last_updated_at: new Date().toISOString(),
    })
    .eq('id', progress.id)

  // 履歴を記録
  await supabase
    .from('cast_status_history')
    .insert({
      cast_id: castId,
      store_id: storeId,
      previous_status_id: progress.current_status_id,
      new_status_id: prevStatus.id,
      reason: '自動降格: 条件を満たしませんでした',
      trigger_type: 'auto',
    })

  // compensation_settingsも更新
  await supabase
    .from('compensation_settings')
    .update({ status_id: prevStatus.id })
    .eq('cast_id', castId)
    .eq('store_id', storeId)
    .eq('is_active', true)

  results.demoted++
}

/**
 * 翌月の開始日を取得
 */
function getNextMonthStart(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
}
