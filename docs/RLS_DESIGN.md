# Row Level Security (RLS) 設計書

このドキュメントでは、Supabaseデータベースに適用するRLSポリシーの設計を説明します。

## 目次
1. [RLSの概要](#rlsの概要)
2. [認証方式](#認証方式)
3. [ポリシー設計](#ポリシー設計)
4. [実装SQL](#実装sql)
5. [注意事項](#注意事項)

---

## RLSの概要

### RLSとは
Row Level Security（RLS）は、データベースレベルでアクセス制御を行う機能です。
各行（レコード）に対して、誰が読み取り・書き込みできるかを制御します。

### なぜRLSが必要か
- **店舗データの分離**: Store 1のデータをStore 2が見れないようにする
- **権限管理**: 管理者とキャストで操作できる範囲を制限
- **セキュリティ強化**: APIキーが漏洩しても、データアクセスを制限できる

---

## 認証方式

### 現在の認証フロー

```
[VI Admin]
  └── admin_users テーブルで認証（bcryptハッシュ）
  └── セッションCookieで管理
  └── store_idをセッションに保存

[シフト管理アプリ]
  └── LINE認証（LIFF）
  └── casts.line_number で識別
  └── JWTトークンで管理

[POSシステム]
  └── users テーブルで認証
  └── store_idをローカルストレージに保存
```

### RLS用の認証情報の渡し方

Supabaseでは、`auth.uid()`や`auth.jwt()`でユーザー情報を取得できますが、
現在のカスタム認証では使用していないため、以下の方法を検討：

#### 方法1: Supabase Auth への移行（推奨）
```typescript
// Supabase Authを使用
const { data: { user } } = await supabase.auth.getUser()
// user.id, user.app_metadata.store_id でアクセス制御
```

#### 方法2: Service Role Key + アプリ側制御
```typescript
// アプリ側でstore_idをフィルタリング（現在の方式）
const { data } = await supabase
  .from('casts')
  .select('*')
  .eq('store_id', currentStoreId)
```

#### 方法3: カスタムJWTの発行
```typescript
// サーバーサイドでカスタムJWTを発行し、store_idを含める
const token = jwt.sign({ store_id: 1 }, SUPABASE_JWT_SECRET)
const supabase = createClient(URL, ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${token}` } }
})
```

---

## ポリシー設計

### 基本方針

1. **店舗ベースのアクセス制御**: 全テーブルで`store_id`によるフィルタリング
2. **読み取りは広め、書き込みは厳格に**: SELECTは許可しやすく、INSERT/UPDATE/DELETEは厳格に
3. **管理者は全操作可能**: 管理者権限があれば全操作を許可

### テーブル別ポリシー

#### 共通テーブル

| テーブル | SELECT | INSERT | UPDATE | DELETE |
|---------|--------|--------|--------|--------|
| stores | 全員 | 管理者のみ | 管理者のみ | 不可 |
| casts | 同店舗 | 同店舗管理者 | 同店舗管理者 | 同店舗管理者 |

#### シフト管理アプリ用

| テーブル | SELECT | INSERT | UPDATE | DELETE |
|---------|--------|--------|--------|--------|
| shifts | 同店舗 | 同店舗管理者 | 同店舗管理者 | 同店舗管理者 |
| shift_requests | 同店舗 | 本人のみ | 管理者のみ | 管理者のみ |
| shift_locks | 同店舗 | 管理者のみ | 管理者のみ | 管理者のみ |

#### POSシステム用

| テーブル | SELECT | INSERT | UPDATE | DELETE |
|---------|--------|--------|--------|--------|
| attendance | 同店舗 | 同店舗 | 同店舗 | 同店舗管理者 |
| products | 同店舗 | 同店舗管理者 | 同店舗管理者 | 同店舗管理者 |
| receipts | 同店舗 | 同店舗 | 同店舗 | 不可 |
| order_items | 同店舗 | 同店舗 | 同店舗 | 不可 |

#### 管理画面用

| テーブル | SELECT | INSERT | UPDATE | DELETE |
|---------|--------|--------|--------|--------|
| admin_users | 本人のみ | スーパー管理者 | 本人のみ | スーパー管理者 |

---

## 実装SQL

### 前提: Supabase Authを使用する場合

```sql
-- ユーザーのstore_idを取得するヘルパー関数
CREATE OR REPLACE FUNCTION auth.store_id()
RETURNS INTEGER AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'store_id')::integer,
    0
  );
