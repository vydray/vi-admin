const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// ヒラギノ角ゴシック (macOS system) を登録
const hiraginoW3 = '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc';
const hiraginoW6 = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc';
const hiraginoW8 = '/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc';
if (fs.existsSync(hiraginoW3)) registerFont(hiraginoW3, { family: 'Hiragino' });
if (fs.existsSync(hiraginoW6)) registerFont(hiraginoW6, { family: 'HiraginoBold' });
if (fs.existsSync(hiraginoW8)) registerFont(hiraginoW8, { family: 'HiraginoBlack' });

const shifts = JSON.parse(fs.readFileSync('/tmp/mirage_may_second_shifts.json', 'utf8'));

// ========== イベント定義 ==========
// 日付範囲（YYYY-MM-DD）でラベルと色を指定
const EVENTS = [
  { start: '2026-05-15', end: '2026-05-17', label: 'ナースイベント', bg: '#bae6fd', text: '#0c4a6e' },
  { start: '2026-05-22', end: '2026-05-24', label: 'フリーコス',     bg: '#fde68a', text: '#7c2d12' },
  { start: '2026-05-29', end: '2026-05-31', label: 'ショットイベ',   bg: '#fbcfe8', text: '#831843' },
];

// ========== 設定 ==========
const TITLE = '5月後半キャスト出勤日';
const START_DATE = '2026-05-16';
const END_DATE = '2026-05-31';
const OUTPUT = 'shift-mirage-may-second.png';

const DAYS = ['月', '火', '水', '木', '金', '土', '日'];
// JS getDay(): 0=日, 1=月, 2=火, ... 6=土
const JS_DAY_TO_COL = [6, 0, 1, 2, 3, 4, 5]; // 日→col6, 月→col0, ..., 土→col5

// ========== カラー ==========
const BG_TRANSPARENT = true; // false にすると BG_COLOR で塗りつぶし
const BG_COLOR = '#ffffff';
const TITLE_BG = '#6e6e6e';     // タイトル: 濃いめグレー
const TITLE_TEXT = '#f5f5f5';
const HEADER_BG = '#9e9e9e';    // 曜日ヘッダー: 中間グレー
const HEADER_TEXT = '#fafafa';
const DATE_ROW_BG = '#bdbdbd';  // 日付行: 薄めグレー（曜日とは微妙に違う）
const CELL_BG = 'rgba(255, 255, 255, 0.92)';
const BORDER = '#bdbdbd';
const DATE_COLOR = '#3a3a3a';
const DATE_SAT = '#2563eb';
const DATE_SUN = '#dc2626';
const NAME_COLOR = '#2a2a2a';
const TIME_COLOR = '#7a7a7a';
const EMPTY_BG = 'rgba(0, 0, 0, 0)';

// ========== レイアウト ==========
const COL_W = 200;
const TITLE_H = 90;
const HEADER_H = 36;     // 曜日ヘッダー
const DATE_ROW_H = 34;   // 日付行（各週の頭に出る）
const ROW_MIN_H = 180;   // 日付行を除いたセル本体の最低高さ
const CELL_PADDING = 10;
const NAME_LINE_HEIGHT = 34;

// ========== ヘルパ ==========
function ymdToDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dateToYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(t) {
  const [hh, mm] = t.split(':').map(Number);
  if (mm === 0) return `${hh}-`;
  return `${hh}${String(mm).padStart(2, '0')}-`;
}

function buildWeeks(startStr, endStr) {
  const start = ymdToDate(startStr);
  const end = ymdToDate(endStr);
  const weeks = [];
  let current = null;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const col = JS_DAY_TO_COL[d.getDay()];
    if (col === 0 || current === null) {
      if (current) weeks.push(current);
      current = new Array(7).fill(null);
    }
    current[col] = new Date(d);
  }
  if (current) weeks.push(current);
  return weeks;
}

// ========== シフトを date キーでマップ化 ==========
const shiftsByDate = new Map();
for (const s of shifts) {
  if (!shiftsByDate.has(s.date)) shiftsByDate.set(s.date, []);
  shiftsByDate.get(s.date).push(s);
}
// 各日内で start_time 昇順にソート
for (const [, arr] of shiftsByDate) {
  arr.sort((a, b) => a.start_time.localeCompare(b.start_time));
}

const weeks = buildWeeks(START_DATE, END_DATE);

// 日付がイベントに含まれるか
function getEventFor(dateStr) {
  for (const e of EVENTS) {
    if (dateStr >= e.start && dateStr <= e.end) return e;
  }
  return null;
}

const EVENT_LABEL_H = 32;

// ========== 各週のセル本体高さ（日付行を除く）==========
function getWeekHeight(week) {
  let maxCount = 0;
  let hasEvent = false;
  for (const day of week) {
    if (!day) continue;
    const list = shiftsByDate.get(dateToYmd(day)) || [];
    if (list.length > maxCount) maxCount = list.length;
    if (getEventFor(dateToYmd(day))) hasEvent = true;
  }
  const base = 16 + (hasEvent ? EVENT_LABEL_H + 8 : 0) + maxCount * NAME_LINE_HEIGHT + 12;
  return Math.max(ROW_MIN_H, base);
}

const weekHeights = weeks.map(getWeekHeight);
// 各週 = 日付行(DATE_ROW_H) + 本体(weekHeights[i])
const totalRowH = weekHeights.reduce((s, h) => s + h + DATE_ROW_H, 0);

