-- 報酬明細テーブル
CREATE TABLE IF NOT EXISTS payslips (
  id SERIAL PRIMARY KEY,
  cast_id INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  year_month VARCHAR(7) NOT NULL, -- "2024-12" 形式
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- 'draft' | 'finalized'

  -- サマリー
  work_days INTEGER NOT NULL DEFAULT 0,           -- 出勤日数
  total_hours DECIMAL(10,2) NOT NULL DEFAULT 0,   -- 勤務時間合計
  average_hourly_wage INTEGER NOT NULL DEFAULT 0, -- 平均時給
  hourly_income INTEGER NOT NULL DEFAULT 0,       -- 時給収入
  sales_back INTEGER NOT NULL DEFAULT 0,          -- 売上バック
  product_back INTEGER NOT NULL DEFAULT 0,        -- 商品バック
  gross_total INTEGER NOT NULL DEFAULT 0,         -- 総支給額
  total_deduction INTEGER NOT NULL DEFAULT 0,     -- 控除合計
  net_payment INTEGER NOT NULL DEFAULT 0,         -- 差引支給額

  -- 詳細 (JSONB)
  daily_details JSONB DEFAULT '[]'::jsonb,        -- 日別明細
  product_back_details JSONB DEFAULT '[]'::jsonb, -- 商品バック詳細
  deduction_details JSONB DEFAULT '[]'::jsonb,    -- 控除内訳

  -- タイムスタンプ
  finalized_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- ユニーク制約: 1キャスト1月に1レコード
  UNIQUE(cast_id, store_id, year_month)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_payslips_store_year_month ON payslips(store_id, year_month);
CREATE INDEX IF NOT EXISTS idx_payslips_cast_id ON payslips(cast_id);
CREATE INDEX IF NOT EXISTS idx_payslips_status ON payslips(status);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_payslips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_payslips_updated_at ON payslips;
CREATE TRIGGER trigger_payslips_updated_at
  BEFORE UPDATE ON payslips
  FOR EACH ROW
  EXECUTE FUNCTION update_payslips_updated_at();

-- RLS有効化
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

-- RLSポリシー（認証済みユーザーのみ）
CREATE POLICY "payslips_select" ON payslips FOR SELECT TO authenticated USING (true);
CREATE POLICY "payslips_insert" ON payslips FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "payslips_update" ON payslips FOR UPDATE TO authenticated USING (true);
CREATE POLICY "payslips_delete" ON payslips FOR DELETE TO authenticated USING (true);
