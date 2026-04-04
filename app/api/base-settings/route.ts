import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSupabaseServerClient } from '@/lib/supabase'

async function validateSession(): Promise<{ id: string; storeId: number; isAllStore: boolean; role: string } | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return null

  try {
    const session = JSON.parse(sessionCookie.value)
    if (!session?.id) return null
    return {
      id: session.id,
      storeId: session.store_id || session.storeId,
      isAllStore: session.isAllStore || false,
      role: session.role || '',
    }
  } catch {
    return null
  }
}

function checkStoreAccess(session: { storeId: number; isAllStore: boolean }, requestedStoreId: number): boolean {
  return session.isAllStore || session.storeId === requestedStoreId
}

/**
 * BASE設定関連の操作を処理
 * POST /api/base-settings
 * body: { action, store_id, ...params }
 *
 * actions:
 *   - load_data: 初期データ読み込み（base_products, base_variations, base_settings）
 *   - save_store_price: 店舗価格保存（base_products UPDATE/INSERT）
 *   - add_product: 商品追加（base_products INSERT）
 *   - import_csv: CSVインポート（base_orders UPSERT）
 *   - load_orders: 注文履歴読み込み（base_orders SELECT）
 *   - save_order_cast: 注文キャスト設定（base_orders UPDATE）
 *   - save_order_business_date: 注文営業日設定（base_orders UPDATE）
 *   - save_credentials: API認証情報保存（base_settings UPSERT）
 *   - load_base_items_sync: BASE商品取得＆同期（base_products, base_variations INSERT）
 */
