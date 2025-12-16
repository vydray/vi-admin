// Core database table types

// ============================================================================
// Cast (キャスト)
// ============================================================================
export interface Cast {
  id: number
  line_number: string | null
  name: string
  twitter: string | null
  password: string | null
  instagram: string | null
  password2: string | null
  attendance_certificate: boolean | null
  residence_record: boolean | null
  contract_documents: boolean | null
  submission_contract: string | null
  employee_name: string | null
  attributes: string | null
  status: string | null
  sales_previous_day: string | null
  experience_date: string | null
  hire_date: string | null
  resignation_date: string | null
  created_at: string
  updated_at: string
  store_id: number
  show_in_pos: boolean
  birthday: string | null
  line_user_id: string | null
  is_admin: boolean
  is_manager: boolean
  line_msg_user_id: string | null
  line_msg_state: string | null
  line_msg_registered_at: string | null
  is_active: boolean
  display_order?: number | null
  primary_cast_id?: number | null  // 同一人物のメインcast_id（NULLなら自分がメイン）
}

// Simplified Cast type for listings (id and name only)
export interface CastBasic {
  id: number
  name: string
}

// Optimized Cast type for list view (only fields actually displayed/used in UI)
export interface CastListView {
  id: number
  name: string
  employee_name: string | null
  birthday: string | null
  status: string | null
  attributes: string | null
  experience_date: string | null
  hire_date: string | null
  resignation_date: string | null
  residence_record: boolean | null
  attendance_certificate: boolean | null
  contract_documents: boolean | null
  twitter: string | null
  password: string | null
  instagram: string | null
  password2: string | null
  show_in_pos: boolean
  is_active: boolean
  is_admin: boolean
  is_manager: boolean
  display_order?: number | null
  primary_cast_id?: number | null
}

// Cast type for POS operations
export interface CastPOS {
  id: number
  name: string
  is_active: boolean
  show_in_pos: boolean
  store_id: number
}

// ============================================================================
// Orders & Payments
// ============================================================================
export interface OrderItem {
  id: number
  order_id: number
  product_name: string
  category: string | null
  cast_name: string[] | string | null  // POS側で配列化対応
  quantity: number
  unit_price: number
  subtotal: number
}

export interface Payment {
  id: number
  order_id: number
  cash_amount: number
  credit_card_amount: number
  other_payment_amount: number
  change_amount: number
}

export interface Receipt {
  id: number
  store_id: number
  table_number: string
  guest_name: string | null
  staff_name: string[] | string | null  // POS側で配列化対応
  subtotal_excl_tax: number
  tax_amount: number
  service_charge: number
  rounding_adjustment: number
  total_incl_tax: number
  order_date: string
  checkout_datetime: string
  deleted_at: string | null
}

export interface ReceiptWithDetails extends Receipt {
  order_items?: OrderItem[]
  payment?: Payment
  payment_methods?: string
}

// ============================================================================
// Products & Categories
// ============================================================================
export interface Product {
  id: number
  name: string
  price: number
  category_id: number
  store_id: number
  display_order?: number
  is_active?: boolean
  needs_cast?: boolean
  tax_rate?: number
  discount_rate?: number
  created_at?: string
}

export interface Category {
  id: number
  name: string
  store_id: number
  display_order?: number
  show_oshi_first?: boolean
  created_at?: string
}

// ============================================================================
// Attendance (勤怠)
// ============================================================================
export interface Attendance {
  id: string
  cast_name: string
  date: string
  check_in_datetime: string | null
  check_out_datetime: string | null
  store_id: number
  status?: string           // 後方互換用（status_idを優先）
  status_id?: string        // 出勤ステータスID（attendance_statuses参照）
  late_minutes?: number
  break_minutes?: number
  daily_payment?: number
  costume_id?: number       // 衣装ID
  is_modified?: boolean     // 締め時刻後に修正されたか
  last_modified_at?: string // 最終修正日時
}

