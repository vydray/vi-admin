-- cast_daily_stats に時給関連カラムを追加
-- 日別の時給・勤務時間・給与を記録

ALTER TABLE cast_daily_stats
ADD COLUMN IF NOT EXISTS work_hours DECIMAL(4,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS base_hourly_wage INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS special_day_bonus INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS costume_bonus INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_hourly_wage INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS wage_amount INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS costume_id INT REFERENCES costumes(id),
ADD COLUMN IF NOT EXISTS wage_status_id INT REFERENCES wage_statuses(id);

-- コメント追加
COMMENT ON COLUMN cast_daily_stats.work_hours IS '勤務時間（時間単位、小数点2桁）';
COMMENT ON COLUMN cast_daily_stats.base_hourly_wage IS '基本時給（ステータスまたはオーバーライド）';
COMMENT ON COLUMN cast_daily_stats.special_day_bonus IS '特別日加算額';
COMMENT ON COLUMN cast_daily_stats.costume_bonus IS '衣装加算額';
COMMENT ON COLUMN cast_daily_stats.total_hourly_wage IS '合計時給（基本+特別日+衣装）';
COMMENT ON COLUMN cast_daily_stats.wage_amount IS '時給収入（合計時給×勤務時間）';
COMMENT ON COLUMN cast_daily_stats.costume_id IS 'その日着用した衣装ID';
COMMENT ON COLUMN cast_daily_stats.wage_status_id IS 'その日適用された時給ステータスID';

-- インデックス追加（月次集計用）
CREATE INDEX IF NOT EXISTS idx_cast_daily_stats_wage_lookup
ON cast_daily_stats(cast_id, date, wage_amount);
