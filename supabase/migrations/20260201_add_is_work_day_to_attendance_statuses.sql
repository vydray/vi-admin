-- attendance_statusesテーブルにis_work_dayカラムを追加
ALTER TABLE attendance_statuses
ADD COLUMN IF NOT EXISTS is_work_day BOOLEAN DEFAULT true;

-- 既存データに適切な値を設定
-- 欠勤系（is_active = false）は出勤扱いにしない
UPDATE attendance_statuses
SET is_work_day = false
WHERE is_active = false;

-- 出勤系（is_active = true）は出勤扱いにする
UPDATE attendance_statuses
SET is_work_day = true
WHERE is_active = true;

COMMENT ON COLUMN attendance_statuses.is_work_day IS '出勤日数としてカウントするかどうか';
