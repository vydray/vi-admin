-- 旧スライドバック率トリガーの削除
-- 実行方法: Supabase Dashboard > SQL Editor で実行
-- 注意: add_cast_daily_stats.sql を実行した後に実行してください

-- ============================================
-- 1. 既存のトリガーを削除
-- ============================================

DROP TRIGGER IF EXISTS trigger_calculate_sliding_back_rate ON orders;

-- ============================================
-- 2. 既存の関数を削除
-- ============================================

DROP FUNCTION IF EXISTS calculate_sliding_back_rate();

-- ============================================
-- 確認用
-- ============================================
-- トリガーが削除されたことを確認
-- SELECT * FROM pg_trigger WHERE tgname = 'trigger_calculate_sliding_back_rate';
