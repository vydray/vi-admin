-- 管理者ユーザーテーブルの作成
CREATE TABLE admin_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'store_admin')),
  store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- 制約: super_adminの場合はstore_idはNULL、store_adminの場合は必須
  CONSTRAINT check_store_admin_has_store CHECK (
    (role = 'super_admin' AND store_id IS NULL) OR
    (role = 'store_admin' AND store_id IS NOT NULL)
  )
);

-- インデックス作成
CREATE INDEX idx_admin_users_username ON admin_users(username);
CREATE INDEX idx_admin_users_store_id ON admin_users(store_id);
CREATE INDEX idx_admin_users_role ON admin_users(role);

-- updated_atの自動更新トリガー
CREATE OR REPLACE FUNCTION update_admin_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_admin_users_updated_at
BEFORE UPDATE ON admin_users
FOR EACH ROW
EXECUTE FUNCTION update_admin_users_updated_at();

-- コメント追加
COMMENT ON TABLE admin_users IS '管理画面へのアクセス用の管理者ユーザーテーブル';
COMMENT ON COLUMN admin_users.username IS 'ログイン用のユーザー名（一意）';
COMMENT ON COLUMN admin_users.password_hash IS 'bcryptでハッシュ化されたパスワード';
COMMENT ON COLUMN admin_users.role IS '権限レベル: super_admin（全店舗）, store_admin（単一店舗）';
COMMENT ON COLUMN admin_users.store_id IS '店舗管理者が管理する店舗ID（super_adminの場合はNULL）';
COMMENT ON COLUMN admin_users.is_active IS 'アカウントの有効/無効フラグ';

-- サンプルデータ挿入用のSQL（手動で実行）
-- パスワードは "password123" のbcryptハッシュ値（$2b$10$YourHashHere）
-- 実際の運用では、アプリケーション側でハッシュ化したパスワードを使用してください

-- 例：
-- INSERT INTO admin_users (username, password_hash, role, store_id) VALUES
-- ('superadmin', '$2b$10$...', 'super_admin', NULL),
-- ('memorable_admin', '$2b$10$...', 'store_admin', 1),
-- ('mirage_admin', '$2b$10$...', 'store_admin', 2);
