-- ================================================================
-- RLS Migration: Store Isolation (店舗分離RLSポリシー)
-- ================================================================
-- 実行日: 2024-12
-- 目的: 全テーブルにstore_idベースのRLSを適用
--       super_admin/store_id=NULL は全店舗アクセス可能
-- ================================================================

-- ================================================================
-- STEP 1: 既存ポリシーの削除
-- ================================================================

-- store_idが直接あるテーブル
DROP POLICY IF EXISTS "allow_all_access" ON casts;
DROP POLICY IF EXISTS "allow_all_access" ON admin_users;
DROP POLICY IF EXISTS "allow_all_access" ON attendance;
DROP POLICY IF EXISTS "allow_all_access" ON attendance_statuses;
DROP POLICY IF EXISTS "allow_all_access" ON attendance_history;
DROP POLICY IF EXISTS "allow_all_access" ON shifts;
DROP POLICY IF EXISTS "allow_all_access" ON shift_requests;
DROP POLICY IF EXISTS "allow_all_access" ON shift_locks;
DROP POLICY IF EXISTS "allow_all_access" ON products;
DROP POLICY IF EXISTS "allow_all_access" ON system_settings;
DROP POLICY IF EXISTS "allow_all_access" ON sales_settings;
DROP POLICY IF EXISTS "allow_all_access" ON compensation_settings;
DROP POLICY IF EXISTS "allow_all_access" ON cast_back_rates;
DROP POLICY IF EXISTS "allow_all_access" ON cast_daily_items;
DROP POLICY IF EXISTS "allow_all_access" ON cast_daily_stats;
DROP POLICY IF EXISTS "allow_all_access" ON wage_statuses;
DROP POLICY IF EXISTS "allow_all_access" ON special_wage_days;
DROP POLICY IF EXISTS "allow_all_access" ON costumes;
DROP POLICY IF EXISTS "allow_all_access" ON store_wage_settings;
DROP POLICY IF EXISTS "allow_all_access" ON deduction_types;
DROP POLICY IF EXISTS "allow_all_access" ON cast_deductions;
DROP POLICY IF EXISTS "allow_all_access" ON payslips;
DROP POLICY IF EXISTS "allow_all_access" ON base_settings;
DROP POLICY IF EXISTS "allow_all_access" ON base_products;
DROP POLICY IF EXISTS "allow_all_access" ON base_variations;
DROP POLICY IF EXISTS "allow_all_access" ON base_orders;
DROP POLICY IF EXISTS "allow_all_access" ON orders;
DROP POLICY IF EXISTS "allow_all_access" ON table_status;
DROP POLICY IF EXISTS "allow_all_access" ON cash_counts;
DROP POLICY IF EXISTS "allow_all_access" ON receipt_sequences;
DROP POLICY IF EXISTS "allow_all_access" ON receipt_settings;
DROP POLICY IF EXISTS "allow_all_access" ON store_line_configs;
DROP POLICY IF EXISTS "allow_all_access" ON line_register_requests;
DROP POLICY IF EXISTS "allow_all_access" ON admin_emergency_logins;
DROP POLICY IF EXISTS "allow_all_access" ON daily_reports;
DROP POLICY IF EXISTS "allow_all_access" ON monthly_targets;
DROP POLICY IF EXISTS "allow_all_access" ON compensation_sample_receipts;
DROP POLICY IF EXISTS "allow_all_access" ON visitor_reservations;
DROP POLICY IF EXISTS "allow_all_access" ON cast_positions;
DROP POLICY IF EXISTS "allow_all_access" ON product_categories;
DROP POLICY IF EXISTS "allow_all_access" ON late_penalty_rules;
DROP POLICY IF EXISTS "allow_all_access" ON late_penalty_tiers;

-- FK経由のテーブル
DROP POLICY IF EXISTS "allow_all_access" ON order_items;
DROP POLICY IF EXISTS "allow_all_access" ON payments;
DROP POLICY IF EXISTS "allow_all_access" ON current_order_items;
DROP POLICY IF EXISTS "allow_all_access" ON wage_status_conditions;
DROP POLICY IF EXISTS "allow_all_access" ON compensation_sample_items;

