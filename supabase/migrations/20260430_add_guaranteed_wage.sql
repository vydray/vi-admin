-- 入店日から累計N時間まで「保証時給」を適用するための設定
-- 売上連動時給を使う店舗向けの新人保護ロジック
-- 累計時間が threshold を超えたら通常の sales_based_wage_brackets に切り替わる
-- 境界日は時間で厳密分割（例: 累計97h で当日4h勤務 → 3h保証 + 1h通常）

ALTER TABLE store_wage_settings ADD COLUMN IF NOT EXISTS guaranteed_wage_threshold_hours INTEGER;
ALTER TABLE store_wage_settings ADD COLUMN IF NOT EXISTS guaranteed_wage_rates JSONB;

COMMENT ON COLUMN store_wage_settings.guaranteed_wage_threshold_hours IS '保証時給を適用する累計勤務時間の閾値（NULL=保証時給なし）。例:100';
COMMENT ON COLUMN store_wage_settings.guaranteed_wage_rates IS 'クラスラベル→保証時給のマップ（例:{"A":2500,"B":2600,"C":2700}）';

-- Mary Mare (store_id=7) の保証時給設定
-- store_wage_settings の行が無い可能性があるので upsert
INSERT INTO store_wage_settings (store_id, min_hours_for_full_day, min_days_for_back, wage_only_max_days, first_month_exempt, guaranteed_wage_threshold_hours, guaranteed_wage_rates)
VALUES (7, 5.0, 5, 4, true, 100, '{"A":2500,"B":2600,"C":2700}'::jsonb)
ON CONFLICT (store_id) DO UPDATE
SET guaranteed_wage_threshold_hours = EXCLUDED.guaranteed_wage_threshold_hours,
    guaranteed_wage_rates = EXCLUDED.guaranteed_wage_rates,
    updated_at = NOW();
