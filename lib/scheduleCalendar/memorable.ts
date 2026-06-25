import path from 'path'
import fs from 'fs'
import { createCanvas, registerFont, loadImage } from 'canvas'
import type { CalendarShift, CalendarTheme, RenderCalendarParams } from './types'

/**
 * Memorable(store1) カード型シフト画像の描画。
 *
 * 元は scripts/generate-shift-image.js（CLI）。marymare/mirage の週グリッドとは別物で、
 * 各日が独立した角丸カード（薄ピンク枠・白地）。日付はカード内に `6/16 (火)` 形式、
 * 時刻は範囲＋小数式（`18.5-23`）。タイトル帯/曜日ヘッダー行は無い。
 *
 * Step1: 背景画像（任意）＋タイトル＋カードグリッドまで。
 * ロゴ・立ち絵・住所のドラッグ配置は Step2（別途）。
 */

let fontsRegistered = false
function ensureFonts(theme: CalendarTheme) {
  if (fontsRegistered) return
  const fontsDir = path.join(process.cwd(), 'public', 'fonts')
  for (const f of theme.fontFiles) {
    const p = path.join(fontsDir, f.file)
    if (!fs.existsSync(p)) continue
    if (f.weight) registerFont(p, { family: f.family, weight: f.weight })
    else registerFont(p, { family: f.family })
  }
  fontsRegistered = true
}

const DAYS = ['日', '月', '火', '水', '木', '金', '土']

// ---------- レイアウト（元スクリプト準拠） ----------
const INNER_W = 200
const BORDER = 2
const CARD_W = INNER_W + BORDER * 2 // 204
const CARD_GAP = 8
const CORNER_R = 8
const HEADER_H = 56
const CAST_LINE_H = 34
const CELL_PAD_TOP = 4
const CELL_PAD_BOTTOM = 8
const ROW_GAP = 30
const MARGIN = 24
const TITLE_AREA_H = 210 // 上部タイトル領域（ロゴはStep2）
const BOTTOM_MARGIN = 40