$$ LANGUAGE SQL STABLE;

-- ユーザーが管理者かどうかを判定するヘルパー関数
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'is_admin')::boolean,
    false
  );
$$ LANGUAGE SQL STABLE;
```

### stores テーブル

```sql
-- RLSを有効化
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- 全員が読み取り可能
CREATE POLICY "stores_select_all"
ON stores FOR SELECT
USING (true);

-- 管理者のみ更新可能
CREATE POLICY "stores_update_admin"
ON stores FOR UPDATE
USING (auth.is_admin())
WITH CHECK (auth.is_admin());
```

### casts テーブル

```sql
-- RLSを有効化
ALTER TABLE casts ENABLE ROW LEVEL SECURITY;

-- 同じ店舗のキャストのみ読み取り可能
CREATE POLICY "casts_select_same_store"
ON casts FOR SELECT
USING (store_id = auth.store_id());

-- 同じ店舗の管理者のみ作成可能
CREATE POLICY "casts_insert_admin"
ON casts FOR INSERT
WITH CHECK (
  store_id = auth.store_id()
  AND auth.is_admin()
);

-- 同じ店舗の管理者のみ更新可能
CREATE POLICY "casts_update_admin"
ON casts FOR UPDATE
USING (
  store_id = auth.store_id()
  AND auth.is_admin()
)
WITH CHECK (
  store_id = auth.store_id()
  AND auth.is_admin()
);

-- 同じ店舗の管理者のみ削除可能
CREATE POLICY "casts_delete_admin"
ON casts FOR DELETE
USING (
  store_id = auth.store_id()
  AND auth.is_admin()
);
```

### shifts テーブル

```sql
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- 同じ店舗のシフトのみ読み取り可能
CREATE POLICY "shifts_select_same_store"
ON shifts FOR SELECT
USING (store_id = auth.store_id());

-- 管理者のみ作成可能
CREATE POLICY "shifts_insert_admin"
ON shifts FOR INSERT
WITH CHECK (
  store_id = auth.store_id()
  AND auth.is_admin()
);

-- 管理者のみ更新可能
CREATE POLICY "shifts_update_admin"
ON shifts FOR UPDATE
USING (
  store_id = auth.store_id()
  AND auth.is_admin()
);

-- 管理者のみ削除可能
CREATE POLICY "shifts_delete_admin"
ON shifts FOR DELETE
USING (
  store_id = auth.store_id()
  AND auth.is_admin()
);
```

### shift_requests テーブル

```sql
ALTER TABLE shift_requests ENABLE ROW LEVEL SECURITY;

-- 同じ店舗のシフト希望のみ読み取り可能
CREATE POLICY "shift_requests_select_same_store"
ON shift_requests FOR SELECT
USING (store_id = auth.store_id());

-- 本人のみ作成可能
CREATE POLICY "shift_requests_insert_own"
ON shift_requests FOR INSERT
WITH CHECK (
  store_id = auth.store_id()
  AND cast_id = auth.cast_id()  -- 要: auth.cast_id()関数の実装
);

-- 管理者のみ更新可能（承認/却下）
CREATE POLICY "shift_requests_update_admin"
ON shift_requests FOR UPDATE
USING (
  store_id = auth.store_id()
  AND auth.is_admin()
);
```

### attendance テーブル

```sql
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- 同じ店舗の勤怠のみ読み取り可能
CREATE POLICY "attendance_select_same_store"
ON attendance FOR SELECT
USING (store_id = auth.store_id());

-- 同じ店舗なら作成可能
CREATE POLICY "attendance_insert_same_store"
ON attendance FOR INSERT
WITH CHECK (store_id = auth.store_id());

-- 同じ店舗なら更新可能
CREATE POLICY "attendance_update_same_store"
ON attendance FOR UPDATE
USING (store_id = auth.store_id());

