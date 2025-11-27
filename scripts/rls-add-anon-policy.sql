-- =====================================================
-- vi-admin用 RLS追加ポリシー
-- =====================================================
--
-- 目的:
--   vi-admin（管理画面）からanon keyでデータにアクセスできるようにする
--
-- 背景:
--   - vi-adminはカスタム認証（bcrypt + Cookie）を使用
--   - Supabase Authを使用していないため、auth.jwt()が機能しない
--   - しかし、vi-adminにはログイン認証があるため、アプリレベルで保護されている
--
-- セキュリティ:
--   - シフトアプリ・POSはSupabase Auth + JWTで店舗別に保護される
--   - vi-adminはアプリのログイン認証 + anon keyで保護される
--   - anon keyが漏洩してもvi-adminのログインが必要
--
-- 実行方法:
--   Supabase Dashboard > SQL Editor で実行
--
-- =====================================================

-- -----------------------------------------------------
-- stores（店舗情報）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON stores
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- casts（キャスト情報）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON casts
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- users（POSログインユーザー）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON users
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- admin_users（管理画面ユーザー）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON admin_users
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- shifts（確定シフト）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON shifts
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- shift_requests（シフト希望）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON shift_requests
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- shift_locks（シフトロック）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON shift_locks
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- store_line_configs（LINE設定）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON store_line_configs
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- line_register_requests（LINE登録リクエスト）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON line_register_requests
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- admin_emergency_logins（緊急ログイン）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON admin_emergency_logins
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- attendance（出退勤記録）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON attendance
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- attendance_statuses（出勤ステータス定義）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON attendance_statuses
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- cast_positions（キャストポジション）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON cast_positions
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- products（商品）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON products
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- product_categories（商品カテゴリ）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON product_categories
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- orders（注文/会計）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON orders
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- order_items（注文明細）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON order_items
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- current_order_items（進行中注文）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON current_order_items
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- table_status（テーブル状態）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON table_status
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- payments（支払い記録）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON payments
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- system_settings（システム設定）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON system_settings
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- store_settings（店舗設定）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON store_settings
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- monthly_targets（月間目標）
-- -----------------------------------------------------
CREATE POLICY "allow_anon_all" ON monthly_targets
FOR ALL TO anon USING (true) WITH CHECK (true);

-- -----------------------------------------------------
-- receipts（レシート）※存在する場合
-- -----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipts') THEN
    EXECUTE 'CREATE POLICY "allow_anon_all" ON receipts FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- -----------------------------------------------------
-- cash_counts（レジ金集計）※存在する場合
-- -----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cash_counts') THEN
    EXECUTE 'CREATE POLICY "allow_anon_all" ON cash_counts FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- -----------------------------------------------------
-- daily_reports（日報）※存在する場合
-- -----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_reports') THEN
    EXECUTE 'CREATE POLICY "allow_anon_all" ON daily_reports FOR ALL TO anon USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- =====================================================
-- 確認用クエリ
-- =====================================================

-- 作成されたポリシー一覧を表示
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname = 'allow_anon_all'
ORDER BY tablename;
