-- cast_daily_items に is_self カラムを追加
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- ============================================
-- 1. is_self カラムを追加
-- ============================================

-- カラム追加
ALTER TABLE cast_daily_items
ADD COLUMN IF NOT EXISTS is_self BOOLEAN NOT NULL DEFAULT TRUE;

-- 既存のユニーク制約を削除
ALTER TABLE cast_daily_items
DROP CONSTRAINT IF EXISTS cast_daily_items_cast_id_store_id_date_category_product_name_key;

-- 新しいユニーク制約を追加（is_selfを含む）
ALTER TABLE cast_daily_items
ADD CONSTRAINT cast_daily_items_unique_key
UNIQUE(cast_id, store_id, date, category, product_name, is_self);

-- コメント追加
COMMENT ON COLUMN cast_daily_items.is_self IS '推し売上かどうか（true=推し、false=ヘルプ）';

-- ============================================
-- 確認用クエリ
-- ============================================
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'cast_daily_items';

-- 商品別・推し/ヘルプ別の売上確認例
-- SELECT
--   c.name as cast_name,
--   i.date,
--   i.category,
--   i.product_name,
--   i.is_self,
--   i.quantity,
--   i.subtotal,
--   i.back_amount
-- FROM cast_daily_items i
-- JOIN casts c ON c.id = i.cast_id
-- WHERE i.store_id = 1
--   AND i.date = '2024-12-14'
-- ORDER BY c.name, i.is_self DESC, i.category, i.product_name;
