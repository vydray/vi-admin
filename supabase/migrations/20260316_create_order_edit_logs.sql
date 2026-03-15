-- 伝票編集ログテーブル
CREATE TABLE order_edit_logs (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id UUID NOT NULL,
  order_item_id UUID,
  action_type VARCHAR(20) NOT NULL,  -- 'edit_order' | 'edit_item' | 'delete_order' | 'delete_item' | 'add_item' | 'edit_payment'
  before_values JSONB,               -- 削除前/編集前の値（addではnull）
  after_values JSONB,                -- 編集後の値（deleteではnull）
  modified_by VARCHAR(100) NOT NULL,  -- admin username
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_edit_logs_order ON order_edit_logs(order_id);
CREATE INDEX idx_order_edit_logs_created ON order_edit_logs(created_at DESC);

-- RLS有効化
ALTER TABLE order_edit_logs ENABLE ROW LEVEL SECURITY;

-- RLSポリシー
CREATE POLICY "service_role_order_edit_logs" ON order_edit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "order_edit_logs_select" ON order_edit_logs FOR SELECT USING (true);
CREATE POLICY "order_edit_logs_insert" ON order_edit_logs FOR INSERT WITH CHECK (true);