-- 特殊テーブル
DROP POLICY IF EXISTS "allow_all_access" ON stores;
DROP POLICY IF EXISTS "allow_all_access" ON users;
DROP POLICY IF EXISTS "allow_all_access" ON casts_backup;

-- 重複ポリシーの削除
DROP POLICY IF EXISTS "system_settings_allow_all" ON system_settings;
DROP POLICY IF EXISTS "Allow anon access" ON base_orders;
DROP POLICY IF EXISTS "Allow anon access" ON base_products;
DROP POLICY IF EXISTS "Allow anon access" ON base_settings;
DROP POLICY IF EXISTS "Allow anon access" ON base_variations;
DROP POLICY IF EXISTS "Allow public access" ON base_orders;
DROP POLICY IF EXISTS "Allow public access" ON base_products;
DROP POLICY IF EXISTS "Allow public access" ON base_settings;
DROP POLICY IF EXISTS "Allow public access" ON base_variations;

-- 既存のauthenticatedポリシーも削除
DROP POLICY IF EXISTS "Allow all for authenticated users" ON attendance_history;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON cast_daily_items;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON cast_daily_stats;
DROP POLICY IF EXISTS "Allow authenticated users to select" ON payslips;
DROP POLICY IF EXISTS "Allow authenticated users to insert" ON payslips;
DROP POLICY IF EXISTS "Allow authenticated users to update" ON payslips;
DROP POLICY IF EXISTS "Allow authenticated users to delete" ON payslips;

-- ================================================================
-- STEP 2: RLSを有効化
-- ================================================================

ALTER TABLE casts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cast_back_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cast_daily_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cast_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE wage_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_wage_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE costumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_wage_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE deduction_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE cast_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_line_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_register_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_emergency_logins ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensation_sample_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cast_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE late_penalty_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE late_penalty_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE current_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE wage_status_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensation_sample_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE casts_backup ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- STEP 3: 新しいRLSポリシーを作成
-- ================================================================
-- 条件:
--   1. super_admin → 全店舗アクセス可能
--   2. store_id = NULL (緊急ログイン全店舗権限) → 全店舗アクセス可能
--   3. それ以外 → 自分のstore_idのみ
-- ================================================================

