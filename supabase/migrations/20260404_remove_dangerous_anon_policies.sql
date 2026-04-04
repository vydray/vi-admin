-- 6テーブルの危険なanon/PUBLICポリシーを削除
-- クライアントコンポーネントからの直接アクセスは全てAPI Route (service_role) 経由に移行済み
--
-- 対象テーブル:
--   store_line_configs  - LINE channel access token が anon key で取得可能だった
--   base_settings       - BASE OAuth token が anon key で取得可能だった
--   base_orders         - BASE注文データが anon key で読み書き可能だった
--   base_products       - BASE商品データが anon key で読み書き可能だった
--   base_variations     - BASEバリエーションが anon key で読み書き可能だった
--   store_twitter_settings - Twitter API keys が PUBLIC で取得可能だった

-- 1. base_orders: anon ALL を削除（authenticated ポリシーは残す）
DROP POLICY IF EXISTS "Allow all for anon users" ON base_orders;

-- 2. base_products: anon ALL を削除（authenticated ポリシーは残す）
DROP POLICY IF EXISTS "Allow all for anon users" ON base_products;

-- 3. base_settings: anon ALL を削除（authenticated ポリシーは残す）
DROP POLICY IF EXISTS "Allow all for anon users" ON base_settings;

-- 4. base_variations: anon ALL を削除（authenticated ポリシーは残す）
DROP POLICY IF EXISTS "Allow all for anon users" ON base_variations;

-- 5. store_line_configs: anon ALL を削除（super_admin_only は残す）
DROP POLICY IF EXISTS "allow_anon_all" ON store_line_configs;

-- 6. store_twitter_settings: PUBLIC ALL を削除して authenticated ALL に置き換え
DROP POLICY IF EXISTS "Allow authenticated users to manage twitter settings" ON store_twitter_settings;
CREATE POLICY "authenticated_manage_twitter_settings" ON store_twitter_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
