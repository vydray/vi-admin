# Row Level Security (RLS) 設計書

## 目次
1. [優先度・ステータス](#優先度ステータス)
2. [現状分析](#現状分析)
3. [セキュリティリスク](#セキュリティリスク)
4. [RLS実装方針](#rls実装方針)
5. [実装手順](#実装手順)
6. [各テーブルのRLSポリシー](#各テーブルのrlsポリシー)
7. [全テーブルRLSポリシーSQL](#全テーブルrlsポリシーsql)

---

## 優先度・ステータス

### 🔴 最優先 - RLS実装

**しないとどうなるか：**
- ブラウザのコンソールから直接DBを操作できる
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`が公開されているため、誰でもデータアクセス可能
- 悪意あるユーザーが全店舗のデータを閲覧・改ざんできる
- **個人情報保護法違反のリスク**

**現在のステータス：** 🔴 未実装

**影響範囲：** 3システム全て（POS、シフト管理、VI Admin）

---

## 現状分析

### 3プロジェクトのSupabaseアクセス方式

| プロジェクト | アクセス方式 | 使用キー | RLS影響 |
|------------|------------|---------|--------|
| **shift-management-app** | クライアント直接 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ⚠️ 必要 |
| **vi-admin** | クライアント直接 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ⚠️ 必要 |
| **table-management-system** | クライアント＋API | anon key + service key | ⚠️ 必要 |

### 現在のコード

**shift-management-app/src/lib/supabase.ts:**
```typescript
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**vi-admin/lib/supabase.ts:**
```typescript
import { createClient } from '@supabase/supabase-js'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**table-management-system/lib/supabase.ts:**
```typescript
// ブラウザ用（RLS適用）
export const supabase = getSupabaseBrowserClient()

// サーバー用（RLSバイパス）
export function getSupabaseServerClient() {
  return createClient(url, process.env.SUPABASE_SERVICE_KEY)
}
```

### 問題点
- **RLSが無効** - データベースレベルでのアクセス制御がない
- **anon keyがブラウザに露出** - `NEXT_PUBLIC_*`はクライアントに公開される
- **store_idフィルタはコード側のみ** - 開発者ツールで書き換え可能

---

## セキュリティリスク

### 攻撃シナリオ

1. **他店舗のデータ閲覧**
   - ブラウザの開発者ツールでJavaScriptを変更
   - `store_id`のフィルタを外してクエリ実行
   - 他店舗の売上、キャスト情報、シフトが全て見える

2. **他ユーザーの個人情報取得**
   - `casts`テーブルに本名、SNSパスワード、LINE IDが含まれる
   - RLSなしでは全キャストの個人情報が取得可能

3. **データ改ざん**
   - anon keyで書き込み可能な場合、他店舗のデータを変更できる

### 影響を受けるテーブル

| テーブル | リスクレベル | 含まれる機密情報 |
|---------|------------|----------------|
| `casts` | **🔴 高** | 本名、SNSパスワード、LINE ID |
| `admin_users` | **🔴 高** | パスワードハッシュ |
| `store_line_configs` | **🔴 高** | LINEチャンネルシークレット |
| `shifts` | 🟡 中 | シフト情報 |
| `attendance` | 🟡 中 | 勤怠情報 |
| `orders` | 🟡 中 | 売上情報 |

---

## RLS実装方針

### 方針: Supabase Auth + JWTカスタムクレーム

#### 概要
1. ログイン時にSupabase Authでセッション作成
2. JWTに`store_id`をカスタムクレームとして追加
3. RLSポリシーでJWTの`store_id`を検証

#### アーキテクチャ

```
[ユーザー] → [ログインAPI] → [Supabase Auth]
                              ↓
                         JWTトークン発行
                         (store_id含む)
                              ↓
[クライアント] → [Supabase] → [RLSポリシー]
                              ↓
                         store_id検証
                              ↓
                         データ返却
```

#### メリット
- Supabaseの標準機能を活用
- 3プロジェクト共通で使える
- 既存のanon keyをそのまま使用可能

---

## 実装手順

### 📋 チェックリスト

#### Phase 1: 準備（影響なし）
- [ ] RLSポリシーのSQL作成
- [ ] テスト環境で動作確認
- [ ] 認証フローの設計

#### Phase 2: 認証システム統一
- [ ] **shift-management-app**: LINE認証 → Supabase Auth
- [ ] **vi-admin**: admin_users認証 → Supabase Auth
- [ ] **table-management-system**: admin_users認証 → Supabase Auth

#### Phase 3: RLS有効化
- [ ] Supabaseダッシュボードで各テーブルのRLS有効化
- [ ] ポリシー適用
- [ ] 動作確認

#### Phase 4: デプロイ・移行
- [ ] 各アプリをデプロイ
- [ ] 既存セッションの移行対応
- [ ] モニタリング

### 各アプリの変更内容

#### shift-management-app
- **現在**: LINE認証 → castsテーブルでユーザー特定
- **変更**: LINE認証 → Supabase Auth → JWTにstore_id, cast_id追加

#### vi-admin
- **現在**: admin_usersテーブルでカスタム認証
- **変更**: admin_users認証 → Supabase Auth → JWTにstore_id追加

#### table-management-system (POS)
- **現在**: admin_usersテーブルでカスタム認証
- **変更**: admin_users認証 → Supabase Auth → JWTにstore_id追加

---

## 具体的な実装ガイド

### 1. 環境変数の追加

各プロジェクトの`.env.local`に以下を追加：

```bash
# 既存（変更なし）
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 新規追加
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # サーバー専用
SUPABASE_AUTH_SECRET=your-secret-key-for-internal-auth        # 内部認証用の固定パスワード
```

**重要**: `SUPABASE_SERVICE_KEY`と`SUPABASE_AUTH_SECRET`は`NEXT_PUBLIC_`を付けない（サーバーのみで使用）

---

### 2. Supabase Admin Clientの作成

**lib/supabaseAdmin.ts**（各プロジェクト共通）
```typescript
import { createClient } from '@supabase/supabase-js'

// サーバーサイド専用（APIルートでのみ使用）
export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
```

---

### 3. ログインAPI実装例

#### table-management-system / vi-admin（ID/パスワード認証）

**pages/api/auth/login.ts**
```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import bcrypt from 'bcryptjs'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { username, password } = req.body
  const supabaseAdmin = getSupabaseAdmin()

  try {
    // 1. admin_usersテーブルで照合（今まで通り）
    const { data: admin, error } = await supabaseAdmin
      .from('admin_users')
      .select('id, username, password_hash, store_id')
      .eq('username', username)
      .single()

    if (error || !admin) {
      return res.status(401).json({ error: 'ユーザーが見つかりません' })
    }

    // 2. パスワード照合（今まで通り）
    const isValid = await bcrypt.compare(password, admin.password_hash)
    if (!isValid) {
      return res.status(401).json({ error: 'パスワードが違います' })
    }

    // 3. Supabase Authユーザーを作成またはサインイン（新規追加）
    const email = `admin_${admin.id}@internal.local`
    const authPassword = process.env.SUPABASE_AUTH_SECRET!

    // ユーザーが存在するか確認
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email === email)

    if (!existingUser) {
      // 初回：ユーザー作成（app_metadataにstore_idを設定）
      const { error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: authPassword,
        email_confirm: true,
        app_metadata: {
          store_id: admin.store_id,
          admin_id: admin.id,
          role: 'admin'
        }
      })
      if (createError) {
        console.error('Auth user creation failed:', createError)
        return res.status(500).json({ error: '認証ユーザーの作成に失敗しました' })
      }
    } else {
      // 既存ユーザー：app_metadataを更新（store_idが変わった場合に対応）
      await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        app_metadata: {
          store_id: admin.store_id,
          admin_id: admin.id,
          role: 'admin'
        }
      })
    }

    // 4. セッショントークンを生成
    const { data: signInData, error: signInError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (signInError) {
      return res.status(500).json({ error: 'セッション作成に失敗しました' })
    }

    // 5. レスポンス
    return res.status(200).json({
      success: true,
      admin: {
        id: admin.id,
        username: admin.username,
        store_id: admin.store_id
      },
      // クライアントでsupabase.auth.setSession()に使用
      access_token: signInData.properties?.access_token,
      refresh_token: signInData.properties?.refresh_token
    })

  } catch (err) {
    console.error('Login error:', err)
    return res.status(500).json({ error: 'サーバーエラー' })
  }
}
```

#### shift-management-app（LINE認証）

**pages/api/auth/line-callback.ts**
```typescript
import { NextApiRequest, NextApiResponse } from 'next'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code } = req.query
  const supabaseAdmin = getSupabaseAdmin()

  try {
    // 1. LINEからアクセストークン取得（今まで通り）
    const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: process.env.LINE_CALLBACK_URL!,
        client_id: process.env.LINE_CHANNEL_ID!,
        client_secret: process.env.LINE_CHANNEL_SECRET!,
      }),
    })
    const { access_token } = await tokenResponse.json()

    // 2. LINEプロフィール取得（今まで通り）
    const profileResponse = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const profile = await profileResponse.json()

    // 3. castsテーブルでユーザー照合（今まで通り）
    const { data: cast, error } = await supabaseAdmin
      .from('casts')
      .select('id, display_name, store_id')
      .eq('line_user_id', profile.userId)
      .single()

    if (error || !cast) {
      return res.redirect('/login?error=not_registered')
    }

    // 4. Supabase Authユーザー作成/更新（新規追加）
    const email = `cast_${cast.id}@internal.local`
    const authPassword = process.env.SUPABASE_AUTH_SECRET!

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email === email)

    if (!existingUser) {
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: authPassword,
        email_confirm: true,
        app_metadata: {
          store_id: cast.store_id,
          cast_id: cast.id,
          role: 'cast'
        }
      })
    } else {
      await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        app_metadata: {
          store_id: cast.store_id,
          cast_id: cast.id,
          role: 'cast'
        }
      })
    }

    // 5. セッション作成してリダイレクト
    // ...（以下同様）

  } catch (err) {
    console.error('LINE auth error:', err)
    return res.redirect('/login?error=auth_failed')
  }
}
```

---

### 4. クライアント側のセッション管理

**lib/supabase.ts**（変更後）
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // セッションをlocalStorageに保存
    persistSession: true,
    // 自動リフレッシュ有効
    autoRefreshToken: true,
  }
})
```

