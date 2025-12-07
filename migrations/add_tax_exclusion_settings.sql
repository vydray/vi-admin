-- sales_settingsテーブルに新しいカラムを追加

-- 消費税抜きで計算するかどうか
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS exclude_consumption_tax BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN sales_settings.exclude_consumption_tax IS '消費税抜きの金額で計算する';

-- サービスTAX抜きで計算するかどうか
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS exclude_service_charge BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN sales_settings.exclude_service_charge IS 'サービスTAX抜きの金額で計算する';

-- skip_rounding_for_cast_itemsカラムが存在する場合は削除
ALTER TABLE sales_settings
DROP COLUMN IF EXISTS skip_rounding_for_cast_items;
