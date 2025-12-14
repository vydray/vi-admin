-- 控除項目マスタ（店舗ごとに設定）
CREATE TABLE IF NOT EXISTS deduction_types (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  -- タイプ: percentage（%計算）, fixed（固定額）, penalty（罰金/ステータス連動）, manual（都度入力）
  type VARCHAR(20) NOT NULL DEFAULT 'fixed',
  -- %計算の場合の率（例: 10.21）
  percentage DECIMAL(5,2),
  -- 固定額の場合の金額
  default_amount INTEGER DEFAULT 0,
  -- 出勤ステータス連動の場合のステータスID
  attendance_status_id INTEGER REFERENCES attendance_statuses(id) ON DELETE SET NULL,
  -- 罰金の場合の1回あたりの金額
  penalty_amount INTEGER DEFAULT 0,
  -- 表示順
  display_order INTEGER DEFAULT 0,
  -- 有効/無効
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- キャスト別控除（月ごとの実績）
CREATE TABLE IF NOT EXISTS cast_deductions (
  id SERIAL PRIMARY KEY,
  cast_id INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- 対象年月（YYYY-MM形式）
  year_month VARCHAR(7) NOT NULL,
  -- 控除項目（NULLの場合はカスタム入力）
  deduction_type_id INTEGER REFERENCES deduction_types(id) ON DELETE SET NULL,
  -- カスタム名（deduction_type_idがNULLの場合に使用）
  custom_name VARCHAR(100),
  -- 控除額（マイナス値で保存）
  amount INTEGER NOT NULL,
  -- 回数（罰金の場合など）
  count INTEGER DEFAULT 1,
  -- メモ
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- 同じキャスト・月・控除項目の組み合わせはユニーク
  UNIQUE(cast_id, year_month, deduction_type_id, custom_name)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_deduction_types_store ON deduction_types(store_id);
CREATE INDEX IF NOT EXISTS idx_cast_deductions_cast_month ON cast_deductions(cast_id, year_month);
CREATE INDEX IF NOT EXISTS idx_cast_deductions_store_month ON cast_deductions(store_id, year_month);

-- RLS有効化
ALTER TABLE deduction_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE cast_deductions ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: deduction_types
CREATE POLICY "deduction_types_select" ON deduction_types FOR SELECT USING (true);
CREATE POLICY "deduction_types_insert" ON deduction_types FOR INSERT WITH CHECK (true);
CREATE POLICY "deduction_types_update" ON deduction_types FOR UPDATE USING (true);
CREATE POLICY "deduction_types_delete" ON deduction_types FOR DELETE USING (true);

-- RLSポリシー: cast_deductions
CREATE POLICY "cast_deductions_select" ON cast_deductions FOR SELECT USING (true);
CREATE POLICY "cast_deductions_insert" ON cast_deductions FOR INSERT WITH CHECK (true);
CREATE POLICY "cast_deductions_update" ON cast_deductions FOR UPDATE USING (true);
CREATE POLICY "cast_deductions_delete" ON cast_deductions FOR DELETE USING (true);

-- 更新日時の自動更新トリガー
CREATE OR REPLACE FUNCTION update_deduction_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_deduction_types_updated_at
  BEFORE UPDATE ON deduction_types
  FOR EACH ROW
  EXECUTE FUNCTION update_deduction_updated_at();

CREATE TRIGGER update_cast_deductions_updated_at
  BEFORE UPDATE ON cast_deductions
  FOR EACH ROW
  EXECUTE FUNCTION update_deduction_updated_at();

-- サンプルデータ（store_id=3用）
-- INSERT INTO deduction_types (store_id, name, type, percentage, display_order) VALUES
--   (3, '源泉徴収', 'percentage', 10.21, 1),
--   (3, '日払い', 'manual', NULL, 2),
--   (3, '前借り', 'manual', NULL, 3),
--   (3, '寮費', 'fixed', NULL, 4);
