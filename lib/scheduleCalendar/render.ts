import path from 'path'
import fs from 'fs'
import { createCanvas, registerFont, loadImage } from 'canvas'
import type { CalendarColors, CalendarEvent, CalendarShift, CalendarTheme, RenderCalendarParams } from './types'

/**
 * 出勤表カレンダー画像の共通描画エンジン。
 *
 * 元は scripts/generate-{marymare,mirage}-shift.js（CLI）。両者は構造が完全一致で、
 * 違いは色・フォント・背景・グローのみ。それらを CalendarTheme に切り出し、
 * 描画ロジックはこの一本に統合した。
 *
 * アップロード背景(backgroundImage)・上部バナー写真(bannerImage)を渡すと、
 * 背景に画像を敷き、最上部に横帯で写真を載せ、テーマの frostedColors で半透明表示にする。
 * いずれも未指定なら従来どおりの描画（バイト単位で同一）。
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
const BANNER_MAX_RATIO = 0.6 // バナー高さは横幅の最大60%まで

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
// 背景画像を canvas に cover フィット（アスペクト維持・はみ出しクロップ）。全面用。
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
// 指定矩形に cover フィット（バナー帯用。矩形外をクリップ）
function drawCoverRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  img: Awaited<ReturnType<typeof loadImage>>,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const ir = img.width / img.height
  const cr = w / h
  let dw: number, dh: number, dx: number, dy: number
  if (ir > cr) {
    dh = h
    dw = h * ir
    dx = x + (w - dw) / 2
    dy = y
  } else {
    dw = w
    dh = w / ir
    dx = x
    dy = y + (h - dh) / 2
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(img, dx, dy, dw, dh)
  ctx.restore()
}

/**
 * カレンダー画像を生成して PNG Buffer を返す。
 */
