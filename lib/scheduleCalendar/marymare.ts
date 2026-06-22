import path from 'path'
import fs from 'fs'
import { createCanvas, registerFont, loadImage } from 'canvas'

/**
 * MaryMare(store7) 出勤表カレンダー画像の描画。
 *
 * 元は scripts/generate-marymare-shift.js（CLI）。本ファイルはそれをサーバ用に
 * 関数化したもの。世界観: ダークゴシック大聖堂 × ネオンピンク × 夢かわ。
 * 背景に大聖堂画像を敷き、その上にフロスト半透明カレンダーを重ねる。
 * フォントは M PLUS Rounded 1c（public/fonts、registerFontは一度だけ）。
 */

export interface CalendarShift {
  date: string // YYYY-MM-DD
  cast_name: string
  start_time: string // HH:MM(:SS)
  display_order: number | null
}

export interface CalendarEvent {
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  label: string
  bg: string
  text: string
}

export interface RenderMaryMareParams {
  title: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  shifts: CalendarShift[]
  events: CalendarEvent[]
}

// ---------- フォント登録（一度だけ） ----------
let fontsRegistered = false
function ensureFonts() {
  if (fontsRegistered) return
  const fontsDir = path.join(process.cwd(), 'public', 'fonts')
  const reg = (file: string, family: string) => {
    const p = path.join(fontsDir, file)
    if (fs.existsSync(p)) registerFont(p, { family })
  }
  reg('MPLUSRounded1c-Regular.ttf', 'Rounded Mplus 1c')
  reg('MPLUSRounded1c-Bold.ttf', 'Rounded Mplus 1c Bold')
  fontsRegistered = true
}

// ---------- 設定 ----------
const DISPLAY_OPEN_TIME = '18:00'
const DAYS = ['月', '火', '水', '木', '金', '土', '日']
const JS_DAY_TO_COL = [6, 0, 1, 2, 3, 4, 5]

// カラー（フロスト半透明：背景が透ける）
const FALLBACK_BG = '#180b16'
const TITLE_BG = 'rgba(20, 9, 16, 0.70)'
const TITLE_TEXT = '#ff8ec6'
const HEADER_BG = 'rgba(70, 22, 60, 0.66)'
const HEADER_TEXT = '#ffd9ee'
const DATE_ROW_BG = 'rgba(42, 15, 34, 0.68)'
const CELL_BG = 'rgba(30, 14, 26, 0.60)'
const BORDER = 'rgba(255, 111, 181, 0.45)'
const DATE_COLOR = '#ffe7f3'
const DATE_SAT = '#9ec5ff'
const DATE_SUN = '#ff6fb5'
const NAME_COLOR = '#ffffff'
const TIME_COLOR = '#ffbfe0'
const EMPTY_BG = 'rgba(0, 0, 0, 0)'

// レイアウト
const COL_W = 200
const TITLE_H = 90
const HEADER_H = 50
const DATE_ROW_H = 42
const ROW_MIN_H = 180
const NAME_LINE_HEIGHT = 34
const EVENT_LABEL_H = 32

// ---------- ヘルパ ----------
function ymdToDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function dateToYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function adjustStartForDisplay(t: string): string {
  if (!t) return t
  return t < DISPLAY_OPEN_TIME ? DISPLAY_OPEN_TIME : t
}
function formatTime(t: string): string {
  const [hh, mm] = t.split(':').map(Number)
  if (mm === 0) return `${hh}-`
  return `${hh}:${String(mm).padStart(2, '0')}-`
}
function buildWeeks(startStr: string, endStr: string): (Date | null)[][] {
  const start = ymdToDate(startStr)
  const end = ymdToDate(endStr)
  const weeks: (Date | null)[][] = []
  let current: (Date | null)[] | null = null
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const col = JS_DAY_TO_COL[d.getDay()]
    if (col === 0 || current === null) {
      if (current) weeks.push(current)
      current = new Array(7).fill(null)
    }
    current[col] = new Date(d)
  }
  if (current) weeks.push(current)
  return weeks
}
// 背景画像を canvas に cover フィット（アスペクト維持・はみ出しクロップ）
function drawCover(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  img: Awaited<ReturnType<typeof loadImage>>,
  w: number,
  h: number,
) {
  const ir = img.width / img.height
  const cr = w / h
  let dw: number, dh: number, dx: number, dy: number
  if (ir > cr) {
    dh = h
    dw = h * ir
    dx = (w - dw) / 2
    dy = 0
  } else {
    dw = w
    dh = w / ir
    dx = 0
    dy = (h - dh) / 2
  }
  ctx.drawImage(img, dx, dy, dw, dh)
}

