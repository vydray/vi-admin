/**
 * 出勤表カレンダー画像 — 共通の型定義。
 * 店舗ごとの見た目の違いは CalendarTheme に集約し、描画ロジック(render.ts)は共通。
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
  /** 帯の背景色。未指定ならテーマの eventDefault.bg を使う */
  bg?: string
  /** 帯の文字色。未指定ならテーマの eventDefault.text を使う */
  text?: string
}

export interface RenderCalendarParams {
  title: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  shifts: CalendarShift[]
  events: CalendarEvent[]
}

/** node-canvas に登録するフォント */
export interface ThemeFontFile {
  file: string // public/fonts 内のファイル名
  family: string
  weight?: 'normal' | 'bold'
}

/** 背景の描き方 */
export type ThemeBackground =
  | { type: 'image'; path: string; overlay?: string; fallback: string }
  | { type: 'color'; color: string }
  | { type: 'transparent' }

/** ドロップシャドウ(ネオングロー) */
export interface ThemeGlow {
  color: string
  blur: number
}

/**
 * 店舗ごとのカレンダー見た目。描画ロジックは共通で、ここだけ差し替える。
 */
export interface CalendarTheme {
  /** 登録するフォント群 */
  fontFiles: ThemeFontFile[]
  /** 各用途のフォントファミリ名 */
  fonts: {
    title: string // `bold 48px "<title>"`
    header: string // `bold 26px "<header>"`
    date: string // `24px "<date>"`（通常ウェイト）
    event: string // `bold Npx "<event>"`
    name: string // `bold Npx "<name>"`
  }
  background: ThemeBackground
  colors: {
    titleBg: string
    titleText: string
    headerBg: string
    headerText: string
    dateRowBg: string
    cellBg: string
    border: string
    dateColor: string
    dateSat: string // 土曜の日付/曜日色（ヘッダーと日付行で共用）
    dateSun: string // 日曜の日付/曜日色
    nameColor: string
    timeColor: string
    emptyBg: string
  }
  /** タイトル文字のグロー（無ければフラット） */
  titleGlow?: ThemeGlow
  /** キャスト名のグロー（無ければフラット） */
  nameGlow?: ThemeGlow
  /** イベント帯の色（管理イベントに色情報が無いため、ここで既定色を与える） */
  eventDefault: { bg: string; text: string }
}
