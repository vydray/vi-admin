-- 保証時給の累計上限を超えた後の挙動設定
-- 'zero': 上限超過後はこの形態の wage = 0（highest 比較で他形態が勝つ前提）
-- 'bracket': 上限超過後は sales_based_wage_brackets を参照して時給確定
-- 将来的に 'fixed' (固定レート) などを追加可能なように JSONB で保持
ALTER TABLE store_wage_settings
  ADD COLUMN IF NOT EXISTS guaranteed_wage_after_threshold JSONB DEFAULT '{"mode":"zero"}'::jsonb;

COMMENT ON COLUMN store_wage_settings.guaranteed_wage_after_threshold IS '保証時給の累計上限を超えた後の挙動。{ "mode": "zero" | "bracket" } で設定';

-- Mary Mare (store_id=7) はブラケット切替を初期値に設定
UPDATE store_wage_settings
SET guaranteed_wage_after_threshold = '{"mode":"bracket"}'::jsonb,
    updated_at = NOW()
WHERE store_id = 7;
