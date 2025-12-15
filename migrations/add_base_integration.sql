-- BASE連携テーブルのマイグレーション
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- ============================================
-- 1. base_settings テーブル作成（API設定）
-- ============================================

CREATE TABLE IF NOT EXISTS base_settings (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- BASE API認証情報
    client_id VARCHAR(255),
    client_secret VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,

    -- 設定
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 店舗ごとに1レコード
    UNIQUE(store_id)
);

COMMENT ON TABLE base_settings IS 'BASE API連携設定';
COMMENT ON COLUMN base_settings.client_id IS 'BASE APIクライアントID';
COMMENT ON COLUMN base_settings.client_secret IS 'BASE APIクライアントシークレット';
COMMENT ON COLUMN base_settings.access_token IS 'アクセストークン';
COMMENT ON COLUMN base_settings.refresh_token IS 'リフレッシュトークン';

-- ============================================
-- 2. base_products テーブル作成（商品マッピング）
-- ============================================

CREATE TABLE IF NOT EXISTS base_products (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- BASE側情報
    base_item_id BIGINT,                    -- BASE商品ID
    base_product_name VARCHAR(255) NOT NULL, -- BASE商品名

    -- ローカル情報（productsテーブルの商品名と完全一致）
    local_product_name VARCHAR(255) NOT NULL,

    -- 価格情報
    base_price INTEGER NOT NULL DEFAULT 0,   -- BASE価格（手数料込み）

    -- 同期設定
    sync_variations BOOLEAN NOT NULL DEFAULT TRUE, -- バリエーションを自動同期するか
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- BASE商品IDは店舗ごとにユニーク
    UNIQUE(store_id, base_item_id)
);

CREATE INDEX IF NOT EXISTS idx_base_products_store ON base_products(store_id);
CREATE INDEX IF NOT EXISTS idx_base_products_name ON base_products(store_id, local_product_name);

COMMENT ON TABLE base_products IS 'BASE商品マッピング';
COMMENT ON COLUMN base_products.base_item_id IS 'BASE側の商品ID';
COMMENT ON COLUMN base_products.base_product_name IS 'BASE側の商品名';
COMMENT ON COLUMN base_products.local_product_name IS 'ローカル商品名（productsと一致）';
COMMENT ON COLUMN base_products.base_price IS 'BASE価格（手数料込み）';

-- ============================================
-- 3. base_variations テーブル作成（バリエーション=キャスト）
-- ============================================

CREATE TABLE IF NOT EXISTS base_variations (
    id SERIAL PRIMARY KEY,
    base_product_id INTEGER NOT NULL REFERENCES base_products(id) ON DELETE CASCADE,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- BASE側情報
    base_variation_id BIGINT,              -- BASEバリエーションID
    variation_name VARCHAR(255) NOT NULL,   -- バリエーション名（=キャスト名）

    -- ローカル情報
    cast_id INTEGER REFERENCES casts(id) ON DELETE SET NULL,

    -- 同期状態
    is_synced BOOLEAN NOT NULL DEFAULT FALSE,
    synced_at TIMESTAMP WITH TIME ZONE,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 同じ商品に同じバリエーション名は1つ
    UNIQUE(base_product_id, variation_name)
);

CREATE INDEX IF NOT EXISTS idx_base_variations_product ON base_variations(base_product_id);
CREATE INDEX IF NOT EXISTS idx_base_variations_cast ON base_variations(cast_id);

COMMENT ON TABLE base_variations IS 'BASEバリエーション（キャストマッピング）';
COMMENT ON COLUMN base_variations.variation_name IS 'バリエーション名（キャスト名と一致）';
COMMENT ON COLUMN base_variations.is_synced IS 'BASEと同期済みか';

-- ============================================
-- 4. base_orders テーブル作成（注文履歴）
-- ============================================