export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { action, store_id } = body

  if (!store_id || !action) {
    return NextResponse.json({ error: 'action and store_id are required' }, { status: 400 })
  }

  if (!checkStoreAccess(session, store_id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseServerClient()

  try {
    switch (action) {
      case 'load_data':
        return await handleLoadData(supabase, store_id)
      case 'save_store_price':
        return await handleSaveStorePrice(supabase, store_id, body)
      case 'add_product':
        return await handleAddProduct(supabase, store_id, body)
      case 'import_csv':
        return await handleImportCSV(supabase, store_id, body)
      case 'load_orders':
        return await handleLoadOrders(supabase, store_id, body)
      case 'save_order_cast':
        return await handleSaveOrderCast(supabase, store_id, body)
      case 'save_order_business_date':
        return await handleSaveOrderBusinessDate(supabase, store_id, body)
      case 'save_credentials':
        return await handleSaveCredentials(supabase, store_id, body)
      case 'load_base_items_sync':
        return await handleLoadBaseItemsSync(supabase, store_id, body)
      case 'delete_cast_data':
        return await handleDeleteCastData(supabase, store_id, body)
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    console.error(`[base-settings] Action ${action} error:`, err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLoadData(supabase: any, storeId: number) {
  // BASE商品一覧
  const { data: productsData, error: productsError } = await supabase
    .from('base_products')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (productsError) throw productsError

  // バリエーション取得
  const productIds = (productsData || []).map((p: { id: number }) => p.id)
  let variationsData: { base_product_id: number; cast_id: number | null }[] = []

  if (productIds.length > 0) {
    const { data: vars, error: varsError } = await supabase
      .from('base_variations')
      .select('*')
      .in('base_product_id', productIds)
      .eq('is_active', true)
      .order('variation_name')

    if (varsError) throw varsError
    variationsData = vars || []
  }

  // BASE API設定
  const { data: baseSettingsData } = await supabase
    .from('base_settings')
    .select('client_id, client_secret, access_token, token_expires_at')
    .eq('store_id', storeId)
    .maybeSingle()

  return NextResponse.json({
    products: productsData || [],
    variations: variationsData,
    settings: baseSettingsData || null,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSaveStorePrice(supabase: any, storeId: number, body: {
  product_id?: number
  product_name: string
  store_price: number | null
  base_item_id?: number | null
  base_price?: number
}) {
  const { product_id, product_name, store_price, base_item_id, base_price } = body

  if (product_id) {
    // 既存商品を更新
    const { error } = await supabase
      .from('base_products')
      .update({ store_price })
      .eq('id', product_id)

    if (error) throw error
  } else {
    // 新規作成
    const { error } = await supabase
      .from('base_products')
      .insert({
        store_id: storeId,
        base_product_name: product_name,
        local_product_name: product_name,
        base_price: base_price || 0,
        base_item_id: base_item_id || null,
        store_price,
        is_active: true,
      })

    if (error) throw error
  }

  return NextResponse.json({ success: true })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleAddProduct(supabase: any, storeId: number, body: {
  product_name: string
  base_price: number
  base_item_id?: number | null
  local_product_name?: string | null
}) {
  const { product_name, base_price, base_item_id, local_product_name } = body

  const { error } = await supabase
    .from('base_products')
    .insert({
      store_id: storeId,
      base_product_name: product_name.trim(),
      local_product_name: local_product_name || null,
      base_price,
      base_item_id: base_item_id || null,
      is_active: true,
    })

  if (error) throw error

  return NextResponse.json({ success: true })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleImportCSV(supabase: any, storeId: number, body: {
  rows: Array<{
    base_order_id: string
    order_datetime: string
    product_name: string
    variation_name: string
    cast_id: number | null
    local_product_id: number | null
    base_price: number
    actual_price: number | null
    quantity: number
    business_date: string
  }>
}) {
  const { rows } = body
  let successCount = 0
  let errorCount = 0

  for (const row of rows) {
    const { error } = await supabase
      .from('base_orders')
      .upsert({
        store_id: storeId,
        base_order_id: row.base_order_id,
        order_datetime: row.order_datetime,
        product_name: row.product_name,
        variation_name: row.variation_name,
        cast_id: row.cast_id,
        local_product_id: row.local_product_id,
        base_price: row.base_price,
        actual_price: row.actual_price,
        quantity: row.quantity,
        business_date: row.business_date,
        is_processed: false,
      }, {
        onConflict: 'store_id,base_order_id,product_name,variation_name',
      })

    if (error) {
      console.error('Import row error:', error)
      errorCount++
    } else {
      successCount++
    }
  }

  return NextResponse.json({ successCount, errorCount })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLoadOrders(supabase: any, storeId: number, body: {
  start_date: string
  end_date: string
}) {
  const { start_date, end_date } = body

  const { data, error } = await supabase
    .from('base_orders')
    .select('*')
    .eq('store_id', storeId)
    .gte('business_date', start_date)
    .lte('business_date', end_date)
    .order('order_datetime', { ascending: false })

  if (error) throw error

  return NextResponse.json({ orders: data || [] })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSaveOrderCast(supabase: any, storeId: number, body: {
  order_id: number
  cast_id: number | null
}) {
  const { order_id, cast_id } = body

  const { error } = await supabase
    .from('base_orders')
    .update({
      cast_id,
      manually_edited: cast_id !== null,
      is_processed: false,
    })
    .eq('id', order_id)
    .eq('store_id', storeId)

  if (error) throw error

  return NextResponse.json({ success: true })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSaveOrderBusinessDate(supabase: any, storeId: number, body: {
  order_id: number
  business_date: string
}) {
  const { order_id, business_date } = body

  const { error } = await supabase
    .from('base_orders')
    .update({
      business_date,
      manually_edited: true,
      is_processed: false,
    })
    .eq('id', order_id)
    .eq('store_id', storeId)

  if (error) throw error

  return NextResponse.json({ success: true })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSaveCredentials(supabase: any, storeId: number, body: {
  client_id: string
  client_secret: string
}) {
  const { client_id, client_secret } = body

  if (!client_id?.trim() || !client_secret?.trim()) {
    return NextResponse.json({ error: 'client_id and client_secret are required' }, { status: 400 })
  }

  // 既存レコードチェック
  const { data: existing } = await supabase
    .from('base_settings')
    .select('id')
    .eq('store_id', storeId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('base_settings')
      .update({
        client_id: client_id.trim(),
        client_secret: client_secret.trim(),
      })
      .eq('store_id', storeId)

    if (error) throw error
  } else {
    const { error } = await supabase
      .from('base_settings')
      .insert({
        store_id: storeId,
        client_id: client_id.trim(),
        client_secret: client_secret.trim(),
      })

    if (error) throw error
  }

  return NextResponse.json({ success: true })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLoadBaseItemsSync(supabase: any, storeId: number, body: {
  items: Array<{ title: string; price: number; item_id: number; variations?: Array<{ variation: string }> }>
  existing_products: Array<{ id: number; base_product_name: string; variations: Array<{ variation_name: string }> }>
  casts: Array<{ id: number; name: string }>
}) {
  const { items, existing_products, casts } = body

  let addedProducts = 0
  let addedVariations = 0

  for (const item of items) {
    const existingProduct = existing_products.find((bp: { base_product_name: string }) => bp.base_product_name === item.title)

    if (!existingProduct) {
      // 新規商品を追加
      const { data: newProduct, error: productError } = await supabase
        .from('base_products')
        .insert({
          store_id: storeId,
          base_product_name: item.title,
          local_product_name: item.title,
          base_price: item.price,
          base_item_id: item.item_id,
          is_active: true,
        })
        .select('id')
        .single()

      if (productError) {
        console.error('商品追加エラー:', productError)
        continue
      }

      addedProducts++

      // 全キャストをバリエーションとして追加
      if (newProduct && casts.length > 0) {
        const variationsToAdd = casts.map((cast: { id: number; name: string }) => ({
          base_product_id: newProduct.id,
          store_id: storeId,
          variation_name: cast.name,
          cast_id: cast.id,
          is_active: true,
        }))

        const { error: varsError } = await supabase
          .from('base_variations')
          .insert(variationsToAdd)

        if (!varsError) {
          addedVariations += variationsToAdd.length
        }
      }
    } else {
      // 既存商品に未登録のキャストを追加
      const existingVariationNames = existingProduct.variations.map((v: { variation_name: string }) => v.variation_name)
      const newCasts = casts.filter((c: { name: string }) => !existingVariationNames.includes(c.name))

      if (newCasts.length > 0) {
        const variationsToAdd = newCasts.map((cast: { id: number; name: string }) => ({
          base_product_id: existingProduct.id,
          store_id: storeId,
          variation_name: cast.name,
          cast_id: cast.id,
          is_active: true,
        }))

        const { error: varsError } = await supabase
          .from('base_variations')
          .insert(variationsToAdd)

        if (!varsError) {
          addedVariations += variationsToAdd.length
        }
      }
    }
  }

  return NextResponse.json({ addedProducts, addedVariations })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDeleteCastData(supabase: any, storeId: number, body: {
  cast_id: number
}) {
  const { cast_id } = body

  await Promise.all([
    supabase.from('base_variations').delete().eq('cast_id', cast_id),
    supabase.from('base_orders').delete().eq('cast_id', cast_id),
  ])

  return NextResponse.json({ success: true })
}