const CANVAS_W = COL_W * 7;
const CANVAS_H = TITLE_H + HEADER_H + totalRowH;

const canvas = createCanvas(CANVAS_W, CANVAS_H);
const ctx = canvas.getContext('2d');

// 背景
if (!BG_TRANSPARENT) {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

// タイトル
ctx.fillStyle = TITLE_BG;
ctx.fillRect(0, 0, CANVAS_W, TITLE_H);
ctx.fillStyle = TITLE_TEXT;
ctx.font = '48px "HiraginoBlack", sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(TITLE, CANVAS_W / 2, TITLE_H / 2);

// 曜日ヘッダー（土=青、日=赤）
ctx.fillStyle = HEADER_BG;
ctx.fillRect(0, TITLE_H, CANVAS_W, HEADER_H);
ctx.font = '18px "HiraginoBold", sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
for (let i = 0; i < 7; i++) {
  if (i === 5) ctx.fillStyle = '#93c5fd';      // 土：薄青
  else if (i === 6) ctx.fillStyle = '#fca5a5'; // 日：薄赤
  else ctx.fillStyle = HEADER_TEXT;
  ctx.fillText(DAYS[i], i * COL_W + COL_W / 2, TITLE_H + HEADER_H / 2);
}

// 各週
let rowY = TITLE_H + HEADER_H;
for (let w = 0; w < weeks.length; w++) {
  const week = weeks[w];
  const bodyH = weekHeights[w];

  // === 1) 日付行（曜日ヘッダーとは微妙に違うグレー）===
  const dateRowY = rowY;
  ctx.fillStyle = DATE_ROW_BG;
  ctx.fillRect(0, dateRowY, CANVAS_W, DATE_ROW_H);
  for (let i = 0; i < 7; i++) {
    const x = i * COL_W;
    const day = week[i];
    // 境界線
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, dateRowY + 0.5, COL_W - 1, DATE_ROW_H - 1);
    if (!day) continue;
    let dateColor = DATE_COLOR;
    if (i === 5) dateColor = DATE_SAT;
    if (i === 6) dateColor = DATE_SUN;
    ctx.fillStyle = dateColor;
    ctx.font = '20px "HiraginoBold", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(day.getDate()), x + COL_W / 2, dateRowY + DATE_ROW_H / 2);
  }

  // === 2) セル本体 ===
  const cellY = rowY + DATE_ROW_H;
  for (let i = 0; i < 7; i++) {
    const x = i * COL_W;
    const day = week[i];

    if (!day) {
      ctx.fillStyle = EMPTY_BG;
      ctx.fillRect(x, cellY, COL_W, bodyH);
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, cellY + 0.5, COL_W - 1, bodyH - 1);
      continue;
    }

    ctx.fillStyle = CELL_BG;
    ctx.fillRect(x, cellY, COL_W, bodyH);
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, cellY + 0.5, COL_W - 1, bodyH - 1);

    // イベントラベル（セル上部に色帯。幅ギリギリに自動フィット）
    const ev = getEventFor(dateToYmd(day));
    let castStartY = cellY + 10;
    if (ev) {
      const labelY = cellY + 6;
      ctx.fillStyle = ev.bg;
      ctx.fillRect(x + 4, labelY, COL_W - 8, EVENT_LABEL_H);
      ctx.fillStyle = ev.text;
      const evMaxW = COL_W - 14;
      let evFont = 22;
      ctx.font = `${evFont}px "HiraginoBold", sans-serif`;
      while (ctx.measureText(ev.label).width > evMaxW && evFont > 10) {
        evFont -= 1;
        ctx.font = `${evFont}px "HiraginoBold", sans-serif`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ev.label, x + COL_W / 2, labelY + EVENT_LABEL_H / 2);
      castStartY = labelY + EVENT_LABEL_H + 8;
    }

    // シフト名（中央寄せ・幅ギリギリに自動フィット）
    const list = shiftsByDate.get(dateToYmd(day)) || [];
    let castY = castStartY;
    const nameMaxW = COL_W - 12;
    for (const s of list) {
      const name = s.cast_name;
      const tStr = formatTime(s.start_time);

      // 22px から始めて、はみ出すなら 1px ずつ下げる（下限 14）
      let fontSize = 22;
      let fit = false;
      while (!fit && fontSize >= 14) {
        ctx.font = `${fontSize}px "Hiragino", sans-serif`;
        const nameW = ctx.measureText(name).width;
        const timeW = ctx.measureText(' ' + tStr).width;
        if (nameW + timeW <= nameMaxW) fit = true;
        else fontSize -= 1;
      }

      ctx.font = `${fontSize}px "Hiragino", sans-serif`;
      const nameW = ctx.measureText(name).width;
      const timeW = ctx.measureText(' ' + tStr).width;
      const totalW = nameW + timeW;
      const startX = x + (COL_W - totalW) / 2;

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      ctx.fillStyle = NAME_COLOR;
      ctx.fillText(name, startX, castY);

      ctx.fillStyle = TIME_COLOR;
      ctx.fillText(' ' + tStr, startX + nameW, castY);

      castY += NAME_LINE_HEIGHT;
    }
  }

  rowY += DATE_ROW_H + bodyH;
}

const buffer = canvas.toBuffer('image/png');
const outputPath = path.join(process.cwd(), OUTPUT);
fs.writeFileSync(outputPath, buffer);
console.log(`Generated: ${outputPath} (${CANVAS_W}x${CANVAS_H})`);
