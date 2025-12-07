-- キャスト報酬設定をcast_back_ratesに集約
-- 1. cast_back_ratesテーブルにhourly_wageカラムを追加
-- 2. 既存のキャストのhourly_wageをデフォルト設定として移行
-- 3. castsテーブルからhourly_wageとcommission_rateカラムを削除

-- Step 1: hourly_wageカラムを追加
ALTER TABLE cast_back_rates ADD COLUMN IF NOT EXISTS hourly_wage INTEGER DEFAULT NULL;

-- Step 2: 既存のキャストからhourly_wageを移行（デフォルト設定として）
-- category=null, product_name=null のエントリがデフォルト設定
INSERT INTO cast_back_rates (cast_id, store_id, category, product_name, back_type, back_ratio, back_fixed_amount, self_back_ratio, help_back_ratio, hourly_wage, is_active)
SELECT
    c.id as cast_id,
    c.store_id,
    NULL as category,
    NULL as product_name,
    'ratio' as back_type,
    COALESCE(c.commission_rate * 100, 0) as back_ratio,
    0 as back_fixed_amount,
    COALESCE(c.commission_rate * 100, 0) as self_back_ratio,
    NULL as help_back_ratio,
    c.hourly_wage,
    true as is_active
FROM casts c
WHERE c.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM cast_back_rates cbr
    WHERE cbr.cast_id = c.id
      AND cbr.category IS NULL
      AND cbr.product_name IS NULL
      AND cbr.is_active = true
  );

-- Step 3: castsテーブルからカラムを削除（オプション - 必要に応じてコメント解除）
-- ALTER TABLE casts DROP COLUMN IF EXISTS hourly_wage;
-- ALTER TABLE casts DROP COLUMN IF EXISTS commission_rate;

-- NOTE: Step 3を実行する前に、アプリケーションコードが更新されていることを確認してください
