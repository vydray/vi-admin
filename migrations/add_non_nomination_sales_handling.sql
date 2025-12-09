-- 推し以外のキャスト分の売上集計方法を追加

-- キャスト商品のみの集計設定
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS item_non_nomination_sales_handling TEXT DEFAULT 'share_only'
CHECK (item_non_nomination_sales_handling IN ('share_only', 'full_to_nomination'));

-- 伝票全体の集計設定
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS receipt_non_nomination_sales_handling TEXT DEFAULT 'share_only'
CHECK (receipt_non_nomination_sales_handling IN ('share_only', 'full_to_nomination'));

-- コメント追加
COMMENT ON COLUMN sales_settings.item_non_nomination_sales_handling IS '推し以外のキャスト分の売上集計方法: share_only=推しの分だけ計上, full_to_nomination=全額を推しに計上';
COMMENT ON COLUMN sales_settings.receipt_non_nomination_sales_handling IS '推し以外のキャスト分の売上集計方法: share_only=推しの分だけ計上, full_to_nomination=全額を推しに計上';
