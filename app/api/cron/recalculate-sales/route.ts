import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateCastSalesByPublishedMethod, getDefaultSalesSettings } from '@/lib/salesCalculation'
import { SalesSettings, CastSalesSummary } from '@/types'

// Service Role Key でRLSをバイパス
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Cron認証（Vercel Cron Jobs用）
function validateCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true
  }
  // 開発環境ではスキップ
  if (process.env.NODE_ENV === 'development') {
    return true
  }
  return false
}

// 今日の日付をYYYY-MM-DD形式で取得（日本時間）
function getTodayDate(): string {
  const now = new Date()
  // 日本時間に変換
  const jstOffset = 9 * 60 * 60 * 1000
  const jstDate = new Date(now.getTime() + jstOffset)
  return jstDate.toISOString().split('T')[0]
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

// 勤務時間を計算
function calculateWorkHours(clockIn: string | null, clockOut: string | null): number {
  if (!clockIn || !clockOut) return 0
  const start = new Date(clockIn)
  let end = new Date(clockOut)

  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  }

  const diffMs = end.getTime() - start.getTime()
  const hours = diffMs / (1000 * 60 * 60)
  return Math.max(0, Math.round(hours * 100) / 100)
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

  const defaults = getDefaultSalesSettings(storeId)
  return {
    id: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...defaults,
  } as SalesSettings
}

// system_settingsから税率を取得
async function loadSystemSettings(storeId: number): Promise<{ tax_rate: number; service_fee_rate: number }> {
  const { data } = await supabaseAdmin
    .from('system_settings')
    .select('setting_key, setting_value')
    .eq('store_id', storeId)

  const settings = { tax_rate: 10, service_fee_rate: 0 }

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

// 指定店舗・日付の売上を再計算
async function recalculateForStoreAndDate(storeId: number, date: string): Promise<{
  success: boolean
  castsProcessed: number
  error?: string
}> {
  try {
    const salesSettings = await loadSalesSettings(storeId)
    const systemSettings = await loadSystemSettings(storeId)
    const taxRate = systemSettings.tax_rate / 100
    const serviceRate = systemSettings.service_fee_rate / 100

    // 伝票とorder_itemsを取得
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
      .gte('order_date', `${date}T00:00:00`)
      .lte('order_date', `${date}T23:59:59.999`)
      .is('deleted_at', null)

    if (ordersError) throw ordersError

    const typedOrders = (orders || []) as unknown as OrderWithStaff[]

    // キャスト情報を取得
    const { data: casts, error: castsError } = await supabaseAdmin
      .from('casts')
      .select('id, name, store_id')
      .eq('store_id', storeId)

    if (castsError) throw castsError

    const castMap = new Map<string, Cast>()
    casts?.forEach((c: Cast) => castMap.set(c.name, c))

    // 時給関連データを取得
    const { data: attendances } = await supabaseAdmin
      .from('attendance')
      .select('cast_name, check_in_datetime, check_out_datetime, costume_id')
      .eq('store_id', storeId)
      .eq('date', date)

    const attendanceMap = new Map<string, Attendance>()
    attendances?.forEach((a: Attendance) => attendanceMap.set(a.cast_name, a))

    const { data: compensationSettings } = await supabaseAdmin
      .from('compensation_settings')
      .select('cast_id, status_id, hourly_wage_override')
      .eq('store_id', storeId)

    const compSettingsMap = new Map<number, CompensationSettingsWage>()
    compensationSettings?.forEach((c: CompensationSettingsWage) => compSettingsMap.set(c.cast_id, c))

    const { data: wageStatuses } = await supabaseAdmin
      .from('wage_statuses')
      .select('id, hourly_wage')
      .eq('store_id', storeId)
      .eq('is_active', true)

    const wageStatusMap = new Map<number, WageStatus>()
    wageStatuses?.forEach((s: WageStatus) => wageStatusMap.set(s.id, s))

    const { data: specialDay } = await supabaseAdmin
      .from('special_wage_days')
      .select('wage_adjustment')
      .eq('store_id', storeId)
      .eq('date', date)
      .eq('is_active', true)
      .single()

    const specialDayBonus = (specialDay as SpecialWageDay | null)?.wage_adjustment || 0

    const { data: costumes } = await supabaseAdmin
      .from('costumes')
      .select('id, wage_adjustment')
      .eq('store_id', storeId)
      .eq('is_active', true)

    const costumeMap = new Map<number, number>()
    costumes?.forEach((c: { id: number; wage_adjustment: number }) => costumeMap.set(c.id, c.wage_adjustment))

    // 確定済みチェック
    const { data: existingStats } = await supabaseAdmin
      .from('cast_daily_stats')
      .select('cast_id, is_finalized')
      .eq('store_id', storeId)
      .eq('date', date)

    const finalizedCastIds = new Set(
      existingStats?.filter((s: { is_finalized: boolean }) => s.is_finalized).map((s: { cast_id: number }) => s.cast_id) || []
    )

    // 売上計算
    const castInfos = (casts || []).map((c: Cast) => ({ id: c.id, name: c.name }))
    const calculatedSales = calculateCastSalesByPublishedMethod(
      typedOrders,
      castInfos,
      salesSettings,
      taxRate,
      serviceRate
    )

    // 結果をUPSERT用に変換
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

    const processedCastIds = new Set<number>()
    const method = salesSettings.published_aggregation ?? 'item_based'

    // 売上があるキャスト
    for (const summary of calculatedSales) {
      if (finalizedCastIds.has(summary.cast_id)) continue
      processedCastIds.add(summary.cast_id)

      const cast = [...castMap.values()].find(c => c.id === summary.cast_id)
      if (!cast) continue

      const attendance = attendanceMap.get(cast.name)
      const compSettings = compSettingsMap.get(summary.cast_id)
      const workHours = calculateWorkHours(attendance?.check_in_datetime || null, attendance?.check_out_datetime || null)
      const costumeId = attendance?.costume_id || null
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
        cast_id: summary.cast_id,
        store_id: storeId,
        date: date,
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

    // 勤怠のみのキャスト
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

    // UPSERT
    if (statsToUpsert.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('cast_daily_stats')
        .upsert(statsToUpsert, {
          onConflict: 'cast_id,store_id,date'
        })

      if (upsertError) throw upsertError
    }

    return { success: true, castsProcessed: statsToUpsert.length }
  } catch (error) {
    console.error('Recalculate error for store', storeId, ':', error)
    return { success: false, castsProcessed: 0, error: String(error) }
  }
}

// GET: Vercel Cron Jobsから呼ばれる
export async function GET(request: NextRequest) {
  // Cron認証
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const today = getTodayDate()

    // 全アクティブ店舗を取得
    const { data: stores, error: storesError } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('is_active', true)

    if (storesError) throw storesError

    const results: { store_id: number; success: boolean; castsProcessed: number; error?: string }[] = []

    // 各店舗の今日の売上を再計算
    for (const store of stores || []) {
      const result = await recalculateForStoreAndDate(store.id, today)
      results.push({ store_id: store.id, ...result })
    }

    return NextResponse.json({
      success: true,
      date: today,
      stores_processed: results.length,
      results
    })
  } catch (error) {
    console.error('Cron Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