/**
 * MaryMare カレンダー画像を生成して PNG Buffer を返す。
 */
export async function renderMaryMareCalendar(params: RenderMaryMareParams): Promise<Buffer> {
  ensureFonts()
  const { title, startDate, endDate, shifts, events } = params

  // シフトを date キーでマップ化＋ソート（display_order昇順→start_time）
  const shiftsByDate = new Map<string, CalendarShift[]>()
  for (const s of shifts) {
    if (!shiftsByDate.has(s.date)) shiftsByDate.set(s.date, [])
    shiftsByDate.get(s.date)!.push(s)
  }
  for (const [, arr] of shiftsByDate) {
    arr.sort((a, b) => {
      const ord = (a.display_order ?? 9999) - (b.display_order ?? 9999)
      if (ord !== 0) return ord
      return a.start_time.localeCompare(b.start_time)
    })
  }

  const getEventFor = (dateStr: string): CalendarEvent | null => {
    for (const e of events) {
      if (dateStr >= e.start && dateStr <= e.end) return e
    }
    return null
  }

  const weeks = buildWeeks(startDate, endDate)

  const getWeekHeight = (week: (Date | null)[]): number => {
    let maxCount = 0
    let hasEvent = false
    for (const day of week) {
      if (!day) continue
      const list = shiftsByDate.get(dateToYmd(day)) || []
      if (list.length > maxCount) maxCount = list.length
      if (getEventFor(dateToYmd(day))) hasEvent = true
    }
    const base = 16 + (hasEvent ? EVENT_LABEL_H + 8 : 0) + maxCount * NAME_LINE_HEIGHT + 12
    return Math.max(ROW_MIN_H, base)
  }

  const weekHeights = weeks.map(getWeekHeight)
  const totalRowH = weekHeights.reduce((s, h) => s + h + DATE_ROW_H, 0)
  const CANVAS_W = COL_W * 7
  const CANVAS_H = TITLE_H + HEADER_H + totalRowH

  const canvas = createCanvas(CANVAS_W, CANVAS_H)
  const ctx = canvas.getContext('2d')

  // 背景: 大聖堂画像 → 暗幕（可読性UP）。無ければ単色
  const bgPath = path.join(process.cwd(), 'public', 'schedule-bg', 'marymare.jpg')
  if (fs.existsSync(bgPath)) {
    const bg = await loadImage(bgPath)
    drawCover(ctx, bg, CANVAS_W, CANVAS_H)
    ctx.fillStyle = 'rgba(20, 9, 16, 0.42)'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  } else {
    ctx.fillStyle = FALLBACK_BG
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }

  // タイトル（フロスト帯 + ネオングロー文字）
  ctx.fillStyle = TITLE_BG
  ctx.fillRect(0, 0, CANVAS_W, TITLE_H)
  ctx.save()
  ctx.shadowColor = 'rgba(255, 111, 181, 0.95)'
  ctx.shadowBlur = 26
  ctx.fillStyle = TITLE_TEXT
  ctx.font = 'bold 48px "Rounded Mplus 1c Bold", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, CANVAS_W / 2, TITLE_H / 2)
  ctx.restore()

  // 曜日ヘッダー
  ctx.fillStyle = HEADER_BG
  ctx.fillRect(0, TITLE_H, CANVAS_W, HEADER_H)
  ctx.font = 'bold 26px "Rounded Mplus 1c Bold", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < 7; i++) {
    if (i === 5) ctx.fillStyle = DATE_SAT
    else if (i === 6) ctx.fillStyle = DATE_SUN
    else ctx.fillStyle = HEADER_TEXT
    ctx.fillText(DAYS[i], i * COL_W + COL_W / 2, TITLE_H + HEADER_H / 2)
  }

  // 各週
  let rowY = TITLE_H + HEADER_H
  for (let w = 0; w < weeks.length; w++) {
    const week = weeks[w]
    const bodyH = weekHeights[w]

    // 日付行
    const dateRowY = rowY
    ctx.fillStyle = DATE_ROW_BG
    ctx.fillRect(0, dateRowY, CANVAS_W, DATE_ROW_H)
    for (let i = 0; i < 7; i++) {
      const x = i * COL_W
      const day = week[i]
      ctx.strokeStyle = BORDER
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, dateRowY + 0.5, COL_W - 1, DATE_ROW_H - 1)
      if (!day) continue
      let dateColor = DATE_COLOR
      if (i === 5) dateColor = DATE_SAT
      if (i === 6) dateColor = DATE_SUN
      ctx.fillStyle = dateColor
      ctx.font = '24px "Rounded Mplus 1c", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(day.getDate()), x + COL_W / 2, dateRowY + DATE_ROW_H / 2)
    }

    // セル本体
    const cellY = rowY + DATE_ROW_H
    for (let i = 0; i < 7; i++) {
      const x = i * COL_W
      const day = week[i]

      if (!day) {
        ctx.fillStyle = EMPTY_BG
        ctx.fillRect(x, cellY, COL_W, bodyH)
        ctx.strokeStyle = BORDER
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, cellY + 0.5, COL_W - 1, bodyH - 1)
        continue
      }

      ctx.fillStyle = CELL_BG
      ctx.fillRect(x, cellY, COL_W, bodyH)
      ctx.strokeStyle = BORDER
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, cellY + 0.5, COL_W - 1, bodyH - 1)

      // イベント帯
      const ev = getEventFor(dateToYmd(day))
      let castStartY = cellY + 10
      if (ev) {
        const labelY = cellY + 6
        ctx.fillStyle = ev.bg
        ctx.fillRect(x + 4, labelY, COL_W - 8, EVENT_LABEL_H)
        ctx.fillStyle = ev.text
        const evMaxW = COL_W - 14
        let evFont = 22
        ctx.font = `bold ${evFont}px "Rounded Mplus 1c Bold", sans-serif`
        while (ctx.measureText(ev.label).width > evMaxW && evFont > 10) {
          evFont -= 1
          ctx.font = `bold ${evFont}px "Rounded Mplus 1c Bold", sans-serif`
        }
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(ev.label, x + COL_W / 2, labelY + EVENT_LABEL_H / 2)
        castStartY = labelY + EVENT_LABEL_H + 8
      }

      // シフト名
      const list = shiftsByDate.get(dateToYmd(day)) || []
      let castY = castStartY
      const nameMaxW = COL_W - 12
      for (const s of list) {
        const name = s.cast_name
        const tStr = formatTime(adjustStartForDisplay(s.start_time))

        let fontSize = 22
        let fit = false
        while (!fit && fontSize >= 14) {
          ctx.font = `bold ${fontSize}px "Rounded Mplus 1c Bold", sans-serif`
          const nameW = ctx.measureText(name).width
          const timeW = ctx.measureText(' ' + tStr).width
          if (nameW + timeW <= nameMaxW) fit = true
          else fontSize -= 1
        }

        ctx.font = `bold ${fontSize}px "Rounded Mplus 1c Bold", sans-serif`
        const nameW = ctx.measureText(name).width
        const totalW = nameW + ctx.measureText(' ' + tStr).width
        const startX = x + (COL_W - totalW) / 2

        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'

        // 文字に薄いグローを乗せて背景の上でも読めるように
        ctx.save()
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
        ctx.shadowBlur = 4
        ctx.fillStyle = NAME_COLOR
        ctx.fillText(name, startX, castY)
        ctx.fillStyle = TIME_COLOR
        ctx.fillText(' ' + tStr, startX + nameW, castY)
        ctx.restore()

        castY += NAME_LINE_HEIGHT
      }
    }

    rowY += DATE_ROW_H + bodyH
  }

  return canvas.toBuffer('image/png')
}
