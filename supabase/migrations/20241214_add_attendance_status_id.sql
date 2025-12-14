-- attendanceテーブルにstatus_idカラムを追加（attendance_statusesとの連携用）
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS status_id UUID REFERENCES attendance_statuses(id) ON DELETE SET NULL;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_attendance_status_id ON attendance(status_id);

-- 既存データのマイグレーション: 名前からIDに変換
-- 同じ店舗内で名前が一致するステータスを探してstatus_idを設定
UPDATE attendance a
SET status_id = (
  SELECT s.id
  FROM attendance_statuses s
  WHERE s.store_id = a.store_id
    AND s.name = a.status
  LIMIT 1
)
WHERE a.status IS NOT NULL
  AND a.status_id IS NULL;

-- 後方互換用トリガー: statusが設定されてstatus_idがNULLの場合、自動でstatus_idを設定
CREATE OR REPLACE FUNCTION set_attendance_status_id()
RETURNS TRIGGER AS $$
BEGIN
  -- status_idが未設定でstatusが設定されている場合、名前からIDを探す
  IF NEW.status_id IS NULL AND NEW.status IS NOT NULL THEN
    SELECT id INTO NEW.status_id
    FROM attendance_statuses
    WHERE store_id = NEW.store_id
      AND name = NEW.status
    LIMIT 1;
  END IF;

  -- status_idが設定されていてstatusが未設定の場合、IDから名前を設定
  IF NEW.status_id IS NOT NULL AND NEW.status IS NULL THEN
    SELECT name INTO NEW.status
    FROM attendance_statuses
    WHERE id = NEW.status_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガー作成
DROP TRIGGER IF EXISTS trigger_set_attendance_status_id ON attendance;
CREATE TRIGGER trigger_set_attendance_status_id
  BEFORE INSERT OR UPDATE ON attendance
  FOR EACH ROW
  EXECUTE FUNCTION set_attendance_status_id();

-- コメント
COMMENT ON COLUMN attendance.status_id IS '出勤ステータスID（attendance_statuses参照）';
COMMENT ON COLUMN attendance.status IS '出勤ステータス名（後方互換用、status_idを優先）';
