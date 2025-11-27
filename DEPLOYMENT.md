# 本番環境デプロイガイド

このドキュメントでは、VI Admin管理システムを本番環境にデプロイする手順を説明します。

## 目次
1. [前提条件](#前提条件)
2. [Vercelへのデプロイ（推奨）](#vercelへのデプロイ推奨)
3. [環境変数の設定](#環境変数の設定)
4. [データベース設定](#データベース設定)
5. [セキュリティチェックリスト](#セキュリティチェックリスト)
6. [デプロイ後の確認](#デプロイ後の確認)

---

## 前提条件

- Node.js 18以上がインストールされていること
- Supabaseプロジェクトが作成されていること
- GitHubリポジトリにコードがプッシュされていること

---

## Vercelへのデプロイ（推奨）

### 1. Vercelアカウントの作成
1. [Vercel](https://vercel.com)にアクセス
2. GitHubアカウントでサインアップ

### 2. プロジェクトのインポート
1. Vercelダッシュボードで「Add New」→「Project」を選択
2. GitHubリポジトリ`vydray/vi-admin`を選択
3. 「Import」をクリック

### 3. プロジェクト設定
- **Framework Preset**: Next.js
- **Root Directory**: `./`（デフォルト）
- **Build Command**: `npm run build`（デフォルト）
- **Output Directory**: `.next`（デフォルト）
- **Install Command**: `npm install`（デフォルト）

### 4. 環境変数の設定
「Environment Variables」セクションで以下を設定：

```
NEXT_PUBLIC_SUPABASE_URL=https://ivgkberavxekkqgoavmo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
```

⚠️ **重要**: `SUPABASE_SERVICE_KEY`は絶対に公開しないでください。

### 5. デプロイ
「Deploy」ボタンをクリックしてデプロイを開始

---

## 環境変数の設定

### 必須の環境変数

| 変数名 | 説明 | 取得場所 |
|--------|------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトのURL | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase匿名キー（公開可） | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_KEY` | Supabaseサービスロールキー（機密） | Supabase Dashboard > Settings > API |

### Supabaseキーの取得方法
1. [Supabase Dashboard](https://app.supabase.com)にログイン
2. プロジェクトを選択
3. 左メニューから「Settings」→「API」を選択
4. 以下をコピー：
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_KEY`

---

## データベース設定

### 1. データベースマイグレーション
本番環境のSupabaseデータベースで以下を確認：

#### 必須テーブル
- `admin_users` - 管理者アカウント
- `stores` - 店舗情報
- `casts` - キャスト情報
- `products` - 商品情報
- `categories` - カテゴリ情報
- `receipts` - レシート情報
- `order_items` - 注文明細
- `payments` - 支払い情報
- `attendance` - 勤怠情報
- `shifts` - シフト情報
- `shift_requests` - シフト希望
- `shift_locks` - シフトロック
- `cast_positions` - キャスト役職

#### Row Level Security (RLS)
⚠️ **重要**: 本番環境では必ずRLSを有効にしてください。

### 2. 初期データの投入
必要に応じて以下のスクリプトを実行：
```bash
# 店舗2のデフォルトデータ挿入
psql -h [your-db-host] -d postgres -f scripts/insert-store2-defaults.sql
```

---

## セキュリティチェックリスト

デプロイ前に以下を確認してください：

### ✅ 環境変数
- [ ] `SUPABASE_SERVICE_KEY`がGitにコミットされていない
- [ ] `.env.local`が`.gitignore`に含まれている
- [ ] Vercelの環境変数が正しく設定されている

### ✅ Supabase設定
- [ ] Row Level Security (RLS)が全テーブルで有効
- [ ] APIキーが適切に管理されている
- [ ] データベースのバックアップが設定されている

### ✅ 認証・認可
- [ ] パスワードがbcryptでハッシュ化されている
- [ ] セッション管理が適切に実装されている
- [ ] 管理者権限のチェックが各ページで実装されている

### ✅ パフォーマンス
- [ ] 不要なconsole.logが削除されている
- [ ] 画像が最適化されている
- [ ] データベースクエリが最適化されている

### ✅ エラーハンドリング
- [ ] 全てのAPI呼び出しでエラーハンドリングが実装されている
- [ ] ユーザーフレンドリーなエラーメッセージが表示される

---

## デプロイ後の確認

### 1. 機能テスト
以下の主要機能をテストしてください：

- [ ] ログイン・ログアウト
- [ ] キャスト管理（作成・編集・削除）
- [ ] 商品管理
- [ ] レシート作成
- [ ] シフト管理
- [ ] 勤怠管理
- [ ] 売上集計

### 2. パフォーマンステスト
- [ ] ページロード時間が3秒以内
- [ ] データベースクエリが最適化されている
- [ ] 画像の読み込みが高速

### 3. セキュリティテスト
- [ ] 未認証ユーザーが管理画面にアクセスできない
- [ ] 他店舗のデータにアクセスできない
- [ ] SQLインジェクション対策がされている

### 4. ブラウザ互換性
- [ ] Chrome（最新版）
- [ ] Firefox（最新版）
- [ ] Safari（最新版）
- [ ] Edge（最新版）

---

## トラブルシューティング

### ビルドエラーが発生する場合
1. `npm run build`をローカルで実行して確認
2. TypeScriptエラーがないか確認
3. 環境変数が正しく設定されているか確認

### データベース接続エラー
1. Supabase URLとAPIキーが正しいか確認
2. SupabaseプロジェクトがActiveか確認
3. ネットワーク接続を確認

### 404エラーが発生する場合
1. `next.config.js`の設定を確認
2. ルーティングが正しく設定されているか確認

---

## サポート

問題が発生した場合は、以下を確認してください：
- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)

---

## 更新履歴

| 日付 | 変更内容 |
|------|----------|
| 2025-11-28 | 初版作成 |
