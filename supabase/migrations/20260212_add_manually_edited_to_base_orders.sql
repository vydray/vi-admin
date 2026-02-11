-- base_ordersに手動編集フラグを追加
-- 手動でcast_idを設定した注文は、cronの自動同期でcast_idを上書きしない
ALTER TABLE base_orders ADD COLUMN IF NOT EXISTS manually_edited BOOLEAN NOT NULL DEFAULT false;