// 勤怠修正履歴
export interface AttendanceHistory {
  id: number
  attendance_id: number
  store_id: number
  // 修正前の値
  previous_status_id: string | null
  previous_check_in_datetime: string | null
  previous_check_out_datetime: string | null
  previous_late_minutes: number | null
  previous_break_minutes: number | null
  previous_daily_payment: number | null
  previous_costume_id: number | null
  // 修正後の値
  new_status_id: string | null
  new_check_in_datetime: string | null
  new_check_out_datetime: string | null
  new_late_minutes: number | null
  new_break_minutes: number | null
  new_daily_payment: number | null
  new_costume_id: number | null
  // 修正情報
  modified_at: string
  modified_source: 'pos' | 'admin'
  modified_by: string | null
  reason: string | null
  created_at: string
}

export interface AttendanceStatus {
  id: string
  name: string
  color: string
  is_active: boolean
  order_index: number
  store_id: number
}

// ============================================================================
// Shifts (シフト)
// ============================================================================
export interface Shift {
  id: number
  cast_id: number
  store_id: number
  date: string
  start_time: string
  end_time: string
  status: string
  created_at: string
}

export interface ShiftRequest {
  id: number
  cast_id: number
  store_id: number
  date: string
  start_time: string
  end_time: string
  status: string
  created_at: string
  updated_at: string
}

export interface ShiftLock {
  id: number
  store_id: number
  year: number
  month: number
  is_locked: boolean
  locked_at: string | null
  locked_by: number | null
}

// ============================================================================
// Store & Settings
// ============================================================================
export interface Store {
  id: number
  name: string
  created_at?: string
}

export interface SystemSettings {
  tax_rate: number              // DB: 10 = 10%, 使用時は /100
  service_fee_rate: number      // DB: 15 = 15%, 使用時は /100
  rounding_method: number
  rounding_unit: number
  card_fee_rate: number
  business_day_start_hour: number
  allow_multiple_nominations: boolean    // 複数推し機能
  allow_multiple_casts_per_item: boolean // 注文明細の複数キャスト
}

export interface StoreSettings {
  store_name: string
  store_postal_code: string
  store_address: string
  store_phone: string
  store_email: string
  business_hours: string
  closed_days: string
  store_registration_number: string
  footer_message: string
  revenue_stamp_threshold: number
  menu_template: string
  logo_url: string
}

// ============================================================================
// Cast Position (for staff position settings)
// ============================================================================
export interface CastPosition {
  id: number
  name: string
  store_id: number
}

// ============================================================================
// Sales & Compensation Settings (売上・報酬設定)
// ============================================================================

// 端数処理方法
export type RoundingMethod =
  | 'floor_1' | 'floor_10' | 'floor_100'
  | 'ceil_1' | 'ceil_10' | 'ceil_100'
  | 'round_1' | 'round_10' | 'round_100'
  | 'round' // レガシー（round_1と同等）
  | 'none'

// 端数処理タイミング
export type RoundingTiming = 'per_item' | 'total'

// ヘルプ計算方法
export type HelpCalculationMethod = 'ratio' | 'fixed'

// 給与形態（レガシー、後方互換用）
export type PayType = 'hourly' | 'commission' | 'hourly_plus_commission' | 'sliding'

// バック計算方法
export type BackType = 'ratio' | 'fixed'

// 保証期間（未使用）
export type GuaranteePeriod = 'day' | 'month'

// 売上対象の種類
export type SalesTargetType = 'receipt_total' | 'cast_sales'  // 伝票小計売上 | 推し小計売上

// 給与計算項目
export interface PayComponent {
  enabled: boolean
  type: 'hourly' | 'fixed' | 'sales'
  value: number                    // 時給額 / 固定額 / バック率(%)
  salesTarget?: SalesTargetType    // 売上ベースの場合の対象
  useSlidingRate?: boolean         // スライド率テーブルを使用するか
}

// 控除項目の種類
export type DeductionType = 'daily_payment' | 'penalty' | 'misc'

// 複数キャストの分配方法
export type MultiCastDistribution = 'nomination_only' | 'all_equal'
// nomination_only: 推しに該当するキャストのみ
// all_equal: 全キャストで均等分配

// 推し以外のキャスト分の売上集計方法
export type NonNominationSalesHandling = 'share_only' | 'full_to_nomination'
// share_only: 推しの分だけ計上（例: A,Cで10000円 → Aに5000円）
// full_to_nomination: 全額を推しに計上（例: A,Cで10000円 → Aに10000円）

