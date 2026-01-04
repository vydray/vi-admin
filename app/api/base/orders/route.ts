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

    // 注文をDBに保存
    let successCount = 0
    let errorCount = 0

    for (const orderSummary of ordersResponse.orders || []) {
      try {
        // 注文詳細を取得（商品情報を含む）
        const detailResponse = await fetchOrderDetail(accessToken, orderSummary.unique_key)
        const orderDetail = detailResponse.order

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
          // キャストとBASE商品をマッチング
          const cast = casts?.find(c => c.name === item.variation)
          const baseProduct = baseProducts?.find(p => p.base_product_name === item.item_title)

          const { error: upsertError } = await supabase
            .from('base_orders')
            .upsert({
              store_id,
              base_order_id: orderSummary.unique_key,
              order_datetime: orderDatetime,
              product_name: item.item_title,
              variation_name: item.variation || null,
              cast_id: cast?.id || null,
              local_product_id: baseProduct?.id || null,
              base_price: item.price,
              actual_price: baseProduct?.store_price || null,
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
      } catch (detailError) {
        console.error('Failed to fetch order detail:', orderSummary.unique_key, detailError)
        errorCount++
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
