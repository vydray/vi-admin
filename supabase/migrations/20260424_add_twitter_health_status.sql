-- Twitter接続のヘルス状態を管理
ALTER TABLE store_twitter_settings
  ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_error_message TEXT;

COMMENT ON COLUMN store_twitter_settings.health_status IS 'healthy | broken | unknown';
