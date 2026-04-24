-- BASE注文のLINE通知機能: 通知状態・顧客名・エラー情報カラムの追加
-- notification_sent_at: 通知済みフラグ(送信前のアトミックマーク用、二重送信防止)
-- customer_name: LINE通知に表示する顧客名(BASE APIのlast_name+first_name)
-- notification_error: LINE送信失敗時のエラー情報(デバッグ・再送UI向け)

ALTER TABLE base_orders
  ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS customer_name text NULL,
  ADD COLUMN IF NOT EXISTS notification_error text NULL;

-- 初回デプロイ時の「過去データに対する通知爆発」防止: 既存行を通知済みでマーク
UPDATE base_orders
SET notification_sent_at = now()
WHERE notification_sent_at IS NULL;

-- 未通知行を素早く引けるpartial index
CREATE INDEX IF NOT EXISTS idx_base_orders_notification_pending
  ON base_orders (store_id, base_order_id)
  WHERE notification_sent_at IS NULL;