// ヘルプ商品の分配方法
export type HelpDistributionMethod = 'all_to_nomination' | 'equal' | 'ratio' | 'equal_per_person' | 'group_ratio' | 'equal_all'
// all_to_nomination: 全額推しに
// equal: 等分（推しとヘルプで分ける）
// ratio: 比率で分ける
// equal_per_person: 均等割（全員で等分）
// group_ratio: 推しグループ:ヘルプ = 1:1 で分配（レガシー）
// equal_all: 全員で等分（レガシー）

// ヘルプ売上の計上方法
export type HelpSalesInclusion = 'both' | 'self_only' | 'help_only'
// both: SELF/HELP両方計上
// self_only: SELFのみ計上
// help_only: HELPのみ計上

// ヘルプバック計算方法
export type HelpBackCalculationMethod = 'sales_based' | 'full_amount'
// sales_based: 売上設定に従う（分配後の金額 × ヘルプバック率）
// full_amount: 商品全額（商品の全額 × ヘルプバック率）

// 支給方法選択
export type PaymentSelectionMethod = 'highest' | 'specific'
// highest: 全報酬形態の中で最も高いものを支給
// specific: 特定の報酬形態を指定して支給

// 売上集計方法（報酬形態ごと）
export type SalesAggregationMethod = 'item_based' | 'receipt_based'
// item_based: 推し小計（キャスト名が入ってる商品のみ）
// receipt_based: 伝票小計（伝票のすべての商品を集計）

// 報酬形態（個別の設定）
export interface CompensationType {
  id: string                          // UUID
  name: string                        // 表示名（報酬形態1, 報酬形態2, etc.）
  order_index: number                 // 並び順
  is_enabled: boolean                 // 有効/無効

  // 売上収集方法
  sales_aggregation: SalesAggregationMethod

  // 基本給与設定
  hourly_rate: number                 // 時給（未使用時は0）
  commission_rate: number             // 売上バック率（%）（未使用時は0）
  fixed_amount: number                // 固定額（未使用時は0）

  // スライド式バック率
  use_sliding_rate: boolean           // スライド式を使用するか
  sliding_rates: SlidingRate[] | null // スライド率テーブル

  // 商品バック設定
  use_product_back: boolean           // 商品別バック率を使用するか
  use_help_product_back: boolean      // ヘルプの商品バックを有効にするか
  help_back_calculation_method: HelpBackCalculationMethod
}

// 公開する集計方法
export type PublishedAggregation = 'none' | 'item_based' | 'receipt_based'
// item_based: キャスト名が入ってる商品のみ
// receipt_based: 伝票のすべての商品を集計

// 店舗別売上計算設定
export interface SalesSettings {
  id: number
  store_id: number

  // ========== キャスト名が入ってる商品のみの集計設定 ==========
  // 計算基準
  item_use_tax_excluded: boolean        // true: 税抜き金額で計算
  item_exclude_consumption_tax: boolean // 消費税抜きで計算
  item_exclude_service_charge: boolean  // サービスTAX込みで計算

  // 複数キャストの分配方法
  item_multi_cast_distribution: MultiCastDistribution
  item_non_nomination_sales_handling: NonNominationSalesHandling
  item_help_distribution_method: HelpDistributionMethod

  // ヘルプ売上設定
  item_help_sales_inclusion: HelpSalesInclusion
  item_help_calculation_method: HelpCalculationMethod
  item_help_ratio: number               // ヘルプ割合（%）
  item_help_fixed_amount: number        // ヘルプ固定額

  // 推し分配設定
  item_nomination_distribute_all: boolean // 商品についていない推しにも売上を分配するか

  // 端数処理
  item_rounding_method: RoundingMethod
  item_rounding_position: number        // 1, 10, 100
  item_rounding_timing: RoundingTiming  // per_item: 商品ごと, total: 合計時

  // ========== 伝票のすべての商品を集計設定 ==========
  // 計算基準
  receipt_use_tax_excluded: boolean
  receipt_exclude_consumption_tax: boolean
  receipt_exclude_service_charge: boolean

  // 複数キャストの分配方法
  receipt_multi_cast_distribution: MultiCastDistribution
  receipt_non_nomination_sales_handling: NonNominationSalesHandling
  receipt_help_distribution_method: HelpDistributionMethod

