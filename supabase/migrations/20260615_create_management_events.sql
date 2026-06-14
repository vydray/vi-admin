-- 経営ダッシュボード(/management)用の告知イベント管理テーブル
-- 1イベント = 1行。期間(start_date〜end_date)を持ち、期間内の各日のイベント列に表示する。
--
-- 用途: 告知イベント(生誕/企画/フェア等)を store_id・期間・名前・詳細メモで登録。
--       経営ダッシュボードのイベント列に表示する。
--       将来 event_promotions(売上特典)を紐付ける拡張余地あり(event_id 等)。
--
-- 設計メモ:
--   - PK = id (BIGSERIAL)
--   - store_id 単位 + 期間で引くため (store_id, start_date, end_date) に INDEX
--   - RLS 有効化・ポリシー無し = service_role(API経由)のみ。anon/auth は遮断
--     (payslip_daily_orders と同じセキュア方針)

CREATE TABLE IF NOT EXISTS management_events (
  id BIGSERIAL PRIMARY KEY,
  store_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT management_events_period_check CHECK (end_date >= start_date)
);

-- 店舗単位 + 期間クエリ用
CREATE INDEX IF NOT EXISTS idx_management_events_store_period
  ON management_events (store_id, start_date, end_date);

-- RLS 有効化 (service_role のみ。anon/auth は遮断)
ALTER TABLE management_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE management_events IS '経営ダッシュボード用の告知イベント。期間付きで各日に表示。';
COMMENT ON COLUMN management_events.description IS '特典・価格・メニュー等の詳細メモ(ホバー表示用)';
