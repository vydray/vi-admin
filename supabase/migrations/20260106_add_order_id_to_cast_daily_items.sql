-- cast_daily_itemsにorder_idを追加（伝票単位で確認できるように）

-- order_idカラム追加
ALTER TABLE cast_daily_items
ADD COLUMN order_id UUID REFERENCES orders(id) ON DELETE CASCADE;

-- コメント追加
COMMENT ON COLUMN cast_daily_items.order_id IS '元の伝票ID（伝票単位で確認用）';

-- 既存のインデックスを削除
DROP INDEX IF EXISTS cast_daily_items_self_unique_idx;
DROP INDEX IF EXISTS cast_daily_items_help_unique_idx;

-- 新しいユニーク制約（order_idを含む）
-- help_cast_id IS NULL の場合用
CREATE UNIQUE INDEX cast_daily_items_self_unique_idx
ON cast_daily_items (cast_id, store_id, date, order_id, COALESCE(category, ''), product_name)
WHERE help_cast_id IS NULL;

-- help_cast_id IS NOT NULL の場合用
CREATE UNIQUE INDEX cast_daily_items_help_unique_idx
ON cast_daily_items (cast_id, store_id, date, order_id, COALESCE(category, ''), product_name, help_cast_id)
WHERE help_cast_id IS NOT NULL;

-- order_idのインデックス（伝票検索用）
CREATE INDEX idx_cast_daily_items_order_id ON cast_daily_items(order_id) WHERE order_id IS NOT NULL;
