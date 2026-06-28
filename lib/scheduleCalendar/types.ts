/**
 * 出勤表カレンダー画像 — 共通の型定義。
 * 店舗ごとの見た目の違いは CalendarTheme に集約し、描画ロジック(render.ts)は共通。
 */

export interface CalendarShift {
  date: string // YYYY-MM-DD
  cast_name: string
  start_time: string // HH:MM(:SS)
  end_time?: string | null // HH:MM(:SS)。memorable(カード型)は時刻範囲を出すので使う
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
  /** アップロード背景画像（全面cover）。指定時はテーマ既定の背景を上書きしフロスト表示にする */
  backgroundImage?: Buffer | null
  /** アップロード上部バナー写真。指定時は最上部に横帯で配置し、その分キャンバスが縦に伸びる */
  bannerImage?: Buffer | null
  /** アップロードロゴ画像（カード型/memorable）。上部中央にアスペクト維持で配置 */
  logoImage?: Buffer | null
  /** カード型: コンテンツ(タイトル＋カード)の上開始位置(px)。背景上部の飾りを避けるため下げる */
  contentTop?: number
  /** カード型: 住所等のテキスト(改行可) */
  address?: string
  /** カード型: 住所の配置（左上x・上y・幅w、いずれもキャンバス比率）。未指定は既定の右下 */
  addressPos?: { x: number; y: number; w: number }
  /** カード型: 立ち絵などのキャラ画像。保存位置(比率)で最前面に合成する */
  characters?: CalendarCharacter[]
  /** グリッド型: 月間イベント枠の配置（左上x・上y・幅w、キャンバス比率）。未指定は既定位置。
   * 表示期間の全日にまたがるイベント(月間扱い)をまとめて描く枠 */
  monthlyEventPos?: { x: number; y: number; w: number }
}

/** 立ち絵などのキャラ。位置・幅はキャンバスに対する比率(0-1)で持つ（月で高さが変わっても追従） */
export interface CalendarCharacter {
  image: Buffer
  x: number // 左位置（キャンバス幅比）
  y: number // 上位置（キャンバス高比）
  w: number // 幅（キャンバス幅比）。高さは画像アスペクトから算出
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

/** カレンダーの配色 */
export interface CalendarColors {
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
  colors: CalendarColors
  /** アップロード背景がある時に colors に上書き適用する半透明配色（フロスト表示用） */
  frostedColors?: Partial<CalendarColors>
  /** アップロード背景の上に重ねる可読性確保用オーバーレイ色（任意） */
  uploadedBgOverlay?: string
  /** タイトル文字のグロー（無ければフラット） */
  titleGlow?: ThemeGlow
  /** キャスト名のグロー（無ければフラット） */
  nameGlow?: ThemeGlow
  /** イベント帯の色（管理イベントに色情報が無いため、ここで既定色を与える） */
  eventDefault: { bg: string; text: string }
}
