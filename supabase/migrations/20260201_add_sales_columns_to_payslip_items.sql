-- payslip_itemsテーブルにself_sales/help_salesカラムを追加
-- これにより売上表示とバック計算の基準を分離できる

ALTER TABLE payslip_items
ADD COLUMN IF NOT EXISTS self_sales INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS help_sales INT DEFAULT 0;

-- 既存データの移行: sales_typeに基づいてself_sales/help_salesを設定
UPDATE payslip_items
SET self_sales = subtotal
WHERE sales_type = 'self';

UPDATE payslip_items
SET help_sales = subtotal
WHERE sales_type = 'help';

COMMENT ON COLUMN payslip_items.self_sales IS '推し売上（このキャストに分配された金額）';
COMMENT ON COLUMN payslip_items.help_sales IS 'ヘルプ売上（このキャストに分配された金額）';
COMMENT ON COLUMN payslip_items.subtotal IS '商品の小計金額（税抜き前の商品価格）';