  // ヘルプ売上設定
  receipt_help_sales_inclusion: HelpSalesInclusion
  receipt_help_calculation_method: HelpCalculationMethod
  receipt_help_ratio: number
  receipt_help_fixed_amount: number

  // 推し分配設定

  // 端数処理
  receipt_rounding_method: RoundingMethod
  receipt_rounding_position: number
  receipt_rounding_timing: RoundingTiming

  // ========== 公開設定 ==========
  published_aggregation: PublishedAggregation

  // ========== 共通設定 ==========
  // ヘルプ扱いにしない推し名（配列）
  non_help_staff_names: string[]

  // 複数推しの分配率（配列、例: [50, 50] で2人均等）
  multi_nomination_ratios: number[]

  // ========== レガシー設定（後方互換用） ==========
  // 端数処理設定
  rounding_method: RoundingMethod
  rounding_timing: RoundingTiming

  // ヘルプ売上計算設定
  distribute_to_help: boolean // ヘルプにも売上を分配するか
  help_calculation_method: HelpCalculationMethod
  help_ratio: number          // ヘルプ割合（%）
  help_fixed_amount: number   // ヘルプ固定額

  // 税計算設定
  use_tax_excluded: boolean   // true: 税抜き金額で計算（後方互換用）
  exclude_consumption_tax: boolean  // 消費税抜きで計算
  exclude_service_charge: boolean   // サービスTAX抜きで計算

  description?: string | null

  // ========== BASE連携設定 ==========
  include_base_in_item_sales: boolean      // BASE売上を推し小計に含める
  include_base_in_receipt_sales: boolean   // BASE売上を伝票小計に含める
  base_cutoff_hour: number                 // BASE注文の営業日締め時間（0-23）
  base_cutoff_enabled: boolean             // BASE注文に営業日締め時間を適用するか

  created_at: string
  updated_at: string
}

// スライド制のレート設定
export interface SlidingRate {
  min: number    // 売上下限
  max: number    // 売上上限（null/undefinedは上限なし）
  rate: number   // バック率（%）
}

// 控除項目
export interface DeductionItem {
  id: string           // UUID
  type: DeductionType  // 種類
  name: string         // 表示名（例: 日払い、遅刻罰金、送迎費）
  amount: number       // 金額（0の場合は変動）
  isVariable: boolean  // 変動額かどうか
}

// キャスト別報酬設定（実際のDBカラム構造）
export interface CompensationSettings {
  id: number
  cast_id: number
  store_id: number

  // 給与形態（レガシー、後方互換用だが現在も使用）
  pay_type: PayType

  // 基本給与設定
  hourly_rate: number               // 時給（未使用時は0）
  commission_rate: number           // 売上バック率（%）（未使用時は0）
  sales_target: SalesTargetType     // 売上計算対象: 'cast_sales' | 'receipt_total'
  fixed_amount: number              // 固定額（未使用時は0）

  // スライド制（高い方を支給）
  use_sliding_comparison: boolean
  compare_hourly_rate: number             // 比較用: 時給（未使用時は0）
  compare_commission_rate: number         // 比較用: 売上バック率（%）（未使用時は0）
  compare_sales_target: SalesTargetType   // 比較用: 売上計算対象
  compare_fixed_amount: number            // 比較用: 固定額（未使用時は0）
  compare_use_product_back: boolean       // 比較用: 商品バック使用するか

  // スライド率テーブル（売上に応じてバック率変動）
  sliding_rates: SlidingRate[] | null

  // 保証設定（レガシー）
  guarantee_enabled: boolean | null
  guarantee_amount: number | null
  guarantee_period: GuaranteePeriod | null

  // 控除設定
  deduction_enabled: boolean
  deduction_items: DeductionItem[] | null

  // 商品別バック設定（レガシー、後方互換用）
  use_product_back: boolean  // 商品別バック率を使用するか（cast_back_ratesテーブル参照）
  use_help_product_back: boolean  // ヘルプの商品バックを有効にするか
  help_back_calculation_method: HelpBackCalculationMethod  // ヘルプバック計算方法

