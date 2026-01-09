import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { fetchOrders, fetchOrderDetail, refreshAccessToken } from '@/lib/baseApi'

/**
 * BASE注文を取得してDBに保存
 * POST /api/base/orders
 * body: { store_id, start_date?, end_date? }
 */
export async function POST(request: NextRequest) {
  try {
    const { store_id, start_date, end_date } = await request.json()

    if (!store_id) {
      return NextResponse.json({ error: 'store_id is required' }, { status: 400 })
    }

    // 日付が指定されていない場合はデフォルトで過去30日
    const defaultEndDate = new Date().toISOString().split('T')[0]
    const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const effectiveStartDate = start_date || defaultStartDate
    const effectiveEndDate = end_date || defaultEndDate

    const supabase = getSupabaseServerClient()

    // base_settingsを取得
    const { data: settings, error: settingsError } = await supabase
      .from('base_settings')
      .select('*')
      .eq('store_id', store_id)
      .single()

    if (settingsError || !settings) {
      return NextResponse.json(
        { error: 'BASE settings not found' },
        { status: 400 }
      )
    }

    if (!settings.access_token) {
      return NextResponse.json(
        { error: 'Not authenticated with BASE' },
        { status: 401 }
      )
    }

    // トークンの有効期限をチェック
    let accessToken = settings.access_token
    if (settings.token_expires_at) {
      const expiresAt = new Date(settings.token_expires_at)
      if (expiresAt < new Date()) {
        // トークンを更新
        if (!settings.refresh_token || !settings.client_id || !settings.client_secret) {
          return NextResponse.json(
            { error: 'Cannot refresh token - missing credentials' },
            { status: 401 }
          )
        }

        try {
          const newTokens = await refreshAccessToken(
            settings.client_id,
            settings.client_secret,
            settings.refresh_token
          )

          accessToken = newTokens.access_token
          const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000)

          // 新しいトークンを保存
          await supabase
            .from('base_settings')
            .update({
              access_token: newTokens.access_token,
              refresh_token: newTokens.refresh_token,
              token_expires_at: newExpiresAt.toISOString(),
            })
            .eq('store_id', store_id)
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError)
          return NextResponse.json(
            { error: 'Token expired and refresh failed' },
            { status: 401 }
          )
        }
      }
    }

    // BASE APIから注文を取得
    console.log('Fetching BASE orders:', { effectiveStartDate, effectiveEndDate })
    const ordersResponse = await fetchOrders(accessToken, {
      start_ordered: effectiveStartDate,
      end_ordered: effectiveEndDate,
      limit: 100,
    })
    console.log('BASE API full response:', JSON.stringify(ordersResponse, null, 2))

    // 売上設定から締め時間を取得
    const { data: salesSettings } = await supabase
      .from('sales_settings')
      .select('base_cutoff_hour, base_cutoff_enabled')
      .eq('store_id', store_id)
      .single()

    const cutoffHour = salesSettings?.base_cutoff_hour ?? 6
    const cutoffEnabled = salesSettings?.base_cutoff_enabled ?? true

    // BASE商品マッピングとキャストを取得
    const { data: baseProducts } = await supabase
      .from('base_products')
      .select('id, base_product_name, local_product_name, store_price')
      .eq('store_id', store_id)
      .eq('is_active', true)

    const { data: casts } = await supabase
      .from('casts')
      .select('id, name')
      .eq('store_id', store_id)

    // キャンセル以外の注文を取得（デジタルコンテンツはdispatchedにならないことがある）
    // dispatch_status: unpaid(入金待ち), ordered(未対応), shipping(配送中), dispatched(対応済み), cancelled(キャンセル)
    const activeOrders = (ordersResponse.orders || []).filter(order => order.dispatch_status !== 'cancelled')
    console.log(`Total orders: ${ordersResponse.orders?.length || 0}, Active (non-cancelled): ${activeOrders.length}`)

    // 注文詳細を並列取得（5件ずつ）
    let successCount = 0
    let errorCount = 0
    const orders = activeOrders
    const BATCH_SIZE = 5

    for (let i = 0; i < orders.length; i += BATCH_SIZE) {
      const batch = orders.slice(i, i + BATCH_SIZE)

      // バッチ内を並列で取得
      const detailResults = await Promise.allSettled(
        batch.map(async (orderSummary) => {
          const detailResponse = await fetchOrderDetail(accessToken, orderSummary.unique_key)
          return { orderSummary, orderDetail: detailResponse.order }
        })
      )

      // 各結果を処理
      for (const result of detailResults) {
        if (result.status === 'rejected') {
          console.error('Failed to fetch order detail:', result.reason)
          errorCount++
          continue
        }

        const { orderSummary, orderDetail } = result.value

        // Unix timestamp（秒）をDateに変換
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

        // 各商品アイテムを保存
        for (const item of orderDetail.order_items || []) {
          const cast = casts?.find(c => c.name === item.variation)
          const baseProduct = baseProducts?.find(p => p.base_product_name === item.title)

          // 店舗価格（税抜）を決定: store_priceがあればそれを使用、なければbase_priceを税抜換算
          const actualPrice = baseProduct?.store_price ?? Math.floor(item.price / 1.1)

          const { error: upsertError } = await supabase
            .from('base_orders')
            .upsert({
              store_id,
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
            console.error('Order upsert error:', upsertError)
            errorCount++
          } else {
            successCount++
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      imported: successCount,
      errors: errorCount,
      total: ordersResponse.orders?.length || 0,
    })
  } catch (error) {
    console.error('BASE orders error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
