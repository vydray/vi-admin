-- cast_daily_itemsに売上計算カラムを追加
-- help_cast_id: ヘルプしたキャスト（推し自身ならnull）
-- self_sales: 推しにつく売上（計算ロジック適用後）
-- help_sales: ヘルプにつく売上（計算ロジック適用後）

-- 新しいカラムを追加
ALTER TABLE cast_daily_items
ADD COLUMN help_cast_id INTEGER REFERENCES casts(id) ON DELETE SET NULL,
ADD COLUMN self_sales INTEGER NOT NULL DEFAULT 0,
ADD COLUMN help_sales INTEGER NOT NULL DEFAULT 0;

-- コメント追加
COMMENT ON COLUMN cast_daily_items.cast_id IS 'テーブルの推し（staff_name）';
COMMENT ON COLUMN cast_daily_items.help_cast_id IS 'ヘルプしたキャスト（推し自身の注文ならnull）';
COMMENT ON COLUMN cast_daily_items.self_sales IS '推しにつく売上（分配ロジック適用後）';
COMMENT ON COLUMN cast_daily_items.help_sales IS 'ヘルプにつく売上（分配ロジック適用後）';

-- 旧カラムに非推奨マークを追加
COMMENT ON COLUMN cast_daily_items.subtotal IS '【非推奨】self_sales + help_sales を使用してください';
COMMENT ON COLUMN cast_daily_items.back_amount IS '【非推奨】報酬計算はpayslipsで行う';
COMMENT ON COLUMN cast_daily_items.is_self IS '【非推奨】help_cast_id IS NULL で判定';

-- インデックス追加（ヘルプ売上の集計用）
CREATE INDEX idx_cast_daily_items_help_cast ON cast_daily_items(help_cast_id) WHERE help_cast_id IS NOT NULL;
