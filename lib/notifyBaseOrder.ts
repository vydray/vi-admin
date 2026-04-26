import { getSupabaseServerClient } from './supabase'
import { pushLineMessage } from './lineNotify'
import { withCronLock } from './cronLock'

interface OrderRow {
  id: number
  base_order_id: string
  product_name: string
  variation_name: string | null
  quantity: number
  base_price: number
  actual_price: number | null
  customer_name: string | null
  customer_note: string | null
  order_datetime: string
  cast_id: number | null
}

interface CastRow {
  id: number
  name: string
  line_user_id: string | null
  is_admin: boolean
  is_manager: boolean
  is_active: boolean
}

export interface NotifyResult {
  skipped: boolean
  results: { storeId: number; sent: number; errors: number }[]
}

/**
 * 全店舗の未通知BASE注文を処理
 * `notify-base-orders` ロックで Fast/Slow cron間の並列を防止
 */
export async function notifyPendingForAllStores(): Promise<NotifyResult> {
  const result = await withCronLock('notify-base-orders', async () => {
    return await runNotification()
  }, 300)

  if (result === null) {
    return { skipped: true, results: [] }
  }
  return { skipped: false, results: result }
}

async function runNotification() {
  const supabase = getSupabaseServerClient()

  const { data: pendingStoresData, error } = await supabase
    .from('base_orders')
    .select('store_id')
    .is('notification_sent_at', null)

  if (error) {
    console.error('[Notify] Failed to fetch pending store list:', error)
    return []
  }

  const storeIds = Array.from(new Set((pendingStoresData || []).map(r => r.store_id)))
  const results: { storeId: number; sent: number; errors: number }[] = []

  for (const storeId of storeIds) {
    try {
      const r = await notifyPendingForStore(storeId)
      results.push({ storeId, sent: r.sent, errors: r.errors })
    } catch (err) {
      console.error(`[Notify] Store ${storeId} unhandled error:`, err)
      results.push({ storeId, sent: 0, errors: 1 })
    }
  }

  return results
}

async function notifyPendingForStore(storeId: number): Promise<{ sent: number; errors: number }> {
  const supabase = getSupabaseServerClient()

  const { data: lineConfig } = await supabase
    .from('store_line_configs')
    .select('line_channel_access_token')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .maybeSingle()

  if (!lineConfig?.line_channel_access_token) {
    console.warn(`[Notify] Store ${storeId}: LINE設定なし/非active、スキップ`)
    return { sent: 0, errors: 0 }
  }
  const accessToken = lineConfig.line_channel_access_token as string

  // 店舗名を取得(複数店舗兼任の管理者向けにメッセージに含める)
  const { data: storeData } = await supabase
    .from('stores')
    .select('store_name')
    .eq('id', storeId)
    .maybeSingle()
  const storeName = (storeData?.store_name as string) || `Store ${storeId}`

  // 未通知の base_order_id リストを取得(ここではあくまで処理対象ID列挙)
  const { data: pendingRows, error } = await supabase
    .from('base_orders')
    .select('base_order_id')
    .eq('store_id', storeId)
    .is('notification_sent_at', null)
    .order('order_datetime', { ascending: true })

  if (error) {
    console.error(`[Notify] Store ${storeId}: fetch pending失敗:`, error)
    return { sent: 0, errors: 1 }
  }
  if (!pendingRows || pendingRows.length === 0) {
    return { sent: 0, errors: 0 }
  }

  const pendingOrderIds = Array.from(new Set(pendingRows.map(r => r.base_order_id)))

  // 店舗の全キャストを取得(名前表示のため非active含む、送信先は別途is_activeで絞る)
  const { data: allCasts } = await supabase
    .from('casts')
    .select('id, name, line_user_id, is_admin, is_manager, is_active')
    .eq('store_id', storeId)

  const castById = new Map<number, CastRow>()
  for (const c of (allCasts || []) as CastRow[]) {
    castById.set(c.id, c)
  }

  // 送信先: is_active=true かつ line_user_id 有り
  const adminManagerRecipients = ((allCasts || []) as CastRow[]).filter(
    c => c.is_active && c.line_user_id && (c.is_admin || c.is_manager)
  )

  let totalSent = 0
  let totalErrors = 0

  for (const baseOrderId of pendingOrderIds) {
    // アトミッククレーム: UPDATE と同時にクレームした全データを取得
    // これにより「claim後に別cronが追加insertした行」を取りこぼさない
    const { data: claimed, error: claimError } = await supabase
      .from('base_orders')
      .update({ notification_sent_at: new Date().toISOString() })
      .eq('store_id', storeId)
      .eq('base_order_id', baseOrderId)
      .is('notification_sent_at', null)
      .select('id, base_order_id, product_name, variation_name, quantity, base_price, actual_price, customer_name, customer_note, order_datetime, cast_id')

    if (claimError) {
      console.error(`[Notify] Store ${storeId} claim失敗 ${baseOrderId}:`, claimError)
      totalErrors++
      continue
    }

    if (!claimed || claimed.length === 0) {
      // 他cronが取ったのでこの注文はスキップ
      continue
    }

    const claimedRows = claimed as OrderRow[]

    // 受信者を確定(line_user_idキーで重複排除、admin>cast優先)
    type Recipient = { type: 'admin'; cast?: never } | { type: 'cast'; cast: CastRow }
    const recipientsByLineId = new Map<string, Recipient>()

    for (const a of adminManagerRecipients) {
      if (a.line_user_id) recipientsByLineId.set(a.line_user_id, { type: 'admin' })
    }

    for (const row of claimedRows) {
      if (!row.cast_id) continue
      const cast = castById.get(row.cast_id)
      if (!cast || !cast.is_active || !cast.line_user_id) continue // 退店済み/LINE未連携はスキップ
      if (recipientsByLineId.has(cast.line_user_id)) continue // adminとして既に登録済み
      recipientsByLineId.set(cast.line_user_id, { type: 'cast', cast })
    }

    if (recipientsByLineId.size === 0) {
      // 通知先なし(管理者未登録かつキャストマッチなし)、既にマーク済みなのでスキップ
      continue
    }

    // 送信
    let lastSendError: string | undefined
    for (const [lineUserId, recipientInfo] of recipientsByLineId) {
      let messageText: string
      if (recipientInfo.type === 'admin') {
        messageText = buildAdminMessage(claimedRows, castById, storeName)
      } else {
        const myRows = claimedRows.filter(r => r.cast_id === recipientInfo.cast.id)
        if (myRows.length === 0) continue
        messageText = buildCastMessage(myRows, storeName)
      }

      const { success, error } = await pushLineMessage(accessToken, lineUserId, messageText)
      if (success) {
        totalSent++
      } else {
        totalErrors++
        lastSendError = error
        console.error(`[Notify] Store ${storeId} send失敗 ${lineUserId}:`, error)
      }
      await sleep(100)
    }

    // 送信エラーがあれば先頭行にエラー情報を残す(再送UI向け)
    if (lastSendError && claimedRows[0]) {
      await supabase
        .from('base_orders')
        .update({ notification_error: lastSendError.slice(0, 500) })
        .eq('id', claimedRows[0].id)
    }
  }

  return { sent: totalSent, errors: totalErrors }
}

