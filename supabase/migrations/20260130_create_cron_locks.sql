-- Cron Job重複実行防止のためのロックテーブル
CREATE TABLE IF NOT EXISTS cron_locks (
  job_name TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

-- 古いロックを自動削除するインデックス
CREATE INDEX IF NOT EXISTS idx_cron_locks_expires_at ON cron_locks(expires_at);

-- Cron Jobロックを取得する関数
CREATE OR REPLACE FUNCTION acquire_cron_lock(
  p_job_name TEXT,
  p_ttl_seconds INT DEFAULT 300,
  p_locked_by TEXT DEFAULT 'vercel-cron'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  current_time TIMESTAMPTZ := NOW();
  lock_acquired BOOLEAN;
BEGIN
  -- 期限切れのロックをクリーンアップ
  DELETE FROM cron_locks WHERE expires_at < current_time;

  -- ロックを取得（競合時はスキップ）
  INSERT INTO cron_locks (job_name, locked_at, locked_by, expires_at)
  VALUES (
    p_job_name,
    current_time,
    p_locked_by,
    current_time + (p_ttl_seconds || ' seconds')::INTERVAL
  )
  ON CONFLICT (job_name) DO NOTHING
  RETURNING TRUE INTO lock_acquired;

  -- ロックが取得できたかどうかを返す
  RETURN COALESCE(lock_acquired, FALSE);
END;
$$;

-- Cron Jobロックを解放する関数
CREATE OR REPLACE FUNCTION release_cron_lock(p_job_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  lock_released BOOLEAN;
BEGIN
  DELETE FROM cron_locks WHERE job_name = p_job_name
  RETURNING TRUE INTO lock_released;

  RETURN COALESCE(lock_released, FALSE);
END;
$$;

-- RLSを無効化（Cron Jobはサービスロールキーで実行される）
ALTER TABLE cron_locks ENABLE ROW LEVEL SECURITY;

-- サービスロールのみアクセス可能
CREATE POLICY "Service role only" ON cron_locks
  FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE cron_locks IS 'Cron Job重複実行防止のための分散ロックテーブル';
COMMENT ON FUNCTION acquire_cron_lock IS 'Cron Jobロックを取得。成功時はTRUE、既にロックされている場合はFALSEを返す';
COMMENT ON FUNCTION release_cron_lock IS 'Cron Jobロックを解放。成功時はTRUE、ロックが存在しない場合はFALSEを返す';
