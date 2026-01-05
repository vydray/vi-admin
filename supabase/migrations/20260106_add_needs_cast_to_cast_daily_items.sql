-- cast_daily_itemsにneeds_castカラムを追加
-- ランキング表示時に指名必須の商品だけをフィルタするため

ALTER TABLE cast_daily_items
ADD COLUMN needs_cast BOOLEAN NOT NULL DEFAULT TRUE;

-- コメント追加
COMMENT ON COLUMN cast_daily_items.needs_cast IS '指名必須商品か（falseならランキング非表示）';

-- インデックス追加（ランキングフィルタ用）
CREATE INDEX idx_cast_daily_items_needs_cast ON cast_daily_items(needs_cast) WHERE needs_cast = true;
