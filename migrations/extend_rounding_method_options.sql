-- 端数処理方法の選択肢を拡張
-- floor/ceil/round × 1/10/100 の全組み合わせに対応

-- 既存のCHECK制約を削除（制約名を推測して削除を試みる）
-- PostgreSQLでは列追加時のCHECK制約は "テーブル名_カラム名_check" という名前になる

-- item_rounding_method の制約を更新
ALTER TABLE sales_settings DROP CONSTRAINT IF EXISTS sales_settings_item_rounding_method_check;
ALTER TABLE sales_settings ADD CONSTRAINT sales_settings_item_rounding_method_check
  CHECK (item_rounding_method IN (
    'floor_1', 'floor_10', 'floor_100',
    'ceil_1', 'ceil_10', 'ceil_100',
    'round_1', 'round_10', 'round_100',
    'round', 'none'
  ));

-- receipt_rounding_method の制約を更新
ALTER TABLE sales_settings DROP CONSTRAINT IF EXISTS sales_settings_receipt_rounding_method_check;
ALTER TABLE sales_settings ADD CONSTRAINT sales_settings_receipt_rounding_method_check
  CHECK (receipt_rounding_method IN (
    'floor_1', 'floor_10', 'floor_100',
    'ceil_1', 'ceil_10', 'ceil_100',
    'round_1', 'round_10', 'round_100',
    'round', 'none'
  ));

-- レガシーの rounding_method も更新（後方互換用）
ALTER TABLE sales_settings DROP CONSTRAINT IF EXISTS sales_settings_rounding_method_check;
ALTER TABLE sales_settings ADD CONSTRAINT sales_settings_rounding_method_check
  CHECK (rounding_method IN (
    'floor_1', 'floor_10', 'floor_100',
    'ceil_1', 'ceil_10', 'ceil_100',
    'round_1', 'round_10', 'round_100',
    'round', 'none'
  ));

-- 端数処理タイミングのカラムを追加
ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS item_rounding_timing TEXT DEFAULT 'per_item'
CHECK (item_rounding_timing IN ('per_item', 'total'));

ALTER TABLE sales_settings
ADD COLUMN IF NOT EXISTS receipt_rounding_timing TEXT DEFAULT 'per_item'
CHECK (receipt_rounding_timing IN ('per_item', 'total'));

-- コメント追加
COMMENT ON COLUMN sales_settings.item_rounding_timing IS '端数処理タイミング: per_item=商品ごと, total=合計時';
COMMENT ON COLUMN sales_settings.receipt_rounding_timing IS '端数処理タイミング: per_item=商品ごと, total=合計時';
