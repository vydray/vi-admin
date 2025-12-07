-- cast_back_rates テーブルから priority カラムを削除
-- 優先度は自動判定（商品名指定 > カテゴリ指定 > 全体）に変更

ALTER TABLE cast_back_rates DROP COLUMN IF EXISTS priority;
