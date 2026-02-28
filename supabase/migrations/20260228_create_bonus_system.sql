-- 賞与システム: テーブル作成 + 既存テーブル変更

-- 1. bonus_types: 賞与ルール定義
CREATE TABLE IF NOT EXISTS bonus_types (
  id SERIAL PRIMARY KEY,
  store_id INT NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL,
  bonus_category TEXT NOT NULL CHECK (bonus_category IN ('sales', 'attendance', 'nomination', 'manual')),
  conditions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. cast_bonuses: 手動賞与
CREATE TABLE IF NOT EXISTS cast_bonuses (
  id SERIAL PRIMARY KEY,
  store_id INT NOT NULL REFERENCES stores(id),
  cast_id INT NOT NULL REFERENCES casts(id),
  bonus_type_id INT REFERENCES bonus_types(id) ON DELETE SET NULL,
  year_month TEXT NOT NULL,
  amount INT NOT NULL,
  name TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. compensation_settings に enabled_bonus_ids 追加
ALTER TABLE compensation_settings
  ADD COLUMN IF NOT EXISTS enabled_bonus_ids INT[];

-- 4. payslips に bonus_total, bonus_details 追加
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS bonus_total INT DEFAULT 0;
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS bonus_details JSONB;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_bonus_types_store ON bonus_types(store_id);
CREATE INDEX IF NOT EXISTS idx_cast_bonuses_store_month ON cast_bonuses(store_id, year_month);
CREATE INDEX IF NOT EXISTS idx_cast_bonuses_cast_month ON cast_bonuses(cast_id, year_month);

-- RLS有効化
ALTER TABLE bonus_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE cast_bonuses ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: service_role は全アクセス可
CREATE POLICY "service_role_bonus_types" ON bonus_types FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_cast_bonuses" ON cast_bonuses FOR ALL TO service_role USING (true) WITH CHECK (true);
