const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

const fontsDir = path.join(process.cwd(), 'public', 'fonts');
if (fs.existsSync(path.join(fontsDir, 'MPLUSRounded1c-Regular.ttf'))) {
  registerFont(path.join(fontsDir, 'MPLUSRounded1c-Regular.ttf'), { family: 'Rounded Mplus 1c' });
}
if (fs.existsSync(path.join(fontsDir, 'MPLUSRounded1c-Bold.ttf'))) {
  registerFont(path.join(fontsDir, 'MPLUSRounded1c-Bold.ttf'), { family: 'Rounded Mplus 1c Bold' });
}

const shifts = JSON.parse(fs.readFileSync('/tmp/april_shifts.json', 'utf8'));
const castsData = JSON.parse(fs.readFileSync('/tmp/casts.json', 'utf8'));

const castMap = new Map();
castsData.forEach(c => castMap.set(c.id, c.name));
const castOrderMap = new Map();
castsData.forEach(c => castOrderMap.set(c.id, c.display_order ?? 9999));

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatTime(t) {
  if (!t) return '';
  const h = parseInt(t.split(':')[0]);
  const m = parseInt(t.split(':')[1]);
  if (h === 0 && m === 0) return '0';
  if (m === 30) return `${h}.5`;
  if (m === 15) return `${h}.25`;
  if (m === 45) return `${h}.75`;
  if (m === 0) return `${h}`;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function formatTimeRange(start, end) {
  return `${formatTime(start)}-${formatTime(end)}`;
}

function groupByDate(shifts) {
  const map = new Map();
  for (const s of shifts) {
    if (!map.has(s.date)) map.set(s.date, []);
    map.get(s.date).push(s);
  }
  for (const [, arr] of map) {
    arr.sort((a, b) => (castOrderMap.get(a.cast_id) || 9999) - (castOrderMap.get(b.cast_id) || 9999));
  }
  return map;
}

function getDates(startStr, endStr) {
  const dates = [];
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 角丸の矩形を描く
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// 実測カラー
const HEADER_PINK = '#E75480';
const HEADER_RED = '#E74C3C';
const HEADER_BLUE = '#3498DB';
const NAME_COLOR = '#333333';
const TIME_COLOR = '#888888';
const BORDER_COLOR = '#F0D0DC';  // rgb(240,208,220) 薄いピンク枠
const WHITE = '#FFFFFF';

function generateImage(dates, outputPath) {
  const shiftsByDate = groupByDate(shifts);

  const firstDate = parseDate(dates[0]);
  const startDow = firstDate.getDay();

  const totalSlots = startDow + dates.length;
  const numRows = Math.ceil(totalSlots / 7);
  const numCols = 7;

  let maxCastsPerRow = [];
  for (let row = 0; row < numRows; row++) {
    let maxInRow = 0;
    for (let col = 0; col < numCols; col++) {
      const idx = row * 7 + col - startDow;
      if (idx >= 0 && idx < dates.length) {
        const dayShifts = shiftsByDate.get(dates[idx]) || [];
        maxInRow = Math.max(maxInRow, dayShifts.length);
      }
    }
    maxCastsPerRow.push(Math.max(maxInRow, 3));
  }

  // 実測値: セル内白=654, 枠=3, セル間透過=30
  // カード全体幅 = 3(枠) + 654(白) + 3(枠) = 660
  // カード間隔 = 30 (透過)
  const innerWidth = 200;
  const border = 2;
  const cardWidth = innerWidth + border * 2;
  const cardGap = 8;
  const cornerRadius = 8;
  const headerHeight = 56;
  const castLineHeight = 34;
  const cellPadTop = 4;
  const cellPadBottom = 8;
  const rowGap = 30;
  const margin = 24;

  const rowCellHeights = maxCastsPerRow.map(n => headerHeight + cellPadTop + n * castLineHeight + cellPadBottom);

  const canvasWidth = margin * 2 + numCols * cardWidth + (numCols - 1) * cardGap;
  let totalH = margin * 2;
  for (let row = 0; row < numRows; row++) {
    totalH += rowCellHeights[row] + border * 2;
    if (row < numRows - 1) totalH += rowGap;
  }

  const canvas = createCanvas(canvasWidth, totalH);
  const ctx = canvas.getContext('2d');

  // 背景透過（何も塗らない）

  let y = margin;

  for (let row = 0; row < numRows; row++) {
    const cellH = rowCellHeights[row];
    const cardH = cellH + border * 2;

    for (let col = 0; col < numCols; col++) {
      const idx = row * 7 + col - startDow;
      if (idx < 0 || idx >= dates.length) continue;

      const dateStr = dates[idx];
      const d = parseDate(dateStr);
      const dow = d.getDay();
      const dayShifts = shiftsByDate.get(dateStr) || [];

      const cardX = margin + col * (cardWidth + cardGap);
      const cardY = y;

      // 薄いピンクの枠（角丸）
      roundRect(ctx, cardX, cardY, cardWidth, cardH, cornerRadius);
      ctx.fillStyle = BORDER_COLOR;
      ctx.fill();

      // 白い中身（角丸、枠の内側）
      roundRect(ctx, cardX + border, cardY + border, innerWidth, cellH, cornerRadius - border);
      ctx.fillStyle = WHITE;
      ctx.fill();

      // 日付ヘッダー
      const headerColor = dow === 0 ? HEADER_RED : dow === 6 ? HEADER_BLUE : HEADER_PINK;
      const dayLabel = `${d.getMonth() + 1}/${d.getDate()} (${DAYS[dow]})`;
      ctx.font = 'bold 34px "Rounded Mplus 1c Bold", sans-serif';
      ctx.fillStyle = headerColor;
      const hw = ctx.measureText(dayLabel).width;
      ctx.fillText(dayLabel, cardX + border + (innerWidth - hw) / 2, cardY + border + 40);

      // キャスト名+時間
      let castY = cardY + border + headerHeight + cellPadTop;
      for (let i = 0; i < dayShifts.length; i++) {
        const s = dayShifts[i];
        const name = castMap.get(s.cast_id) || '?';
        const timeStr = formatTimeRange(s.start_time, s.end_time);

        ctx.font = 'bold 22px "Rounded Mplus 1c Bold", sans-serif';
        const nameW = ctx.measureText(name).width;
        ctx.font = '18px "Rounded Mplus 1c", sans-serif';
        const timeW = ctx.measureText(timeStr).width;
        const totalW = nameW + timeW;
        const startX = cardX + border + (innerWidth - totalW) / 2;

        // 名前（ほぼ黒）
        ctx.font = 'bold 22px "Rounded Mplus 1c Bold", sans-serif';
        ctx.fillStyle = NAME_COLOR;
        ctx.fillText(name, startX, castY + 24);

        // 時間（グレー）
        ctx.font = '18px "Rounded Mplus 1c", sans-serif';
        ctx.fillStyle = TIME_COLOR;
        ctx.fillText(timeStr, startX + nameW, castY + 24);

        castY += castLineHeight;
      }
    }

    y += cardH + rowGap;
  }

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Generated: ${outputPath} (${canvasWidth}x${totalH})`);
}

const dates = getDates('2026-05-01', '2026-05-15');
generateImage(dates, path.join(process.cwd(), 'shift-memorable-may-first.png'));
console.log('Done!');