function buildAdminMessage(rows: OrderRow[], castById: Map<number, CastRow>, storeName: string): string {
  const customerName = rows[0].customer_name || '名前なし'
  const orderDatetime = formatJSTTime(rows[0].order_datetime)
  const customerNote = rows[0].customer_note

  const itemBlocks = rows.map(row => {
    const cast = row.cast_id ? castById.get(row.cast_id) : undefined
    const castLabel = cast ? `✨ ${cast.name}` : '⚠️ 未マッチ'
    const variationDisplay = row.variation_name || 'なし'
    const priceDisplay = row.actual_price !== null
      ? `💰 ¥${row.actual_price.toLocaleString()}`
      : '💰 ¥--- ⚠️ 店舗価格未設定'
    return `${castLabel}（${variationDisplay}）\n　📦 ${row.product_name} × ${row.quantity}\n　${priceDisplay}`
  })

  const lines = [
    `🛒【BASE注文】${storeName}`,
    '━━━━━━━━━━━━━━',
    `👤 お客様: ${customerName} 様`,
    `⏰ 受注: ${orderDatetime}`,
  ]
  if (customerNote) {
    lines.push(`💬 コメント: ${customerNote}`)
  }
  lines.push('', itemBlocks.join('\n\n'), '━━━━━━━━━━━━━━')
  return lines.join('\n')
}

function buildCastMessage(rows: OrderRow[], storeName: string): string {
  const customerName = rows[0].customer_name || '名前なし'
  const orderDatetime = formatJSTTime(rows[0].order_datetime)
  const customerNote = rows[0].customer_note

  const itemLines = rows.map(row => `📦 ${row.product_name} × ${row.quantity}`)

  const lines = [
    `🎀 BASE注文 / ${storeName}`,
    '━━━━━━━━━━━',
    ...itemLines,
    `👤 ${customerName} 様`,
    `⏰ ${orderDatetime}`,
  ]
  if (customerNote) {
    lines.push(`💬 ${customerNote}`)
  }
  lines.push('━━━━━━━━━━━')
  return lines.join('\n')
}

function formatJSTTime(isoString: string): string {
  const date = new Date(isoString)
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
