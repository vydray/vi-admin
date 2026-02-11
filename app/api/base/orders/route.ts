import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase'
import { fetchOrders, fetchOrderDetail, refreshAccessToken } from '@/lib/baseApi'

/**
 * セッション検証関数
 */
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

/**
 * BASE注文を取得してDBに保存
 * POST /api/base/orders
 * body: { store_id, start_date?, end_date? }
 */
export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
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

    // BASE APIから注文を取得（ページネーション対応）
    let allOrders: any[] = []
    let offset = 0
    const PAGE_SIZE = 100
    const MAX_PAGES = 100 // 最大10,000件まで（DoS対策）
    let pageCount = 0

    while (pageCount < MAX_PAGES) {
      const ordersResponse = await fetchOrders(accessToken, {
        start_ordered: effectiveStartDate,
        end_ordered: effectiveEndDate,
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
      console.warn(`[BASE Orders] Reached max page limit (${MAX_PAGES}), results may be incomplete`)
    }

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
    const activeOrders = allOrders.filter(order => order.dispatch_status !== 'cancelled')

    // 手動編集済みのbase_ordersキーを取得（cast_idを上書きしないため）
    const { data: manuallyEditedData } = await supabase
      .from('base_orders')
      .select('base_order_id, product_name, variation_name')
      .eq('store_id', store_id)
      .eq('manually_edited', true)

    const manuallyEditedKeys = new Set(
      (manuallyEditedData || []).map(r => `${r.base_order_id}|${r.product_name}|${r.variation_name}`)
    )

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

          // NULLではなく空文字を使用（ユニーク制約でNULL != NULLになるため）
          const productName = item.title || ''
          const variationName = item.variation || ''

          // 手動編集済みの注文はcast_idを上書きしない
          const key = `${orderSummary.unique_key}|${productName}|${variationName}`
          if (manuallyEditedKeys.has(key)) {
            // cast_id以外のフィールドのみ更新
            const { error: updateError } = await supabase
              .from('base_orders')
              .update({
                order_datetime: orderDatetime,
                base_price: item.price,
                actual_price: actualPrice,
                quantity: item.amount,
                business_date: businessDate,
              })
              .eq('store_id', store_id)
              .eq('base_order_id', orderSummary.unique_key)
              .eq('product_name', productName)
              .eq('variation_name', variationName)

            if (updateError) {
              console.error('Order update error (manually_edited):', updateError)
              errorCount++
            } else {
              successCount++
            }
            continue
          }

          // local_product_idはproductsテーブルを参照するので、base_products.idは使わない
          const { error: upsertError } = await supabase
            .from('base_orders')
            .upsert({
              store_id,
              base_order_id: orderSummary.unique_key,
              order_datetime: orderDatetime,
              product_name: productName,
              variation_name: variationName,
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
      total: allOrders.length,
    })
  } catch (error) {
    console.error('BASE orders error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
