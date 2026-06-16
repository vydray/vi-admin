import { getSupabaseServerClient } from './supabase'
import { refreshAccessToken } from './baseApi'
import { acquireCronLock, releaseCronLock } from './cronLock'
import { alertBaseTokenStuck } from './baseTokenAlert'

/**
 * BASE access_token を必要に応じてリフレッシュし、有効な access_token を返す。
 *
 * 背景:
 * BASE の refresh_token は rotating（1回使うと無効化される）。
 * fast(毎分) / slow(15分毎) / refresh(30分毎) の3 cron が独立に走るため、
 * 同一 store の refresh_token を複数プロセスが同時に消費すると、
 * 先着の1本だけ成功し残りは invalid_grant で失敗 → トークン取得不能で取り込み全停止、
 * という事故が起こりうる（深夜の通知停止の再発リスク）。
 *
 * 対策:
 * store 単位の分散ロック（cronLock の RPC を流用）でリフレッシュ処理を直列化する。
 * - ロックを取得できた場合のみ実際にリフレッシュを実行し、CAS で書き戻す。
 * - ロックを取得できない（= 他プロセスがリフレッシュ中）場合は、短時間待って
 *   DB の最新トークンを読み直して返す。
 *
 * @param input store の現在の設定（呼び出し側が select 済み）
 * @param marginMs 期限まで残りこのms未満ならリフレッシュ対象とする
 * @returns 有効な access_token と、リフレッシュを実行したか
 */
export async function refreshBaseTokenIfNeeded(input: {
  store_id: number
  access_token: string
  refresh_token: string | null
  client_id: string | null
  client_secret: string | null
  token_expires_at: string | null
}, marginMs: number): Promise<{ accessToken: string; refreshed: boolean }> {
  const supabase = getSupabaseServerClient()

  // 期限に十分余裕があればそのまま使う
  if (input.token_expires_at) {
    const remaining = new Date(input.token_expires_at).getTime() - Date.now()
    if (remaining >= marginMs) {
      return { accessToken: input.access_token, refreshed: false }
    }
  }

  // リフレッシュに必要な認証情報が無ければリフレッシュ不可（呼び出し側で扱う）
  if (!input.refresh_token || !input.client_id || !input.client_secret) {
    throw new Error('missing refresh credentials')
  }

  const lockName = `base-token-refresh-${input.store_id}`
  // refreshAccessToken は外部HTTPなので余裕を持って 60秒 TTL
  const acquired = await acquireCronLock(lockName, 60)

  if (!acquired) {
    // 他プロセスがリフレッシュ中。少し待ってからDBの最新トークンを読み直す。
    await new Promise((r) => setTimeout(r, 1500))
    const { data: latest } = await supabase
      .from('base_settings')
      .select('access_token')
      .eq('store_id', input.store_id)
      .single()
    return { accessToken: latest?.access_token ?? input.access_token, refreshed: false }
  }

  try {
    // ロック取得後、DBの最新状態を再読み（待っている間に他プロセスが更新済みかもしれない）
    const { data: current } = await supabase
      .from('base_settings')
      .select('access_token, refresh_token, token_expires_at')
      .eq('store_id', input.store_id)
      .single()

    if (!current) {
      return { accessToken: input.access_token, refreshed: false }
    }

    // 他プロセスが既にリフレッシュ済みで期限に余裕があるなら、それを使う
    if (current.token_expires_at) {
      const remaining = new Date(current.token_expires_at).getTime() - Date.now()
      if (remaining >= marginMs) {
        return { accessToken: current.access_token, refreshed: false }
      }
    }

    const refreshToken = current.refresh_token ?? input.refresh_token
    if (!refreshToken) {
      throw new Error('missing refresh_token')
    }

    let newTokens
    try {
      newTokens = await refreshAccessToken(
        input.client_id,
        input.client_secret,
        refreshToken
      )
    } catch (refreshErr) {
      // invalid_grant = rotating refresh_token が失効。コードからは自己回復できず
      // 再認証が必須なので、管理者へ警報して可視化する(1時間に1回スロットル)。
      const msg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr)
      if (msg.includes('invalid_grant')) {
        await alertBaseTokenStuck(input.store_id, msg)
      }
      throw refreshErr
    }
    const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000)

    // ロック配下なので競合は起きないが、念のため CAS で書き戻す（count で成否判定）。
    // token_expires_at が NULL の場合 .eq(col, null) は SQL 上 col = NULL となり 0 行マッチ
    // (= 新トークンが永久に保存されず、消費済み refresh_token が残って永久 stuck) になるため、
    // NULL のときは .is(null) を使う。
    const baseUpdate = supabase
      .from('base_settings')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        token_expires_at: newExpiresAt.toISOString(),
      }, { count: 'exact' })
      .eq('store_id', input.store_id)
    const { count } = await (
      current.token_expires_at === null
        ? baseUpdate.is('token_expires_at', null)
        : baseUpdate.eq('token_expires_at', current.token_expires_at)
    )

    if (!count || count === 0) {
      // ロック配下では通常起きない。起きたらDBの最新を読み直して使う。
      const { data: latest } = await supabase
        .from('base_settings')
        .select('access_token')
        .eq('store_id', input.store_id)
        .single()
      return { accessToken: latest?.access_token ?? newTokens.access_token, refreshed: true }
    }

    return { accessToken: newTokens.access_token, refreshed: true }
  } finally {
    await releaseCronLock(lockName)
  }
}
