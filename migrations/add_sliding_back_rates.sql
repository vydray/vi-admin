-- 商品バック率スライド機能のマイグレーション
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- ============================================
-- 1. cast_back_rates テーブルに新カラムを追加
-- ============================================

-- スライド式バック率を使用するか
ALTER TABLE cast_back_rates
ADD COLUMN IF NOT EXISTS use_sliding_back BOOLEAN NOT NULL DEFAULT false;

-- スライド率の売上計算方法 (item_based: 推し小計, receipt_based: 伝票小計)
ALTER TABLE cast_back_rates
ADD COLUMN IF NOT EXISTS back_sales_aggregation VARCHAR(20) NOT NULL DEFAULT 'item_based';

-- スライド率テーブル (JSONB)
-- 各要素の構造:
-- {
--   "min": 0,           -- 売上下限
--   "max": 50000,       -- 売上上限 (0 or null = 上限なし)
--   "rate": 10          -- バック率 (%)
-- }
ALTER TABLE cast_back_rates
ADD COLUMN IF NOT EXISTS sliding_back_rates JSONB;

-- ============================================
-- 2. コメント追加
-- ============================================
COMMENT ON COLUMN cast_back_rates.use_sliding_back IS 'スライド式バック率を使用するか';
COMMENT ON COLUMN cast_back_rates.back_sales_aggregation IS '売上計算方法: item_based=推し小計, receipt_based=伝票小計';
COMMENT ON COLUMN cast_back_rates.sliding_back_rates IS 'スライド率テーブル (JSONB形式)';

-- ============================================
-- 確認用クエリ
-- ============================================
-- SELECT id, cast_id, category, product_name, back_type, back_ratio, use_sliding_back, back_sales_aggregation, sliding_back_rates FROM cast_back_rates LIMIT 10;
