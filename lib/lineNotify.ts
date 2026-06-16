/**
 * LINE Messaging API - push送信
 * 指定の line_user_id 宛てにテキストメッセージを1通送る
 *
 * 信頼性: BASE注文通知は送信前に notification_sent_at をクレーム確定する設計のため、
 * ここで一過性の失敗(429レート制限 / 5xx / ネットワーク/タイムアウト)を取りこぼすと
 * その宛先(特に該当キャスト)は恒久的に通知が届かない。よって一過性エラーは指数バックオフで
 * 数回リトライする。4xx(429以外: 無効トークン/ブロック等)はリトライしても無駄なので即返す。
 */

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push'
const PUSH_TIMEOUT_MS = 10000 // 1リクエストのタイムアウト
const DEFAULT_MAX_ATTEMPTS = 3 // 初回 + リトライ2回
const MAX_BACKOFF_MS = 5000 // バックオフ上限(cronロックTTLを食い潰さないため)

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function pushLineMessage(
  accessToken: string,
  to: string,
  text: string,
  opts?: { maxAttempts?: number }
): Promise<{ success: boolean; error?: string }> {
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)
  let lastError = 'unknown error'

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS)
    try {
      const response = await fetch(LINE_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          to,
          messages: [{ type: 'text', text }],
        }),
        signal: controller.signal,
      })

      if (response.ok) {
        return { success: true }
      }

      const errBody = await response.text()
      lastError = `${response.status}: ${errBody.slice(0, 300)}`

      // 一過性(429 / 5xx)はリトライ、それ以外の4xxは即失敗
      const retriable = response.status === 429 || response.status >= 500
      if (!retriable || attempt >= maxAttempts) {
        return { success: false, error: lastError }
      }

      // 429 は Retry-After を尊重(上限あり)、無ければ指数バックオフ
      const retryAfterSec = Number(response.headers.get('retry-after'))
      const backoff = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(retryAfterSec * 1000, MAX_BACKOFF_MS)
        : Math.min(400 * 2 ** (attempt - 1), MAX_BACKOFF_MS)
      await sleep(backoff)
    } catch (err) {
      // ネットワーク/タイムアウト(AbortError含む)はリトライ対象
      lastError = err instanceof Error ? err.message : String(err)
      if (attempt >= maxAttempts) {
        return { success: false, error: lastError }
      }
      await sleep(Math.min(400 * 2 ** (attempt - 1), MAX_BACKOFF_MS))
    } finally {
      clearTimeout(timeoutId)
    }
  }

  return { success: false, error: lastError }
}
