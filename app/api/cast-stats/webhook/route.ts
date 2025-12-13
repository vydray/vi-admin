import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service Role Key でRLSをバイパス
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Webhook用のシークレット検証
function validateWebhookSecret(request: NextRequest): boolean {
  const secret = request.headers.get('x-webhook-secret')
  const expectedSecret = process.env.WEBHOOK_SECRET

  // シークレットが設定されていない場合はスキップ（開発環境用）
  if (!expectedSecret) return true

  return secret === expectedSecret
}

// 日付をYYYY-MM-DD形式に変換
function formatDate(dateStr: string): string {
  return new Date(dateStr).toISOString().split('T')[0]
}

// キャスト名を配列として取得
function getCastNames(castName: string | string[] | null): string[] {
  if (!castName) return []
  if (Array.isArray(castName)) return castName.filter(Boolean)
  return [castName].filter(Boolean)
}

interface OrderItem {
  id: number
  order_id: number
  product_name: string
  category_name: string | null
  quantity: number
  unit_price: number
  subtotal: number
  cast_name: string | string[] | null
}

interface Order {
  id: number
  store_id: number
  checkout_datetime: string
  subtotal_excl_tax: number
  deleted_at: string | null
  staff_name: string | string[] | null
}

interface Cast {
  id: number
  name: string
  store_id: number
}

