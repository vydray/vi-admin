/**
 * 営業日計算ユーティリティ
 *
 * 営業日は会計時刻（checkout_datetime）から、設定された切替時刻を考慮して計算されます。
 * 例：切替時刻が6時の場合
 * - 1/20 23:00 の会計 → 1/20 の営業日
 * - 1/21 01:00 の会計 → 1/20 の営業日（まだ1/20の営業として扱う）
 * - 1/21 06:00 の会計 → 1/21 の営業日（1/21の営業に切り替わる）
 */

/**
 * 会計時刻から営業日を計算する
 * @param checkoutDatetime 会計時刻（ISO 8601形式の文字列）
 * @param cutoffHour 営業日切替時刻（0-23の整数）
 * @returns 営業日（YYYY-MM-DD形式の文字列）
 */
export function calculateBusinessDay(
  checkoutDatetime: string,
  cutoffHour: number = 6
): string {
  // 会計時刻をDateオブジェクトに変換
  const checkoutDate = new Date(checkoutDatetime)

  // 日本時間に変換
  const jstDate = new Date(
    checkoutDate.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })
  )

  // 時刻を取得
  const hour = jstDate.getHours()

  // 切替時刻より前の場合、前日を営業日とする
  if (hour < cutoffHour) {
    jstDate.setDate(jstDate.getDate() - 1)
  }

  // YYYY-MM-DD形式で返す
  const year = jstDate.getFullYear()
  const month = String(jstDate.getMonth() + 1).padStart(2, '0')
  const day = String(jstDate.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * 営業日をISO 8601形式のタイムスタンプに変換する
 * @param businessDay 営業日（YYYY-MM-DD形式の文字列）
 * @returns ISO 8601形式のタイムスタンプ
 */
export function businessDayToTimestamp(businessDay: string): string {
  // 営業日の0時0分0秒をUTCタイムスタンプとして返す
  return new Date(businessDay + 'T00:00:00.000Z').toISOString()
}

/**
 * 現在の営業日を取得する
 * @param cutoffHour 営業日切替時刻（0-23の整数）
 * @returns 現在の営業日（YYYY-MM-DD形式の文字列）
 */
export function getCurrentBusinessDay(cutoffHour: number = 6): string {
  const now = new Date()
  return calculateBusinessDay(now.toISOString(), cutoffHour)
}

/**
 * 営業日の範囲を計算する（ダッシュボード用）
 * @param businessDay 営業日（YYYY-MM-DD形式の文字列）
 * @param cutoffHour 営業日切替時刻（0-23の整数）
 * @returns { start: string, end: string } - 営業日の開始時刻と終了時刻（ISO 8601形式）
 */
export function getBusinessDayRange(
  businessDay: string,
  cutoffHour: number = 6
): { start: string; end: string } {
  // 営業日の開始時刻を計算（当日の切替時刻）
  const startDate = new Date(businessDay + 'T00:00:00+09:00')
  startDate.setHours(cutoffHour, 0, 0, 0)

  // 営業日の終了時刻を計算（翌日の切替時刻の直前）
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + 1)
  endDate.setMilliseconds(-1)

  return {
    start: startDate.toISOString(),
    end: endDate.toISOString()
  }
}
