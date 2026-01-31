-- 報酬明細用の商品明細テーブル
CREATE TABLE IF NOT EXISTS payslip_items (
  id BIGSERIAL PRIMARY KEY,
  cast_id BIGINT NOT NULL,
  store_id INT NOT NULL,
  date DATE NOT NULL,
  year_month TEXT NOT NULL,  -- '2026-01' 形式

  -- 商品情報
  product_name TEXT NOT NULL,
  category TEXT,
  quantity INT NOT NULL,

  -- 金額（分配済み）
  subtotal INT NOT NULL,  -- 売上金額（このキャストの分）
  back_ratio DECIMAL(5,2),  -- バック率（%）
  back_amount INT NOT NULL,  -- バック額（円）

  -- 分類
  sales_type TEXT NOT NULL,  -- 'self' or 'help'
  is_base BOOLEAN DEFAULT FALSE,  -- BASE商品かどうか

  -- 参照情報
  order_id TEXT,  -- 元の注文ID

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 重複防止：同じキャストが同じ注文の同じ商品で同じroleのバックは1つだけ
  UNIQUE (cast_id, date, order_id, product_name, sales_type)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_payslip_items_cast_month ON payslip_items(cast_id, year_month);
CREATE INDEX IF NOT EXISTS idx_payslip_items_date ON payslip_items(date);
CREATE INDEX IF NOT EXISTS idx_payslip_items_store ON payslip_items(store_id);

-- RLS有効化
ALTER TABLE payslip_items ENABLE ROW LEVEL SECURITY;

-- キャストは自分のデータのみ閲覧可能
CREATE POLICY "Casts can view own payslip items"
  ON payslip_items FOR SELECT
  USING (
    cast_id IN (
      SELECT id FROM casts WHERE line_user_id = auth.uid()
    )
  );

-- 管理者は全データ閲覧・編集可能
CREATE POLICY "Admins can manage all payslip items"
  ON payslip_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

COMMENT ON TABLE payslip_items IS '報酬明細用の商品明細テーブル（各キャストの分配済みバック情報）';
COMMENT ON COLUMN payslip_items.subtotal IS 'このキャストに分配された売上金額';
COMMENT ON COLUMN payslip_items.sales_type IS '推し売上(self) or ヘルプ売上(help)';
COMMENT ON COLUMN payslip_items.is_base IS 'BASE商品かどうか';