// ---------- ヘルパ ----------
function formatTime(t: string | null | undefined): string {
  if (!t) return ''
  const h = parseInt(t.split(':')[0])
  const m = parseInt(t.split(':')[1])
  if (h === 0 && m === 0) return '0'
  if (m === 30) return `${h}.5`
  if (m === 15) return `${h}.25`
  if (m === 45) return `${h}.75`
  if (m === 0) return `${h}`
  return `${h}:${String(m).padStart(2, '0')}`
}
function formatTimeRange(start: string, end: string | null | undefined): string {
  return `${formatTime(start)}-${formatTime(end)}`
}
function ymdToDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function getDates(startStr: string, endStr: string): string[] {
  const dates: string[] = []
  const start = ymdToDate(startStr)
  const end = ymdToDate(endStr)
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${day}`)
  }
  return dates
}
function roundRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
function drawCover(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  img: Awaited<ReturnType<typeof loadImage>>,
  w: number, h: number,
) {
  const ir = img.width / img.height
  const cr = w / h
  let dw: number, dh: number, dx: number, dy: number
  if (ir > cr) { dh = h; dw = h * ir; dx = (w - dw) / 2; dy = 0 }
  else { dw = w; dh = w / ir; dx = 0; dy = (h - dh) / 2 }
  ctx.drawImage(img, dx, dy, dw, dh)
}

export async function renderMemorableCalendar(
  params: RenderCalendarParams,
  theme: CalendarTheme,
): Promise<Buffer> {
  ensureFonts(theme)
  const { title, startDate, endDate, shifts, backgroundImage } = params
  const c = theme.colors

  // シフトを date キーでマップ化＋display_order昇順ソート
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

  const dates = getDates(startDate, endDate)
  const startDow = ymdToDate(dates[0]).getDay()
  const numRows = Math.ceil((startDow + dates.length) / 7)

  // 各行の最大キャスト数（最低3）
  const maxCastsPerRow: number[] = []
  for (let row = 0; row < numRows; row++) {
    let maxInRow = 0
    for (let col = 0; col < 7; col++) {
      const idx = row * 7 + col - startDow
      if (idx >= 0 && idx < dates.length) {
        maxInRow = Math.max(maxInRow, (shiftsByDate.get(dates[idx]) || []).length)
      }
    }
    maxCastsPerRow.push(Math.max(maxInRow, 3))
  }
  const rowCellHeights = maxCastsPerRow.map((n) => HEADER_H + CELL_PAD_TOP + n * CAST_LINE_H + CELL_PAD_BOTTOM)

  const CANVAS_W = MARGIN * 2 + 7 * CARD_W + 6 * CARD_GAP
  let gridH = 0
  for (let row = 0; row < numRows; row++) {
    gridH += rowCellHeights[row] + BORDER * 2
    if (row < numRows - 1) gridH += ROW_GAP
  }
  const CANVAS_H = TITLE_AREA_H + gridH + BOTTOM_MARGIN

  const canvas = createCanvas(CANVAS_W, CANVAS_H)
  const ctx = canvas.getContext('2d')

  // ---------- 背景 ----------
  let bgImg: Awaited<ReturnType<typeof loadImage>> | null = null
  if (backgroundImage) {
    try {
      bgImg = await loadImage(backgroundImage)
    } catch (e) {
      console.error('[renderMemorable] 背景画像のデコード失敗、背景なしで継続:', e)
      bgImg = null
    }
  }
  if (bgImg) {
    drawCover(ctx, bgImg, CANVAS_W, CANVAS_H)
  } else {
    ctx.fillStyle = theme.background.type === 'color' ? theme.background.color : '#fdeef4'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
  }

  // ---------- タイトル（ピンク文字＋白縁取り） ----------
  ctx.font = `bold 84px "${theme.fonts.title}", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const titleX = CANVAS_W / 2
  const titleY = TITLE_AREA_H / 2 + 20
  ctx.lineJoin = 'round'
  ctx.lineWidth = 14
  ctx.strokeStyle = '#ffffff'
  ctx.strokeText(title, titleX, titleY)
  ctx.fillStyle = c.titleText
  ctx.fillText(title, titleX, titleY)

  // ---------- カードグリッド ----------
  let y = TITLE_AREA_H
  for (let row = 0; row < numRows; row++) {
    const cellH = rowCellHeights[row]
    const cardH = cellH + BORDER * 2

    for (let col = 0; col < 7; col++) {
      const idx = row * 7 + col - startDow
      if (idx < 0 || idx >= dates.length) continue

      const dateStr = dates[idx]
      const d = ymdToDate(dateStr)
      const dow = d.getDay()
      const dayShifts = shiftsByDate.get(dateStr) || []

      const cardX = MARGIN + col * (CARD_W + CARD_GAP)
      const cardY = y

      // 薄ピンク枠（角丸）
      roundRect(ctx, cardX, cardY, CARD_W, cardH, CORNER_R)
      ctx.fillStyle = c.border
      ctx.fill()

      // 白い中身
      roundRect(ctx, cardX + BORDER, cardY + BORDER, INNER_W, cellH, CORNER_R - BORDER)
      ctx.fillStyle = c.cellBg
      ctx.fill()

      // 日付ヘッダー（M/D (曜)）
      const headerColor = dow === 0 ? c.dateSun : dow === 6 ? c.dateSat : c.dateColor
      const dayLabel = `${d.getMonth() + 1}/${d.getDate()} (${DAYS[dow]})`
      ctx.font = `bold 34px "${theme.fonts.title}", sans-serif`
      ctx.fillStyle = headerColor
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      const hw = ctx.measureText(dayLabel).width
      ctx.fillText(dayLabel, cardX + BORDER + (INNER_W - hw) / 2, cardY + BORDER + 40)

      // キャスト名＋時刻範囲
      let castY = cardY + BORDER + HEADER_H + CELL_PAD_TOP
      for (const s of dayShifts) {
        const name = s.cast_name
        const timeStr = formatTimeRange(s.start_time, s.end_time)

        ctx.font = `bold 22px "${theme.fonts.name}", sans-serif`
        const nameW = ctx.measureText(name).width
        ctx.font = `18px "${theme.fonts.date}", sans-serif`
        const timeW = ctx.measureText(timeStr).width
        const totalW = nameW + timeW
        const startX = cardX + BORDER + (INNER_W - totalW) / 2

        ctx.font = `bold 22px "${theme.fonts.name}", sans-serif`
        ctx.fillStyle = c.nameColor
        ctx.fillText(name, startX, castY + 24)

        ctx.font = `18px "${theme.fonts.date}", sans-serif`
        ctx.fillStyle = c.timeColor
        ctx.fillText(timeStr, startX + nameW, castY + 24)

        castY += CAST_LINE_H
      }
    }

    y += cardH + ROW_GAP
  }

  return canvas.toBuffer('image/png')
}
