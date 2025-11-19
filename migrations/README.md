# データベースマイグレーション

## order_dateカラムの追加

### 概要
ordersテーブルに営業日（order_date）カラムを追加します。これにより、深夜営業を考慮した正確な営業日ベースの集計が可能になります。

### 実行手順

1. Supabase Dashboardにログイン
2. 該当プロジェクトを選択
3. 左メニューから「SQL Editor」を選択
4. `add_order_date_column.sql`の内容をコピー＆ペースト
5. 「Run」をクリックして実行

### マイグレーション内容

#### 1. カラム追加
- `order_date` (TIMESTAMP WITH TIME ZONE): 営業日を格納

#### 2. 既存データの更新
- checkout_datetimeから営業日を自動計算
- デフォルト6時を切替時刻として使用
- 6時より前の会計 → 前日の営業日
- 6時以降の会計 → 当日の営業日

#### 3. インデックス追加
- `idx_orders_order_date`: order_dateでの検索を高速化
- `idx_orders_store_order_date`: 店舗ID + order_dateでの検索を高速化
- `idx_orders_deleted_at`: 削除フラグでの検索を高速化

### マイグレーション後の作業

#### 1. 店舗ごとの正確な営業日で再計算（任意）

各店舗の設定値（business_day_cutoff_hour）を使って正確な営業日を再計算する場合：

```bash
cd /Users/okitakaisei/projects/vi-admin

# 全店舗のorder_dateを再計算
npm run update-business-days

# 特定店舗のみ再計算（例: Memorable = 店舗ID 1）
npm run update-business-days 1

# 特定店舗のみ再計算（例: Mistress Mirage = 店舗ID 2）
npm run update-business-days 2
```

#### 2. 動作確認

- POSで新規会計を実行 → ordersテーブルのorder_dateが自動設定されることを確認
- vi-adminのダッシュボードで営業日ベースの集計が正しく表示されることを確認
- 伝票管理ページで営業日が表示されることを確認

### 注意事項

- このマイグレーションは既存データを変更します
- 実行前にデータベースのバックアップを推奨
- 本番環境で実行する前に、開発環境で動作確認することを推奨

## 注文明細のカテゴリーバックフィル

### 概要

既存の注文明細（order_items）データにカテゴリー情報を自動設定します。POSシステムでは以前カテゴリーを保存していませんでしたが、現在は商品名からカテゴリーを自動取得して保存するようになっています。このスクリプトは過去のデータにカテゴリーを追加します。

### 実行手順

```bash
cd /Users/okitakaisei/projects/vi-admin

# 全店舗の注文明細カテゴリーをバックフィル
npm run backfill-categories

# 特定店舗のみバックフィル（例: Memorable = 店舗ID 1）
npm run backfill-categories 1

# 特定店舗のみバックフィル（例: Mistress Mirage = 店舗ID 2）
npm run backfill-categories 2
```

### 処理内容

1. カテゴリーが未設定（null または空文字列）の注文明細を検索
2. 商品名から商品マスタを検索
3. 商品マスタの category_id からカテゴリーマスタを検索
4. カテゴリー名を order_items.category に設定

### 動作確認

- vi-adminの伝票管理ページで注文明細のカテゴリーが表示されることを確認
- 注文明細の編集モーダルでカテゴリーが正しく選択されていることを確認

### 注意事項

- 商品マスタに存在しない商品名の注文明細はカテゴリーが設定されません
- 今後POSで作成される注文は自動的にカテゴリーが設定されます
