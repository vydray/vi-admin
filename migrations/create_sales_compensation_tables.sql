-- 売上・報酬計算システム用テーブルのマイグレーション
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- ============================================
-- 1. sales_settings テーブル（店舗別売上計算設定）
-- ============================================
CREATE TABLE IF NOT EXISTS sales_settings (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- 端数処理設定
  rounding_method VARCHAR(20) NOT NULL DEFAULT 'floor_100',  -- floor_100: 100円切捨て, floor_10: 10円切捨て, round: 四捨五入, none: なし
  rounding_timing VARCHAR(20) NOT NULL DEFAULT 'total',      -- per_item: 商品ごと, total: 合計時

  -- ヘルプ売上計算設定
  help_calculation_method VARCHAR(20) NOT NULL DEFAULT 'ratio',  -- ratio: 割合, fixed: 固定額
  help_ratio DECIMAL(5,2) NOT NULL DEFAULT 50.00,                -- ヘルプ割合（%）: ratio時に使用
  help_fixed_amount INTEGER NOT NULL DEFAULT 0,                   -- ヘルプ固定額: fixed時に使用

  -- 税計算設定
  use_tax_excluded BOOLEAN NOT NULL DEFAULT true,   -- true: 税抜き金額で計算, false: 税込み金額で計算

  -- バック計算対象設定
  include_shimei_in_sales BOOLEAN NOT NULL DEFAULT true,    -- 指名料を売上に含める
  include_drink_in_sales BOOLEAN NOT NULL DEFAULT true,     -- ドリンクを売上に含める
  include_food_in_sales BOOLEAN NOT NULL DEFAULT false,     -- フードを売上に含める
  include_extension_in_sales BOOLEAN NOT NULL DEFAULT true, -- 延長料金を売上に含める

  -- メモ・説明
  description TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- 店舗ごとに1レコード
  UNIQUE(store_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_sales_settings_store_id ON sales_settings(store_id);

-- 更新日時自動更新トリガー
CREATE OR REPLACE FUNCTION update_sales_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sales_settings_updated_at ON sales_settings;
CREATE TRIGGER trigger_sales_settings_updated_at
  BEFORE UPDATE ON sales_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_sales_settings_updated_at();

-- コメント
COMMENT ON TABLE sales_settings IS '店舗別売上計算設定';
COMMENT ON COLUMN sales_settings.rounding_method IS '端数処理方法: floor_100=100円切捨て, floor_10=10円切捨て, round=四捨五入, none=なし';
COMMENT ON COLUMN sales_settings.rounding_timing IS '端数処理タイミング: per_item=商品ごと, total=合計時';
COMMENT ON COLUMN sales_settings.help_calculation_method IS 'ヘルプ売上計算方法: ratio=割合, fixed=固定額';
COMMENT ON COLUMN sales_settings.help_ratio IS 'ヘルプ売上割合（％）';
COMMENT ON COLUMN sales_settings.use_tax_excluded IS 'true=税抜き計算, false=税込み計算';

-- ============================================
-- 2. compensation_settings テーブル（キャスト別報酬設定）
-- ============================================
CREATE TABLE IF NOT EXISTS compensation_settings (
  id SERIAL PRIMARY KEY,
  cast_id INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- 給与形態
  pay_type VARCHAR(30) NOT NULL DEFAULT 'hourly',  -- hourly: 時給制, commission: 完全歩合, hourly_plus_commission: 時給+歩合, sliding: スライド制

  -- 時給設定（hourly, hourly_plus_commission時に使用）
  hourly_rate INTEGER NOT NULL DEFAULT 0,          -- 時給（円）

  -- 歩合設定（commission, hourly_plus_commission時に使用）
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 0, -- 歩合率（%）

  -- スライド制設定（sliding時に使用）
  -- 売上額に応じたバック率をJSONで保存
  -- 例: [{"min": 0, "max": 50000, "rate": 30}, {"min": 50001, "max": 100000, "rate": 40}, ...]
  sliding_rates JSONB,

  -- 保証設定
  guarantee_enabled BOOLEAN NOT NULL DEFAULT false, -- 保証制度の有無
  guarantee_amount INTEGER NOT NULL DEFAULT 0,      -- 保証金額（円/日 or 円/月）
  guarantee_period VARCHAR(10) DEFAULT 'day',       -- day: 日額保証, month: 月額保証

  -- 控除設定
  deduction_enabled BOOLEAN NOT NULL DEFAULT false,  -- 控除の有無
  deduction_items JSONB,                             -- 控除項目 例: [{"name": "衣装代", "amount": 3000}, ...]

  -- 適用期間
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to DATE,                                     -- NULLの場合は無期限

  -- ステータス
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_compensation_settings_cast_id ON compensation_settings(cast_id);
CREATE INDEX IF NOT EXISTS idx_compensation_settings_store_id ON compensation_settings(store_id);
CREATE INDEX IF NOT EXISTS idx_compensation_settings_active ON compensation_settings(cast_id, is_active) WHERE is_active = true;

-- 更新日時自動更新トリガー
CREATE OR REPLACE FUNCTION update_compensation_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_compensation_settings_updated_at ON compensation_settings;
CREATE TRIGGER trigger_compensation_settings_updated_at
  BEFORE UPDATE ON compensation_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_compensation_settings_updated_at();

-- コメント
COMMENT ON TABLE compensation_settings IS 'キャスト別報酬設定';
COMMENT ON COLUMN compensation_settings.pay_type IS '給与形態: hourly=時給制, commission=完全歩合, hourly_plus_commission=時給+歩合, sliding=スライド制';
COMMENT ON COLUMN compensation_settings.sliding_rates IS 'スライド制の売上別バック率（JSONB形式）';

-- ============================================
-- 3. cast_back_rates テーブル（キャスト×商品別バック率）
-- ============================================
CREATE TABLE IF NOT EXISTS cast_back_rates (
  id SERIAL PRIMARY KEY,
  cast_id INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- 商品識別
  category VARCHAR(100),           -- 商品カテゴリ（NULLの場合は全カテゴリ対象）
  product_name VARCHAR(200),       -- 商品名（NULLの場合はカテゴリ全体対象）

  -- バック設定
  back_type VARCHAR(20) NOT NULL DEFAULT 'ratio',  -- ratio: 割合, fixed: 固定額
  back_ratio DECIMAL(5,2) NOT NULL DEFAULT 0,      -- バック率（%）: ratio時に使用
  back_fixed_amount INTEGER NOT NULL DEFAULT 0,    -- バック固定額（円）: fixed時に使用

  -- SELF/HELP別バック率（オプション）
  self_back_ratio DECIMAL(5,2),    -- SELF時のバック率（NULLの場合はback_ratioを使用）
  help_back_ratio DECIMAL(5,2),    -- HELP時のバック率（NULLの場合はsales_settings.help_ratioを使用）

  -- 優先度（同じcast_id, categoryの場合、高い方を優先）
  priority INTEGER NOT NULL DEFAULT 0,

  -- ステータス
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_cast_back_rates_cast_id ON cast_back_rates(cast_id);
CREATE INDEX IF NOT EXISTS idx_cast_back_rates_store_id ON cast_back_rates(store_id);
CREATE INDEX IF NOT EXISTS idx_cast_back_rates_category ON cast_back_rates(category);
CREATE INDEX IF NOT EXISTS idx_cast_back_rates_lookup ON cast_back_rates(cast_id, category, product_name, is_active);

-- 更新日時自動更新トリガー
CREATE OR REPLACE FUNCTION update_cast_back_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cast_back_rates_updated_at ON cast_back_rates;
CREATE TRIGGER trigger_cast_back_rates_updated_at
  BEFORE UPDATE ON cast_back_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_cast_back_rates_updated_at();

-- コメント
COMMENT ON TABLE cast_back_rates IS 'キャスト×商品別バック率設定';
COMMENT ON COLUMN cast_back_rates.category IS '商品カテゴリ（NULLは全カテゴリ対象）';
COMMENT ON COLUMN cast_back_rates.product_name IS '商品名（NULLはカテゴリ全体対象）';
COMMENT ON COLUMN cast_back_rates.back_type IS 'バック計算方法: ratio=割合, fixed=固定額';
COMMENT ON COLUMN cast_back_rates.priority IS '適用優先度（高い方を優先）';

-- ============================================
-- 4. 既存店舗へのデフォルト設定を挿入
-- ============================================
INSERT INTO sales_settings (store_id, rounding_method, rounding_timing, help_calculation_method, help_ratio, use_tax_excluded)
SELECT id, 'floor_100', 'total', 'ratio', 50.00, true
FROM stores
WHERE NOT EXISTS (
  SELECT 1 FROM sales_settings WHERE sales_settings.store_id = stores.id
)
ON CONFLICT (store_id) DO NOTHING;

-- ============================================
-- 5. RLSポリシー（必要に応じて）
-- ============================================
-- 既存のRLSポリシーと同様に全アクセス許可
ALTER TABLE sales_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cast_back_rates ENABLE ROW LEVEL SECURITY;

-- sales_settings
DROP POLICY IF EXISTS allow_all_access ON sales_settings;
CREATE POLICY allow_all_access ON sales_settings FOR ALL USING (true) WITH CHECK (true);

-- compensation_settings
DROP POLICY IF EXISTS allow_all_access ON compensation_settings;
CREATE POLICY allow_all_access ON compensation_settings FOR ALL USING (true) WITH CHECK (true);

-- cast_back_rates
DROP POLICY IF EXISTS allow_all_access ON cast_back_rates;
CREATE POLICY allow_all_access ON cast_back_rates FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 確認用クエリ
-- ============================================
-- SELECT * FROM sales_settings;
-- SELECT * FROM compensation_settings LIMIT 10;
-- SELECT * FROM cast_back_rates LIMIT 10;
