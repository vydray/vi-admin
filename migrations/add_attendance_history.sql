-- 勤怠修正履歴テーブルのマイグレーション
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- ============================================
-- 1. attendance テーブルにカラム追加
-- ============================================

-- 修正済みフラグと最終修正日時を追加
ALTER TABLE attendance
ADD COLUMN IF NOT EXISTS is_modified BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN attendance.is_modified IS '締め時刻後に修正されたかどうか';
COMMENT ON COLUMN attendance.last_modified_at IS '最終修正日時';

-- ============================================
-- 2. attendance_history テーブル作成（修正履歴）
-- ============================================

CREATE TABLE IF NOT EXISTS attendance_history (
    id SERIAL PRIMARY KEY,
    attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
    store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- 修正前の値
    previous_status_id UUID,
    previous_check_in_datetime TIMESTAMP WITH TIME ZONE,
    previous_check_out_datetime TIMESTAMP WITH TIME ZONE,
    previous_late_minutes INTEGER,
    previous_break_minutes INTEGER,
    previous_daily_payment INTEGER,
    previous_costume_id INTEGER,

    -- 修正後の値
    new_status_id UUID,
    new_check_in_datetime TIMESTAMP WITH TIME ZONE,
    new_check_out_datetime TIMESTAMP WITH TIME ZONE,
    new_late_minutes INTEGER,
    new_break_minutes INTEGER,
    new_daily_payment INTEGER,
    new_costume_id INTEGER,

    -- 修正情報
    modified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    modified_source VARCHAR(20) NOT NULL DEFAULT 'admin', -- 'pos' or 'admin'
    modified_by UUID, -- 将来の権限管理用（ユーザーID）
    reason TEXT, -- 修正理由（任意）

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_attendance_history_attendance
ON attendance_history(attendance_id);

CREATE INDEX IF NOT EXISTS idx_attendance_history_store_date
ON attendance_history(store_id, modified_at);

COMMENT ON TABLE attendance_history IS '勤怠修正履歴';
COMMENT ON COLUMN attendance_history.attendance_id IS '修正対象の勤怠レコードID';
COMMENT ON COLUMN attendance_history.modified_source IS '修正元: pos=POS, admin=管理画面';
COMMENT ON COLUMN attendance_history.modified_by IS '修正者ID（将来の権限管理用）';
COMMENT ON COLUMN attendance_history.reason IS '修正理由';

-- ============================================
-- 3. RLS（Row Level Security）設定
-- ============================================

ALTER TABLE attendance_history ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーに全操作を許可
DROP POLICY IF EXISTS "Allow all for authenticated users" ON attendance_history;
CREATE POLICY "Allow all for authenticated users" ON attendance_history
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- 4. 勤怠更新時に履歴を自動記録するトリガー関数
-- ============================================

CREATE OR REPLACE FUNCTION record_attendance_history()
RETURNS TRIGGER AS $$
DECLARE
    cutoff_hour INTEGER;
    attendance_date DATE;
    cutoff_datetime TIMESTAMP WITH TIME ZONE;
    is_after_cutoff BOOLEAN;
BEGIN
    -- 営業日切替時刻を取得
    SELECT COALESCE(
        (SELECT setting_value::INTEGER
         FROM store_settings
         WHERE store_id = NEW.store_id
         AND setting_name = 'business_day_cutoff_hour'),
        6
    ) INTO cutoff_hour;

    -- 勤怠の日付
    attendance_date := NEW.date;

    -- 締め時刻（翌日のcutoff_hour時）
    cutoff_datetime := (attendance_date + INTERVAL '1 day')::DATE + (cutoff_hour || ' hours')::INTERVAL;

    -- 現在時刻が締め時刻を過ぎているかチェック
    is_after_cutoff := NOW() > cutoff_datetime;

    -- 値が変更されているかチェック
    IF OLD.status_id IS DISTINCT FROM NEW.status_id
       OR OLD.check_in_datetime IS DISTINCT FROM NEW.check_in_datetime
       OR OLD.check_out_datetime IS DISTINCT FROM NEW.check_out_datetime
       OR OLD.late_minutes IS DISTINCT FROM NEW.late_minutes
       OR OLD.break_minutes IS DISTINCT FROM NEW.break_minutes
       OR OLD.daily_payment IS DISTINCT FROM NEW.daily_payment
       OR OLD.costume_id IS DISTINCT FROM NEW.costume_id
    THEN
        -- 締め時刻後の修正の場合のみ履歴を記録
        IF is_after_cutoff THEN
            INSERT INTO attendance_history (
                attendance_id,
                store_id,
                previous_status_id,
                previous_check_in_datetime,
                previous_check_out_datetime,
                previous_late_minutes,
                previous_break_minutes,
                previous_daily_payment,
                previous_costume_id,
                new_status_id,
                new_check_in_datetime,
                new_check_out_datetime,
                new_late_minutes,
                new_break_minutes,
                new_daily_payment,
                new_costume_id,
                modified_source
            ) VALUES (
                NEW.id,
                NEW.store_id,
                OLD.status_id,
                OLD.check_in_datetime,
                OLD.check_out_datetime,
                OLD.late_minutes,
                OLD.break_minutes,
                OLD.daily_payment,
                OLD.costume_id,
                NEW.status_id,
                NEW.check_in_datetime,
                NEW.check_out_datetime,
                NEW.late_minutes,
                NEW.break_minutes,
                NEW.daily_payment,
                NEW.costume_id,
                'admin' -- 管理画面からの更新として記録
            );

            -- 修正フラグを立てる
            NEW.is_modified := TRUE;
            NEW.last_modified_at := NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- トリガーを設定
DROP TRIGGER IF EXISTS trigger_attendance_history ON attendance;
CREATE TRIGGER trigger_attendance_history
BEFORE UPDATE ON attendance
FOR EACH ROW
EXECUTE FUNCTION record_attendance_history();

-- ============================================
-- 確認用クエリ
-- ============================================
-- SELECT * FROM attendance WHERE is_modified = TRUE;
-- SELECT * FROM attendance_history ORDER BY modified_at DESC LIMIT 10;
