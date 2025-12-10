-- published_aggregationにnone（公表しない）を追加
-- 既存のCHECK制約を削除して新しい制約を追加

-- 既存のCHECK制約を削除
ALTER TABLE sales_settings
DROP CONSTRAINT IF EXISTS sales_settings_published_aggregation_check;

-- 新しいCHECK制約を追加（noneを含む）
ALTER TABLE sales_settings
ADD CONSTRAINT sales_settings_published_aggregation_check
CHECK (published_aggregation IN ('none', 'item_based', 'receipt_based'));

-- コメント更新
COMMENT ON COLUMN sales_settings.published_aggregation IS '公開する集計方法: none=公表しない, item_based=キャスト商品のみ, receipt_based=伝票全体';
