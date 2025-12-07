-- sales_settingsテーブルに新しいカラムを追加

-- キャスト名表示商品を端数処理対象外にするかどうかのフラグ
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS skip_rounding_for_cast_items BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN sales_settings.skip_rounding_for_cast_items IS 'キャスト名表示商品を端数処理対象外にする（true=対象外、false=すべて端数処理）';

-- 消費税抜きで計算するかどうか
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS exclude_consumption_tax BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN sales_settings.exclude_consumption_tax IS '消費税抜きの金額で計算する';

-- サービスTAX抜きで計算するかどうか
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS exclude_service_charge BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN sales_settings.exclude_service_charge IS 'サービスTAX抜きの金額で計算する';
