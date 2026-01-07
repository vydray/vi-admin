-- cast_daily_itemsにテーブル情報を追加
ALTER TABLE cast_daily_items
ADD COLUMN table_number TEXT,
ADD COLUMN guest_name TEXT;

COMMENT ON COLUMN cast_daily_items.table_number IS 'テーブル番号';
COMMENT ON COLUMN cast_daily_items.guest_name IS 'お客様名';
