-- キャスト日別統計テーブルのマイグレーション
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- ============================================
-- 1. cast_daily_items テーブル作成（商品詳細）
-- ============================================

CREATE TABLE IF NOT EXISTS cast_daily_items (
    id SERIAL PRIMARY KEY,
    cast_id INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    category VARCHAR(100),
    product_name VARCHAR(200),
    quantity INTEGER NOT NULL DEFAULT 0,
    subtotal INTEGER NOT NULL DEFAULT 0,
    back_amount INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- ユニーク制約（同じキャスト・店舗・日付・カテゴリ・商品の組み合わせは1レコード）
    UNIQUE(cast_id, store_id, date, category, product_name)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_cast_daily_items_cast_date
ON cast_daily_items(cast_id, date);

CREATE INDEX IF NOT EXISTS idx_cast_daily_items_store_date
ON cast_daily_items(store_id, date);

COMMENT ON TABLE cast_daily_items IS 'キャスト別日別商品詳細';
COMMENT ON COLUMN cast_daily_items.quantity IS '個数';
COMMENT ON COLUMN cast_daily_items.subtotal IS '小計';
COMMENT ON COLUMN cast_daily_items.back_amount IS 'バック金額';

-- ============================================
-- 2. cast_daily_stats テーブル作成（売上サマリー）
-- ============================================

CREATE TABLE IF NOT EXISTS cast_daily_stats (
    id SERIAL PRIMARY KEY,
    cast_id INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- 推し小計ベース（item_based）
    self_sales_item_based INTEGER NOT NULL DEFAULT 0,
    help_sales_item_based INTEGER NOT NULL DEFAULT 0,
    total_sales_item_based INTEGER NOT NULL DEFAULT 0,
    product_back_item_based INTEGER NOT NULL DEFAULT 0,

    -- 伝票小計ベース（receipt_based）
    self_sales_receipt_based INTEGER NOT NULL DEFAULT 0,
    help_sales_receipt_based INTEGER NOT NULL DEFAULT 0,
    total_sales_receipt_based INTEGER NOT NULL DEFAULT 0,
    product_back_receipt_based INTEGER NOT NULL DEFAULT 0,

    -- 確定フラグ
    is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
    finalized_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- ユニーク制約
    UNIQUE(cast_id, store_id, date)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_cast_daily_stats_cast_date
ON cast_daily_stats(cast_id, date);

CREATE INDEX IF NOT EXISTS idx_cast_daily_stats_store_date
ON cast_daily_stats(store_id, date);

CREATE INDEX IF NOT EXISTS idx_cast_daily_stats_store_month
ON cast_daily_stats(store_id, date)
WHERE is_finalized = FALSE;

COMMENT ON TABLE cast_daily_stats IS 'キャスト別日別売上サマリー';
COMMENT ON COLUMN cast_daily_stats.self_sales_item_based IS '推し売上（推し小計ベース）';
COMMENT ON COLUMN cast_daily_stats.help_sales_item_based IS 'ヘルプ売上（推し小計ベース）';
COMMENT ON COLUMN cast_daily_stats.self_sales_receipt_based IS '推し売上（伝票小計ベース）';
COMMENT ON COLUMN cast_daily_stats.help_sales_receipt_based IS 'ヘルプ売上（伝票小計ベース）';
COMMENT ON COLUMN cast_daily_stats.is_finalized IS '確定済みフラグ（trueの場合は再計算でスキップ）';

-- ============================================
-- 3. updated_at を自動更新するトリガー
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- cast_daily_items
DROP TRIGGER IF EXISTS trigger_cast_daily_items_updated_at ON cast_daily_items;
CREATE TRIGGER trigger_cast_daily_items_updated_at
BEFORE UPDATE ON cast_daily_items
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- cast_daily_stats
DROP TRIGGER IF EXISTS trigger_cast_daily_stats_updated_at ON cast_daily_stats;
CREATE TRIGGER trigger_cast_daily_stats_updated_at
BEFORE UPDATE ON cast_daily_stats
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. RLS（Row Level Security）設定
-- ============================================

ALTER TABLE cast_daily_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cast_daily_stats ENABLE ROW LEVEL SECURITY;

-- 全ての操作を許可するポリシー（認証済みユーザー）
CREATE POLICY "Allow all for authenticated users" ON cast_daily_items
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON cast_daily_stats
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ============================================
-- 確認用クエリ
-- ============================================
-- SELECT * FROM cast_daily_items LIMIT 10;
-- SELECT * FROM cast_daily_stats LIMIT 10;

-- ランキング取得例
-- SELECT
--   c.name,
--   SUM(s.total_sales_item_based) as monthly_sales,
--   RANK() OVER (ORDER BY SUM(s.total_sales_item_based) DESC) as ranking
-- FROM cast_daily_stats s
-- JOIN casts c ON c.id = s.cast_id
-- WHERE s.store_id = 1
--   AND s.date >= DATE_TRUNC('month', CURRENT_DATE)
-- GROUP BY c.id, c.name
-- ORDER BY ranking;