export async function renderCalendar(params: RenderCalendarParams, theme: CalendarTheme): Promise<Buffer> {
  ensureFonts(theme)
  const { title, startDate, endDate, shifts, events, backgroundImage, bannerImage, monthlyEventPos } = params

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

  // 表示期間の全日にまたがるイベントは「月間」として別枠にまとめる（毎日のセルには出さない）
  const isMonthlyEvent = (e: CalendarEvent) => e.start <= startDate && e.end >= endDate
  const monthlyEvents = events.filter(isMonthlyEvent)
  const dayEvents = events.filter((e) => !isMonthlyEvent(e))

  const getEventsFor = (dateStr: string): CalendarEvent[] =>
    dayEvents.filter((e) => dateStr >= e.start && dateStr <= e.end)

  const weeks = buildWeeks(startDate, endDate)

  const getWeekHeight = (week: (Date | null)[]): number => {
    let maxCount = 0
    let maxEvents = 0
    for (const day of week) {
      if (!day) continue
      const list = shiftsByDate.get(dateToYmd(day)) || []
      if (list.length > maxCount) maxCount = list.length
      const evs = getEventsFor(dateToYmd(day)).length
      if (evs > maxEvents) maxEvents = evs
    }
    const base = 16 + (maxEvents > 0 ? maxEvents * (EVENT_LABEL_H + 4) + 8 : 0) + maxCount * NAME_LINE_HEIGHT + 12
    return Math.max(ROW_MIN_H, base)
  }

  const weekHeights = weeks.map(getWeekHeight)
  const totalRowH = weekHeights.reduce((s, h) => s + h + DATE_ROW_H, 0)
  const CANVAS_W = COL_W * 7

  // アップロード画像を先に読み込む。壊れていたら無視して通常描画にフォールバックする
  // （shifts/eventsが正しいのに画像1枚で生成全体が落ちるのを防ぐ）。
  let bgImg: Awaited<ReturnType<typeof loadImage>> | null = null
  if (backgroundImage) {
    try {
      bgImg = await loadImage(backgroundImage)
    } catch (e) {
      console.error('[renderCalendar] 背景画像のデコード失敗、背景なしで継続:', e)
      bgImg = null
    }
  }

  // 上部バナー写真（cropされたアスペクトのまま横幅いっぱいに敷く。高さは比率から算出）
  let bannerImg: Awaited<ReturnType<typeof loadImage>> | null = null
  let bannerH = 0
  if (bannerImage) {
    try {
      bannerImg = await loadImage(bannerImage)
      bannerH = Math.min(
        Math.round(CANVAS_W * (bannerImg.height / bannerImg.width)),
        Math.round(CANVAS_W * BANNER_MAX_RATIO),
      )
    } catch (e) {
      console.error('[renderCalendar] バナー画像のデコード失敗、バナーなしで継続:', e)
      bannerImg = null
      bannerH = 0
    }
  }
  const top = bannerH

  // 背景が実際に使える時だけフロスト配色に切替（デコード失敗時は通常配色のまま）
  const c: CalendarColors = bgImg && theme.frostedColors
    ? { ...theme.colors, ...theme.frostedColors }
    : theme.colors

  const CANVAS_H = bannerH + TITLE_H + HEADER_H + totalRowH

  const canvas = createCanvas(CANVAS_W, CANVAS_H)
  const ctx = canvas.getContext('2d')

  // ---------- 背景 ----------
  if (bgImg) {
    drawCover(ctx, bgImg, CANVAS_W, CANVAS_H)
    if (theme.uploadedBgOverlay) {
      ctx.fillStyle = theme.uploadedBgOverlay
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    }
  } else {
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
  }

  // ---------- 上部バナー写真 ----------
  if (bannerImg) {
    drawCoverRect(ctx, bannerImg, 0, 0, CANVAS_W, bannerH)
  }

  // ---------- タイトル ----------
  ctx.fillStyle = c.titleBg
  ctx.fillRect(0, top, CANVAS_W, TITLE_H)
  if (theme.titleGlow) {
    ctx.save()
    ctx.shadowColor = theme.titleGlow.color
    ctx.shadowBlur = theme.titleGlow.blur
  }
  ctx.fillStyle = c.titleText
  ctx.font = `bold 48px "${theme.fonts.title}", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(title, CANVAS_W / 2, top + TITLE_H / 2)
  if (theme.titleGlow) ctx.restore()

  // ---------- 曜日ヘッダー ----------
  ctx.fillStyle = c.headerBg
  ctx.fillRect(0, top + TITLE_H, CANVAS_W, HEADER_H)
  ctx.font = `bold 26px "${theme.fonts.header}", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < 7; i++) {
    if (i === 5) ctx.fillStyle = c.dateSat
    else if (i === 6) ctx.fillStyle = c.dateSun
    else ctx.fillStyle = c.headerText
    ctx.fillText(DAYS[i], i * COL_W + COL_W / 2, top + TITLE_H + HEADER_H / 2)
  }

  // ---------- 各週 ----------
  let rowY = top + TITLE_H + HEADER_H
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

      // イベント帯（同日に複数あれば縦に積む）
      const evs = getEventsFor(dateToYmd(day))
      let castStartY = cellY + 10
      if (evs.length > 0) {
        let labelY = cellY + 6
        for (const ev of evs) {
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
          labelY += EVENT_LABEL_H + 4
        }
        castStartY = labelY + 4
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

  // ---------- 月間イベント枠（表示期間の全日にまたがるイベントをまとめて配置） ----------
  if (monthlyEvents.length > 0) {
    const box = theme.monthlyBox ?? {
      panel: 'rgba(255,255,255,0.95)',
      border: 'rgba(139,92,246,0.5)',
      headerText: '#5b21b6',
      bodyText: '#3f3a52',
      accent: '#8b5cf6',
      shadow: 'rgba(91,33,182,0.18)',
    }
    const mw = (monthlyEventPos?.w ?? 0.26) * CANVAS_W
    const mx = (monthlyEventPos?.x ?? 0.03) * CANVAS_W
    const my = (monthlyEventPos?.y ?? 0.5) * CANVAS_H
    const pad = Math.round(mw * 0.065)
    const titleSize = Math.max(15, Math.round(mw * 0.082))
    const lineSize = Math.max(12, Math.round(mw * 0.06))
    const headerH = titleSize + Math.round(pad * 1.1)
    const lineH = lineSize + Math.round(pad * 0.7)
    const mh = headerH + Math.round(pad * 0.6) + monthlyEvents.length * lineH + pad
    const r = Math.min(14, mw * 0.045)

    const roundRectPath = (rx: number, ry: number, rw: number, rh: number, rad: number) => {
      ctx.beginPath()
      ctx.moveTo(rx + rad, ry)
      ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rad)
      ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rad)
      ctx.arcTo(rx, ry + rh, rx, ry, rad)
      ctx.arcTo(rx, ry, rx + rw, ry, rad)
      ctx.closePath()
    }
    // 上だけ角丸（見出しバー用）
    const roundTopPath = (rx: number, ry: number, rw: number, rh: number, rad: number) => {
      ctx.beginPath()
      ctx.moveTo(rx, ry + rh)
      ctx.lineTo(rx, ry + rad)
      ctx.arcTo(rx, ry, rx + rad, ry, rad)
      ctx.lineTo(rx + rw - rad, ry)
      ctx.arcTo(rx + rw, ry, rx + rw, ry + rad, rad)
      ctx.lineTo(rx + rw, ry + rh)
      ctx.closePath()
    }
    const fillDiamond = (cx: number, cy: number, rr: number) => {
      ctx.beginPath()
      ctx.moveTo(cx, cy - rr)
      ctx.lineTo(cx + rr, cy)
      ctx.lineTo(cx, cy + rr)
      ctx.lineTo(cx - rr, cy)
      ctx.closePath()
      ctx.fill()
    }

    // パネル（影＋フロスト）
    ctx.save()
    ctx.shadowColor = box.shadow
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 5
    roundRectPath(mx, my, mw, mh, r)
    ctx.fillStyle = box.panel
    ctx.fill()
    ctx.restore()

    // 見出しバー（本体タイトル「◯月◯半キャスト出勤日」と同じ配色＋明朝太字）
    roundTopPath(mx, my, mw, headerH, r)
    ctx.fillStyle = c.titleBg
    ctx.fill()
    ctx.fillStyle = c.titleText
    ctx.font = `${titleSize}px "${theme.fonts.title}", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('月間イベント', mx + mw / 2, my + Math.round(headerH / 2) + 1)

    // 枠線（パネル全体）
    roundRectPath(mx, my, mw, mh, r)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = box.border
    ctx.stroke()

    // イベント名（ダイヤbullet ＋ 名前）
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    let ly = my + headerH + Math.round(pad * 0.6)
    const textX = mx + pad + 16
    const maxW = mx + mw - pad - textX
    for (const ev of monthlyEvents) {
      const midY = ly + Math.round(lineH / 2)
      ctx.fillStyle = box.accent
      fillDiamond(mx + pad + 5, midY, 4)
      ctx.fillStyle = box.bodyText
      let fs = lineSize
      ctx.font = `${fs}px "${theme.fonts.event}", sans-serif`
      while (ctx.measureText(ev.label).width > maxW && fs > 9) {
        fs -= 1
        ctx.font = `${fs}px "${theme.fonts.event}", sans-serif`
      }
      ctx.fillText(ev.label, textX, midY)
      ly += lineH
    }
  }

  return canvas.toBuffer('image/png')
}
