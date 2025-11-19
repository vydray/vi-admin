-- ordersテーブルにorder_date（営業日）カラムを追加するマイグレーション
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- 1. order_dateカラムを追加
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS order_date TIMESTAMP WITH TIME ZONE;

-- 2. 既存のデータに対してorder_dateを計算して設定
-- デフォルト6時で計算（後でupdate-business-days.tsスクリプトで店舗ごとの設定値で再計算可能）
UPDATE orders
SET order_date = (
  CASE
    -- 日本時間で6時より前の場合、前日を営業日とする
    WHEN EXTRACT(HOUR FROM checkout_datetime AT TIME ZONE 'Asia/Tokyo') < 6
    THEN DATE_TRUNC('day', checkout_datetime AT TIME ZONE 'Asia/Tokyo' - INTERVAL '1 day')
    ELSE DATE_TRUNC('day', checkout_datetime AT TIME ZONE 'Asia/Tokyo')
  END
)
WHERE checkout_datetime IS NOT NULL
  AND order_date IS NULL;

-- 3. インデックスを追加してorder_dateでの検索を高速化
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_store_order_date ON orders(store_id, order_date);
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON orders(deleted_at);

-- 4. 確認用クエリ（実行後に確認してください）
-- SELECT id, checkout_datetime, order_date, store_id FROM orders ORDER BY checkout_datetime DESC LIMIT 10;
