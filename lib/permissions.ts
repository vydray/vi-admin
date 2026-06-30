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
  receipts: { label: '伝票管理', category: 'その他' },
  store_settings: { label: '店舗設定', category: 'その他' },
  settings: { label: 'システム設定', category: 'その他' },
  shifts: { label: 'シフト管理', category: 'その他' },
  base_settings: { label: 'BASE連携設定', category: 'その他' },
  schedule: { label: '出勤表作成', category: 'その他' },
  twitter: { label: 'Twitter管理', category: 'その他' },
  orishan_report: { label: 'オリシャン集計', category: 'キャスト' },
  website_banners: { label: 'Webサイト・バナー管理', category: 'その他' },
  management: { label: '経営ダッシュボード', category: '経営' },
  expenses: { label: '経費管理', category: 'その他' },
  interview: { label: 'キャスト面談', category: 'キャスト' },
}

// カテゴリ順（経営は重要なので先頭）
export const PERMISSION_CATEGORIES = ['経営', 'キャスト', '設定', '商品', 'その他'] as const

// 全権限キーの一覧
export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.keys(PERMISSION_CONFIG) as PermissionKey[]

// デフォルトOFF（明示的にtrueの時だけ許可）の権限キー。
// 経営ダッシュボードは経営数値を扱うため、店舗adminには既定で見せない（opt-in）。
export const OPT_IN_KEYS = new Set<PermissionKey>(['management', 'interview'])

// デフォルト権限（opt-inキー以外は有効）
export const DEFAULT_PERMISSIONS: Permissions = ALL_PERMISSION_KEYS.reduce((acc, key) => {
  acc[key] = !OPT_IN_KEYS.has(key)
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

  // opt-inキー（経営ダッシュボード等）は明示的にtrueの時だけ許可。
  // 後方互換の「未設定なら許可」を適用せず、既定OFFを担保する。
  if (OPT_IN_KEYS.has(key)) {
    return permissions?.[key] === true
  }

  // permissionsが未定義または空の場合はデフォルトで許可（後方互換性）
  if (!permissions || Object.keys(permissions).length === 0) return true

  // 明示的にfalseの場合のみ拒否
  return permissions[key] !== false
}

// ページパスから権限キーを取得
export function getPermissionKeyFromPath(path: string): PermissionKey | null {
  const pathMap: Record<string, PermissionKey> = {
    '/management': 'management',
    '/expenses': 'expenses',
    '/interview': 'interview',
    '/casts': 'casts',
    '/attendance': 'attendance',
    '/payslip': 'payslip',
    '/payslip-list': 'payslip_list',
    '/cast-sales': 'cast_sales',
    '/orishan-report': 'orishan_report',
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
    '/schedule/calendar': 'schedule',
    // Twitter
    '/twitter-posts': 'twitter',
    '/twitter-settings': 'twitter',
    // Webサイト
    '/website-banners': 'website_banners',
  }

  return pathMap[path] || null
}
