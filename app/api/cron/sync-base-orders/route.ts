import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { fetchOrders, fetchOrderDetail, refreshAccessToken } from '@/lib/baseApi'
import { withCronLock } from '@/lib/cronLock'
import { recalculateForDate } from '@/lib/recalculateSales'

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

    // Cron Job重複実行防止（ロック取得）
    const result = await withCronLock('sync-base-orders', async () => {
      return await executeSyncBaseOrders()
    }, 600) // 10分タイムアウト

    if (result === null) {
      return NextResponse.json({
        message: 'Job is already running, skipped'
      })
    }

    return result
  } catch (error) {
    console.error('[CRON] sync-base-orders error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function executeSyncBaseOrders() {
  try {

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

    const results: { store_id: number; success: boolean; imported?: number; errors?: number; error?: string; errorDetails?: string[] }[] = []

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
                // Optimistic Locking: リフレッシュ前に再度有効期限をチェック
                const { data: currentSetting } = await supabase
                  .from('base_settings')
                  .select('token_expires_at, access_token')
                  .eq('store_id', setting.store_id)
                  .single()

                // 他のプロセスが既に更新した場合、最新のトークンを使用
                if (currentSetting && currentSetting.token_expires_at !== setting.token_expires_at) {
                  const currentExpiresAt = new Date(currentSetting.token_expires_at)
                  if (currentExpiresAt >= new Date()) {
                    // 既に有効なトークンがある
                    accessToken = currentSetting.access_token
                    console.log(`[BASE Sync] Store ${setting.store_id}: Token already refreshed by another process`)
                  } else {
                    // まだ期限切れのまま → リフレッシュ
                    const newTokens = await refreshAccessToken(
                      setting.client_id,
                      setting.client_secret,
                      setting.refresh_token
                    )
                    accessToken = newTokens.access_token
                    const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000)

                    // Optimistic Locking: 元の有効期限が変わっていない場合のみ更新
                    const { count } = await supabase
                      .from('base_settings')
                      .update({
                        access_token: newTokens.access_token,
                        refresh_token: newTokens.refresh_token,
                        token_expires_at: newExpiresAt.toISOString(),
                      })
                      .eq('store_id', setting.store_id)
                      .eq('token_expires_at', setting.token_expires_at)

                    if (count === 0) {
                      console.warn(`[BASE Sync] Store ${setting.store_id}: Token update conflict, using latest token`)
                    }
                  }
                } else {
                  // 変更なし → リフレッシュ実行
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
                }

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

        // 過去3日分の注文を取得（ページネーション対応、月またぎにも対応）
        const endDate = new Date().toISOString().split('T')[0]
        const startDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

        let allOrders: any[] = []
        let offset = 0
        const PAGE_SIZE = 100
        const MAX_PAGES = 100 // 最大10,000件まで（DoS対策）
        let pageCount = 0

        while (pageCount < MAX_PAGES) {
          const ordersResponse = await fetchOrders(accessToken, {
            start_ordered: startDate,
            end_ordered: endDate,
            limit: PAGE_SIZE,
            offset,
          })

          const orders = ordersResponse.orders || []
          allOrders = allOrders.concat(orders)
          pageCount++

          if (orders.length < PAGE_SIZE) {
            break // 最後のページ
          }
          offset += PAGE_SIZE
        }

        if (pageCount >= MAX_PAGES) {
          console.warn(`[BASE Sync] Store ${setting.store_id}: Reached max page limit (${MAX_PAGES}), results may be incomplete`)
        }

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

        // キャンセル以外の注文を処理（デジタルコンテンツはdispatchedにならないことがある）
        const activeOrders = allOrders.filter(
          order => order.dispatch_status !== 'cancelled'
        )

        let successCount = 0
        let errorCount = 0
        const BATCH_SIZE = 5
        const errorDetails: string[] = []

        console.log(`[BASE Sync] Store ${setting.store_id}: Processing ${activeOrders.length} orders`)

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
              const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason)
              errorDetails.push(`fetchOrderDetail failed: ${errorMsg}`)
              console.error(`[BASE Sync] Store ${setting.store_id}: fetchOrderDetail failed -`, errorMsg)
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

              // local_product_idはproductsテーブルを参照するので、base_products.idは使わない
              // 将来的にはbase_productsにlocal_product_id（products.id）を持たせるべき
              const { error: upsertError } = await supabase
                .from('base_orders')
                .upsert({
                  store_id: setting.store_id,
                  base_order_id: orderSummary.unique_key,
                  order_datetime: orderDatetime,
                  product_name: item.title,
                  variation_name: item.variation || null,
                  cast_id: cast?.id || null,
                  local_product_id: null, // base_products.idは外部キー制約違反になるためnull
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
                errorDetails.push(`upsert failed for ${orderSummary.unique_key}: ${upsertError.message}`)
                console.error(`[BASE Sync] Store ${setting.store_id}: upsert failed -`, upsertError.message)
              } else {
                successCount++
              }
            }
          }
        }

        console.log(`[BASE Sync] Store ${setting.store_id}: Completed - ${successCount} success, ${errorCount} errors`)

        results.push({
          store_id: setting.store_id,
          success: true,
          imported: successCount,
          errors: errorCount,
          errorDetails: errorDetails.length > 0 ? errorDetails.slice(0, 10) : undefined, // 最大10件
        })
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

    // BASE注文同期後、過去3日分の売上を自動再計算
    console.log('[BASE Sync] Starting automatic sales recalculation for past 3 days...')
    const recalcResults: any[] = []

    for (const result of results) {
      if (!result.success || result.imported === 0) continue

      // 過去3日分の日付を生成
      const today = new Date()
      const dates: string[] = []
      for (let i = 0; i < 3; i++) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        dates.push(date.toISOString().split('T')[0])
      }

      // 各日付の売上を再計算（直接関数呼び出しでDeployment Protectionを回避）
      for (const date of dates) {
        try {
          const recalcResult = await recalculateForDate(result.store_id, date)

          if (recalcResult.success) {
            recalcResults.push({
              store_id: result.store_id,
              date,
              success: true,
              castsProcessed: recalcResult.castsProcessed,
              itemsProcessed: recalcResult.itemsProcessed
            })
            console.log(`[BASE Sync] Store ${result.store_id}: Sales recalculated for ${date} (${recalcResult.castsProcessed} casts, ${recalcResult.itemsProcessed} items)`)
          } else {
            recalcResults.push({ store_id: result.store_id, date, success: false, error: recalcResult.error })
            console.error(`[BASE Sync] Store ${result.store_id}: Sales recalc failed for ${date} -`, recalcResult.error)
          }
        } catch (recalcError) {
          const errorMsg = recalcError instanceof Error ? recalcError.message : 'Unknown error'
          recalcResults.push({ store_id: result.store_id, date, success: false, error: errorMsg })
          console.error(`[BASE Sync] Store ${result.store_id}: Sales recalc error for ${date} -`, errorMsg)
        }
      }
    }

    return NextResponse.json({
      success: true,
      results,
      recalcResults,
      syncedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[BASE Sync] executeSyncBaseOrders error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
