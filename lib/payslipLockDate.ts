/**
 * 報酬明細の自動ロック判定
 *
 * 業務ルール: 各月の payslip は翌月5日まで cron で自動再計算され、翌月6日(JST)以降は自動ロック。
 * - 手動の「再計算」ボタンは triggeredBy='manual' なのでロック後も動く（緊急修正用）
 * - cron は triggeredBy='cron' なのでロック後はスキップ
 */

const CUTOFF_DAY_OF_NEXT_MONTH = 6 // 翌月この日(JST)以降ロック (= 翌月5日まで recalc)

/**
 * 指定年月の payslip が「自動ロック期間」に入っているかどうか
 * @param yearMonth "YYYY-MM"
 * @returns true なら cron はスキップ、画面表示は「確定済み」扱い
 */
export function isYearMonthLocked(yearMonth: string): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2]) // 1-12

  // 翌月のロック開始日を YYYY-MM-DD で表現
  let nextYear = year
  let nextMonth = month + 1
  if (nextMonth > 12) {
    nextMonth = 1
    nextYear += 1
  }
  const cutoffStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(CUTOFF_DAY_OF_NEXT_MONTH).padStart(2, '0')}`

  // 今日のJST日付を YYYY-MM-DD で取得
  const todayJstStr = new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0]

  return todayJstStr >= cutoffStr
}
