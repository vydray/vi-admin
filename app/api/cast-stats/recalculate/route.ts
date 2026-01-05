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
  guest_count: number | null
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
  cast_id: number        // テーブルの推し（staff_name）
  help_cast_id: number | null  // ヘルプしたキャスト（推し自身ならnull）
  store_id: number
  date: string
  category: string | null
  product_name: string
  quantity: number
  self_sales: number     // 推しにつく売上（分配ロジック適用後）
  help_sales: number     // ヘルプにつく売上（分配ロジック適用後）
  // 後方互換用
  subtotal: number
  back_amount: number
  is_self: boolean
}

// 商品別キャスト売上を集計（cast_daily_items用）
// 新しいロジック: cast_id=テーブルの推し、help_cast_id=ヘルプキャスト
function aggregateCastDailyItems(
  orders: OrderWithStaff[],
  castMap: Map<string, Cast>,
  storeId: number,
  date: string,
  salesSettings: SalesSettings,
  taxRate: number = 0.1
): CastDailyItemData[] {
  const itemsMap = new Map<string, CastDailyItemData>()
  const method = salesSettings.published_aggregation ?? 'item_based'
  const nonHelpNames = salesSettings.non_help_staff_names || []

  console.log(`[aggregateCastDailyItems] method=${method}, orders=${orders.length}, taxRate=${taxRate}`)

  // 設定に応じた税抜き計算
  const isItemBased = method === 'item_based'
  const excludeTax = isItemBased
    ? (salesSettings.item_exclude_consumption_tax ?? salesSettings.use_tax_excluded ?? false)
    : (salesSettings.receipt_exclude_consumption_tax ?? salesSettings.use_tax_excluded ?? false)
  const helpDistMethod = isItemBased
    ? (salesSettings.item_help_distribution_method ?? 'all_to_nomination')
    : (salesSettings.receipt_help_distribution_method ?? 'all_to_nomination')
  const giveHelpSales = isItemBased
    ? (salesSettings.item_help_sales_inclusion === 'both')
    : (salesSettings.receipt_help_sales_inclusion === 'both')
  const helpRatio = isItemBased
    ? (salesSettings.item_help_ratio ?? 50)
    : (salesSettings.receipt_help_ratio ?? 50)

  // 税抜き計算関数
  const applyTax = (amount: number) => {
    if (!excludeTax) return amount
    const taxPercent = Math.round(taxRate * 100)
    return Math.floor(amount * 100 / (100 + taxPercent))
  }

  for (const order of orders) {
    // 伝票の推し（staff_name）
    const staffNames = order.staff_name?.split(',').map(n => n.trim()) || []
    // ヘルプ除外名を除いた実キャストの推し
    const realNominations = staffNames.filter(n => !nonHelpNames.includes(n))

    // 推しがいない伝票はスキップ（receipt_basedでも推しがいないと保存しない）
    if (realNominations.length === 0) continue

    // 推しのキャストIDを取得
    const nominationCastIds = realNominations
      .map(name => castMap.get(name)?.id)
      .filter((id): id is number => id !== undefined)

    if (nominationCastIds.length === 0) continue

    for (const item of order.order_items || []) {
      const castsOnItem = item.cast_name || []
      const realCastsOnItem = castsOnItem.filter(c => !nonHelpNames.includes(c))

      // 商品金額（税抜き適用）
      const rawAmount = (item.unit_price || 0) * (item.quantity || 0)
      const itemAmount = applyTax(rawAmount)

      // デバッグ: 最初の数件だけログ出力
      if (itemsMap.size < 3) {
        console.log(`[item] ${item.product_name}: unit_price=${item.unit_price}, qty=${item.quantity}, raw=${rawAmount}, after_tax=${itemAmount}, cast_name=${JSON.stringify(item.cast_name)}`)
      }

      // SELF/HELP判定
      const selfCastsOnItem = realCastsOnItem.filter(c => realNominations.includes(c))
      const helpCastsOnItem = realCastsOnItem.filter(c => !realNominations.includes(c))

      const isSelfOnly = selfCastsOnItem.length > 0 && helpCastsOnItem.length === 0
      const isHelpOnly = helpCastsOnItem.length > 0 && selfCastsOnItem.length === 0
      const isMixed = selfCastsOnItem.length > 0 && helpCastsOnItem.length > 0
      const noCast = realCastsOnItem.length === 0

      // 各推しに対してデータを作成
      for (const nominationName of realNominations) {
        const nominationCast = castMap.get(nominationName)
        if (!nominationCast) continue

        // キャストなし商品の処理
        // - item_based: 保存するが self_sales=0（売上カウントしない）
        // - receipt_based: 保存して self_sales=金額（推しの売上としてカウント）
        if (noCast) {
          const perNomination = isItemBased ? 0 : Math.floor(itemAmount / realNominations.length)
          const key = `${nominationCast.id}:null:${item.product_name}:${item.category || ''}`

          if (itemsMap.has(key)) {
            const existing = itemsMap.get(key)!
            existing.quantity += item.quantity
            existing.self_sales += perNomination
            existing.subtotal += item.subtotal
          } else {
            itemsMap.set(key, {
              cast_id: nominationCast.id,
              help_cast_id: null,
              store_id: storeId,
              date: date,
              category: item.category,
              product_name: item.product_name,
              quantity: item.quantity,
              self_sales: perNomination,
              help_sales: 0,
              subtotal: item.subtotal,
              back_amount: 0,
              is_self: true
            })
          }
          continue
        }

        // SELF商品 → 推しのself_salesに全額
        if (isSelfOnly) {
          const perNomination = Math.floor(itemAmount / realNominations.length)
          const key = `${nominationCast.id}:null:${item.product_name}:${item.category || ''}`

          if (itemsMap.has(key)) {
            const existing = itemsMap.get(key)!
            existing.quantity += item.quantity
            existing.self_sales += perNomination
            existing.subtotal += item.subtotal
          } else {
            itemsMap.set(key, {
              cast_id: nominationCast.id,
              help_cast_id: null,
              store_id: storeId,
              date: date,
              category: item.category,
              product_name: item.product_name,
              quantity: item.quantity,
              self_sales: perNomination,
              help_sales: 0,
              subtotal: item.subtotal,
              back_amount: 0,
              is_self: true
            })
          }
        }

        // HELP商品またはMIXED → 分配設定に基づく
        if (isHelpOnly || isMixed) {
          let selfShare = 0
          let helpSharePerCast = 0
          const perNominationBase = Math.floor(itemAmount / realNominations.length)

          switch (helpDistMethod) {
            case 'all_to_nomination':
              // 全額推しに
              selfShare = perNominationBase
              helpSharePerCast = 0
              break
            case 'equal':
              // 推しとヘルプで50:50
              selfShare = Math.floor(perNominationBase / 2)
              helpSharePerCast = giveHelpSales
                ? Math.floor((perNominationBase - selfShare) / helpCastsOnItem.length)
                : 0
              break
            case 'ratio':
              // 割合分配
              const helpShareTotal = Math.floor(perNominationBase * helpRatio / 100)
              selfShare = perNominationBase - helpShareTotal
              helpSharePerCast = giveHelpSales
                ? Math.floor(helpShareTotal / helpCastsOnItem.length)
                : 0
              break
            case 'equal_per_person':
              // 全員で均等割
              const allCastsCount = realNominations.length + helpCastsOnItem.length
              const perPerson = Math.floor(itemAmount / allCastsCount)
              selfShare = perPerson
              helpSharePerCast = giveHelpSales ? perPerson : 0
              break
            default:
              selfShare = perNominationBase
              helpSharePerCast = 0
          }

          // 推しのレコードを作成（help_cast_id = ヘルプキャストの最初の人、またはnull）
          for (const helpCastName of helpCastsOnItem) {
            const helpCast = castMap.get(helpCastName)
            if (!helpCast) continue

            const key = `${nominationCast.id}:${helpCast.id}:${item.product_name}:${item.category || ''}`

            if (itemsMap.has(key)) {
              const existing = itemsMap.get(key)!
              existing.quantity += item.quantity
              existing.self_sales += selfShare
              existing.help_sales += helpSharePerCast
              existing.subtotal += item.subtotal
            } else {
              itemsMap.set(key, {
                cast_id: nominationCast.id,
                help_cast_id: helpCast.id,
                store_id: storeId,
                date: date,
                category: item.category,
                product_name: item.product_name,
                quantity: item.quantity,
                self_sales: selfShare,
                help_sales: helpSharePerCast,
                subtotal: item.subtotal,
                back_amount: 0,
                is_self: false
              })
            }
          }

          // MIXED商品の場合、推し自身の分もレコードに（selfCastsOnItemがある場合）
          if (isMixed && selfCastsOnItem.includes(nominationName)) {
            const selfKey = `${nominationCast.id}:null:${item.product_name}:${item.category || ''}`
            const selfAmount = Math.floor(itemAmount / (selfCastsOnItem.length + helpCastsOnItem.length))

            if (itemsMap.has(selfKey)) {
              const existing = itemsMap.get(selfKey)!
              existing.quantity += item.quantity
              existing.self_sales += selfAmount
              existing.subtotal += item.subtotal
            } else {
              itemsMap.set(selfKey, {
                cast_id: nominationCast.id,
                help_cast_id: null,
                store_id: storeId,
                date: date,
                category: item.category,
                product_name: item.product_name,
                quantity: item.quantity,
                self_sales: selfAmount,
                help_sales: 0,
                subtotal: item.subtotal,
                back_amount: 0,
                is_self: true
              })
            }
          }
        }
      }
    }
  }

  const result = Array.from(itemsMap.values())
  console.log(`[aggregateCastDailyItems] result count=${result.length}, sample=${JSON.stringify(result.slice(0, 2))}`)
  return result
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
        guest_count,
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

    // 2.5. BASE注文を取得（未処理のもの）
    const { data: baseOrders, error: baseOrdersError } = await supabaseAdmin
      .from('base_orders')
      .select('id, cast_id, actual_price, quantity, product_name')
      .eq('store_id', storeId)
      .eq('business_date', date)
      .eq('is_processed', false)
      .not('cast_id', 'is', null)
      .not('actual_price', 'is', null)

    if (baseOrdersError) {
      console.warn('BASE orders fetch error:', baseOrdersError)
    }

    // BASE売上をキャストIDごとに集計
    const baseSalesByCast = new Map<number, number>()
    for (const order of baseOrders || []) {
      if (order.cast_id && order.actual_price) {
        const current = baseSalesByCast.get(order.cast_id) || 0
        baseSalesByCast.set(order.cast_id, current + (order.actual_price * order.quantity))
      }
    }
    console.log(`BASE orders for ${date}: ${baseOrders?.length || 0} items, casts with sales: ${baseSalesByCast.size}`)

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

    // 7.5. 指名本数を集計（staff_nameがキャスト名と一致する伝票のguest_countを合計）
    const nominationCountByCast = new Map<number, number>()
    for (const order of typedOrders) {
      if (!order.staff_name || !order.guest_count) continue
      const cast = castMap.get(order.staff_name)
      if (cast) {
        const current = nominationCountByCast.get(cast.id) || 0
        nominationCountByCast.set(cast.id, current + order.guest_count)
      }
    }

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
      nomination_count: number
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

      // BASE売上を加算（設定に応じて）
      const baseSales = baseSalesByCast.get(summary.cast_id) || 0
      const includeBaseInItem = salesSettings.include_base_in_item_sales ?? false
      const includeBaseInReceipt = salesSettings.include_base_in_receipt_sales ?? false

      statsToUpsert.push({
        cast_id: summary.cast_id,
        store_id: storeId,
        date: date,
        // 公表設定に応じてどちらのカラムに値を入れるか決定
        // BASE売上は推し売上（self_sales）に加算
        self_sales_item_based: (method === 'item_based' ? summary.self_sales : 0) + (includeBaseInItem ? baseSales : 0),
        help_sales_item_based: method === 'item_based' ? summary.help_sales : 0,
        total_sales_item_based: (method === 'item_based' ? summary.total_sales : 0) + (includeBaseInItem ? baseSales : 0),
        product_back_item_based: Math.round(summary.total_back),
        self_sales_receipt_based: (method === 'receipt_based' ? summary.self_sales : 0) + (includeBaseInReceipt ? baseSales : 0),
        help_sales_receipt_based: method === 'receipt_based' ? summary.help_sales : 0,
        total_sales_receipt_based: (method === 'receipt_based' ? summary.total_sales : 0) + (includeBaseInReceipt ? baseSales : 0),
        product_back_receipt_based: method === 'receipt_based' ? Math.round(summary.total_back) : 0,
        work_hours: workHours,
        base_hourly_wage: baseHourlyWage,
        special_day_bonus: specialDayBonus,
        costume_bonus: costumeBonus,
        total_hourly_wage: totalHourlyWage,
        wage_amount: wageAmount,
        costume_id: costumeId,
        wage_status_id: wageStatusId,
        nomination_count: nominationCountByCast.get(summary.cast_id) || 0,
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

        // BASE売上を加算（設定に応じて）
        const baseSales = baseSalesByCast.get(cast.id) || 0
        const includeBaseInItem = salesSettings.include_base_in_item_sales ?? false
        const includeBaseInReceipt = salesSettings.include_base_in_receipt_sales ?? false

        statsToUpsert.push({
          cast_id: cast.id,
          store_id: storeId,
          date: date,
          self_sales_item_based: includeBaseInItem ? baseSales : 0,
          help_sales_item_based: 0,
          total_sales_item_based: includeBaseInItem ? baseSales : 0,
          product_back_item_based: 0,
          self_sales_receipt_based: includeBaseInReceipt ? baseSales : 0,
          help_sales_receipt_based: 0,
          total_sales_receipt_based: includeBaseInReceipt ? baseSales : 0,
          product_back_receipt_based: 0,
          work_hours: workHours,
          base_hourly_wage: baseHourlyWage,
          special_day_bonus: specialDayBonus,
          costume_bonus: costumeBonus,
          total_hourly_wage: totalHourlyWage,
          wage_amount: wageAmount,
          costume_id: costumeId,
          wage_status_id: wageStatusId,
          nomination_count: nominationCountByCast.get(cast.id) || 0,
          is_finalized: false,
          updated_at: new Date().toISOString()
        })
        processedCastIds.add(cast.id)
      }
    }

    // 8.5. BASE売上があるがPOS/勤怠データがないキャストを処理
    const includeBaseInItem = salesSettings.include_base_in_item_sales ?? false
    const includeBaseInReceipt = salesSettings.include_base_in_receipt_sales ?? false

    for (const [castId, baseSales] of baseSalesByCast) {
      if (processedCastIds.has(castId)) continue
      if (finalizedCastIds.has(castId)) continue

      statsToUpsert.push({
        cast_id: castId,
        store_id: storeId,
        date: date,
        self_sales_item_based: includeBaseInItem ? baseSales : 0,
        help_sales_item_based: 0,
        total_sales_item_based: includeBaseInItem ? baseSales : 0,
        product_back_item_based: 0,
        self_sales_receipt_based: includeBaseInReceipt ? baseSales : 0,
        help_sales_receipt_based: 0,
        total_sales_receipt_based: includeBaseInReceipt ? baseSales : 0,
        product_back_receipt_based: 0,
        work_hours: 0,
        base_hourly_wage: 0,
        special_day_bonus: 0,
        costume_bonus: 0,
        total_hourly_wage: 0,
        wage_amount: 0,
        costume_id: null,
        wage_status_id: null,
        nomination_count: nominationCountByCast.get(castId) || 0,
        is_finalized: false,
        updated_at: new Date().toISOString()
      })
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

    // 10. cast_daily_itemsも更新（新しいカラム構成で）
    const dailyItems = aggregateCastDailyItems(typedOrders, castMap, storeId, date, salesSettings, taxRate)

    // 10.5. BASE注文もcast_daily_itemsに追加（推し扱い、カテゴリは"BASE"）
    const baseItemsMap = new Map<string, CastDailyItemData>()
    for (const order of baseOrders || []) {
      if (!order.cast_id || !order.product_name) continue
      const key = `${order.cast_id}:${order.product_name}`
      const amount = order.actual_price * order.quantity
      if (baseItemsMap.has(key)) {
        const existing = baseItemsMap.get(key)!
        existing.quantity += order.quantity
        existing.self_sales += amount
        existing.subtotal += amount
      } else {
        baseItemsMap.set(key, {
          cast_id: order.cast_id,
          help_cast_id: null,  // BASEは全て推し扱い
          store_id: storeId,
          date: date,
          category: 'BASE',
          product_name: order.product_name,
          quantity: order.quantity,
          self_sales: amount,
          help_sales: 0,
          subtotal: amount,
          back_amount: 0,
          is_self: true  // 後方互換用
        })
      }
    }
    const baseItems = Array.from(baseItemsMap.values())

    // POS + BASE を結合
    const allDailyItems = [...dailyItems, ...baseItems]

    if (allDailyItems.length > 0) {
      // 確定済みのキャストは除外
      const itemsToUpsert = allDailyItems.filter(item => !finalizedCastIds.has(item.cast_id))
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
          return { success: false, castsProcessed: statsToUpsert.length, itemsProcessed: 0, error: `cast_daily_items insert error: ${itemsError.message}` }
        }
      }
    }

    // 11. BASE注文を処理済みにマーク
    if (baseOrders && baseOrders.length > 0) {
      const baseOrderIds = baseOrders.map(o => o.id)
      const { error: baseUpdateError } = await supabaseAdmin
        .from('base_orders')
        .update({ is_processed: true })
        .in('id', baseOrderIds)

      if (baseUpdateError) {
        console.error('BASE orders update error:', baseUpdateError)
      } else {
        console.log(`Marked ${baseOrderIds.length} BASE orders as processed`)
      }
    }

    return { success: true, castsProcessed: statsToUpsert.length, itemsProcessed: allDailyItems.length }
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
