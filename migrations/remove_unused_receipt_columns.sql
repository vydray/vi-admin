-- 不要になった伝票小計のカラムを削除
-- receipt_nomination_distribute_all: 伝票小計では常にtrue（全推しに分配）なので不要
-- receipt_deduct_item_sales: 機能自体を削除したので不要

ALTER TABLE sales_settings
DROP COLUMN IF EXISTS receipt_nomination_distribute_all;

ALTER TABLE sales_settings
DROP COLUMN IF EXISTS receipt_deduct_item_sales;
