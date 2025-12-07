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
  cast_name: string | null
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
  staff_name: string | null
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
  status?: string
  late_minutes?: number
  break_minutes?: number
  daily_payment?: number
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
export type RoundingMethod = 'floor_100' | 'floor_10' | 'round' | 'none'

// 端数処理タイミング
export type RoundingTiming = 'per_item' | 'total'

// ヘルプ計算方法
export type HelpCalculationMethod = 'ratio' | 'fixed'

// 給与形態
export type PayType = 'hourly' | 'commission' | 'hourly_plus_commission' | 'sliding'

// バック計算方法
export type BackType = 'ratio' | 'fixed'

// 保証期間
export type GuaranteePeriod = 'day' | 'month'

// 店舗別売上計算設定
export interface SalesSettings {
  id: number
  store_id: number

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

  // バック計算対象設定
  include_shimei_in_sales: boolean    // 指名料を売上に含める
  include_drink_in_sales: boolean     // ドリンクを売上に含める
  include_food_in_sales: boolean      // フードを売上に含める
  include_extension_in_sales: boolean // 延長料金を売上に含める

  description?: string | null

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
  name: string    // 控除名
  amount: number  // 金額
}

// キャスト別報酬設定
export interface CompensationSettings {
  id: number
  cast_id: number
  store_id: number

  // 給与形態
  pay_type: PayType

  // 時給設定
  hourly_rate: number

  // 歩合設定
  commission_rate: number

  // スライド制設定
  sliding_rates: SlidingRate[] | null

  // 保証設定
  guarantee_enabled: boolean
  guarantee_amount: number
  guarantee_period: GuaranteePeriod

  // 控除設定
  deduction_enabled: boolean
  deduction_items: DeductionItem[] | null

  // 適用期間
  valid_from: string
  valid_to: string | null

  is_active: boolean
  created_at: string
  updated_at: string
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
