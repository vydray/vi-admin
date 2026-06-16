import { getSupabaseServerClient } from './supabase'
import { pushLineMessage } from './lineNotify'
import { acquireCronLock } from './cronLock'

/**
 * BASEトークンの自動更新が回復不能(invalid_grant=refresh_token失効)になった時に、
 * 店舗の管理者/マネージャーへ LINE で再認証を促す警報を送る。
 *
 * 背景: rotating refresh_token が一度無効化されると refreshAccessToken は毎回 invalid_grant
 * で失敗し、コードからは自己回復できない(BASEの再認証フロー /api/base/callback が必須)。
 * 放置すると深夜の取り込みが静かに止まり朝まで誰も気づけないため、能動的に通知する。
 *
 * スパム防止: 既存の cron_lock を「1時間に1回」のスロットルとして流用する。
 * acquire できた時だけ送信し、ロックは解放しない(TTL満了=1時間で自然に再送可能になる)。
 */
export async function alertBaseTokenStuck(storeId: number, detail: string): Promise<void> {
  try {
    // 1時間に1通だけ(ロックを取れた最初の1回のみ送信、解放しない)
    const throttled = await acquireCronLock(`base-token-alert-${storeId}`, 3600)
    if (!throttled) return

    const supabase = getSupabaseServerClient()

    const { data: lineConfig } = await supabase
      .from('store_line_configs')
      .select('line_channel_access_token')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .maybeSingle()

    const accessToken = lineConfig?.line_channel_access_token as string | undefined
    if (!accessToken) return

    const { data: storeData } = await supabase
      .from('stores')
      .select('store_name')
      .eq('id', storeId)
      .maybeSingle()
    const storeName = (storeData?.store_name as string) || `Store ${storeId}`

    const { data: recipients } = await supabase
      .from('casts')
      .select('line_user_id, is_admin, is_manager, is_active')
      .eq('store_id', storeId)

    const adminLineIds = Array.from(
      new Set(
        ((recipients || []) as Array<{ line_user_id: string | null; is_admin: boolean; is_manager: boolean; is_active: boolean }>)
          .filter(c => c.is_active && c.line_user_id && (c.is_admin || c.is_manager))
          .map(c => c.line_user_id as string)
      )
    )
    if (adminLineIds.length === 0) return

    const message = [
      `⚠️【BASE連携】${storeName}`,
      '━━━━━━━━━━━━━━',
      'BASEトークンの自動更新が失敗し続けています。',
      '注文の取り込み・通知が止まっている可能性があります。',
      '管理画面の BASE設定から再連携(再認証)してください。',
      '',
      `詳細: ${detail.slice(0, 150)}`,
      '━━━━━━━━━━━━━━',
    ].join('\n')

    for (const lineId of adminLineIds) {
      await pushLineMessage(accessToken, lineId, message)
    }
  } catch (err) {
    // 警報自体の失敗で本処理を巻き込まない
    console.error(`[BaseTokenAlert] Store ${storeId}: alert failed:`, err)
  }
}
