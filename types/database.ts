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
  hourly_wage: number
  commission_rate: number
  is_admin: boolean
  is_manager: boolean
  line_msg_user_id: string | null
  line_msg_state: string | null
  line_msg_registered_at: string | null
  is_active: boolean
  display_order?: number | null
}

// Simplified Cast type for listings (id and name only)
export interface CastBasic {
  id: number
  name: string
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
  check_in_datetime: string
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
  consumption_tax_rate: number
  service_charge_rate: number
  rounding_method: number
  rounding_unit: number
  card_fee_rate: number
  business_day_cutoff_hour: number
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
