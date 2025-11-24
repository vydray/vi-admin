# セキュリティ・デプロイメント対策チェックリスト

本番環境デプロイ前に必ず実施すべきセキュリティ対策と最適化のリスト。

---

## 🔴 最優先（本番デプロイ前に必須）

### 1. ログインページ・認証機能 ⚠️ **実装中**

**しないとどうなるか：**
- URLを知っていれば誰でも管理画面にアクセス可能
- データ改ざん、情報漏洩のリスク
- 個人情報保護法違反の可能性

**実装内容：**
- [ ] ログインページ作成 (`/login`)
- [ ] Supabase Authを使った認証
- [ ] ミドルウェアで保護されたルート
- [ ] `casts`テーブルの`is_admin`フラグを活用
- [ ] セッション管理
- [ ] ログアウト機能

**ステータス：** 🟡 未実装

---

## 🟡 重要（早めに対応）

### 2. Supabaseバックアップ設定確認

**しないとどうなるか：**
- 誤操作でデータ削除 → 復元不可
- バグでデータ破損 → 元に戻せない
- ランサムウェア攻撃 → 身代金を払うしかない

**確認手順：**
1. Supabaseダッシュボード → プロジェクト設定
2. Database → Backups
3. 日次バックアップが有効か確認（無料プランで7日間保存）
4. 可能ならPITR（Point-in-Time Recovery）を有効化（Pro以上）

**所要時間：** 5分
**ステータス：** 🔴 未確認

---

### 3. CSP（Content Security Policy）設定

**しないとどうなるか：**
- XSS攻撃を受ける可能性
- セッション情報が盗まれる
- 攻撃者が管理者になりすませる

**実装場所：** `next.config.ts`

```typescript
module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
          }
        ]
      }
    ]
  }
}
```

**ステータス：** 🔴 未実装

---

## 🟠 高優先度（3システム統合時に実施）

### 4. RLS（Row Level Security）設定

**しないとどうなるか：**
- ブラウザのコンソールから直接DBを操作できる
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`が公開されているため、誰でもデータアクセス可能
- 悪意あるユーザーが全データ削除・改ざんできる

**実装内容：**
```sql
-- 例: castsテーブルにRLSを設定
ALTER TABLE casts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "管理者のみアクセス可能" ON casts
  FOR ALL
  USING (auth.role() = 'authenticated');

-- 他のテーブルも同様に設定
```

**注意：** POSシステム、シフトアプリ、管理画面の3システム全てに影響するため、最後に調整

**ステータス：** 🔴 未実装（3システム調整後）

---

## 🟢 推奨（データ量増加時）

### 5. データベースインデックス最適化

**しないとどうなるか：**
- データ量が増えると検索が遅くなる
- キャスト100人→0.1秒、1000人→3秒（インデックスなし）
- 月次レポートで数分待たされる

**実装例：**
```sql
-- よく検索されるカラムにインデックス追加
CREATE INDEX idx_casts_store_id ON casts(store_id);
CREATE INDEX idx_casts_is_active ON casts(is_active);
CREATE INDEX idx_shifts_date ON shifts(date);
CREATE INDEX idx_orders_store_date ON orders(store_id, order_date);
CREATE INDEX idx_attendance_date ON attendance(date, store_id);
```

**実施タイミング：** キャスト数が100人以上、月間注文数が1000件以上になったら

**ステータス：** 🟢 未実装（今は不要）

---

### 6. Supabaseクエリキャッシュ設定

**しないとどうなるか：**
- 毎回データベースにアクセス
- ページ表示が遅い
- Supabaseの無料枠を消費

**実装例：**
```typescript
// Next.js App Routerでのキャッシュ設定
export const revalidate = 300 // 5分間キャッシュ

// または個別のfetchでキャッシュ
const { data } = await supabase
  .from('casts')
  .select('*')
// Next.jsが自動でキャッシュ
```

**実施タイミング：** ユーザー数が増えてきたら

**ステータス：** 🟢 未実装（今は不要）

---

## 📋 実施順序

```
1. ログインページ作成          🔴 最優先（今すぐ）
   ↓
2. バックアップ設定確認         🟡 5分で完了
   ↓
3. CSP設定                     🟡 認証後に実施
   ↓
4. RLS設定                     🟠 3システム調整時
   ↓
5. DB最適化・キャッシュ         🟢 データ増加時
```

---

## 🔗 関連ドキュメント

- [README.md](./README.md) - プロジェクト概要
- [Supabaseダッシュボード](https://supabase.com/dashboard/project/ivgkberavxekkqgoavmo)

---

**最終更新：** 2025-11-25
**次の作業：** ログインページの実装