-- casts
CREATE POLICY "store_isolation" ON casts FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- admin_users
CREATE POLICY "store_isolation" ON admin_users FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- attendance
CREATE POLICY "store_isolation" ON attendance FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- attendance_statuses
CREATE POLICY "store_isolation" ON attendance_statuses FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- attendance_history
CREATE POLICY "store_isolation" ON attendance_history FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- shifts
CREATE POLICY "store_isolation" ON shifts FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- shift_requests
CREATE POLICY "store_isolation" ON shift_requests FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- shift_locks
CREATE POLICY "store_isolation" ON shift_locks FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- products
CREATE POLICY "store_isolation" ON products FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- system_settings
CREATE POLICY "store_isolation" ON system_settings FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- sales_settings
CREATE POLICY "store_isolation" ON sales_settings FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- compensation_settings
CREATE POLICY "store_isolation" ON compensation_settings FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- cast_back_rates
CREATE POLICY "store_isolation" ON cast_back_rates FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- cast_daily_items
CREATE POLICY "store_isolation" ON cast_daily_items FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- cast_daily_stats
CREATE POLICY "store_isolation" ON cast_daily_stats FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- wage_statuses
CREATE POLICY "store_isolation" ON wage_statuses FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- special_wage_days
CREATE POLICY "store_isolation" ON special_wage_days FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- costumes
CREATE POLICY "store_isolation" ON costumes FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- store_wage_settings
CREATE POLICY "store_isolation" ON store_wage_settings FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- deduction_types
CREATE POLICY "store_isolation" ON deduction_types FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- cast_deductions
CREATE POLICY "store_isolation" ON cast_deductions FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- payslips
CREATE POLICY "store_isolation" ON payslips FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- base_settings
CREATE POLICY "store_isolation" ON base_settings FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- base_products
CREATE POLICY "store_isolation" ON base_products FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- base_variations
CREATE POLICY "store_isolation" ON base_variations FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- base_orders
CREATE POLICY "store_isolation" ON base_orders FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- orders
CREATE POLICY "store_isolation" ON orders FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- table_status
CREATE POLICY "store_isolation" ON table_status FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- cash_counts
CREATE POLICY "store_isolation" ON cash_counts FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- receipt_sequences
CREATE POLICY "store_isolation" ON receipt_sequences FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- receipt_settings
CREATE POLICY "store_isolation" ON receipt_settings FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- store_line_configs
CREATE POLICY "store_isolation" ON store_line_configs FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- line_register_requests
CREATE POLICY "store_isolation" ON line_register_requests FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- admin_emergency_logins（store_id=NULLのレコードも見れるように）
CREATE POLICY "store_isolation" ON admin_emergency_logins FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  OR store_id IS NULL
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- daily_reports
CREATE POLICY "store_isolation" ON daily_reports FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- monthly_targets
CREATE POLICY "store_isolation" ON monthly_targets FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- compensation_sample_receipts
CREATE POLICY "store_isolation" ON compensation_sample_receipts FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- visitor_reservations
CREATE POLICY "store_isolation" ON visitor_reservations FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- cast_positions
CREATE POLICY "store_isolation" ON cast_positions FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- product_categories
CREATE POLICY "store_isolation" ON product_categories FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- late_penalty_rules
CREATE POLICY "store_isolation" ON late_penalty_rules FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM deduction_types dt
    WHERE dt.id = late_penalty_rules.deduction_type_id
    AND dt.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM deduction_types dt
    WHERE dt.id = late_penalty_rules.deduction_type_id
    AND dt.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- late_penalty_tiers
CREATE POLICY "store_isolation" ON late_penalty_tiers FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM late_penalty_rules lpr
    JOIN deduction_types dt ON dt.id = lpr.deduction_type_id
    WHERE lpr.id = late_penalty_tiers.late_penalty_rule_id
    AND dt.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM late_penalty_rules lpr
    JOIN deduction_types dt ON dt.id = lpr.deduction_type_id
    WHERE lpr.id = late_penalty_tiers.late_penalty_rule_id
    AND dt.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- ================================================================
-- FK経由でstore_idに到達するテーブル
-- ================================================================

-- order_items (orders.store_id経由)
CREATE POLICY "store_isolation" ON order_items FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND o.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id
    AND o.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- payments (orders.store_id経由)
CREATE POLICY "store_isolation" ON payments FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = payments.order_id
    AND o.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = payments.order_id
    AND o.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- current_order_items (直接store_idを持っている)
CREATE POLICY "store_isolation" ON current_order_items FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- wage_status_conditions (wage_statuses.store_id経由)
CREATE POLICY "store_isolation" ON wage_status_conditions FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM wage_statuses ws
    WHERE ws.id = wage_status_conditions.status_id
    AND ws.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM wage_statuses ws
    WHERE ws.id = wage_status_conditions.status_id
    AND ws.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- compensation_sample_items (compensation_sample_receipts.store_id経由)
CREATE POLICY "store_isolation" ON compensation_sample_items FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM compensation_sample_receipts csr
    WHERE csr.id = compensation_sample_items.receipt_id
    AND csr.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM compensation_sample_receipts csr
    WHERE csr.id = compensation_sample_items.receipt_id
    AND csr.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- ================================================================
-- 特殊テーブル
-- ================================================================

-- stores（マスタテーブル）
CREATE POLICY "store_isolation" ON stores FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- users（POS認証用）
CREATE POLICY "store_isolation" ON users FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- casts_backup（バックアップ用、super_adminのみ）
CREATE POLICY "store_isolation" ON casts_backup FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);

-- ================================================================
-- 完了
-- ================================================================
