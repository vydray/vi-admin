-- カテゴリにバック率設定要否フラグを追加（デフォルト: 必要）
ALTER TABLE product_categories
ADD COLUMN IF NOT EXISTS back_rate_required BOOLEAN NOT NULL DEFAULT true;

-- 商品にバック率設定要否フラグを追加（NULL = カテゴリに従う）
ALTER TABLE products
ADD COLUMN IF NOT EXISTS back_rate_required BOOLEAN DEFAULT NULL;