  // 報酬形態設定（新構造）
  payment_selection_method: PaymentSelectionMethod  // 支給方法: highest | specific
  selected_compensation_type_id: string | null      // specific時に使用する報酬形態ID
  compensation_types: CompensationType[] | null     // 報酬形態の配列

  // 対象年月（月ごとの報酬設定用）
  target_year: number | null   // 対象年（nullは全期間共通）
  target_month: number | null  // 対象月（1-12、nullは全期間共通）
  is_locked: boolean           // ロック済み（給料日を過ぎたらロック）
  locked_at: string | null     // ロック日時

  // 適用期間（レガシー、後方互換用）
  valid_from: string
  valid_to: string | null

  // 時給システム拡張フィールド
  status_id: number | null        // 時給ステータス（wage_statuses参照）
  status_locked: boolean          // ステータス固定フラグ
  hourly_wage_override: number | null  // 時給直接指定
  min_days_rule_enabled: boolean  // 最低日数ルール適用
  first_month_exempt_override: boolean | null  // 入店初月除外

  is_active: boolean
  created_at: string
  updated_at: string
}

// スライドバック率エントリ
export interface SlidingBackRateEntry {
  min: number       // 売上下限
  max: number       // 売上上限 (0 = 上限なし)
  rate: number      // バック率 (%)
}

// キャスト×商品別バック率
export interface CastBackRate {
  id: number
  cast_id: number
  store_id: number

  // 商品識別
  category: string | null        // NULLは全カテゴリ対象
  product_name: string | null    // NULLはカテゴリ全体対象

  // バック設定
  back_type: BackType
  back_ratio: number            // バック率（%）
  back_fixed_amount: number     // バック固定額

  // SELF/HELP別バック率
  self_back_ratio: number | null  // NULLの場合はback_ratioを使用
  help_back_ratio: number | null  // NULLの場合はsales_settings.help_ratioを使用

  // スライド式バック率
  use_sliding_back: boolean                       // スライド式を使用するか
  back_sales_aggregation: 'item_based' | 'receipt_based'  // 売上計算方法
  sliding_back_rates: SlidingBackRateEntry[] | null       // スライド率テーブル

  // 計算済みスライドバック率（会計時にトリガーで自動更新）
  calculated_sliding_rate: number | null          // 計算されたバック率
  calculated_at: string | null                    // 計算日時
  calculated_sales_amount: number | null          // 計算時の累計売上

  // キャスト報酬設定（デフォルト設定用: category=null, product_name=null時）
  hourly_wage: number | null     // 時給

  is_active: boolean

  created_at: string
  updated_at: string
}

// ============================================================================
// Sales Calculation Types (売上計算用)
// ============================================================================

// SELF/HELP判定結果
export type SalesType = 'self' | 'help'

// 計算済み売上アイテム
export interface CalculatedSalesItem {
  order_item_id: number
  cast_id: number
  cast_name: string
  product_name: string
  category: string | null
  quantity: number
  unit_price_excl_tax: number     // 税抜き単価
  subtotal_excl_tax: number       // 税抜き小計
  sales_type: SalesType           // SELF or HELP
  back_ratio: number              // 適用されたバック率
  back_amount: number             // バック金額
}

// キャスト別売上集計
export interface CastSalesSummary {
  cast_id: number
  cast_name: string
  self_sales: number        // SELF売上合計
  help_sales: number        // HELP売上合計
  total_sales: number       // 合計売上
  total_back: number        // バック合計
  items: CalculatedSalesItem[]
}

// ============================================================================
// Cast Daily Stats Types (キャスト日別統計)
// ============================================================================

// 日別商品詳細
export interface CastDailyItem {
  id: number
  cast_id: number
  store_id: number
  date: string
  category: string | null
  product_name: string | null
  quantity: number
  subtotal: number
  back_amount: number
  created_at: string
  updated_at: string
}

// 日別売上サマリー
export interface CastDailyStats {
  id: number
  cast_id: number
  store_id: number
  date: string

  // 推し小計ベース（item_based）
  self_sales_item_based: number
  help_sales_item_based: number
  total_sales_item_based: number
  product_back_item_based: number

  // 伝票小計ベース（receipt_based）
  self_sales_receipt_based: number
  help_sales_receipt_based: number
  total_sales_receipt_based: number
  product_back_receipt_based: number

