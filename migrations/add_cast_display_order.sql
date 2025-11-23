-- castsテーブルにdisplay_order（表示順序）カラムを追加するマイグレーション
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- 1. display_orderカラムを追加
ALTER TABLE casts
ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- 2. 既存のデータに対して店舗ごとに連番を設定（名前順を維持）
WITH ranked_casts AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY name) AS row_num
  FROM casts
  WHERE display_order IS NULL
)
UPDATE casts
SET display_order = ranked_casts.row_num
FROM ranked_casts
WHERE casts.id = ranked_casts.id;

-- 3. インデックスを追加して並び替えを高速化
CREATE INDEX IF NOT EXISTS idx_casts_store_display_order ON casts(store_id, display_order);

-- 4. 確認用クエリ（実行後に確認してください）
-- SELECT id, name, store_id, display_order FROM casts ORDER BY store_id, display_order LIMIT 20;
