-- 売上特典(event_promotions)を告知イベント(management_events)へ紐付ける
-- 紐付き特典は name/期間を management_events から参照する(保存値は初期コピーのみ)。
-- 既存の特典(event_id IS NULL)は従来通り独立した売上特典として動作する。

ALTER TABLE event_promotions
  ADD COLUMN IF NOT EXISTS event_id BIGINT REFERENCES management_events(id) ON DELETE SET NULL;

-- 1つの告知イベントに紐付く特典は1つまで
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_promotions_event_id
  ON event_promotions (event_id) WHERE event_id IS NOT NULL;

COMMENT ON COLUMN event_promotions.event_id IS '告知イベント(management_events)への紐付け。NULLなら独立した売上特典イベント';