  // 時給関連
  work_hours: number              // 勤務時間（時間単位）
  base_hourly_wage: number        // 基本時給
  special_day_bonus: number       // 特別日加算額
  costume_bonus: number           // 衣装加算額
  total_hourly_wage: number       // 合計時給
  wage_amount: number             // 時給収入（合計時給×勤務時間）
  costume_id: number | null       // 衣装ID
  wage_status_id: number | null   // 時給ステータスID

  // 確定フラグ
  is_finalized: boolean
  finalized_at: string | null

  created_at: string
  updated_at: string
}

// ============================================================================
// Wage System Types (時給システム)
// ============================================================================

// 時給ステータス（研修、レギュラー、ゴールド等）
export interface WageStatus {
  id: number
  store_id: number
  name: string
  hourly_wage: number
  priority: number
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

// 昇格/降格条件タイプ
export type WageConditionType = 'attendance_days' | 'sales' | 'nominations'

// 条件演算子
export type WageConditionOperator = '>=' | '<=' | '>' | '<' | '='

// ステータス昇格/降格条件
export interface WageStatusCondition {
  id: number
  status_id: number
  condition_type: WageConditionType
  operator: WageConditionOperator
  value: number
  logic_group: number  // 同グループはAND、別グループはOR
  created_at: string
  updated_at: string
}

// 特別日カレンダー（クリスマス等の時給加算日）
export interface SpecialWageDay {
  id: number
  store_id: number
  date: string
  name: string
  wage_adjustment: number  // 時給調整額（+1000円等）
  is_active: boolean
  created_at: string
  updated_at: string
}

// 衣装マスタ（衣装ごとの時給調整）
export interface Costume {
  id: number
  store_id: number
  name: string
  wage_adjustment: number  // 時給調整額（+500円等）
  display_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// 店舗別時給ルール設定
export interface StoreWageSettings {
  id: number
  store_id: number
  default_hourly_wage: number
  min_hours_for_full_day: number  // 1日出勤とカウントする最低時間（例: 5.0）
  min_days_for_back: number       // バック対象となる最低出勤日数
  wage_only_max_days: number      // この日数以下は時給のみ（バックなし）
  first_month_exempt: boolean     // 入店初月はルールから除外
  created_at: string
  updated_at: string
}

// CompensationSettings への追加フィールド（extend用）
export interface CompensationSettingsWageExtension {
  status_id: number | null        // 固定ステータス（NULLなら自動計算）
  status_locked: boolean          // ステータス固定フラグ
  hourly_wage_override: number | null  // 時給直接指定（NULLならステータスの時給）
  min_days_rule_enabled: boolean  // 最低日数ルール適用
  first_month_exempt_override: boolean | null  // 入店初月除外（NULL=店舗設定に従う）
}

// Attendance への追加フィールド（extend用）
export interface AttendanceWageExtension {
  costume_id: number | null  // その日着用した衣装
}

// ============================================================================
// BASE連携 Types
// ============================================================================

// バック率の適用対象
export type BackRateSource = 'pos' | 'base' | 'all'

// BASE API設定
export interface BaseSettings {
  id: number
  store_id: number
  client_id: string | null
  client_secret: string | null
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// BASE商品マッピング
export interface BaseProduct {
  id: number
  store_id: number
  base_item_id: number | null
  base_product_name: string
  local_product_name: string
  base_price: number
  sync_variations: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

// BASEバリエーション（キャストマッピング）
export interface BaseVariation {
  id: number
  base_product_id: number
  store_id: number
  base_variation_id: number | null
  variation_name: string
  cast_id: number | null
  is_synced: boolean
  synced_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// BASE注文履歴
export interface BaseOrder {
  id: number
  store_id: number
  base_order_id: string
  order_datetime: string
  product_name: string
  variation_name: string | null
  cast_id: number | null
  local_product_id: number | null
  base_price: number
  actual_price: number | null
  quantity: number
  back_amount: number
  business_date: string | null  // 営業日（締め時間考慮）
  is_processed: boolean
  processed_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

// BASE商品とバリエーション（UI用）
export interface BaseProductWithVariations extends BaseProduct {
  variations: BaseVariation[]
}
