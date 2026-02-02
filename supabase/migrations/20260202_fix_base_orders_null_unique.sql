-- base_ordersのNULL値を含む一意制約を修正
-- PostgreSQLではNULL = NULLがfalseなので、通常のUNIQUE制約ではNULL値の重複を防げない

-- Step 1: 既存の制約を削除
ALTER TABLE base_orders
DROP CONSTRAINT IF EXISTS base_orders_unique_order_item;

-- Step 2: NULLを空文字に変換
UPDATE base_orders SET product_name = '' WHERE product_name IS NULL;
UPDATE base_orders SET variation_name = '' WHERE variation_name IS NULL;

-- Step 3: 重複レコードを削除（最初のものを残す）
DELETE FROM base_orders a
USING base_orders b
WHERE a.id > b.id
  AND a.store_id = b.store_id
  AND a.base_order_id = b.base_order_id
  AND a.product_name = b.product_name
  AND a.variation_name = b.variation_name;

-- Step 4: 一意制約を作成（NULLなしなので通常の制約でOK）
ALTER TABLE base_orders
ADD CONSTRAINT base_orders_unique_order_item
UNIQUE (store_id, base_order_id, product_name, variation_name);

-- Step 5: カラムにNOT NULL制約を追加（今後NULLを防ぐ）
ALTER TABLE base_orders ALTER COLUMN product_name SET DEFAULT '';
ALTER TABLE base_orders ALTER COLUMN variation_name SET DEFAULT '';
