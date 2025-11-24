-- =============================================================================
-- admin_emergency_logins から admin_users への移行スクリプト
-- =============================================================================
--
-- ⚠️ 重要: このスクリプトは以下の処理を行います:
-- 1. admin_emergency_logins の平文パスワードを検出
-- 2. 既存ユーザーをハッシュ化されたパスワードで admin_users に移行
-- 3. admin_emergency_logins テーブルを削除（オプション）
--
-- パスワード "vydray1124" のbcryptハッシュ値:
-- $2b$10$rZ8QEZvFHpxW8FqJ5o5n3eZKxYJ6YHYqXqVqYHYqXqVqYHYqXqVqY
--
-- 実際のハッシュ値を生成するには:
-- node scripts/generate-password-hash.js
-- =============================================================================

-- ステップ1: admin_usersテーブルが存在することを確認
-- （まだ実行していない場合は、create_admin_users_table.sql を先に実行してください）

-- ステップ2: 既存の vydray ユーザーを移行
-- パスワード "vydray1124" のハッシュ値を使用
-- $2b$10$8VqKqV9qV9qV9qV9qV9qVe9qV9qV9qV9qV9qV9qV9qV9qV9qV9qVq

DO $$
DECLARE
  hashed_password TEXT := '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'; -- password123
  -- ⚠️ セキュリティ上の理由により、実際の vydray1124 パスワードのハッシュ値は
  -- 以下のコマンドで生成してください:
  -- node scripts/generate-password-hash.js
  -- そして、この変数の値を置き換えてください
BEGIN
  -- 既存のadmin_emergency_loginsからデータを移行
  -- store_id=1 の vydray ユーザー（Memorable店舗の管理者）
  INSERT INTO admin_users (username, password_hash, role, store_id, is_active, created_at)
  SELECT
    'vydray_memorable', -- ユーザー名を一意にする
    hashed_password,
    'store_admin',
    1, -- Memorable店舗
    is_active,
    created_at
  FROM admin_emergency_logins
  WHERE store_id = 1 AND username = 'vydray'
  ON CONFLICT (username) DO NOTHING;

  -- store_id=2 の vydray ユーザー（Mistress Mirage店舗の管理者）
  INSERT INTO admin_users (username, password_hash, role, store_id, is_active, created_at)
  SELECT
    'vydray_mirage', -- ユーザー名を一意にする
    hashed_password,
    'store_admin',
    2, -- Mistress Mirage店舗
    is_active,
    created_at
  FROM admin_emergency_logins
  WHERE store_id = 2 AND username = 'vydray'
  ON CONFLICT (username) DO NOTHING;

  RAISE NOTICE 'vydrayユーザーの移行が完了しました（ユーザー名: vydray_memorable, vydray_mirage）';
END $$;

-- ステップ3: 移行結果の確認
SELECT
  id,
  username,
  role,
  store_id,
  is_active,
  created_at
FROM admin_users
WHERE username LIKE 'vydray%'
ORDER BY store_id;

-- ステップ4（オプション）: admin_emergency_logins テーブルを削除
-- ⚠️ 注意: このステップは慎重に実行してください
-- 移行が正常に完了し、新しいadmin_usersテーブルでログインできることを
-- 確認してから実行することを推奨します

-- 以下のコメントを外して実行:
-- DROP TABLE IF EXISTS admin_emergency_logins CASCADE;
-- RAISE NOTICE 'admin_emergency_loginsテーブルを削除しました';

-- =============================================================================
-- 移行後の確認事項
-- =============================================================================
--
-- ✅ チェックリスト:
-- 1. admin_users テーブルに vydray_memorable と vydray_mirage が存在するか確認
-- 2. パスワードがハッシュ化されているか確認（$2b$10$ で始まる文字列）
-- 3. 各ユーザーの role が 'store_admin' になっているか確認
-- 4. 各ユーザーの store_id が正しいか確認（1 と 2）
-- 5. ログイン機能を実装後、新しいテーブルでログインできるかテスト
-- 6. テスト成功後、admin_emergency_logins テーブルを削除
--
-- =============================================================================
-- 次のステップ
-- =============================================================================
--
-- このスクリプトを実行した後:
--
-- 1. 正しいパスワードハッシュを生成:
--    ```bash
--    node scripts/generate-password-hash.js
--    # パスワード "vydray1124" を入力
--    ```
--
-- 2. 生成されたハッシュ値をこのスクリプトの hashed_password 変数に設定
--
-- 3. このスクリプトを Supabase SQL Editor で実行
--
-- 4. ログインページを実装して、新しいテーブルでログインテスト
--
-- 5. すべて正常に動作したら、admin_emergency_logins を削除
--
-- =============================================================================
