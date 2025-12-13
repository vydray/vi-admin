-- 時給システム マイグレーション
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- ============================================
-- 1. wage_statuses テーブル（ステータス定義）
-- ============================================
CREATE TABLE IF NOT EXISTS wage_statuses (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  hourly_wage INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wage_statuses_store_id ON wage_statuses(store_id);

COMMENT ON TABLE wage_statuses IS '時給ステータス定義（研修、レギュラー、ゴールド等）';
COMMENT ON COLUMN wage_statuses.priority IS '優先度（高い方が優先）';
COMMENT ON COLUMN wage_statuses.is_default IS '新規キャストのデフォルトステータス';

-- ============================================
-- 2. wage_status_conditions テーブル（昇格/降格条件）
-- ============================================
CREATE TABLE IF NOT EXISTS wage_status_conditions (
  id SERIAL PRIMARY KEY,
  status_id INTEGER NOT NULL REFERENCES wage_statuses(id) ON DELETE CASCADE,
  condition_type VARCHAR(30) NOT NULL,  -- 'attendance_days', 'sales', 'nominations'
  operator VARCHAR(10) NOT NULL DEFAULT '>=',  -- '>=', '<=', '>', '<', '='
  value INTEGER NOT NULL,
  logic_group INTEGER NOT NULL DEFAULT 1,  -- 同グループはAND、別グループはOR
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wage_status_conditions_status_id ON wage_status_conditions(status_id);

COMMENT ON TABLE wage_status_conditions IS 'ステータス昇格/降格条件';
COMMENT ON COLUMN wage_status_conditions.condition_type IS '条件タイプ: attendance_days=出勤日数, sales=売上, nominations=指名本数';
COMMENT ON COLUMN wage_status_conditions.logic_group IS '同グループの条件はAND、別グループはOR';

-- ============================================
-- 3. special_wage_days テーブル（特別日カレンダー）
-- ============================================
CREATE TABLE IF NOT EXISTS special_wage_days (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  name VARCHAR(100) NOT NULL,
  wage_adjustment INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(store_id, date)
);

CREATE INDEX IF NOT EXISTS idx_special_wage_days_store_id ON special_wage_days(store_id);
CREATE INDEX IF NOT EXISTS idx_special_wage_days_date ON special_wage_days(store_id, date);

COMMENT ON TABLE special_wage_days IS '特別日カレンダー（クリスマス等の時給加算日）';
COMMENT ON COLUMN special_wage_days.wage_adjustment IS '時給調整額（+1000円等）';

-- ============================================
-- 4. costumes テーブル（衣装マスタ）
-- ============================================
CREATE TABLE IF NOT EXISTS costumes (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  wage_adjustment INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_costumes_store_id ON costumes(store_id);

COMMENT ON TABLE costumes IS '衣装マスタ（衣装ごとの時給調整）';
COMMENT ON COLUMN costumes.wage_adjustment IS '時給調整額（+500円等）';

-- ============================================
-- 5. store_wage_settings テーブル（店舗ルール）
-- ============================================
CREATE TABLE IF NOT EXISTS store_wage_settings (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  default_hourly_wage INTEGER NOT NULL DEFAULT 0,
  min_hours_for_full_day DECIMAL(4,2) NOT NULL DEFAULT 5.0,
  min_days_for_back INTEGER NOT NULL DEFAULT 5,
  wage_only_max_days INTEGER NOT NULL DEFAULT 4,
  first_month_exempt BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(store_id)
);

COMMENT ON TABLE store_wage_settings IS '店舗別時給ルール設定';
COMMENT ON COLUMN store_wage_settings.default_hourly_wage IS 'デフォルト時給';
COMMENT ON COLUMN store_wage_settings.min_hours_for_full_day IS '1日出勤とカウントする最低時間';
COMMENT ON COLUMN store_wage_settings.min_days_for_back IS 'バック対象となる最低出勤日数';
COMMENT ON COLUMN store_wage_settings.wage_only_max_days IS 'この日数以下は時給のみ（バックなし）';
COMMENT ON COLUMN store_wage_settings.first_month_exempt IS '入店初月はルールから除外';

-- ============================================
-- 6. compensation_settings に追加カラム
-- ============================================
ALTER TABLE compensation_settings
ADD COLUMN IF NOT EXISTS status_id INTEGER REFERENCES wage_statuses(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS status_locked BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS hourly_wage_override INTEGER,
ADD COLUMN IF NOT EXISTS min_days_rule_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS first_month_exempt_override BOOLEAN;

COMMENT ON COLUMN compensation_settings.status_id IS '固定ステータス（NULLなら自動計算）';
COMMENT ON COLUMN compensation_settings.status_locked IS 'ステータス固定フラグ';
COMMENT ON COLUMN compensation_settings.hourly_wage_override IS '時給直接指定（NULLならステータスの時給）';
COMMENT ON COLUMN compensation_settings.min_days_rule_enabled IS '最低日数ルール適用';
COMMENT ON COLUMN compensation_settings.first_month_exempt_override IS '入店初月除外（NULL=店舗設定に従う）';

-- ============================================
-- 7. attendance に追加カラム
-- ============================================
ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS costume_id INTEGER REFERENCES costumes(id) ON DELETE SET NULL;

COMMENT ON COLUMN attendance.costume_id IS 'その日着用した衣装';

-- ============================================
-- 8. RLSポリシー
-- ============================================
ALTER TABLE wage_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE wage_status_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_wage_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE costumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_wage_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_access ON wage_statuses;
CREATE POLICY allow_all_access ON wage_statuses FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_access ON wage_status_conditions;
CREATE POLICY allow_all_access ON wage_status_conditions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_access ON special_wage_days;
CREATE POLICY allow_all_access ON special_wage_days FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_access ON costumes;
CREATE POLICY allow_all_access ON costumes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_access ON store_wage_settings;
CREATE POLICY allow_all_access ON store_wage_settings FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 9. 更新日時自動更新トリガー
-- ============================================
CREATE OR REPLACE FUNCTION update_wage_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_wage_statuses_updated_at ON wage_statuses;
CREATE TRIGGER trigger_wage_statuses_updated_at
  BEFORE UPDATE ON wage_statuses
  FOR EACH ROW
  EXECUTE FUNCTION update_wage_tables_updated_at();

DROP TRIGGER IF EXISTS trigger_wage_status_conditions_updated_at ON wage_status_conditions;
CREATE TRIGGER trigger_wage_status_conditions_updated_at
  BEFORE UPDATE ON wage_status_conditions
  FOR EACH ROW
  EXECUTE FUNCTION update_wage_tables_updated_at();

DROP TRIGGER IF EXISTS trigger_special_wage_days_updated_at ON special_wage_days;
CREATE TRIGGER trigger_special_wage_days_updated_at
  BEFORE UPDATE ON special_wage_days
  FOR EACH ROW
  EXECUTE FUNCTION update_wage_tables_updated_at();

DROP TRIGGER IF EXISTS trigger_costumes_updated_at ON costumes;
CREATE TRIGGER trigger_costumes_updated_at
  BEFORE UPDATE ON costumes
  FOR EACH ROW
  EXECUTE FUNCTION update_wage_tables_updated_at();

DROP TRIGGER IF EXISTS trigger_store_wage_settings_updated_at ON store_wage_settings;
CREATE TRIGGER trigger_store_wage_settings_updated_at
  BEFORE UPDATE ON store_wage_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_wage_tables_updated_at();

-- ============================================
-- 10. 既存店舗へのデフォルト設定
-- ============================================
INSERT INTO store_wage_settings (store_id, default_hourly_wage, min_hours_for_full_day, min_days_for_back, wage_only_max_days, first_month_exempt)
SELECT id, 0, 5.0, 5, 4, true
FROM stores
WHERE NOT EXISTS (
  SELECT 1 FROM store_wage_settings WHERE store_wage_settings.store_id = stores.id
)
ON CONFLICT (store_id) DO NOTHING;
