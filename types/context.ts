// Context Types

import { ReactNode } from 'react'
import { Store } from './database'

// ============================================================================
// Auth Context
// ============================================================================

// 権限キーの一覧
export type PermissionKey =
  | 'casts'              // キャスト管理
  | 'attendance'         // 勤怠管理
  | 'payslip'            // 給与明細
  | 'payslip_list'       // 報酬明細一覧
  | 'cast_sales'         // キャスト売上
  | 'cast_back_rates'    // バック率設定
  | 'cast_wage_settings' // キャスト時給設定
  | 'wage_settings'      // 時給ステータス設定
  | 'compensation_settings' // 手当設定
  | 'compensation_list'  // 報酬形態一覧
  | 'deduction_settings' // 控除設定
  | 'bonus_settings'     // 賞与設定
  | 'sales_settings'     // 売上設定
  | 'products'           // 商品管理
  | 'categories'         // カテゴリ管理
  | 'receipts'           // レシート設定
  | 'store_settings'     // 店舗設定
  | 'settings'           // アカウント設定
  | 'shifts'             // シフト管理
  | 'base_settings'      // BASE連携設定
  | 'schedule'           // 出勤表作成
  | 'twitter'            // Twitter管理
  | 'orishan_report'     // オリシャン集計
  | 'website_banners'    // Webサイト・イベントバナー
  | 'management'         // 経営ダッシュボード（既定OFF・opt-in）
  | 'expenses'           // 経費管理
  | 'interview'          // キャスト面談（プロデュースDB・既定OFF・opt-in・機密）
  | 'labor_cost'         // 人件費・給与の表示（OFFにすると給与/人件費を隠す横断フラグ）

export type Permissions = Partial<Record<PermissionKey, boolean>>

export interface AdminUser {
  id: number
  username: string
  role: 'super_admin' | 'store_admin'
  store_id: number | null
  accessible_store_ids?: number[] // 複数店運用: アクセス可能な店舗ID群（未設定なら自店のみ）
  permissions?: Permissions
}

export interface AuthContextType {
  user: AdminUser | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  isAuthenticated: boolean
}

// ============================================================================
// Store Context
// ============================================================================
export interface StoreContextType {
  storeId: number
  setStoreId: (id: number) => void
  storeName: string
  stores: Store[]
  isLoading: boolean
  canSwitchStore: boolean
}

// ============================================================================
// Confirm Context
// ============================================================================
export interface ConfirmContextType {
  confirm: (message: string) => Promise<boolean>
}

// ============================================================================
// Provider Props
// ============================================================================
export interface ProviderProps {
  children: ReactNode
}
