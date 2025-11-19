/**
 * 既存の注文データの営業日（order_date）を一括更新するスクリプト
 *
 * 使い方:
 * npx tsx scripts/update-business-days.ts [store_id]
 *
 * 例:
 * npx tsx scripts/update-business-days.ts 1  # Memorable
 * npx tsx scripts/update-business-days.ts 2  # Mistress Mirage
 * npx tsx scripts/update-business-days.ts    # 全店舗
 */

import { createClient } from '@supabase/supabase-js'
import { calculateBusinessDay } from '../lib/businessDay'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('環境変数が設定されていません')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function updateBusinessDays(storeId?: number) {
  try {
    console.log('営業日の一括更新を開始します...')

    // 指定された店舗IDまたは全店舗のシステム設定を取得
    const settingsQuery = supabase
      .from('system_settings')
      .select('store_id, setting_value')
      .eq('setting_key', 'business_day_cutoff_hour')

    if (storeId) {
      settingsQuery.eq('store_id', storeId)
    }

    const { data: settings, error: settingsError } = await settingsQuery

    if (settingsError) {
      throw settingsError
    }

    // 店舗ごとの切替時刻をマップに格納
    const cutoffHours: { [storeId: number]: number } = {}
    settings?.forEach(setting => {
      cutoffHours[setting.store_id] = Number(setting.setting_value)
    })

    console.log('取得した設定:', cutoffHours)

    // 対象の注文データを取得
    const ordersQuery = supabase
      .from('orders')
      .select('id, store_id, checkout_datetime, order_date')
      .not('checkout_datetime', 'is', null)

    if (storeId) {
      ordersQuery.eq('store_id', storeId)
    }

    const { data: orders, error: ordersError } = await ordersQuery

    if (ordersError) {
      throw ordersError
    }

    if (!orders || orders.length === 0) {
      console.log('更新対象の注文データが見つかりませんでした')
      return
    }

    console.log(`${orders.length}件の注文データを処理します...`)

    // バッチ更新用の配列
    const updates: Array<{ id: number; order_date: string }> = []
    let updatedCount = 0
    let skippedCount = 0

    for (const order of orders) {
      // 店舗の切替時刻を取得（デフォルトは6時）
      const cutoffHour = cutoffHours[order.store_id] ?? 6

      // 営業日を計算
      const businessDay = calculateBusinessDay(order.checkout_datetime, cutoffHour)

      // 既存のorder_dateと比較
      const existingBusinessDay = order.order_date?.split('T')[0]

      if (existingBusinessDay === businessDay) {
        // 既に正しい営業日が設定されている場合はスキップ
        skippedCount++
      } else {
        // 更新が必要な場合
        updates.push({
          id: order.id,
          order_date: businessDay + 'T00:00:00.000Z'
        })
        updatedCount++
      }

      // 進捗表示
      if ((updatedCount + skippedCount) % 100 === 0) {
        console.log(`処理中: ${updatedCount + skippedCount}/${orders.length}`)
      }
    }

    console.log(`\n更新対象: ${updatedCount}件`)
    console.log(`スキップ: ${skippedCount}件`)

    if (updates.length === 0) {
      console.log('更新するデータがありません')
      return
    }

    // バッチ更新を実行（50件ずつ）
    const batchSize = 50
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize)

      for (const update of batch) {
        const { error } = await supabase
          .from('orders')
          .update({ order_date: update.order_date })
          .eq('id', update.id)

        if (error) {
          console.error(`ID ${update.id} の更新に失敗:`, error.message)
        }
      }

      console.log(`更新完了: ${Math.min(i + batchSize, updates.length)}/${updates.length}`)
    }

    console.log('\n営業日の更新が完了しました！')
    console.log(`合計更新件数: ${updatedCount}件`)

  } catch (error) {
    console.error('エラーが発生しました:', error)
    process.exit(1)
  }
}

// コマンドライン引数から店舗IDを取得
const storeIdArg = process.argv[2]
const storeId = storeIdArg ? parseInt(storeIdArg, 10) : undefined

if (storeIdArg && isNaN(storeId!)) {
  console.error('店舗IDは数値で指定してください')
  process.exit(1)
}

// スクリプト実行
updateBusinessDays(storeId)
  .then(() => {
    console.log('スクリプトが正常に終了しました')
    process.exit(0)
  })
  .catch((error) => {
    console.error('スクリプトの実行中にエラーが発生しました:', error)
    process.exit(1)
  })
