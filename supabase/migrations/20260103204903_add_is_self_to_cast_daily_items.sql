-- cast_daily_itemsにis_selfカラムを追加（自分の卓かヘルプか）
ALTER TABLE cast_daily_items
ADD COLUMN is_self BOOLEAN NOT NULL DEFAULT TRUE;

-- 既存データは判別できないため全てTRUE（指名）として扱う
-- 再計算で正しい値が設定される
