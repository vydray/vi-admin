import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// .env.localファイルを読み込む
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('エラー: 環境変数が設定されていません')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '設定済み' : '未設定')
  console.error('SUPABASE_SERVICE_KEY:', supabaseServiceKey ? '設定済み' : '未設定')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function backfillCategories(storeId?: number) {
  try {
    console.log('カテゴリーのバックフィル処理を開始します...')

    // 店舗IDの指定がある場合はその店舗のみ、ない場合は全店舗
    const storeFilter = storeId ? `店舗ID: ${storeId}` : '全店舗'
    console.log(`対象: ${storeFilter}`)

    // 商品マスタとカテゴリーマスタを取得
    const productsQuery = supabase
      .from('products')
      .select('id, name, category_id, store_id')

    if (storeId) {
      productsQuery.eq('store_id', storeId)
    }

    const { data: products, error: productsError } = await productsQuery

    if (productsError) {
      throw productsError
    }

    const categoriesQuery = supabase
      .from('categories')
      .select('id, name, store_id')

    if (storeId) {
      categoriesQuery.eq('store_id', storeId)
    }

    const { data: categories, error: categoriesError } = await categoriesQuery

    if (categoriesError) {
      throw categoriesError
    }

    console.log(`商品マスタ: ${products?.length || 0}件`)
    console.log(`カテゴリーマスタ: ${categories?.length || 0}件`)

    // カテゴリーが空または null の order_items を取得
    const orderItemsQuery = supabase
      .from('order_items')
      .select('id, product_name, category, store_id')
      .or('category.is.null,category.eq.')

    if (storeId) {
      orderItemsQuery.eq('store_id', storeId)
    }

    const { data: orderItems, error: orderItemsError } = await orderItemsQuery

    if (orderItemsError) {
      throw orderItemsError
    }

    console.log(`\nカテゴリーが未設定の注文明細: ${orderItems?.length || 0}件`)

    if (!orderItems || orderItems.length === 0) {
      console.log('バックフィルが必要な注文明細はありません。')
      return
    }

    // 注文明細ごとにカテゴリーを更新
    let updatedCount = 0
    let notFoundCount = 0

    for (const item of orderItems) {
      // 商品名からカテゴリーを検索
      const product = products?.find(
        p => p.name === item.product_name && p.store_id === item.store_id
      )
      const category = categories?.find(
        c => c.id === product?.category_id && c.store_id === item.store_id
      )

      if (category) {
        // カテゴリーを更新
        const { error: updateError } = await supabase
          .from('order_items')
          .update({ category: category.name })
          .eq('id', item.id)

        if (updateError) {
          console.error(`エラー (ID: ${item.id}):`, updateError.message)
        } else {
          updatedCount++
          if (updatedCount % 100 === 0) {
            console.log(`進捗: ${updatedCount}/${orderItems.length}件更新完了`)
          }
        }
      } else {
        notFoundCount++
        console.log(`商品が見つかりません: ${item.product_name} (ID: ${item.id}, 店舗: ${item.store_id})`)
      }
    }

    console.log('\n=== 完了 ===')
    console.log(`更新成功: ${updatedCount}件`)
    console.log(`商品が見つからない: ${notFoundCount}件`)
    console.log(`合計: ${orderItems.length}件`)

  } catch (error) {
    console.error('エラーが発生しました:', error)
    process.exit(1)
  }
}

// コマンドライン引数から店舗IDを取得
const storeIdArg = process.argv[2]
const storeId = storeIdArg ? parseInt(storeIdArg, 10) : undefined

if (storeIdArg && isNaN(storeId!)) {
  console.error('エラー: 店舗IDは数値で指定してください')
  process.exit(1)
}

backfillCategories(storeId)