interface AttendanceRecord {
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

// 勤務時間を計算（時間単位）
function calculateWorkHours(clockIn: string | null, clockOut: string | null): number {
  if (!clockIn || !clockOut) return 0
  const start = new Date(clockIn)
  const end = new Date(clockOut)
  const diffMs = end.getTime() - start.getTime()
  const hours = diffMs / (1000 * 60 * 60)
  return Math.max(0, Math.round(hours * 100) / 100)
}

// 指定日のデータを再計算（時給計算含む）
async function recalculateForDate(storeId: number, date: string): Promise<{
  success: boolean
  castsProcessed: number
  error?: string
}> {
  try {
    // 1. その日の伝票を取得
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('store_id', storeId)
      .gte('checkout_datetime', `${date}T00:00:00`)
      .lt('checkout_datetime', `${date}T23:59:59.999`)
      .is('deleted_at', null)

    if (ordersError) throw ordersError

    // 2. 伝票のorder_itemsを取得
    const orderIds = (orders || []).map((o: Order) => o.id)
    let orderItems: OrderItem[] = []
    if (orderIds.length > 0) {
      const { data: items, error: itemsError } = await supabaseAdmin
        .from('order_items')
        .select('*')
        .in('order_id', orderIds)

      if (itemsError) throw itemsError
      orderItems = items || []
    }

    // 3. キャスト情報を取得
    const { data: casts, error: castsError } = await supabaseAdmin
      .from('casts')
      .select('id, name, store_id')
      .eq('store_id', storeId)

    if (castsError) throw castsError

    const castMap = new Map<string, Cast>()
    casts?.forEach((c: Cast) => castMap.set(c.name, c))

    // 3.5 時給関連データを取得
    // 勤怠データ（POSのフィールド名に合わせる）
    const { data: attendances } = await supabaseAdmin
      .from('attendance')
      .select('cast_name, check_in_datetime, check_out_datetime, costume_id')
      .eq('store_id', storeId)
      .eq('date', date)

    const attendanceMap = new Map<string, AttendanceRecord>()
    attendances?.forEach((a: AttendanceRecord) => attendanceMap.set(a.cast_name, a))

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

    // 4. 確定済みかチェック
    const { data: existingStats } = await supabaseAdmin
      .from('cast_daily_stats')
      .select('cast_id, is_finalized')
      .eq('store_id', storeId)
      .eq('date', date)

    const finalizedCastIds = new Set(
      existingStats?.filter((s: { is_finalized: boolean }) => s.is_finalized).map((s: { cast_id: number }) => s.cast_id) || []
    )

    // 5. キャストごとの売上を集計
    const castStats = new Map<number, {
      castId: number
      selfSalesItemBased: number
      helpSalesItemBased: number
      selfSalesReceiptBased: number
      helpSalesReceiptBased: number
      productBackItemBased: number
      productBackReceiptBased: number
      workHours: number
      baseHourlyWage: number
      specialDayBonus: number
      costumeBonus: number
      totalHourlyWage: number
      wageAmount: number
      costumeId: number | null
      wageStatusId: number | null
      items: Map<string, { category: string | null; productName: string; quantity: number; subtotal: number; backAmount: number }>
    }>()

    // ヘルパー関数: キャストの時給データを初期化
    const initCastStats = (castId: number, castName: string) => {
      const attendance = attendanceMap.get(castName)
      const compSettings = compSettingsMap.get(castId)
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

      return {
        castId,
        selfSalesItemBased: 0,
        helpSalesItemBased: 0,
        selfSalesReceiptBased: 0,
        helpSalesReceiptBased: 0,
        productBackItemBased: 0,
        productBackReceiptBased: 0,
        workHours,
        baseHourlyWage,
        specialDayBonus,
        costumeBonus,
        totalHourlyWage,
        wageAmount,
        costumeId,
        wageStatusId,
        items: new Map()
      }
    }

    // 伝票ベースの集計
    for (const order of (orders || []) as Order[]) {
      const orderItemsForOrder = orderItems.filter(oi => oi.order_id === order.id)
      const orderStaffNames = getCastNames(order.staff_name)
      const castsInOrder = new Set<string>()

      for (const item of orderItemsForOrder) {
        const itemCasts = getCastNames(item.cast_name)
        itemCasts.forEach(c => castsInOrder.add(c))
      }
      orderStaffNames.forEach(s => castsInOrder.add(s))

      // item_based
      for (const item of orderItemsForOrder) {
        const itemCasts = getCastNames(item.cast_name)

        for (const castName of itemCasts) {
          const cast = castMap.get(castName)
          if (!cast) continue
          if (finalizedCastIds.has(cast.id)) continue

          if (!castStats.has(cast.id)) {
            castStats.set(cast.id, initCastStats(cast.id, castName))
          }

          const stats = castStats.get(cast.id)!
          const isSelf = orderStaffNames.includes(castName)
          const share = item.subtotal / itemCasts.length

          if (isSelf) {
            stats.selfSalesItemBased += share
          } else {
            stats.helpSalesItemBased += share
          }

          const itemKey = `${item.category_name || ''}:${item.product_name}`
          if (!stats.items.has(itemKey)) {
            stats.items.set(itemKey, {
              category: item.category_name,
              productName: item.product_name,
              quantity: 0,
              subtotal: 0,
              backAmount: 0
            })
          }
          const itemStats = stats.items.get(itemKey)!
          itemStats.quantity += item.quantity / itemCasts.length
          itemStats.subtotal += share
        }
      }

      // receipt_based
      const castsInOrderArray = Array.from(castsInOrder)
      if (castsInOrderArray.length > 0) {
        const sharePerCast = order.subtotal_excl_tax / castsInOrderArray.length

        for (const castName of castsInOrderArray) {
          const cast = castMap.get(castName)
          if (!cast) continue
          if (finalizedCastIds.has(cast.id)) continue

          if (!castStats.has(cast.id)) {
            castStats.set(cast.id, initCastStats(cast.id, castName))
          }

          const stats = castStats.get(cast.id)!
          const isSelf = orderStaffNames.includes(castName)

          if (isSelf) {
            stats.selfSalesReceiptBased += sharePerCast
          } else {
            stats.helpSalesReceiptBased += sharePerCast
          }
        }
      }
    }

    // 勤怠データがあるが伝票に登場しないキャストも追加
    for (const [castName, attendance] of attendanceMap) {
      const cast = castMap.get(castName)
      if (!cast) continue
      if (finalizedCastIds.has(cast.id)) continue
      if (castStats.has(cast.id)) continue // 既に追加済み

      // 勤怠があれば時給データを初期化
      if (attendance.check_in_datetime && attendance.check_out_datetime) {
        castStats.set(cast.id, initCastStats(cast.id, castName))
      }
    }

    // 6. cast_daily_statsにUPSERT
    const statsToUpsert = Array.from(castStats.values()).map(stats => ({
      cast_id: stats.castId,
      store_id: storeId,
      date: date,
      self_sales_item_based: Math.round(stats.selfSalesItemBased),
      help_sales_item_based: Math.round(stats.helpSalesItemBased),
      total_sales_item_based: Math.round(stats.selfSalesItemBased + stats.helpSalesItemBased),
      product_back_item_based: Math.round(stats.productBackItemBased),
      self_sales_receipt_based: Math.round(stats.selfSalesReceiptBased),
      help_sales_receipt_based: Math.round(stats.helpSalesReceiptBased),
      total_sales_receipt_based: Math.round(stats.selfSalesReceiptBased + stats.helpSalesReceiptBased),
      product_back_receipt_based: Math.round(stats.productBackReceiptBased),
      // 時給関連
      work_hours: stats.workHours,
      base_hourly_wage: stats.baseHourlyWage,
      special_day_bonus: stats.specialDayBonus,
      costume_bonus: stats.costumeBonus,
      total_hourly_wage: stats.totalHourlyWage,
      wage_amount: stats.wageAmount,
      costume_id: stats.costumeId,
      wage_status_id: stats.wageStatusId,
      is_finalized: false,
      updated_at: new Date().toISOString()
    }))

    if (statsToUpsert.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('cast_daily_stats')
        .upsert(statsToUpsert, {
          onConflict: 'cast_id,store_id,date'
        })

      if (upsertError) throw upsertError
    }

    // 7. cast_daily_itemsにUPSERT
    const itemsToUpsert: {
      cast_id: number
      store_id: number
      date: string
      category: string | null
      product_name: string
      quantity: number
      subtotal: number
      back_amount: number
    }[] = []

    for (const [, stats] of castStats) {
      for (const [, item] of stats.items) {
        itemsToUpsert.push({
          cast_id: stats.castId,
          store_id: storeId,
          date: date,
          category: item.category,
          product_name: item.productName,
          quantity: Math.round(item.quantity),
          subtotal: Math.round(item.subtotal),
          back_amount: Math.round(item.backAmount)
        })
      }
    }

    if (itemsToUpsert.length > 0) {
      const castIdsToUpdate = Array.from(castStats.keys()).filter(id => !finalizedCastIds.has(id))

      if (castIdsToUpdate.length > 0) {
        await supabaseAdmin
          .from('cast_daily_items')
          .delete()
          .eq('store_id', storeId)
          .eq('date', date)
          .in('cast_id', castIdsToUpdate)

        const { error: itemsUpsertError } = await supabaseAdmin
          .from('cast_daily_items')
          .insert(itemsToUpsert)

        if (itemsUpsertError) throw itemsUpsertError
      }
    }

    return { success: true, castsProcessed: castStats.size }
  } catch (error) {
    console.error('Recalculate error:', error)
    return { success: false, castsProcessed: 0, error: String(error) }
  }
}

// POST: Supabaseからのwebhook（orders/attendance両対応）
export async function POST(request: NextRequest) {
  // シークレット検証
  if (!validateWebhookSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { type, table, record, old_record } = body

    let storeId: number
    let date: string

    // テーブルによって処理を分岐
    if (table === 'attendance') {
      // 勤怠テーブルの変更
      const attendance = record || old_record
      if (!attendance || !attendance.store_id || !attendance.date) {
        return NextResponse.json({ error: 'Invalid attendance payload' }, { status: 400 })
      }
      storeId = attendance.store_id
      date = attendance.date // attendanceは直接dateフィールドを持つ
    } else {
      // ordersテーブルの変更（デフォルト）
      const order = record || old_record
      if (!order || !order.store_id || !order.checkout_datetime) {
        return NextResponse.json({ error: 'Invalid order payload' }, { status: 400 })
      }
      storeId = order.store_id
      date = formatDate(order.checkout_datetime)
    }

    // 再計算実行
    const result = await recalculateForDate(storeId, date)

    // DELETEの場合、old_recordの日付も再計算（ordersのみ）
    if (table !== 'attendance' && type === 'DELETE' && old_record && old_record.checkout_datetime) {
      const oldDate = formatDate(old_record.checkout_datetime)
      if (oldDate !== date) {
        await recalculateForDate(storeId, oldDate)
      }
    }

    // UPDATEで日付が変わった場合、両方の日付を再計算（ordersのみ）
    if (table !== 'attendance' && type === 'UPDATE' && old_record && old_record.checkout_datetime) {
      const oldDate = formatDate(old_record.checkout_datetime)
      if (oldDate !== date) {
        await recalculateForDate(storeId, oldDate)
      }
    }

    return NextResponse.json({
      success: true,
      table: table || 'orders',
      date,
      castsProcessed: result.castsProcessed
    })
  } catch (error) {
    console.error('Webhook Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
