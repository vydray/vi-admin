-- ================================================================
-- Migration: Add permissions column to admin_users
-- ================================================================
-- 目的: 各admin_userに対してページ/機能ごとのアクセス権限を設定
-- ================================================================

-- permissionsカラムを追加（JSONB型）
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- コメント追加
COMMENT ON COLUMN admin_users.permissions IS 'ページ/機能ごとのアクセス権限。例: {"casts": true, "payslip": false}';

-- ================================================================
-- 権限一覧（アプリケーション側で管理）
-- ================================================================
-- casts: キャスト管理
-- attendance: 勤怠管理
-- payslip: 給与明細
-- cast_sales: キャスト売上
-- cast_back_rates: バック率設定
-- cast_wage_settings: キャスト時給設定
-- wage_settings: 時給ステータス設定
-- compensation_settings: 手当設定
-- deduction_settings: 控除設定
-- sales_settings: 売上設定
-- products: 商品管理
-- categories: カテゴリ管理
-- receipts: レシート設定
-- store_settings: 店舗設定
-- settings: システム設定
-- shifts: シフト管理
-- base_settings: BASE連携設定
-- ================================================================

-- 既存のstore_adminユーザーにデフォルト権限を付与（全機能アクセス可能）
UPDATE admin_users
SET permissions = '{
  "casts": true,
  "attendance": true,
  "payslip": true,
  "cast_sales": true,
  "cast_back_rates": true,
  "cast_wage_settings": true,
  "wage_settings": true,
  "compensation_settings": true,
  "deduction_settings": true,
  "sales_settings": true,
  "products": true,
  "categories": true,
  "receipts": true,
  "store_settings": true,
  "settings": true,
  "shifts": true,
  "base_settings": true
}'::jsonb
WHERE role = 'store_admin' AND (permissions IS NULL OR permissions = '{}'::jsonb);

-- ================================================================
-- 完了
-- ================================================================
