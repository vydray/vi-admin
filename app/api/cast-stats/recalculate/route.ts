import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { calculateCastSalesByPublishedMethod, getDefaultSalesSettings } from '@/lib/salesCalculation'
import { getBusinessDayRange } from '@/lib/businessDay'
import { SalesSettings, CastSalesSummary } from '@/types'

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

// 日付をYYYY-MM-DD形式に変換
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

interface OrderItemWithTax {
  id: number
  order_id: string
  product_name: string
  category: string | null
  cast_name: string[] | null
  quantity: number
  unit_price: number
  subtotal: number
}

interface OrderWithStaff {
  id: string
  staff_name: string | null
  order_date: string
  order_items: OrderItemWithTax[]
}

interface Cast {
  id: number
  name: string
  store_id: number
}

interface Attendance {
  cast_name: string
  check_in_datetime: string | null
  check_out_datetime: string | null
  costume_id: number | null
}

interface CompensationSettingsWage {
  cast_id: number
  status_id: number | null
  hourly_wage_override: number | null
}

interface WageStatus {
  id: number
  hourly_wage: number
}

interface SpecialWageDay {
  wage_adjustment: number
}

interface CastDailyItemData {
  cast_id: number
  store_id: number
  date: string
  category: string | null
  product_name: string
  quantity: number
  subtotal: number
  back_amount: number
  is_self: boolean
}

// 商品別キャスト売上を集計（cast_daily_items用）
function aggregateCastDailyItems(
  orders: OrderWithStaff[],
  castMap: Map<string, Cast>,
  storeId: number,
  date: string
): CastDailyItemData[] {
  const itemsMap = new Map<string, CastDailyItemData>()

  for (const order of orders) {
    const staffNames = order.staff_name?.split(',').map(n => n.trim()) || []

    for (const item of order.order_items || []) {
      if (!item.cast_name || item.cast_name.length === 0) continue

      for (const castName of item.cast_name) {
        const cast = castMap.get(castName)
        if (!cast) continue

        const isSelf = staffNames.includes(castName)
        const key = `${cast.id}:${item.product_name}:${item.category || ''}:${isSelf}`

        if (itemsMap.has(key)) {
          const existing = itemsMap.get(key)!
          existing.quantity += item.quantity
          existing.subtotal += item.subtotal
        } else {
          itemsMap.set(key, {
            cast_id: cast.id,
            store_id: storeId,
            date: date,
            category: item.category,
            product_name: item.product_name,
            quantity: item.quantity,
            subtotal: item.subtotal,
            back_amount: 0,
            is_self: isSelf
          })
        }
      }
    }
  }

  return Array.from(itemsMap.values())
}

// 勤務時間を計算（時間単位）- 深夜勤務（日をまたぐ）対応
function calculateWorkHours(clockIn: string | null, clockOut: string | null): number {
  if (!clockIn || !clockOut) return 0
  const start = new Date(clockIn)
  let end = new Date(clockOut)

  // 退勤が出勤より前の場合は翌日扱い（深夜勤務）
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  }

  const diffMs = end.getTime() - start.getTime()
  const hours = diffMs / (1000 * 60 * 60)
  return Math.max(0, Math.round(hours * 100) / 100) // 小数点2桁
}

// sales_settingsを取得
async function loadSalesSettings(storeId: number): Promise<SalesSettings> {
  const { data, error } = await supabaseAdmin
    .from('sales_settings')
    .select('*')
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) {
    console.warn('売上設定の取得に失敗:', error)
  }

  if (data) {
    return data as SalesSettings
  }

  // デフォルト設定を返す
  const defaults = getDefaultSalesSettings(storeId)
  return {
    id: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...defaults,
  } as SalesSettings
}

// system_settingsから税率などを取得
async function loadSystemSettings(storeId: number): Promise<{ tax_rate: number; service_fee_rate: number }> {
  const { data, error } = await supabaseAdmin
    .from('system_settings')
    .select('setting_key, setting_value')
    .eq('store_id', storeId)

  if (error) {
    console.warn('システム設定の取得に失敗:', error)
    return { tax_rate: 10, service_fee_rate: 0 }
  }

  const settings: { tax_rate: number; service_fee_rate: number } = {
    tax_rate: 10,
    service_fee_rate: 0
  }

  if (data) {
    for (const row of data) {
      if (row.setting_key === 'tax_rate') {
        settings.tax_rate = parseFloat(row.setting_value) || 10
      } else if (row.setting_key === 'service_fee_rate') {
        settings.service_fee_rate = parseFloat(row.setting_value) || 0
      }
    }
  }

  return settings
}