-- 管理者のみ削除可能
CREATE POLICY "attendance_delete_admin"
ON attendance FOR DELETE
USING (
  store_id = auth.store_id()
  AND auth.is_admin()
);
```

### products テーブル

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 同じ店舗の商品のみ読み取り可能
CREATE POLICY "products_select_same_store"
ON products FOR SELECT
USING (store_id = auth.store_id());

-- 管理者のみ作成可能
CREATE POLICY "products_insert_admin"
ON products FOR INSERT
WITH CHECK (
  store_id = auth.store_id()
  AND auth.is_admin()
);

-- 管理者のみ更新可能
CREATE POLICY "products_update_admin"
ON products FOR UPDATE
USING (
  store_id = auth.store_id()
  AND auth.is_admin()
);
```

### receipts テーブル

```sql
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- 同じ店舗のレシートのみ読み取り可能
CREATE POLICY "receipts_select_same_store"
ON receipts FOR SELECT
USING (store_id = auth.store_id());

-- 同じ店舗なら作成可能
CREATE POLICY "receipts_insert_same_store"
ON receipts FOR INSERT
WITH CHECK (store_id = auth.store_id());

-- 同じ店舗なら更新可能
CREATE POLICY "receipts_update_same_store"
ON receipts FOR UPDATE
USING (store_id = auth.store_id());

-- 削除は不可（会計データの保全）
-- DELETE ポリシーなし = 誰も削除できない
```

### admin_users テーブル

```sql
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- 本人のみ読み取り可能
CREATE POLICY "admin_users_select_own"
ON admin_users FOR SELECT
USING (id = auth.uid()::integer);

-- 本人のみパスワード更新可能
CREATE POLICY "admin_users_update_own"
ON admin_users FOR UPDATE
USING (id = auth.uid()::integer)
WITH CHECK (id = auth.uid()::integer);
```

---

## Service Role Key を使う場合（RLSバイパス）

管理画面（VI Admin）では、Service Role Keyを使用してRLSをバイパスすることも可能です：

```typescript
// lib/supabase-admin.ts
import { createClient } from '@supabase/supabase-js'

// Service Role Key はRLSをバイパス
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!  // Service Role Key
)

// 使用例（サーバーサイドのみ）
const { data } = await supabaseAdmin
  .from('casts')
  .select('*')
  // store_idのフィルタリングはアプリ側で行う
  .eq('store_id', storeId)
```

**注意**: Service Role KeyはRLSを完全にバイパスするため、
サーバーサイド（API Routes）でのみ使用し、クライアントには絶対に渡さないこと。

---

## 注意事項

### 1. 現在の実装との互換性

現在は`anon key`でRLSなしで運用しています。
RLSを有効化すると、既存のクエリが動作しなくなる可能性があります。

**移行手順:**
1. 開発環境でRLSを有効化してテスト
2. 各アプリの認証をSupabase Authに移行
3. 本番環境でRLSを有効化

### 2. Service Role Key の管理

- Service Role KeyはRLSをバイパスするため、慎重に管理
- クライアントサイドでは絶対に使用しない
- 環境変数として安全に保管

### 3. パフォーマンスへの影響

RLSポリシーは各クエリで評価されるため、複雑なポリシーはパフォーマンスに影響します。

**最適化のポイント:**
- ポリシーはシンプルに保つ
- `store_id`カラムにインデックスを作成
- 必要最小限のポリシーのみ定義

### 4. デバッグ方法

```sql
-- 現在のユーザー情報を確認
SELECT auth.uid(), auth.store_id(), auth.is_admin();

-- ポリシーの一覧を確認
SELECT * FROM pg_policies WHERE tablename = 'casts';

-- RLSを一時的に無効化（デバッグ用）
ALTER TABLE casts DISABLE ROW LEVEL SECURITY;
```

---

## 推奨する実装順序

1. **フェーズ1: 準備**
   - [ ] Supabase Authへの移行計画を立てる
   - [ ] ヘルパー関数（auth.store_id等）を作成
   - [ ] 開発環境で動作確認

2. **フェーズ2: 段階的RLS有効化**
   - [ ] `stores`テーブルからRLSを有効化
   - [ ] 各テーブルを1つずつRLS有効化
   - [ ] 各アプリで動作確認

3. **フェーズ3: 本番適用**
   - [ ] 本番環境でRLS有効化
   - [ ] モニタリングとログ確認
   - [ ] 問題があれば即座にロールバック

---

## 更新履歴

| 日付 | 変更内容 |
|------|----------|
| 2025-11-28 | 初版作成 |
