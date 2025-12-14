-- 控除項目マスタ（店舗ごとに設定）
CREATE TABLE IF NOT EXISTS deduction_types (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  -- タイプ:
  -- percentage: %計算（源泉徴収など）
  -- fixed: 固定額（寮費など）
  -- penalty_status: ステータス連動罰金（当欠、無欠など）
  -- penalty_late: 遅刻罰金（late_minutesベース）
  -- daily_payment: 日払い（attendanceから自動取得）
  -- manual: 都度入力（前借りなど）
  type VARCHAR(20) NOT NULL DEFAULT 'fixed',
  -- %計算の場合の率（例: 10.21）
  percentage DECIMAL(5,2),
  -- 固定額の場合の金額
  default_amount INTEGER DEFAULT 0,
  -- ステータス連動の場合のステータスID（attendance_statuses.id）
  attendance_status_id UUID REFERENCES attendance_statuses(id) ON DELETE SET NULL,
  -- ステータス連動罰金の1回あたりの金額
  penalty_amount INTEGER DEFAULT 0,
  -- 表示順
  display_order INTEGER DEFAULT 0,
  -- 有効/無効
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 遅刻罰金ルール
CREATE TABLE IF NOT EXISTS late_penalty_rules (
  id SERIAL PRIMARY KEY,
  deduction_type_id INTEGER NOT NULL REFERENCES deduction_types(id) ON DELETE CASCADE,
  -- 計算方式: fixed（固定）, tiered（段階式）, cumulative（累積）
  calculation_type VARCHAR(20) NOT NULL DEFAULT 'fixed',
  -- 固定式の場合: 遅刻1回あたりの罰金
  fixed_amount INTEGER DEFAULT 0,
  -- 累積式の場合: 何分毎に
  interval_minutes INTEGER DEFAULT 15,
  -- 累積式の場合: 1インターバルあたりの罰金
  amount_per_interval INTEGER DEFAULT 0,
  -- 累積式の場合: 最大罰金額（0=上限なし）
  max_amount INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 遅刻罰金の段階式ルール（calculation_type='tiered'の場合に使用）
CREATE TABLE IF NOT EXISTS late_penalty_tiers (
  id SERIAL PRIMARY KEY,
  late_penalty_rule_id INTEGER NOT NULL REFERENCES late_penalty_rules(id) ON DELETE CASCADE,
  -- 何分以上
  minutes_from INTEGER NOT NULL DEFAULT 0,
  -- 何分未満（NULLの場合は上限なし）
  minutes_to INTEGER,
  -- 罰金額
  penalty_amount INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
  -- 自動計算フラグ（true=勤怠から自動計算、false=手入力）
  is_auto_calculated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- 同じキャスト・月・控除項目の組み合わせはユニーク
  UNIQUE(cast_id, year_month, deduction_type_id, custom_name)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_deduction_types_store ON deduction_types(store_id);
CREATE INDEX IF NOT EXISTS idx_deduction_types_status ON deduction_types(attendance_status_id);
CREATE INDEX IF NOT EXISTS idx_late_penalty_rules_type ON late_penalty_rules(deduction_type_id);
CREATE INDEX IF NOT EXISTS idx_late_penalty_tiers_rule ON late_penalty_tiers(late_penalty_rule_id);
CREATE INDEX IF NOT EXISTS idx_cast_deductions_cast_month ON cast_deductions(cast_id, year_month);
CREATE INDEX IF NOT EXISTS idx_cast_deductions_store_month ON cast_deductions(store_id, year_month);

-- RLS有効化
ALTER TABLE deduction_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE late_penalty_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE late_penalty_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cast_deductions ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: deduction_types
CREATE POLICY "deduction_types_select" ON deduction_types FOR SELECT USING (true);
CREATE POLICY "deduction_types_insert" ON deduction_types FOR INSERT WITH CHECK (true);
CREATE POLICY "deduction_types_update" ON deduction_types FOR UPDATE USING (true);
CREATE POLICY "deduction_types_delete" ON deduction_types FOR DELETE USING (true);

-- RLSポリシー: late_penalty_rules
CREATE POLICY "late_penalty_rules_select" ON late_penalty_rules FOR SELECT USING (true);
CREATE POLICY "late_penalty_rules_insert" ON late_penalty_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "late_penalty_rules_update" ON late_penalty_rules FOR UPDATE USING (true);
CREATE POLICY "late_penalty_rules_delete" ON late_penalty_rules FOR DELETE USING (true);

-- RLSポリシー: late_penalty_tiers
CREATE POLICY "late_penalty_tiers_select" ON late_penalty_tiers FOR SELECT USING (true);
CREATE POLICY "late_penalty_tiers_insert" ON late_penalty_tiers FOR INSERT WITH CHECK (true);
CREATE POLICY "late_penalty_tiers_update" ON late_penalty_tiers FOR UPDATE USING (true);
CREATE POLICY "late_penalty_tiers_delete" ON late_penalty_tiers FOR DELETE USING (true);

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

-- コメント
COMMENT ON TABLE deduction_types IS '控除項目マスタ（店舗ごと）';
COMMENT ON COLUMN deduction_types.type IS 'percentage: %計算, fixed: 固定額, penalty_status: ステータス連動罰金, penalty_late: 遅刻罰金, daily_payment: 日払い自動, manual: 都度入力';
COMMENT ON TABLE late_penalty_rules IS '遅刻罰金ルール（段階式）';
COMMENT ON TABLE cast_deductions IS 'キャスト別控除（月ごと）';