// 指定日のデータを再計算して保存
async function recalculateForDate(storeId: number, date: string): Promise<{
  success: boolean
  castsProcessed: number
  itemsProcessed?: number
  error?: string
}> {
  try {
    // 1. sales_settingsを取得
    const salesSettings = await loadSalesSettings(storeId)
    const systemSettings = await loadSystemSettings(storeId)
    const taxRate = systemSettings.tax_rate / 100
    const serviceRate = systemSettings.service_fee_rate / 100

    // 営業日切替時刻を取得
    const { data: cutoffHourSetting } = await supabaseAdmin
      .from('system_settings')
      .select('setting_value')
      .eq('store_id', storeId)
      .eq('setting_key', 'business_day_start_hour')
      .maybeSingle()

    const cutoffHour = cutoffHourSetting?.setting_value ? Number(cutoffHourSetting.setting_value) : 6

    // 営業日の範囲を計算
    const { start, end } = getBusinessDayRange(date, cutoffHour)

    // 2. その日の伝票とorder_itemsを取得（営業日ベース）
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        staff_name,
        order_date,
        order_items (
          id,
          product_name,
          category,
          cast_name,
          quantity,
          unit_price,
          subtotal
        )
      `)
      .eq('store_id', storeId)
      .gte('order_date', start)
      .lte('order_date', end)
      .is('deleted_at', null)

    if (ordersError) throw ordersError

    const typedOrders = (orders || []) as unknown as OrderWithStaff[]

    // 3. キャスト情報を取得
    const { data: casts, error: castsError } = await supabaseAdmin
      .from('casts')
      .select('id, name, store_id')
      .eq('store_id', storeId)

    if (castsError) throw castsError

    const castMap = new Map<string, Cast>()
    casts?.forEach((c: Cast) => castMap.set(c.name, c))

    // 4. 時給関連データを取得
    const { data: attendances } = await supabaseAdmin
      .from('attendance')
      .select('cast_name, check_in_datetime, check_out_datetime, costume_id')
      .eq('store_id', storeId)
      .eq('date', date)

    const attendanceMap = new Map<string, Attendance>()
    attendances?.forEach((a: Attendance) => attendanceMap.set(a.cast_name, a))

    // 報酬設定（時給関連フィールド）
    const { data: compensationSettings } = await supabaseAdmin
      .from('compensation_settings')
      .select('cast_id, status_id, hourly_wage_override')
      .eq('store_id', storeId)

    const compSettingsMap = new Map<number, CompensationSettingsWage>()
    compensationSettings?.forEach((c: CompensationSettingsWage) => compSettingsMap.set(c.cast_id, c))

    // 時給ステータス
    const { data: wageStatuses } = await supabaseAdmin
      .from('wage_statuses')
      .select('id, hourly_wage')
      .eq('store_id', storeId)
      .eq('is_active', true)

    const wageStatusMap = new Map<number, WageStatus>()
    wageStatuses?.forEach((s: WageStatus) => wageStatusMap.set(s.id, s))

    // 特別日
    const { data: specialDay } = await supabaseAdmin
      .from('special_wage_days')
      .select('wage_adjustment')
      .eq('store_id', storeId)
      .eq('date', date)
      .eq('is_active', true)
      .single()

    const specialDayBonus = (specialDay as SpecialWageDay | null)?.wage_adjustment || 0

    // 衣装マスタ
    const { data: costumes } = await supabaseAdmin
      .from('costumes')
      .select('id, wage_adjustment')
      .eq('store_id', storeId)
      .eq('is_active', true)

    const costumeMap = new Map<number, number>()
    costumes?.forEach((c: { id: number; wage_adjustment: number }) => costumeMap.set(c.id, c.wage_adjustment))

    // 5. 確定済みかチェック
    const { data: existingStats } = await supabaseAdmin
      .from('cast_daily_stats')
      .select('cast_id, is_finalized')
      .eq('store_id', storeId)
      .eq('date', date)

    const finalizedCastIds = new Set(
      existingStats?.filter((s: { is_finalized: boolean }) => s.is_finalized).map((s: { cast_id: number }) => s.cast_id) || []
    )

    // 6. 売上設定に基づいて売上を計算（calculateCastSalesByPublishedMethodを使用）
    const castInfos = (casts || []).map((c: Cast) => ({ id: c.id, name: c.name }))
    const calculatedSales = calculateCastSalesByPublishedMethod(
      typedOrders,
      castInfos,
      salesSettings,
      taxRate,
      serviceRate
    )

    // 7. 計算結果をキャストごとにマップに格納
    const salesMap = new Map<number, CastSalesSummary>()
    calculatedSales.forEach((summary: CastSalesSummary) => {
      salesMap.set(summary.cast_id, summary)
    })

    // 8. 時給関連データを計算してstatsToUpsertを作成
    const statsToUpsert: {
      cast_id: number
      store_id: number
      date: string
      self_sales_item_based: number
      help_sales_item_based: number
      total_sales_item_based: number
      product_back_item_based: number
      self_sales_receipt_based: number
      help_sales_receipt_based: number
      total_sales_receipt_based: number
      product_back_receipt_based: number
      work_hours: number
      base_hourly_wage: number
      special_day_bonus: number
      costume_bonus: number
      total_hourly_wage: number
      wage_amount: number
      costume_id: number | null
      wage_status_id: number | null
      is_finalized: boolean
      updated_at: string
    }[] = []

    // 全キャストを処理（売上がなくても勤怠があれば時給データを保存）
    const processedCastIds = new Set<number>()

    // 売上があるキャストを処理
    for (const summary of calculatedSales) {
      if (finalizedCastIds.has(summary.cast_id)) continue
      processedCastIds.add(summary.cast_id)

      const cast = [...castMap.values()].find(c => c.id === summary.cast_id)
      if (!cast) continue

      // 時給データを計算
      const attendance = attendanceMap.get(cast.name)
      const compSettings = compSettingsMap.get(summary.cast_id)
      const workHours = calculateWorkHours(attendance?.check_in_datetime || null, attendance?.check_out_datetime || null)
      const costumeId = attendance?.costume_id || null
      const wageStatusId = compSettings?.status_id || null

      // 基本時給の決定
      let baseHourlyWage = 0
      if (compSettings?.hourly_wage_override) {
        baseHourlyWage = compSettings.hourly_wage_override
      } else if (wageStatusId) {
        const wageStatus = wageStatusMap.get(wageStatusId)
        baseHourlyWage = wageStatus?.hourly_wage || 0
      }

      // 衣装加算
      const costumeBonus = costumeId ? (costumeMap.get(costumeId) || 0) : 0

      // 合計時給
      const totalHourlyWage = baseHourlyWage + specialDayBonus + costumeBonus

      // 時給収入
      const wageAmount = Math.round(totalHourlyWage * workHours)

      // published_aggregationに基づいて値を設定
      const method = salesSettings.published_aggregation ?? 'item_based'

      statsToUpsert.push({
        cast_id: summary.cast_id,
        store_id: storeId,
        date: date,
        // 公表設定に応じてどちらのカラムに値を入れるか決定
        // どちらの計算方法でも同じ値を両方に入れる（後方互換性のため）
        self_sales_item_based: method === 'item_based' ? summary.self_sales : 0,
        help_sales_item_based: method === 'item_based' ? summary.help_sales : 0,
        total_sales_item_based: method === 'item_based' ? summary.total_sales : 0,
        product_back_item_based: Math.round(summary.total_back),
        self_sales_receipt_based: method === 'receipt_based' ? summary.self_sales : 0,
        help_sales_receipt_based: method === 'receipt_based' ? summary.help_sales : 0,
        total_sales_receipt_based: method === 'receipt_based' ? summary.total_sales : 0,
        product_back_receipt_based: method === 'receipt_based' ? Math.round(summary.total_back) : 0,
        work_hours: workHours,
        base_hourly_wage: baseHourlyWage,
        special_day_bonus: specialDayBonus,
        costume_bonus: costumeBonus,
        total_hourly_wage: totalHourlyWage,
        wage_amount: wageAmount,
        costume_id: costumeId,
        wage_status_id: wageStatusId,
        is_finalized: false,
        updated_at: new Date().toISOString()
      })
    }

    // 勤怠データがあるが売上計算に含まれなかったキャストも追加
    for (const [castName, attendance] of attendanceMap) {
      const cast = castMap.get(castName)
      if (!cast) continue
      if (finalizedCastIds.has(cast.id)) continue
      if (processedCastIds.has(cast.id)) continue

      if (attendance.check_in_datetime && attendance.check_out_datetime) {
        const compSettings = compSettingsMap.get(cast.id)
        const workHours = calculateWorkHours(attendance.check_in_datetime, attendance.check_out_datetime)
        const costumeId = attendance.costume_id || null
        const wageStatusId = compSettings?.status_id || null

        let baseHourlyWage = 0
        if (compSettings?.hourly_wage_override) {
          baseHourlyWage = compSettings.hourly_wage_override
        } else if (wageStatusId) {
          const wageStatus = wageStatusMap.get(wageStatusId)
          baseHourlyWage = wageStatus?.hourly_wage || 0
        }

        const costumeBonus = costumeId ? (costumeMap.get(costumeId) || 0) : 0
        const totalHourlyWage = baseHourlyWage + specialDayBonus + costumeBonus
        const wageAmount = Math.round(totalHourlyWage * workHours)

        statsToUpsert.push({
          cast_id: cast.id,
          store_id: storeId,
          date: date,
          self_sales_item_based: 0,
          help_sales_item_based: 0,
          total_sales_item_based: 0,
          product_back_item_based: 0,
          self_sales_receipt_based: 0,
          help_sales_receipt_based: 0,
          total_sales_receipt_based: 0,
          product_back_receipt_based: 0,
          work_hours: workHours,
          base_hourly_wage: baseHourlyWage,
          special_day_bonus: specialDayBonus,
          costume_bonus: costumeBonus,
          total_hourly_wage: totalHourlyWage,
          wage_amount: wageAmount,
          costume_id: costumeId,
          wage_status_id: wageStatusId,
          is_finalized: false,
          updated_at: new Date().toISOString()
        })
      }
    }

    // 9. cast_daily_statsにUPSERT
    if (statsToUpsert.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('cast_daily_stats')
        .upsert(statsToUpsert, {
          onConflict: 'cast_id,store_id,date'
        })

      if (upsertError) throw upsertError
    }

    // 10. cast_daily_itemsも更新（cron jobと同様）
    const dailyItems = aggregateCastDailyItems(typedOrders, castMap, storeId, date)
    if (dailyItems.length > 0) {
      // 確定済みのキャストは除外
      const itemsToUpsert = dailyItems.filter(item => !finalizedCastIds.has(item.cast_id))
      if (itemsToUpsert.length > 0) {
        // 更新対象のキャストIDリスト
        const castIdsToUpdate = [...new Set(itemsToUpsert.map(i => i.cast_id))]

        // 既存のcast_daily_itemsを削除
        const { error: deleteError } = await supabaseAdmin
          .from('cast_daily_items')
          .delete()
          .eq('store_id', storeId)
          .eq('date', date)
          .in('cast_id', castIdsToUpdate)

        if (deleteError) {
          console.error('cast_daily_items delete error:', deleteError)
        }

        // 新しいデータを挿入
        const { error: itemsError } = await supabaseAdmin
          .from('cast_daily_items')
          .insert(itemsToUpsert)

        if (itemsError) {
          console.error('cast_daily_items insert error:', itemsError)
        }
      }
    }

    return { success: true, castsProcessed: statsToUpsert.length, itemsProcessed: dailyItems.length }
  } catch (error) {
    console.error('Recalculate error:', error)
    return { success: false, castsProcessed: 0, error: String(error) }
  }
}

// POST: 指定日のデータを再計算
export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { store_id, date, date_from, date_to } = body

    const storeId = store_id || session.storeId

    // 日付範囲が指定されている場合
    if (date_from && date_to) {
      const results: { date: string; success: boolean; castsProcessed: number; itemsProcessed?: number; error?: string }[] = []

      const startDate = new Date(date_from)
      const endDate = new Date(date_to)

      for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDate(d)
        const result = await recalculateForDate(storeId, dateStr)
        results.push({ date: dateStr, ...result })
      }

      return NextResponse.json({
        success: true,
        results
      })
    }

    // 単一日付の場合
    const targetDate = date || formatDate(new Date())
    const result = await recalculateForDate(storeId, targetDate)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      date: targetDate,
      castsProcessed: result.castsProcessed,
      itemsProcessed: result.itemsProcessed
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
