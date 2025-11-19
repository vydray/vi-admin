// lib/timeUtils.ts
// 時間関連のユーティリティ関数

export const DEFAULT_SHIFT_START = '19:00'
export const DEFAULT_SHIFT_END = '03:00'
export const HOURS_IN_EXTENDED_DAY = 30
export const MINUTES_IN_HOUR = 60
export const TIME_INTERVAL_MINUTES = 15

/**
 * 時間選択肢を生成（00:00 から 29:45 まで15分刻み）
 */
export const generateTimeOptions = (): string[] => {
  const options: string[] = []
  for (let h = 0; h < HOURS_IN_EXTENDED_DAY; h++) {
    for (let m = 0; m < MINUTES_IN_HOUR; m += TIME_INTERVAL_MINUTES) {
      const hour = h.toString().padStart(2, '0')
      const minute = m.toString().padStart(2, '0')
      options.push(`${hour}:${minute}`)
    }
  }
  return options
}

/**
 * シフト時間をフォーマット（例: "19:00〜27:00"）
 * 0-5時は24-29時として表示
 */
export const formatShiftTime = (startTime: string, endTime: string, separator: string = '〜'): string => {
  if (!startTime || !endTime) return ''

  const formatTime = (time: string) => {
    const [hours, minutes] = time.slice(0, 5).split(':').map(Number)
    // 0-5時は24-29時として表示
    if (hours >= 0 && hours <= 5) {
      return `${hours + 24}:${minutes.toString().padStart(2, '0')}`
    }
    return `${hours}:${minutes.toString().padStart(2, '0')}`
  }

  return `${formatTime(startTime)}${separator}${formatTime(endTime)}`
}