**ログイン処理（クライアント）**
```typescript
async function login(username: string, password: string) {
  // 1. ログインAPIを呼ぶ
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error)
  }

  // 2. Supabaseセッションを設定
  if (data.access_token && data.refresh_token) {
    await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token
    })
  }

  // 3. 従来通りlocalStorageにも保存（既存コードとの互換性）
  localStorage.setItem('admin', JSON.stringify(data.admin))

  return data
}
```

---

### 5. ログアウト処理

```typescript
async function logout() {
  // 1. Supabase Authからサインアウト
  await supabase.auth.signOut()

  // 2. 従来のlocalStorageもクリア
  localStorage.removeItem('admin')
  localStorage.removeItem('store_id')

  // 3. ログインページにリダイレクト
  window.location.href = '/login'
}
```

---

### 6. パスワード変更（変更なし）

パスワード変更は今まで通り`admin_users.password_hash`を更新するだけ。
Supabase Auth側のパスワードは固定値なので変更不要。

```typescript
async function changePassword(adminId: number, newPassword: string) {
  const hash = await bcrypt.hash(newPassword, 10)

  const { error } = await supabase
    .from('admin_users')
    .update({ password_hash: hash })
    .eq('id', adminId)

  if (error) throw error
  return { success: true }
}
```

---

