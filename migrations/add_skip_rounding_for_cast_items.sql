-- sales_settingsテーブルにskip_rounding_for_cast_itemsカラムを追加
-- キャスト名表示商品を端数処理対象外にするかどうかのフラグ

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS skip_rounding_for_cast_items BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN sales_settings.skip_rounding_for_cast_items IS 'キャスト名表示商品を端数処理対象外にする（true=対象外、false=すべて端数処理）';
