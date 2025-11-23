-- shiftsテーブルにstore_id（店舗ID）カラムを追加するマイグレーション
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- 1. store_idカラムを追加
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS store_id INTEGER;

-- 2. 既存のデータに対してデフォルト値を設定（必要に応じて調整）
-- キャストのstore_idを参照して設定
UPDATE shifts
SET store_id = casts.store_id
FROM casts
WHERE shifts.cast_id = casts.id
  AND shifts.store_id IS NULL;

-- 3. インデックスを追加して店舗IDでの検索を高速化
CREATE INDEX IF NOT EXISTS idx_shifts_store_id ON shifts(store_id);
CREATE INDEX IF NOT EXISTS idx_shifts_store_date ON shifts(store_id, date);

-- 4. 確認用クエリ（実行後に確認してください）
-- SELECT id, cast_id, date, store_id FROM shifts ORDER BY store_id, date DESC LIMIT 20;