CREATE TABLE IF NOT EXISTS base_orders (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- BASE注文情報
    base_order_id VARCHAR(100) NOT NULL,    -- BASE注文ID
    order_datetime TIMESTAMP WITH TIME ZONE NOT NULL,

    -- 商品情報
    product_name VARCHAR(255) NOT NULL,
    variation_name VARCHAR(255),             -- バリエーション（キャスト名）

    -- マッピング結果
    cast_id INTEGER REFERENCES casts(id) ON DELETE SET NULL,
    local_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,

    -- 価格
    base_price INTEGER NOT NULL,             -- BASE価格
    actual_price INTEGER,                    -- 実際の商品価格（productsから）
    quantity INTEGER NOT NULL DEFAULT 1,

    -- バック計算結果
    back_amount INTEGER DEFAULT 0,

    -- 営業日（締め時間を考慮した日付）
    business_date DATE,

    -- 処理状態
    is_processed BOOLEAN NOT NULL DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 同じ注文IDは店舗ごとにユニーク
    UNIQUE(store_id, base_order_id, product_name, variation_name)
);

-- 営業日での検索用インデックス
CREATE INDEX IF NOT EXISTS idx_base_orders_business_date ON base_orders(store_id, business_date);

CREATE INDEX IF NOT EXISTS idx_base_orders_store_date ON base_orders(store_id, order_datetime);
CREATE INDEX IF NOT EXISTS idx_base_orders_cast ON base_orders(cast_id);
CREATE INDEX IF NOT EXISTS idx_base_orders_processed ON base_orders(store_id, is_processed);

COMMENT ON TABLE base_orders IS 'BASE注文履歴';
COMMENT ON COLUMN base_orders.base_order_id IS 'BASE側の注文ID';
COMMENT ON COLUMN base_orders.base_price IS 'BASE価格（手数料込み）';
COMMENT ON COLUMN base_orders.actual_price IS '実際の商品価格';
COMMENT ON COLUMN base_orders.is_processed IS 'キャスト売上に反映済みか';

-- ============================================
-- 5. sales_settings に BASE関連カラム追加
-- ============================================

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS include_base_in_item_sales BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS include_base_in_receipt_sales BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS base_cutoff_hour INTEGER NOT NULL DEFAULT 6,
ADD COLUMN IF NOT EXISTS base_cutoff_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN sales_settings.include_base_in_item_sales IS 'BASE売上を推し小計に含める';
COMMENT ON COLUMN sales_settings.include_base_in_receipt_sales IS 'BASE売上を伝票小計に含める';
COMMENT ON COLUMN sales_settings.base_cutoff_hour IS 'BASE注文の営業日締め時間（0-23、例: 6 = 翌6時まで前日扱い）';
COMMENT ON COLUMN sales_settings.base_cutoff_enabled IS 'BASE注文に営業日締め時間を適用するか';

-- ============================================
-- 6. cast_back_rates に source カラム追加
-- ============================================

-- source カラムを追加（既存データはデフォルトで 'all'）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cast_back_rates' AND column_name = 'source'
    ) THEN
        ALTER TABLE cast_back_rates
        ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'all';

        COMMENT ON COLUMN cast_back_rates.source IS 'バック率適用対象: pos=POSのみ, base=BASEのみ, all=両方';
    END IF;
END $$;

-- ============================================
-- 7. updated_at トリガー
-- ============================================

-- base_settings
DROP TRIGGER IF EXISTS trigger_base_settings_updated_at ON base_settings;
CREATE TRIGGER trigger_base_settings_updated_at
BEFORE UPDATE ON base_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- base_products
DROP TRIGGER IF EXISTS trigger_base_products_updated_at ON base_products;
CREATE TRIGGER trigger_base_products_updated_at
BEFORE UPDATE ON base_products
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- base_variations
DROP TRIGGER IF EXISTS trigger_base_variations_updated_at ON base_variations;
CREATE TRIGGER trigger_base_variations_updated_at
BEFORE UPDATE ON base_variations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- base_orders
DROP TRIGGER IF EXISTS trigger_base_orders_updated_at ON base_orders;
CREATE TRIGGER trigger_base_orders_updated_at
BEFORE UPDATE ON base_orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. RLS（Row Level Security）設定
-- ============================================

ALTER TABLE base_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_orders ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーに全操作を許可
CREATE POLICY "Allow all for authenticated users" ON base_settings
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON base_products
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON base_variations
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users" ON base_orders
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- 確認用クエリ
-- ============================================
-- SELECT * FROM base_settings;
-- SELECT * FROM base_products;
-- SELECT * FROM base_variations;
-- SELECT * FROM base_orders WHERE is_processed = FALSE;
