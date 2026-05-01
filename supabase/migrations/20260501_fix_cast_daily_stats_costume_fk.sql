-- cast_daily_stats.costume_id の FK 制約を costumes → uniforms に変更
-- 旧 costumes テーブル時代の FK が残っており、新 uniforms テーブルの ID で
-- INSERT すると FK violation を起こして cast_daily_stats の upsert が失敗していた。
-- これにより cast_daily_items の delete+insert もスキップされ、recalc が機能していなかった。

-- 既存の壊れたデータをクリーンアップ: uniforms に存在しない costume_id は null にする
UPDATE cast_daily_stats
SET costume_id = NULL
WHERE costume_id IS NOT NULL
  AND costume_id NOT IN (SELECT id FROM uniforms);

-- 古い FK 制約を削除
ALTER TABLE cast_daily_stats
  DROP CONSTRAINT IF EXISTS cast_daily_stats_costume_id_fkey;

-- 新しい FK 制約を uniforms に対して張る
-- 衣装が削除された場合は costume_id を null にする（履歴は残す）
ALTER TABLE cast_daily_stats
  ADD CONSTRAINT cast_daily_stats_costume_id_fkey
  FOREIGN KEY (costume_id) REFERENCES uniforms(id) ON DELETE SET NULL;

-- 同様に attendance テーブルの FK も確認・修正
-- attendance.costume_id が costumes を参照していた場合は uniforms に切り替え
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu USING (constraint_name)
    WHERE tc.table_name = 'attendance'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'costume_id'
  ) THEN
    -- 既存制約があれば探して削除
    EXECUTE (
      SELECT 'ALTER TABLE attendance DROP CONSTRAINT ' || tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu USING (constraint_name)
      WHERE tc.table_name = 'attendance'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'costume_id'
      LIMIT 1
    );
  END IF;
END $$;

-- attendance の壊れたデータもクリーンアップ
UPDATE attendance
SET costume_id = NULL
WHERE costume_id IS NOT NULL
  AND costume_id NOT IN (SELECT id FROM uniforms);

ALTER TABLE attendance
  ADD CONSTRAINT attendance_costume_id_fkey
  FOREIGN KEY (costume_id) REFERENCES uniforms(id) ON DELETE SET NULL;