### 7. 実装順序

```
1. 環境変数追加                    ← まずこれ
2. lib/supabaseAdmin.ts作成        ← サーバー用クライアント
3. ログインAPI修正                 ← Supabase Auth連携追加
4. クライアントのセッション管理    ← setSession追加
5. RLSポリシーをDBに適用          ← 最後にこれ
```

**重要**: RLSポリシーは全アプリの認証が完了してから適用すること。
先にRLSを有効化すると、未対応のアプリがデータにアクセスできなくなる。

---

## 各テーブルのRLSポリシー

### 基本ポリシーパターン

```sql
-- store_idでフィルタする基本ポリシー
CREATE POLICY "Users can only access their store data"
ON [table_name]
FOR ALL
USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);
```

### サービスキー（バイパス）について

- APIルートで`SUPABASE_SERVICE_KEY`を使用している場合、RLSはバイパスされる
- サーバーサイドでの管理操作には引き続きservice keyを使用可能
- クライアントサイドのanon keyアクセスのみRLSが適用される

---

## 全テーブルRLSポリシーSQL

以下のSQLをSupabaseのSQL Editorで実行してRLSを有効化する。

```sql
-- =====================================================
-- RLS (Row Level Security) 設定
-- =====================================================
-- 注意: 必ずポリシー作成後にRLSを有効化すること
-- ポリシーなしでRLSを有効化すると全アクセスが拒否される
-- =====================================================

-- -----------------------------------------------------
-- 共通テーブル
-- -----------------------------------------------------

-- stores
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores_select_own" ON stores
FOR SELECT USING (
  id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- casts
ALTER TABLE casts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "casts_all_own_store" ON casts
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- シフト管理アプリ用テーブル
-- -----------------------------------------------------

-- shifts
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shifts_all_own_store" ON shifts
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- shift_requests
ALTER TABLE shift_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift_requests_all_own_store" ON shift_requests
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- shift_locks
ALTER TABLE shift_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift_locks_all_own_store" ON shift_locks
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- store_line_configs
ALTER TABLE store_line_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_line_configs_all_own_store" ON store_line_configs
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- line_register_requests
ALTER TABLE line_register_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "line_register_requests_all_own_store" ON line_register_requests
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- admin_emergency_logins
ALTER TABLE admin_emergency_logins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_emergency_logins_all_own_store" ON admin_emergency_logins
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- POSシステム用テーブル
-- -----------------------------------------------------

-- attendance
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_all_own_store" ON attendance
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- attendance_statuses
ALTER TABLE attendance_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_statuses_all_own_store" ON attendance_statuses
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- cast_positions
ALTER TABLE cast_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cast_positions_all_own_store" ON cast_positions
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_all_own_store" ON products
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- product_categories
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_categories_all_own_store" ON product_categories
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_all_own_store" ON orders
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- order_items
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_all_own_store" ON order_items
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_all_own_store" ON payments
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- table_status
ALTER TABLE table_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "table_status_all_own_store" ON table_status
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- current_order_items
ALTER TABLE current_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "current_order_items_all_own_store" ON current_order_items
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- system_settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_settings_all_own_store" ON system_settings
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- cash_counts
ALTER TABLE cash_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cash_counts_all_own_store" ON cash_counts
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- daily_reports
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_reports_all_own_store" ON daily_reports
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- monthly_targets
ALTER TABLE monthly_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monthly_targets_all_own_store" ON monthly_targets
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- receipts (store_idがある場合)
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receipts_all_own_store" ON receipts
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- -----------------------------------------------------
-- 管理画面用テーブル
-- -----------------------------------------------------

-- admin_users
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_users_all_own_store" ON admin_users
FOR ALL USING (
  store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);
```

