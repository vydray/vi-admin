-- 報酬再計算 変更ログテーブル
CREATE TABLE payslip_recalculation_logs (
  id SERIAL PRIMARY KEY,
  batch_id UUID NOT NULL,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  cast_id INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  cast_name VARCHAR(100) NOT NULL,
  year_month VARCHAR(7) NOT NULL,
  triggered_by VARCHAR(10) NOT NULL DEFAULT 'manual',
  before_values JSONB NOT NULL,
  after_values JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recalc_logs_store_month ON payslip_recalculation_logs(store_id, year_month);
CREATE INDEX idx_recalc_logs_batch ON payslip_recalculation_logs(batch_id);
CREATE INDEX idx_recalc_logs_created ON payslip_recalculation_logs(created_at DESC);
