import path from 'path'
import fs from 'fs'
import { createCanvas, registerFont, loadImage } from 'canvas'
import type { CalendarEvent, CalendarShift, CalendarTheme, RenderCalendarParams } from './types'

/**
 * 出勤表カレンダー画像の共通描画エンジン。
 *
 * 元は scripts/generate-{marymare,mirage}-shift.js（CLI）。両者は構造が完全一致で、
 * 違いは色・フォント・背景・グローのみ。それらを CalendarTheme に切り出し、
 * 描画ロジックはこの一本に統合した。
 */

// ---------- フォント登録（ファミリ単位で一度だけ） ----------
const registeredFamilies = new Set<string>()
function ensureFonts(theme: CalendarTheme) {
  const fontsDir = path.join(process.cwd(), 'public', 'fonts')
  for (const f of theme.fontFiles) {
    if (registeredFamilies.has(f.family)) continue
    const p = path.join(fontsDir, f.file)
    if (!fs.existsSync(p)) continue
    if (f.weight) registerFont(p, { family: f.family, weight: f.weight })
    else registerFont(p, { family: f.family })
    registeredFamilies.add(f.family)
  }
}

// ---------- レイアウト（全テーマ共通） ----------
const DISPLAY_OPEN_TIME = '18:00'
const DAYS = ['月', '火', '水', '木', '金', '土', '日']
const JS_DAY_TO_COL = [6, 0, 1, 2, 3, 4, 5]
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
 * カレンダー画像を生成して PNG Buffer を返す。
 */
export async function renderCalendar(params: RenderCalendarParams, theme: CalendarTheme): Promise<Buffer> {
  ensureFonts(theme)
  const { title, startDate, endDate, shifts, events } = params
  const c = theme.colors

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

  // ---------- 背景 ----------
  const bg = theme.background
  if (bg.type === 'image') {
    const bgPath = path.join(process.cwd(), bg.path)
    if (fs.existsSync(bgPath)) {
      const img = await loadImage(bgPath)
      drawCover(ctx, img, CANVAS_W, CANVAS_H)
      if (bg.overlay) {
        ctx.fillStyle = bg.overlay
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      }
    } else {
      ctx.fillStyle = bg.fallback
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    }
  } else if (bg.type === 'color') {
    ctx.fillStyle = bg.color
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }
  // transparent: 何も塗らない

  // ---------- タイトル ----------
  ctx.fillStyle = c.titleBg
  ctx.fillRect(0, 0, CANVAS_W, TITLE_H)
  if (theme.titleGlow) {
    ctx.save()
    ctx.shadowColor = theme.titleGlow.color
    ctx.shadowBlur = theme.titleGlow.blur
  }
  ctx.fillStyle = c.titleText
  ctx.font = `bold 48px "${theme.fonts.title}", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, CANVAS_W / 2, TITLE_H / 2)
  if (theme.titleGlow) ctx.restore()

  // ---------- 曜日ヘッダー ----------
  ctx.fillStyle = c.headerBg
  ctx.fillRect(0, TITLE_H, CANVAS_W, HEADER_H)
  ctx.font = `bold 26px "${theme.fonts.header}", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < 7; i++) {
    if (i === 5) ctx.fillStyle = c.dateSat
    else if (i === 6) ctx.fillStyle = c.dateSun
    else ctx.fillStyle = c.headerText
    ctx.fillText(DAYS[i], i * COL_W + COL_W / 2, TITLE_H + HEADER_H / 2)
  }

  // ---------- 各週 ----------
  let rowY = TITLE_H + HEADER_H
  for (let w = 0; w < weeks.length; w++) {
    const week = weeks[w]
    const bodyH = weekHeights[w]

    // 日付行
    const dateRowY = rowY
    ctx.fillStyle = c.dateRowBg
    ctx.fillRect(0, dateRowY, CANVAS_W, DATE_ROW_H)
    for (let i = 0; i < 7; i++) {
      const x = i * COL_W
      const day = week[i]
      ctx.strokeStyle = c.border
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, dateRowY + 0.5, COL_W - 1, DATE_ROW_H - 1)
      if (!day) continue
      let dateColor = c.dateColor
      if (i === 5) dateColor = c.dateSat
      if (i === 6) dateColor = c.dateSun
      ctx.fillStyle = dateColor
      ctx.font = `24px "${theme.fonts.date}", sans-serif`
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
        ctx.fillStyle = c.emptyBg
        ctx.fillRect(x, cellY, COL_W, bodyH)
        ctx.strokeStyle = c.border
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, cellY + 0.5, COL_W - 1, bodyH - 1)
        continue
      }

      ctx.fillStyle = c.cellBg
      ctx.fillRect(x, cellY, COL_W, bodyH)
      ctx.strokeStyle = c.border
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, cellY + 0.5, COL_W - 1, bodyH - 1)

      // イベント帯
      const ev = getEventFor(dateToYmd(day))
      let castStartY = cellY + 10
      if (ev) {
        const labelY = cellY + 6
        ctx.fillStyle = ev.bg ?? theme.eventDefault.bg
        ctx.fillRect(x + 4, labelY, COL_W - 8, EVENT_LABEL_H)
        ctx.fillStyle = ev.text ?? theme.eventDefault.text
        const evMaxW = COL_W - 14
        let evFont = 22
        ctx.font = `bold ${evFont}px "${theme.fonts.event}", sans-serif`
        while (ctx.measureText(ev.label).width > evMaxW && evFont > 10) {
          evFont -= 1
          ctx.font = `bold ${evFont}px "${theme.fonts.event}", sans-serif`
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
          ctx.font = `bold ${fontSize}px "${theme.fonts.name}", sans-serif`
          const nameW = ctx.measureText(name).width
          const timeW = ctx.measureText(' ' + tStr).width
          if (nameW + timeW <= nameMaxW) fit = true
          else fontSize -= 1
        }

        ctx.font = `bold ${fontSize}px "${theme.fonts.name}", sans-serif`
        const nameW = ctx.measureText(name).width
        const totalW = nameW + ctx.measureText(' ' + tStr).width
        const startX = x + (COL_W - totalW) / 2

        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'

        if (theme.nameGlow) {
          ctx.save()
          ctx.shadowColor = theme.nameGlow.color
          ctx.shadowBlur = theme.nameGlow.blur
        }
        ctx.fillStyle = c.nameColor
        ctx.fillText(name, startX, castY)
        ctx.fillStyle = c.timeColor
        ctx.fillText(' ' + tStr, startX + nameW, castY)
        if (theme.nameGlow) ctx.restore()

        castY += NAME_LINE_HEIGHT
      }
    }

    rowY += DATE_ROW_H + bodyH
  }

  return canvas.toBuffer('image/png')
}