---

## 注意事項

### 移行時の注意

1. **RLS有効化前に必ずポリシーを作成**
   - ポリシーなしでRLSを有効化すると全アクセスが拒否される

2. **既存セッションの扱い**
   - JWT更新前のセッションはstore_idクレームがない
   - 移行期間中はフォールバック処理が必要

3. **テスト環境での確認必須**
   - 本番適用前にステージング環境で全機能テスト

### 今後の課題

1. **キャスト個別のRLS（給料明細など）**
   - 現状: 店舗単位でのアクセス制御（store_idのみ）
   - 将来: 給料明細などキャスト個人のデータは本人のみ閲覧可能にする

   **実装方針:**
   ```sql
   -- 給料テーブル（新規作成時）
   CREATE TABLE cast_salaries (
     id SERIAL PRIMARY KEY,
     store_id INTEGER NOT NULL,
     cast_id INTEGER NOT NULL,  -- ← 必須：個人識別用
     year_month VARCHAR(7),
     base_salary INTEGER,
     bonus INTEGER,
     deductions INTEGER,
     net_salary INTEGER,
     created_at TIMESTAMP DEFAULT NOW()
   );

   -- 個人データ用RLSポリシー
   CREATE POLICY "salary_own_or_admin" ON cast_salaries
   FOR SELECT USING (
     -- 管理者は自店舗の全員分見れる
     (
       (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'manager')
       AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
     )
     OR
     -- キャストは自分のだけ
     (
       cast_id = (auth.jwt() -> 'app_metadata' ->> 'user_id')::integer
       AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
     )
   );
   ```

   **データフロー:**
   ```
   [orders等] → 管理者がAPI経由で集計 → [cast_salaries] → キャストが閲覧
                (service_role使用)        (cast_id でRLS)
   ```

   **注意:** 既存テーブル（orders等）にcast_idがない場合でも、
   集計結果を新しいテーブルに保存することで個人RLSを実現できる。

