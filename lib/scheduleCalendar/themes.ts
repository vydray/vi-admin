import type { CalendarTheme } from './types'

/**
 * MaryMare(store7) — ダークゴシック大聖堂 × ネオンピンク × 夢かわ。
 * 背景に大聖堂画像＋暗幕、M PLUS Rounded、タイトル/名前にネオングロー。
 * （元: scripts/generate-marymare-shift.js）
 */
export const marymareTheme: CalendarTheme = {
  fontFiles: [
    { file: 'MPLUSRounded1c-Regular.ttf', family: 'Rounded Mplus 1c' },
    { file: 'MPLUSRounded1c-Bold.ttf', family: 'Rounded Mplus 1c Bold' },
  ],
  fonts: {
    title: 'Rounded Mplus 1c Bold',
    header: 'Rounded Mplus 1c Bold',
    date: 'Rounded Mplus 1c',
    event: 'Rounded Mplus 1c Bold',
    name: 'Rounded Mplus 1c Bold',
  },
  background: {
    type: 'image',
    path: 'public/schedule-bg/marymare.jpg',
    overlay: 'rgba(20, 9, 16, 0.42)',
    fallback: '#180b16',
  },
  colors: {
    titleBg: 'rgba(20, 9, 16, 0.70)',
    titleText: '#ff8ec6',
    headerBg: 'rgba(70, 22, 60, 0.66)',
    headerText: '#ffd9ee',
    dateRowBg: 'rgba(42, 15, 34, 0.68)',
    cellBg: 'rgba(30, 14, 26, 0.60)',
    border: 'rgba(255, 111, 181, 0.45)',
    dateColor: '#ffe7f3',
    dateSat: '#9ec5ff',
    dateSun: '#ff6fb5',
    nameColor: '#ffffff',
    timeColor: '#ffbfe0',
    emptyBg: 'rgba(0, 0, 0, 0)',
  },
  titleGlow: { color: 'rgba(255, 111, 181, 0.95)', blur: 26 },
  nameGlow: { color: 'rgba(0, 0, 0, 0.55)', blur: 4 },
  eventDefault: { bg: 'rgba(255, 79, 162, 0.92)', text: '#ffffff' },
}

/**
 * MistressMirage(store2) — 白基調・明朝(Shippori Mincho)・グレートーン・フラット。
 * 背景透明、イベント帯はラベンダー。
 * （元: scripts/generate-mirage-shift.js）
 */
export const mirageTheme: CalendarTheme = {
  fontFiles: [
    { file: 'ShipporiMincho-Regular.ttf', family: 'Hiragino' },
    { file: 'ShipporiMincho-Bold.ttf', family: 'HiraginoBold', weight: 'bold' },
    { file: 'ShipporiMincho-ExtraBold.ttf', family: 'HiraginoBlack', weight: 'bold' },
  ],
  fonts: {
    title: 'HiraginoBlack',
    header: 'HiraginoBold',
    date: 'Hiragino',
    event: 'HiraginoBlack',
    name: 'HiraginoBold',
  },
  background: { type: 'transparent' },
  colors: {
    titleBg: '#7a7a7a',
    titleText: '#f5f5f5',
    headerBg: '#c8c8c8',
    headerText: '#555555',
    dateRowBg: '#dcdcdc',
    cellBg: 'rgba(255, 255, 255, 0.92)',
    border: '#bdbdbd',
    dateColor: '#3a3a3a',
    dateSat: '#2563eb',
    dateSun: '#dc2626',
    nameColor: '#2a2a2a',
    timeColor: '#7a7a7a',
    emptyBg: 'rgba(0, 0, 0, 0)',
  },
  // アップロード背景がある時はこの半透明配色に切替（すりガラスのカレンダーが背景に浮く）。
  // 帯類を半透明にして背景を覗かせ、空セルは透明で背景をそのまま見せる。
  frostedColors: {
    titleBg: 'rgba(122, 122, 122, 0.74)',
    headerBg: 'rgba(200, 200, 200, 0.60)',
    dateRowBg: 'rgba(220, 220, 220, 0.60)',
    cellBg: 'rgba(255, 255, 255, 0.86)',
    border: 'rgba(140, 140, 140, 0.50)',
  },
  // titleGlow / nameGlow なし（フラット）
  eventDefault: { bg: '#ddd6fe', text: '#5b21b6' },
}

/** 店舗ID → カレンダーデザイン。実装済みの店舗のみ。順次追加。 */
export const STORE_CALENDARS: Record<number, { name: string; theme: CalendarTheme }> = {
  7: { name: 'MaryMare', theme: marymareTheme },
  2: { name: 'MistressMirage', theme: mirageTheme },
}
