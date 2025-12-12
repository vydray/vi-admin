-- 報酬形態タブ機能のマイグレーション
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- ============================================
-- 1. compensation_settings テーブルに新カラムを追加
-- ============================================

-- 支給方法の選択 (highest: 高い方を支給, specific: 特定の報酬形態を使用)
ALTER TABLE compensation_settings
ADD COLUMN IF NOT EXISTS payment_selection_method VARCHAR(20) NOT NULL DEFAULT 'highest';

-- specific時に使用する報酬形態ID (UUID文字列)
ALTER TABLE compensation_settings
ADD COLUMN IF NOT EXISTS selected_compensation_type_id VARCHAR(36);

-- 報酬形態の配列 (JSONB)
-- 各要素の構造:
-- {
--   "id": "uuid-string",
--   "name": "報酬形態1",
--   "order_index": 0,
--   "is_enabled": true,
--   "sales_aggregation": "item_based" | "receipt_based",
--   "hourly_rate": 0,
--   "commission_rate": 50,
--   "fixed_amount": 0,
--   "use_sliding_rate": false,
--   "sliding_rates": [...],
--   "use_product_back": true,
--   "use_help_product_back": false,
--   "help_back_calculation_method": "ratio"
-- }
ALTER TABLE compensation_settings
ADD COLUMN IF NOT EXISTS compensation_types JSONB;

-- ============================================
-- 2. コメント追加
-- ============================================
COMMENT ON COLUMN compensation_settings.payment_selection_method IS '支給方法: highest=高い方を支給, specific=特定の報酬形態を使用';
COMMENT ON COLUMN compensation_settings.selected_compensation_type_id IS 'specific時に使用する報酬形態のID (UUID)';
COMMENT ON COLUMN compensation_settings.compensation_types IS '報酬形態の配列 (JSONB)';

-- ============================================
-- 3. 既存データのマイグレーション（オプション）
-- ============================================
-- 既存のcompensation_settings.sliding_ratesを報酬形態1に移行
-- 注: このマイグレーションは手動で確認してから実行することを推奨
/*
UPDATE compensation_settings
SET compensation_types = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', '報酬形態1',
    'order_index', 0,
    'is_enabled', true,
    'sales_aggregation', 'item_based',
    'hourly_rate', hourly_rate,
    'commission_rate', commission_rate,
    'fixed_amount', fixed_amount,
    'use_sliding_rate', COALESCE(sliding_rates IS NOT NULL AND jsonb_array_length(sliding_rates) > 0, false),
    'sliding_rates', COALESCE(sliding_rates, '[]'::jsonb),
    'use_product_back', use_product_back,
    'use_help_product_back', COALESCE(use_help_product_back, false),
    'help_back_calculation_method', COALESCE(help_back_calculation_method, 'ratio')
  ),
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', '報酬形態2',
    'order_index', 1,
    'is_enabled', use_sliding_comparison,
    'sales_aggregation', 'receipt_based',
    'hourly_rate', COALESCE(compare_hourly_rate, 0),
    'commission_rate', COALESCE(compare_commission_rate, 0),
    'fixed_amount', COALESCE(compare_fixed_amount, 0),
    'use_sliding_rate', false,
    'sliding_rates', NULL,
    'use_product_back', COALESCE(compare_use_product_back, false),
    'use_help_product_back', false,
    'help_back_calculation_method', 'ratio'
  )
)
WHERE compensation_types IS NULL;
*/

-- ============================================
-- 確認用クエリ
-- ============================================
-- SELECT id, cast_id, payment_selection_method, selected_compensation_type_id, compensation_types FROM compensation_settings LIMIT 10;
