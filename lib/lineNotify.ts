/**
 * LINE Messaging API - push送信
 * 指定の line_user_id 宛てにテキストメッセージを1通送る
 */
export async function pushLineMessage(
  accessToken: string,
  to: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        to,
        messages: [{ type: 'text', text }],
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      return { success: false, error: `${response.status}: ${errBody.slice(0, 300)}` }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
