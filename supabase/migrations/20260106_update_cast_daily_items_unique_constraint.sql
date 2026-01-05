-- cast_daily_itemsのユニーク制約を更新（help_cast_idを追加）
-- 同じ商品でも推し自身とヘルプで別レコードにできるようにする

-- 既存のユニーク制約を削除
ALTER TABLE cast_daily_items
DROP CONSTRAINT IF EXISTS cast_daily_items_cast_id_store_id_date_category_product_nam_key;

-- help_cast_id IS NULL の場合用（自分の売上）
CREATE UNIQUE INDEX IF NOT EXISTS cast_daily_items_self_unique_idx
ON cast_daily_items (cast_id, store_id, date, COALESCE(category, ''), product_name)
WHERE help_cast_id IS NULL;

-- help_cast_id IS NOT NULL の場合用（ヘルプ売上）
CREATE UNIQUE INDEX IF NOT EXISTS cast_daily_items_help_unique_idx
ON cast_daily_items (cast_id, store_id, date, COALESCE(category, ''), product_name, help_cast_id)
WHERE help_cast_id IS NOT NULL;
