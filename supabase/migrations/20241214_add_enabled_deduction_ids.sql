-- compensation_settingsテーブルにキャスト別の有効控除IDリストを追加
ALTER TABLE compensation_settings ADD COLUMN IF NOT EXISTS enabled_deduction_ids INTEGER[] DEFAULT '{}';

-- コメント
COMMENT ON COLUMN compensation_settings.enabled_deduction_ids IS 'このキャストに適用する控除項目のID配列';
