import type { PermissionKey, Permissions } from '@/types'

// 権限の表示名とカテゴリ
export const PERMISSION_CONFIG: Record<PermissionKey, { label: string; category: string }> = {
  casts: { label: 'キャスト管理', category: 'キャスト' },
  attendance: { label: '勤怠管理', category: 'キャスト' },
  payslip: { label: '給与明細', category: 'キャスト' },
  payslip_list: { label: '報酬明細一覧', category: 'キャスト' },
  cast_sales: { label: 'キャスト売上', category: 'キャスト' },
  cast_back_rates: { label: 'バック率設定', category: 'キャスト' },
  cast_wage_settings: { label: 'キャスト時給設定', category: 'キャスト' },
  wage_settings: { label: '時給ステータス設定', category: '設定' },
  compensation_settings: { label: '手当設定', category: '設定' },
  compensation_list: { label: '報酬形態一覧', category: '設定' },
  deduction_settings: { label: '控除設定', category: '設定' },
  sales_settings: { label: '売上設定', category: '設定' },
  products: { label: '商品管理', category: '商品' },
  categories: { label: 'カテゴリ管理', category: '商品' },
  receipts: { label: 'レシート設定', category: 'その他' },
  store_settings: { label: '店舗設定', category: 'その他' },
  settings: { label: 'システム設定', category: 'その他' },
  shifts: { label: 'シフト管理', category: 'その他' },
  base_settings: { label: 'BASE連携設定', category: 'その他' },
  schedule: { label: '出勤表作成', category: 'その他' },
  twitter: { label: 'Twitter管理', category: 'その他' },
}

// カテゴリ順
export const PERMISSION_CATEGORIES = ['キャスト', '設定', '商品', 'その他'] as const

// 全権限キーの一覧
export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.keys(PERMISSION_CONFIG) as PermissionKey[]

// デフォルト権限（全て有効）
export const DEFAULT_PERMISSIONS: Permissions = ALL_PERMISSION_KEYS.reduce((acc, key) => {
  acc[key] = true
  return acc
}, {} as Permissions)

// 権限チェック関数
export function hasPermission(
  permissions: Permissions | undefined,
  key: PermissionKey,
  role?: 'super_admin' | 'store_admin'
): boolean {
  // super_adminは全権限あり
  if (role === 'super_admin') return true

  // permissionsが未定義または空の場合はデフォルトで許可（後方互換性）
  if (!permissions || Object.keys(permissions).length === 0) return true

  // 明示的にfalseの場合のみ拒否
  return permissions[key] !== false
}

// ページパスから権限キーを取得
export function getPermissionKeyFromPath(path: string): PermissionKey | null {
  const pathMap: Record<string, PermissionKey> = {
    '/casts': 'casts',
    '/attendance': 'attendance',
    '/payslip': 'payslip',
    '/payslip-list': 'payslip_list',
    '/cast-sales': 'cast_sales',
    '/cast-back-rates': 'cast_back_rates',
    '/cast-wage-settings': 'cast_wage_settings',
    '/wage-settings': 'wage_settings',
    '/compensation-settings': 'compensation_settings',
    '/compensation-list': 'compensation_list',
    '/deduction-settings': 'deduction_settings',
    '/sales-settings': 'sales_settings',
    '/products': 'products',
    '/categories': 'categories',
    '/receipts': 'receipts',
    '/store-settings': 'store_settings',
    '/settings': 'settings',
    '/shifts/manage': 'shifts',
    '/base-settings': 'base_settings',
    // 出勤表作成
    '/schedule/photos': 'schedule',
    '/schedule/template': 'schedule',
    '/schedule/generate': 'schedule',
    // Twitter
    '/twitter-posts': 'twitter',
    '/twitter-settings': 'twitter',
  }

  return pathMap[path] || null
}
