-- base_ordersテーブルの重複問題を修正
-- 問題: onConflictで使用している列に一意制約が存在しないため、upsertが常にINSERTになっていた

-- Step 1: 重複レコードを削除（最初に挿入されたものを残す）
DELETE FROM base_orders a
USING base_orders b
WHERE a.id > b.id
  AND a.store_id = b.store_id
  AND a.base_order_id = b.base_order_id
  AND COALESCE(a.product_name, '') = COALESCE(b.product_name, '')
  AND COALESCE(a.variation_name, '') = COALESCE(b.variation_name, '');

-- Step 2: 一意制約を追加
-- store_id, base_order_id, product_name, variation_nameの組み合わせで一意
ALTER TABLE base_orders
ADD CONSTRAINT base_orders_unique_order_item
UNIQUE (store_id, base_order_id, product_name, variation_name);

-- この制約により、upsertのonConflictが正しく動作するようになる
