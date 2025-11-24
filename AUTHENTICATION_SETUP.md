# 認証システムのセットアップ手順

## 1. admin_usersテーブルの作成

### 手順

1. **Supabaseダッシュボードにアクセス**
   - https://supabase.com/dashboard にアクセス
   - プロジェクトを選択

2. **SQL Editorを開く**
   - 左メニューから「SQL Editor」をクリック
   - 「New query」をクリック

3. **SQLを実行**
   - `supabase/create_admin_users_table.sql` の内容をコピー
   - SQL Editorに貼り付けて「Run」をクリック

4. **テーブル作成の確認**
   - 左メニュー「Table Editor」から `admin_users` テーブルが作成されていることを確認

---

## 2. 初期管理者ユーザーの作成

### オプション1: Supabase SQL Editorで直接作成（推奨）

最初のsuper_adminユーザーを作成するには、SQL Editorで以下のSQLを実行します：

```sql
-- パスワード "password123" のハッシュ値を使用（本番環境では必ず変更してください）
-- ハッシュ値: $2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW

INSERT INTO admin_users (username, password_hash, role, store_id) VALUES
('admin', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'super_admin', NULL);
```

**⚠️ 重要:**
- このパスワードは開発用です
- 本番環境では必ず強力なパスワードに変更してください
- ログイン後、すぐにパスワードを変更してください

### オプション2: Node.jsスクリプトで作成

より安全な方法として、bcryptを使って独自のパスワードハッシュを生成できます。

1. **bcryptパッケージのインストール**（まだの場合）
   ```bash
   npm install bcryptjs
   ```

2. **パスワードハッシュ生成スクリプトの実行**
   ```bash
   node scripts/generate-password-hash.js
   ```

3. **生成されたハッシュをSQLに使用**
   ```sql
   INSERT INTO admin_users (username, password_hash, role, store_id) VALUES
   ('your_username', '生成されたハッシュ値', 'super_admin', NULL);
   ```

---

## 3. テーブル構造

### admin_users テーブル

| カラム名 | 型 | 説明 |
|---------|-----|------|
| id | SERIAL | 主キー |
| username | VARCHAR(50) | ログイン用ユーザー名（一意） |
| password_hash | VARCHAR(255) | bcryptでハッシュ化されたパスワード |
| role | VARCHAR(20) | 権限: `super_admin` または `store_admin` |
| store_id | INTEGER | 店舗ID（super_adminの場合はNULL） |
| is_active | BOOLEAN | アカウント有効/無効フラグ |
| created_at | TIMESTAMP | 作成日時 |
| updated_at | TIMESTAMP | 更新日時 |

### 権限レベル

- **super_admin**: 全店舗のデータにアクセス可能、店舗切り替え可能
- **store_admin**: 特定の1店舗のみアクセス可能、店舗切り替え不可

---

## 4. 店舗管理者の追加方法

店舗管理者を追加する場合は、以下のSQLを実行します：

```sql
-- 例: Memorable店舗（store_id=1）の管理者を追加
INSERT INTO admin_users (username, password_hash, role, store_id) VALUES
('memorable_admin', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'store_admin', 1);

-- 例: Mistress Mirage店舗（store_id=2）の管理者を追加
INSERT INTO admin_users (username, password_hash, role, store_id) VALUES
('mirage_admin', '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'store_admin', 2);
```

---

## 5. セキュリティ上の注意事項

### パスワード管理
- ❌ **絶対にしないこと**: パスワードを平文でデータベースに保存
- ✅ **必ずすること**: bcryptでハッシュ化してから保存
- ✅ **推奨**: パスワードの最小文字数は8文字以上
- ✅ **推奨**: 定期的なパスワード変更

### 本番環境デプロイ前
1. すべてのデフォルトパスワードを変更
2. パスワードポリシーの確認
3. アカウントのロック機能の実装（オプション）
4. ログイン履歴の記録（オプション）

---

## 次のステップ

1. ✅ admin_usersテーブル作成（このファイル）
2. ⏳ ログインページの実装
3. ⏳ 認証ミドルウェアの実装
4. ⏳ StoreContextへの権限統合
5. ⏳ ログアウト機能の実装

---

**最終更新:** 2025-11-25
