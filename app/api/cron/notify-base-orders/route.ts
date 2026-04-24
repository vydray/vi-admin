import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { fetchOrders, fetchOrderDetail } from '@/lib/baseApi'
import { withCronLock } from '@/lib/cronLock'
import { calculateBusinessDay } from '@/lib/businessDay'
import { notifyPendingForAllStores } from '@/lib/notifyBaseOrder'

/**
 * BASE注文 高速同期 + LINE通知 cron
 * Vercel Cron: 毎分
 *
 * 役割:
 * - 直近1時間の新規注文を BASE API から取得
 * - base_orders に upsert
 * - 未通知分を LINE 通知(3者: 管理者・マネージャー・該当キャスト)
 *
 * 設計上の注意:
 * - トークンリフレッシュは行わない(slow cron `sync-base-orders` に任せる)
 * - 手動編集済み(manually_edited=true)の行は更新しない(slow cron が扱う)
 * - 未登録商品の auto-register もしない(slow cron が扱う)
 * - 通知は `notify-base-orders` ロックで slow cron と直列化
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await withCronLock('notify-base-orders-fast', async () => {
      return await executeFastSyncAndNotify()
    }, 120)

    if (result === null) {
      return NextResponse.json({ message: 'Job is already running, skipped' })
    }

    return result
  } catch (error) {
    console.error('[Fast Sync] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function executeFastSyncAndNotify() {
  const supabase = getSupabaseServerClient()

  const { data: settings, error: settingsError } = await supabase
    .from('base_settings')
    .select('store_id, access_token, token_expires_at')
    .not('access_token', 'is', null)

  if (settingsError) {
    console.error('[Fast Sync] failed to fetch base_settings:', settingsError)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const syncResults: Array<{ store_id: number; success: boolean; fetched?: number; upserted?: number; skipped?: string; error?: string }> = []

  for (const setting of settings || []) {
    try {
      // トークン期限切れ時はスキップ(slow cronがリフレッシュ担当)
      if (setting.token_expires_at) {
        const expiresAt = new Date(setting.token_expires_at)
        if (expiresAt < new Date()) {
          syncResults.push({ store_id: setting.store_id, success: true, skipped: 'token expired (awaiting slow cron refresh)' })
          continue
        }
      }

      const accessToken = setting.access_token

      // 直近1時間をカバー: 昨日と今日と翌日までfetch(timezone安全マージン)
      const now = new Date()
      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      const ordersResponse = await fetchOrders(accessToken, {
        start_ordered: startDate,
        end_ordered: endDate,
        limit: 100,
      })

      const allOrders = ordersResponse.orders || []
      const oneHourAgoEpoch = Math.floor((Date.now() - 60 * 60 * 1000) / 1000)
      const recentOrders = allOrders.filter(
        order =>
          order.dispatch_status !== 'cancelled' &&
          !order.terminated &&
          order.ordered >= oneHourAgoEpoch
      )

      if (recentOrders.length === 0) {
        syncResults.push({ store_id: setting.store_id, success: true, fetched: 0 })
        continue
      }

      const { data: salesSettings } = await supabase
        .from('sales_settings')
        .select('base_cutoff_hour, base_cutoff_enabled')
        .eq('store_id', setting.store_id)
        .single()

      const cutoffHour = salesSettings?.base_cutoff_hour ?? 6
      const cutoffEnabled = salesSettings?.base_cutoff_enabled ?? true

      const { data: baseProducts } = await supabase
        .from('base_products')
        .select('base_product_name, store_price')
        .eq('store_id', setting.store_id)
        .eq('is_active', true)

      const { data: casts } = await supabase
        .from('casts')
        .select('id, name')
        .eq('store_id', setting.store_id)

      const { data: manuallyEditedData } = await supabase
        .from('base_orders')
        .select('base_order_id, product_name, variation_name')
        .eq('store_id', setting.store_id)
        .eq('manually_edited', true)

      const manuallyEditedKeys = new Set(
        (manuallyEditedData || []).map(r => `${r.base_order_id}|${r.product_name}|${r.variation_name}`)
      )

      let upsertedCount = 0
      let orderErrorCount = 0

      for (const orderSummary of recentOrders) {
        try {
          const detailResponse = await fetchOrderDetail(accessToken, orderSummary.unique_key)
          const orderDetail = detailResponse.order
          const orderDate = new Date(orderSummary.ordered * 1000)
          const orderDatetime = orderDate.toISOString()
          const businessDate = calculateBusinessDay(orderDatetime, cutoffEnabled ? cutoffHour : 0)

          const lastName = (orderDetail.last_name || '').trim()
          const firstName = (orderDetail.first_name || '').trim()
          const customerName = (lastName || firstName)
            ? `${lastName} ${firstName}`.trim()
            : null

          for (const item of orderDetail.order_items || []) {
            const cast = casts?.find(c => c.name === item.variation)
            const baseProduct = baseProducts?.find(p => p.base_product_name === item.title)
            const actualPrice = baseProduct?.store_price ?? null

            const productName = item.title || ''
            const variationName = item.variation || ''

            // 手動編集済みはskip(slow cronが処理)
            const key = `${orderSummary.unique_key}|${productName}|${variationName}`
            if (manuallyEditedKeys.has(key)) continue

            const { error: upsertError } = await supabase
              .from('base_orders')
              .upsert({
                store_id: setting.store_id,
                base_order_id: orderSummary.unique_key,
                order_datetime: orderDatetime,
                product_name: productName,
                variation_name: variationName,
                cast_id: cast?.id || null,
                local_product_id: null,
                base_price: item.price,
                actual_price: actualPrice,
                quantity: item.amount,
                business_date: businessDate,
                is_processed: false,
                customer_name: customerName,
              }, {
                onConflict: 'store_id,base_order_id,product_name,variation_name'
              })

            if (!upsertError) {
              upsertedCount++
            } else {
              console.error(`[Fast Sync] upsert failed for ${orderSummary.unique_key}:`, upsertError.message)
            }
          }
        } catch (orderErr) {
          orderErrorCount++
          const msg = orderErr instanceof Error ? orderErr.message : String(orderErr)
          console.error(`[Fast Sync] Store ${setting.store_id} order ${orderSummary.unique_key} failed:`, msg)
        }
      }

      syncResults.push({
        store_id: setting.store_id,
        success: true,
        fetched: recentOrders.length,
        upserted: upsertedCount,
        ...(orderErrorCount > 0 ? { error: `${orderErrorCount} order(s) failed` } : {}),
      })
    } catch (storeErr) {
      const msg = storeErr instanceof Error ? storeErr.message : String(storeErr)
      console.error(`[Fast Sync] Store ${setting.store_id} failed:`, msg)
      syncResults.push({ store_id: setting.store_id, success: false, error: msg })
    }
  }

  // 通知処理(slow cronと共通のロックで排他)
  const notifyResult = await notifyPendingForAllStores()

  return NextResponse.json({
    success: true,
    syncResults,
    notifyResult,
    executedAt: new Date().toISOString(),
  })
}
