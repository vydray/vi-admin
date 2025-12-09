-- 売上設定テーブルの拡張
-- キャスト名が入ってる商品のみの集計設定と伝票全体の集計設定を追加

-- ========== キャスト名が入ってる商品のみの集計設定 ==========

-- 計算基準
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS item_use_tax_excluded BOOLEAN DEFAULT true;

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS item_exclude_consumption_tax BOOLEAN DEFAULT true;

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS item_exclude_service_charge BOOLEAN DEFAULT false;

-- 複数キャストの分配方法
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS item_multi_cast_distribution TEXT DEFAULT 'nomination_only'
CHECK (item_multi_cast_distribution IN ('nomination_only', 'all_equal'));

-- ヘルプ売上設定
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS item_help_sales_inclusion TEXT DEFAULT 'both'
CHECK (item_help_sales_inclusion IN ('both', 'self_only', 'help_only'));

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS item_help_calculation_method TEXT DEFAULT 'ratio'
CHECK (item_help_calculation_method IN ('ratio', 'fixed'));

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS item_help_ratio INTEGER DEFAULT 50;

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS item_help_fixed_amount INTEGER DEFAULT 0;

-- 端数処理
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS item_rounding_method TEXT DEFAULT 'floor_100'
CHECK (item_rounding_method IN ('floor_100', 'floor_10', 'round', 'none'));

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS item_rounding_position INTEGER DEFAULT 100;


-- ========== 伝票のすべての商品を集計設定 ==========

-- 計算基準
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS receipt_use_tax_excluded BOOLEAN DEFAULT true;

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS receipt_exclude_consumption_tax BOOLEAN DEFAULT true;

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS receipt_exclude_service_charge BOOLEAN DEFAULT false;

-- 複数キャストの分配方法
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS receipt_multi_cast_distribution TEXT DEFAULT 'nomination_only'
CHECK (receipt_multi_cast_distribution IN ('nomination_only', 'all_equal'));

-- ヘルプ売上設定
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS receipt_help_sales_inclusion TEXT DEFAULT 'both'
CHECK (receipt_help_sales_inclusion IN ('both', 'self_only', 'help_only'));

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS receipt_help_calculation_method TEXT DEFAULT 'ratio'
CHECK (receipt_help_calculation_method IN ('ratio', 'fixed'));

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS receipt_help_ratio INTEGER DEFAULT 50;

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS receipt_help_fixed_amount INTEGER DEFAULT 0;

-- 端数処理
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS receipt_rounding_method TEXT DEFAULT 'floor_100'
CHECK (receipt_rounding_method IN ('floor_100', 'floor_10', 'round', 'none'));

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS receipt_rounding_position INTEGER DEFAULT 100;

-- 商品で計上済みの売上を差し引く
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS receipt_deduct_item_sales BOOLEAN DEFAULT false;


-- ========== 公開設定 ==========
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS published_aggregation TEXT DEFAULT 'item_based'
CHECK (published_aggregation IN ('item_based', 'receipt_based'));


-- ========== 共通設定 ==========

-- ヘルプ扱いにしない推し名（配列）
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS non_help_staff_names TEXT[] DEFAULT '{}';

-- 複数推しの分配率（配列、例: [50, 50] で2人均等）
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS multi_nomination_ratios INTEGER[] DEFAULT '{50, 50}';


-- コメント追加
COMMENT ON COLUMN sales_settings.item_multi_cast_distribution IS '複数キャストの分配方法: nomination_only=推しに該当するキャストのみ, all_equal=全キャストで均等分配';
COMMENT ON COLUMN sales_settings.item_help_sales_inclusion IS 'ヘルプ売上の計上方法: both=両方, self_only=SELFのみ, help_only=HELPのみ';
COMMENT ON COLUMN sales_settings.receipt_multi_cast_distribution IS '複数キャストの分配方法: nomination_only=推しに該当するキャストのみ, all_equal=全キャストで均等分配';
COMMENT ON COLUMN sales_settings.receipt_help_sales_inclusion IS 'ヘルプ売上の計上方法: both=両方, self_only=SELFのみ, help_only=HELPのみ';
COMMENT ON COLUMN sales_settings.receipt_deduct_item_sales IS '商品で計上済みの売上を差し引く';
COMMENT ON COLUMN sales_settings.published_aggregation IS '公開する集計方法: item_based=キャスト商品のみ, receipt_based=伝票全体';
COMMENT ON COLUMN sales_settings.non_help_staff_names IS 'ヘルプ扱いにしない推し名の配列';
COMMENT ON COLUMN sales_settings.multi_nomination_ratios IS '複数推しの分配率（例: [50, 50]で均等）';