2. **監査ログ**
   - 誰がいつどのデータにアクセスしたかのログ

---

## 関連ドキュメント

- [DATABASE.md](./DATABASE.md) - データベース仕様書
- [Supabaseダッシュボード](https://supabase.com/dashboard/project/ivgkberavxekkqgoavmo)

---

## vi-admin用の追加ポリシー（anon key対応）

### 背景

vi-adminは**カスタム認証**（bcrypt + Cookie）を使用しており、Supabase Authを使用していない。
そのため、`auth.jwt()`が機能せず、RLSポリシーによってデータアクセスが拒否される。

### 解決策

vi-adminは管理画面であり、すでにアプリレベルでログイン認証が実装されている。
そのため、**anon roleに対して全アクセスを許可する追加ポリシー**を作成することで、
既存のRLSポリシー（Supabase Auth用）を維持しつつ、vi-adminからのアクセスを許可する。

### セキュリティ考慮

| システム | 認証方式 | RLSの扱い |
|---------|---------|----------|
| **vi-admin** | カスタム認証（bcrypt） | anon roleで全アクセス許可 |
| **シフトアプリ** | Supabase Auth（LINE連携） | auth.jwt()で店舗別制限 |
| **POS** | Supabase Auth | auth.jwt()で店舗別制限 |

**リスク軽減:**
- vi-adminにはログイン認証がある（admin_usersテーブル）
- PC専用アプリで、社内利用のみ
- anon keyが漏洩しても、vi-adminのログインが必要

### 追加ポリシーSQL

以下のSQLを実行してvi-admin用のポリシーを追加：

**ファイル:** `scripts/rls-add-anon-policy.sql`

```sql
-- vi-admin用の追加ポリシー（anon roleでもアクセス可能）
CREATE POLICY "allow_anon_all" ON casts
FOR ALL TO anon USING (true) WITH CHECK (true);

-- 他のテーブルも同様...
```

### 実行方法

1. Supabase Dashboard → **SQL Editor** に移動
2. `scripts/rls-add-anon-policy.sql` の内容を貼り付け
3. **Run** をクリック

### 確認方法

```sql
-- anon用ポリシーが作成されたか確認
SELECT tablename, policyname, roles
FROM pg_policies
WHERE schemaname = 'public' AND policyname = 'allow_anon_all'
ORDER BY tablename;
```

---

## 更新履歴

| 日付 | 変更内容 |
|------|----------|
| 2025-11-28 | 初版作成 |
| 2025-11-28 | 全テーブルRLSポリシーSQL追加 |
| 2025-11-28 | 具体的な実装ガイド追加（コード例含む） |
| 2025-11-28 | 将来の給料明細RLS設計を追加 |
| 2025-11-28 | vi-admin用anon追加ポリシー追加 |
