-- =====================================================
-- RLS (Row Level Security) 適用SQL
-- =====================================================
--
-- 実行方法: Supabase Dashboard > SQL Editor で実行
--
-- 注意事項:
-- 1. 既存ポリシーがある場合は先に削除されます
-- 2. 全テーブルのRLSが有効化されます
-- 3. 実行前に各アプリのSupabase Auth連携が完了していること
--
-- =====================================================

-- =====================================================
-- 1. 既存ポリシーを削除（クリーンアップ）
-- =====================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
            r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- =====================================================
-- 2. 各テーブルのRLSを有効化＆ポリシー作成
-- =====================================================

-- -----------------------------------------------------
-- stores（店舗情報）- SELECT only, idで判定
-- -----------------------------------------------------
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores_select_own" ON stores
FOR SELECT USING (
  id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- casts（キャスト情報）
-- -----------------------------------------------------
ALTER TABLE casts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "casts_all_own_store" ON casts
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- users（POSログインユーザー）
-- -----------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_all_own_store" ON users
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- admin_users（管理画面ユーザー）
-- -----------------------------------------------------
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_users_all_own_store" ON admin_users
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- shifts（確定シフト）
-- -----------------------------------------------------
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shifts_all_own_store" ON shifts
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- shift_requests（シフト希望）
-- -----------------------------------------------------
ALTER TABLE shift_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift_requests_all_own_store" ON shift_requests
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- shift_locks（シフトロック）
-- -----------------------------------------------------
ALTER TABLE shift_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift_locks_all_own_store" ON shift_locks
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- store_line_configs（LINE設定）
-- -----------------------------------------------------
ALTER TABLE store_line_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_line_configs_all_own_store" ON store_line_configs
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- line_register_requests（LINE登録リクエスト）
-- -----------------------------------------------------
ALTER TABLE line_register_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "line_register_requests_all_own_store" ON line_register_requests
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- admin_emergency_logins（緊急ログイン）
-- -----------------------------------------------------
ALTER TABLE admin_emergency_logins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_emergency_logins_all_own_store" ON admin_emergency_logins
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- attendance（出退勤記録）
-- -----------------------------------------------------
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_all_own_store" ON attendance
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- attendance_statuses（出勤ステータス定義）
-- -----------------------------------------------------
ALTER TABLE attendance_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_statuses_all_own_store" ON attendance_statuses
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- cast_positions（キャストポジション）
-- -----------------------------------------------------
ALTER TABLE cast_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cast_positions_all_own_store" ON cast_positions
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- products（商品）
-- -----------------------------------------------------
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_all_own_store" ON products
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- product_categories（商品カテゴリ）
-- -----------------------------------------------------
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_categories_all_own_store" ON product_categories
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- orders（注文/会計）
-- -----------------------------------------------------
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_all_own_store" ON orders
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- order_items（注文明細）
-- -----------------------------------------------------
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_all_own_store" ON order_items
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- current_order_items（進行中注文）
-- -----------------------------------------------------
ALTER TABLE current_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "current_order_items_all_own_store" ON current_order_items
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- table_status（テーブル状態）
-- -----------------------------------------------------
ALTER TABLE table_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "table_status_all_own_store" ON table_status
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- payments（支払い記録）
-- -----------------------------------------------------
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_all_own_store" ON payments
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- system_settings（システム設定）
-- -----------------------------------------------------
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_settings_all_own_store" ON system_settings
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- store_settings（店舗設定）
-- -----------------------------------------------------
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_settings_all_own_store" ON store_settings
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- monthly_targets（月間目標）
-- -----------------------------------------------------
ALTER TABLE monthly_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly_targets_all_own_store" ON monthly_targets
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- receipts（レシートストレージ）※存在する場合
-- -----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipts') THEN
    ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "receipts_all_own_store" ON receipts
    FOR ALL USING (
      store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    );
  END IF;
END $$;

-- -----------------------------------------------------
-- cash_counts（レジ金集計）※存在する場合
-- -----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cash_counts') THEN
    ALTER TABLE cash_counts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "cash_counts_all_own_store" ON cash_counts
    FOR ALL USING (
      store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    );
  END IF;
END $$;

-- -----------------------------------------------------
-- daily_reports（日報）※存在する場合
-- -----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_reports') THEN
    ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "daily_reports_all_own_store" ON daily_reports
    FOR ALL USING (
      store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    );
  END IF;
END $$;

-- =====================================================
-- 3. 確認用クエリ
-- =====================================================

-- RLSが有効なテーブル一覧を表示
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = true
ORDER BY tablename;

-- 作成されたポリシー一覧を表示
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
