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

// 日付をYYYY-MM-DD形式に変換
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

// キャスト名を配列として取得（文字列でも配列でも対応）
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

interface Attendance {
  cast_id: number
  clock_in: string | null
  clock_out: string | null
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

interface Costume {
  wage_adjustment: number
}

// 勤務時間を計算（時間単位）
function calculateWorkHours(clockIn: string | null, clockOut: string | null): number {
  if (!clockIn || !clockOut) return 0
  const start = new Date(clockIn)
  const end = new Date(clockOut)
  const diffMs = end.getTime() - start.getTime()
  const hours = diffMs / (1000 * 60 * 60)
  return Math.max(0, Math.round(hours * 100) / 100) // 小数点2桁
}

// 指定日のデータを再計算して保存
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

    if (!orders || orders.length === 0) {
      // 伝票がない日は空のデータを保存（既存データを削除しない）
      return { success: true, castsProcessed: 0 }
    }

    // 2. 伝票のorder_itemsを取得
    const orderIds = orders.map((o: Order) => o.id)
    const { data: orderItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('*')
      .in('order_id', orderIds)

    if (itemsError) throw itemsError

    // 3. キャスト情報を取得
    const { data: casts, error: castsError } = await supabaseAdmin
      .from('casts')
      .select('id, name, store_id')
      .eq('store_id', storeId)

    if (castsError) throw castsError

    const castMap = new Map<string, Cast>()
    casts?.forEach((c: Cast) => castMap.set(c.name, c))

    // 3.5 時給関連データを取得
    // 勤怠データ
    const { data: attendances } = await supabaseAdmin
      .from('attendance')
      .select('cast_id, clock_in, clock_out, costume_id')
      .eq('store_id', storeId)
      .eq('date', date)

    const attendanceMap = new Map<number, Attendance>()
    attendances?.forEach((a: Attendance) => attendanceMap.set(a.cast_id, a))

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
    // item_based: キャスト名が入っている商品の売上
    // receipt_based: キャストが関わった伝票全体の売上
    const castStats = new Map<number, {
      castId: number
      selfSalesItemBased: number
      helpSalesItemBased: number
      selfSalesReceiptBased: number
      helpSalesReceiptBased: number
      productBackItemBased: number
      productBackReceiptBased: number
      // 時給関連
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

    // 伝票ごとに処理
    for (const order of orders as Order[]) {
      const orderItemsForOrder = (orderItems as OrderItem[] || []).filter(oi => oi.order_id === order.id)

      // 伝票の推しキャスト（staff_name）を取得
      const orderStaffNames = getCastNames(order.staff_name)

      // この伝票に関わるキャストを集計
      const castsInOrder = new Set<string>()

      // order_itemsからキャスト名を収集
      for (const item of orderItemsForOrder) {
        const itemCasts = getCastNames(item.cast_name)
        itemCasts.forEach(c => castsInOrder.add(c))
      }

      // staff_nameも追加
      orderStaffNames.forEach(s => castsInOrder.add(s))

      // item_based: 各商品のcast_nameに基づいて集計
      for (const item of orderItemsForOrder) {
        const itemCasts = getCastNames(item.cast_name)

        for (const castName of itemCasts) {
          const cast = castMap.get(castName)
          if (!cast) continue
          if (finalizedCastIds.has(cast.id)) continue

          if (!castStats.has(cast.id)) {
            // 時給データを計算
            const attendance = attendanceMap.get(cast.id)
            const compSettings = compSettingsMap.get(cast.id)
            const workHours = calculateWorkHours(attendance?.clock_in || null, attendance?.clock_out || null)
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

            castStats.set(cast.id, {
              castId: cast.id,
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
            })
          }

          const stats = castStats.get(cast.id)!

          // 推しかヘルプか判定（伝票のstaff_nameに含まれているかどうか）
          const isSelf = orderStaffNames.includes(castName)

          // 複数キャストがいる場合は均等分配
          const share = item.subtotal / itemCasts.length

          if (isSelf) {
            stats.selfSalesItemBased += share
          } else {
            stats.helpSalesItemBased += share
          }

          // 商品詳細を追加
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

      // receipt_based: 伝票に関わったキャストに伝票小計を分配
      const castsInOrderArray = Array.from(castsInOrder)
      if (castsInOrderArray.length > 0) {
        const sharePerCast = order.subtotal_excl_tax / castsInOrderArray.length

        for (const castName of castsInOrderArray) {
          const cast = castMap.get(castName)
          if (!cast) continue
          if (finalizedCastIds.has(cast.id)) continue

          if (!castStats.has(cast.id)) {
            // 時給データを計算
            const attendance = attendanceMap.get(cast.id)
            const compSettings = compSettingsMap.get(cast.id)
            const workHours = calculateWorkHours(attendance?.clock_in || null, attendance?.clock_out || null)
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

            castStats.set(cast.id, {
              castId: cast.id,
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
            })
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
      // 既存データを削除してから挿入（確定済みは除く）
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
      const results: { date: string; success: boolean; castsProcessed: number; error?: string }[] = []

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
      castsProcessed: result.castsProcessed
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
