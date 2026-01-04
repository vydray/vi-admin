import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { fetchOrders, fetchOrderDetail, refreshAccessToken } from '@/lib/baseApi'

/**
 * BASE注文自動同期
 * Vercel Cron: 15分ごと
 *
 * 処理フロー:
 * 1. BASE接続済みの全店舗を取得
 * 2. 各店舗で過去3日分の注文を取得
 * 3. base_ordersテーブルに保存
 * 4. recalculate-sales cron（5分ごと）が売上に反映
 */
export async function GET(request: Request) {
  try {
    // Vercel Cronの認証チェック
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseServerClient()

    // BASE接続済みの全店舗を取得
    const { data: settings, error: settingsError } = await supabase
      .from('base_settings')
      .select('store_id, access_token, refresh_token, client_id, client_secret, token_expires_at')
      .not('access_token', 'is', null)

    if (settingsError) {
      console.error('Failed to fetch base_settings:', settingsError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    const results: { store_id: number; success: boolean; imported?: number; error?: string }[] = []

    for (const setting of settings || []) {
      try {
        let accessToken = setting.access_token

        // トークンの有効期限チェック
        if (setting.token_expires_at) {
          const expiresAt = new Date(setting.token_expires_at)
          if (expiresAt < new Date()) {
            // トークンをリフレッシュ
            if (setting.refresh_token && setting.client_id && setting.client_secret) {
              try {
                const newTokens = await refreshAccessToken(
                  setting.client_id,
                  setting.client_secret,
                  setting.refresh_token
                )
                accessToken = newTokens.access_token
                const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000)

                await supabase
                  .from('base_settings')
                  .update({
                    access_token: newTokens.access_token,
                    refresh_token: newTokens.refresh_token,
                    token_expires_at: newExpiresAt.toISOString(),
                  })
                  .eq('store_id', setting.store_id)

                console.log(`[BASE Sync] Store ${setting.store_id}: Token refreshed`)
              } catch (refreshError) {
                results.push({
                  store_id: setting.store_id,
                  success: false,
                  error: 'Token refresh failed',
                })
                continue
              }
            } else {
              results.push({
                store_id: setting.store_id,
                success: false,
                error: 'Token expired, cannot refresh',
              })
              continue
            }
          }
        }

        // 過去3日分の注文を取得
        const endDate = new Date().toISOString().split('T')[0]
        const startDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

        const ordersResponse = await fetchOrders(accessToken, {
          start_ordered: startDate,
          end_ordered: endDate,
          limit: 100,
        })

        // 売上設定から締め時間を取得
        const { data: salesSettings } = await supabase
          .from('sales_settings')
          .select('base_cutoff_hour, base_cutoff_enabled')
          .eq('store_id', setting.store_id)
          .single()

        const cutoffHour = salesSettings?.base_cutoff_hour ?? 6
        const cutoffEnabled = salesSettings?.base_cutoff_enabled ?? true

        // BASE商品マッピングとキャストを取得
        const { data: baseProducts } = await supabase
          .from('base_products')
          .select('id, base_product_name, local_product_name, store_price')
          .eq('store_id', setting.store_id)
          .eq('is_active', true)

        const { data: casts } = await supabase
          .from('casts')
          .select('id, name')
          .eq('store_id', setting.store_id)

        // 対応済みの注文のみ処理
        const activeOrders = (ordersResponse.orders || []).filter(
          order => order.dispatch_status === 'dispatched'
        )

        let successCount = 0
        let errorCount = 0
        const BATCH_SIZE = 5

        for (let i = 0; i < activeOrders.length; i += BATCH_SIZE) {
          const batch = activeOrders.slice(i, i + BATCH_SIZE)

          const detailResults = await Promise.allSettled(
            batch.map(async (orderSummary) => {
              const detailResponse = await fetchOrderDetail(accessToken, orderSummary.unique_key)
              return { orderSummary, orderDetail: detailResponse.order }
            })
          )

          for (const result of detailResults) {
            if (result.status === 'rejected') {
              errorCount++
              continue
            }

            const { orderSummary, orderDetail } = result.value
            const orderDate = new Date(orderSummary.ordered * 1000)
            const orderDatetime = orderDate.toISOString()

            // 営業日を計算
            let businessDateObj = new Date(orderDate)
            if (cutoffEnabled) {
              const hour = orderDate.getHours()
              if (hour < cutoffHour) {
                businessDateObj.setDate(businessDateObj.getDate() - 1)
              }
            }
            const businessDate = businessDateObj.toISOString().split('T')[0]

            for (const item of orderDetail.order_items || []) {
              const cast = casts?.find(c => c.name === item.variation)
              const baseProduct = baseProducts?.find(p => p.base_product_name === item.title)

              // 店舗価格（税抜）を決定: store_priceがあればそれを使用、なければbase_priceを税抜換算
              const actualPrice = baseProduct?.store_price ?? Math.floor(item.price / 1.1)

              const { error: upsertError } = await supabase
                .from('base_orders')
                .upsert({
                  store_id: setting.store_id,
                  base_order_id: orderSummary.unique_key,
                  order_datetime: orderDatetime,
                  product_name: item.title,
                  variation_name: item.variation || null,
                  cast_id: cast?.id || null,
                  local_product_id: baseProduct?.id || null,
                  base_price: item.price,
                  actual_price: actualPrice,
                  quantity: item.amount,
                  business_date: businessDate,
                  is_processed: false,
                }, {
                  onConflict: 'store_id,base_order_id,product_name,variation_name'
                })

              if (upsertError) {
                errorCount++
              } else {
                successCount++
              }
            }
          }
        }

        results.push({
          store_id: setting.store_id,
          success: true,
          imported: successCount,
        })
        console.log(`[BASE Sync] Store ${setting.store_id}: Imported ${successCount} items, ${errorCount} errors`)
      } catch (storeError) {
        const errorMessage = storeError instanceof Error ? storeError.message : 'Unknown error'
        results.push({
          store_id: setting.store_id,
          success: false,
          error: errorMessage,
        })
        console.error(`[BASE Sync] Store ${setting.store_id}: Failed -`, errorMessage)
      }
    }

    return NextResponse.json({
      success: true,
      results,
      syncedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('BASE sync cron error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
