# データベース仕様書

このドキュメントでは、VI Admin / シフト管理アプリ / POSシステムで共有するSupabaseデータベースの構造を説明します。

## 目次
1. [概要](#概要)
2. [テーブル一覧](#テーブル一覧)
3. [共通テーブル](#共通テーブル)
4. [シフト管理アプリ専用テーブル](#シフト管理アプリ専用テーブル)
5. [POSシステム専用テーブル](#posシステム専用テーブル)
6. [管理画面専用テーブル](#管理画面専用テーブル)
7. [リレーション図](#リレーション図)
8. [重要な注意事項](#重要な注意事項)

---

## 概要

### Supabaseプロジェクト情報
- **プロジェクトURL:** `https://ivgkberavxekkqgoavmo.supabase.co`
- **リージョン:** 東京 (ap-northeast-1)

### 店舗ID
| store_id | 店舗名 |
|----------|--------|
| 1 | Memorable |
| 2 | MistressMirage |

### 使用アプリケーション
| アプリ | 説明 | リポジトリ |
|--------|------|-----------|
| VI Admin | 管理者用ダッシュボード（PC専用） | vi-admin |
| シフト管理アプリ | LINEミニアプリ（キャスト向け） | shift-management-app |
| POSシステム | テーブル管理・会計システム | table-management-system |

---

## テーブル一覧

### 共通テーブル（3システムで共有）
| テーブル名 | 説明 |
|-----------|------|
| `stores` | 店舗情報 |
| `casts` | キャスト情報 |

### シフト管理アプリ専用
| テーブル名 | 説明 |
|-----------|------|
| `shifts` | 確定シフト |
| `shift_requests` | シフト希望 |
| `shift_locks` | シフト編集ロック |
| `store_line_configs` | LINE設定 |
| `line_register_requests` | LINE登録リクエスト |
| `admin_emergency_logins` | 緊急管理者ログイン |

### POSシステム専用
| テーブル名 | 説明 |
|-----------|------|
| `attendance` | 勤怠情報 |
| `attendance_statuses` | 勤怠ステータス設定 |
| `cast_positions` | キャスト役職 |
| `products` | 商品マスタ |
| `product_categories` | 商品カテゴリ |
| `receipts` | レシート |
| `order_items` | 注文明細 |
| `payments` | 支払い情報 |
| `table_status` | テーブル状態 |
| `current_order_items` | 現在進行中の注文 |
| `system_settings` | システム設定 |
| `cash_counts` | 現金カウント |
| `daily_reports` | 日次レポート |
| `monthly_targets` | 月次目標 |

### 管理画面専用
| テーブル名 | 説明 |
|-----------|------|
| `admin_users` | 管理者アカウント |

---

## 共通テーブル

### `stores` - 店舗情報

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| name | text | NO | - | 店舗名 |
| created_at | timestamptz | YES | now() | 作成日時 |

### `casts` - キャスト情報

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID（外部キー） |
| name | text | NO | - | キャスト名（源氏名） |
| employee_name | text | YES | NULL | 本名 |
| birthday | date | YES | NULL | 誕生日 |
| status | text | YES | NULL | ステータス（レギュラー/体験/etc） |
| attributes | text | YES | NULL | 属性（ニュー/レギュラー/etc） |
| experience_date | date | YES | NULL | 体験入店日 |
| hire_date | date | YES | NULL | 入店日 |
| resignation_date | date | YES | NULL | 退店日 |
| hourly_wage | integer | NO | 0 | 時給 |
| commission_rate | numeric | NO | 0 | バック率 |
| residence_record | boolean | YES | NULL | 住民票提出 |
| attendance_certificate | boolean | YES | NULL | 在籍証明書提出 |
| contract_documents | boolean | YES | NULL | 契約書類提出 |
| twitter | text | YES | NULL | Twitter/Xアカウント |
| password | text | YES | NULL | Twitterパスワード |
| instagram | text | YES | NULL | Instagramアカウント |
| password2 | text | YES | NULL | Instagramパスワード |
| line_number | text | YES | NULL | LINE User ID（Uで始まる33文字） |
| line_user_id | text | YES | NULL | LINE User ID（旧カラム、非推奨） |
| show_in_pos | boolean | NO | true | POSに表示するか |
| is_active | boolean | NO | true | 有効フラグ |
| is_admin | boolean | NO | false | 管理者フラグ |
| is_manager | boolean | NO | false | マネージャーフラグ |
| display_order | integer | YES | NULL | 表示順序 |
| created_at | timestamptz | YES | now() | 作成日時 |
| updated_at | timestamptz | YES | now() | 更新日時 |

**重要な制約:**
- 同じ`store_id`内で`name`は一意である必要がある（運用上のルール）
- `attendance`テーブルで`cast_name`を使用しているため、名前の重複は集計エラーの原因となる

---

## シフト管理アプリ専用テーブル

### `shifts` - 確定シフト

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| cast_id | integer | NO | - | キャストID（外部キー） |
| store_id | integer | NO | - | 店舗ID |
| date | date | NO | - | シフト日付 |
| start_time | text | YES | NULL | 開始時刻（HH:MM） |
| end_time | text | YES | NULL | 終了時刻（HH:MM） |
| status | text | YES | NULL | ステータス |
| created_at | timestamptz | YES | now() | 作成日時 |

### `shift_requests` - シフト希望

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| cast_id | integer | NO | - | キャストID |
| store_id | integer | NO | - | 店舗ID |
| date | date | NO | - | 希望日付 |
| start_time | text | YES | NULL | 希望開始時刻 |
| end_time | text | YES | NULL | 希望終了時刻 |
| status | text | YES | 'pending' | ステータス（pending/approved/rejected） |
| created_at | timestamptz | YES | now() | 作成日時 |
| updated_at | timestamptz | YES | now() | 更新日時 |

### `shift_locks` - シフト編集ロック

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| year | integer | NO | - | 年 |
| month | integer | NO | - | 月 |
| is_locked | boolean | NO | false | ロック状態 |
| locked_at | timestamptz | YES | NULL | ロック日時 |
| locked_by | integer | YES | NULL | ロックしたユーザーID |

### `store_line_configs` - LINE設定

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| line_channel_id | text | YES | NULL | LINEチャンネルID |
| line_channel_secret | text | YES | NULL | LINEチャンネルシークレット |
| line_channel_access_token | text | YES | NULL | LINEアクセストークン |
| liff_id | text | YES | NULL | LIFF ID |
| is_active | boolean | NO | true | 有効フラグ |
| created_at | timestamptz | YES | now() | 作成日時 |

### `line_register_requests` - LINE登録リクエスト

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| line_user_id | text | NO | - | LINE User ID |
| requested_name | text | YES | NULL | 申請された名前 |
| cast_id | integer | YES | NULL | マッチしたキャストID |
| status | text | YES | 'pending' | ステータス（pending/approved/rejected） |
| created_at | timestamptz | YES | now() | 作成日時 |

### `admin_emergency_logins` - 緊急管理者ログイン

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| username | text | NO | - | ユーザー名 |
| password_hash | text | NO | - | パスワードハッシュ |
| is_active | boolean | NO | true | 有効フラグ |
| created_at | timestamptz | YES | now() | 作成日時 |

---

## POSシステム専用テーブル

### `attendance` - 勤怠情報

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| cast_id | integer | YES | NULL | キャストID（外部キー） |
| cast_name | text | NO | - | キャスト名（検索用） |
| store_id | integer | NO | - | 店舗ID |
| date | date | NO | - | 勤務日 |
| check_in_datetime | text | YES | NULL | 出勤日時 |
| check_out_datetime | text | YES | NULL | 退勤日時 |
| status | text | YES | NULL | ステータス（出勤/当欠/無欠/遅刻/早退/公欠/事前欠） |
| late_minutes | integer | YES | 0 | 遅刻分数 |
| break_minutes | integer | YES | 0 | 休憩分数 |
| daily_payment | integer | YES | 0 | 日払い額 |
| created_at | timestamptz | YES | now() | 作成日時 |

**重要:** `cast_name`でキャストを識別しているため、キャスト名の一意性が重要。

### `attendance_statuses` - 勤怠ステータス設定

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| status_name | text | NO | - | ステータス名 |
| color | text | YES | NULL | 表示色 |
| display_order | integer | YES | 0 | 表示順序 |

### `cast_positions` - キャスト役職

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| name | text | NO | - | 役職名 |
| store_id | integer | NO | - | 店舗ID |

### `products` - 商品マスタ

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| category_id | integer | YES | NULL | カテゴリID |
| name | text | NO | - | 商品名 |
| price | integer | NO | 0 | 価格 |
| tax_rate | numeric | YES | 0.1 | 税率 |
| discount_rate | numeric | YES | 0 | 割引率 |
| needs_cast | boolean | NO | false | キャスト指名が必要か |
| is_active | boolean | NO | true | 有効フラグ |
| display_order | integer | YES | 0 | 表示順序 |
| created_at | timestamptz | YES | now() | 作成日時 |

### `product_categories` - 商品カテゴリ

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| name | text | NO | - | カテゴリ名 |
| display_order | integer | YES | 0 | 表示順序 |
| show_oshi_first | boolean | NO | false | 推しを先頭に表示 |
| created_at | timestamptz | YES | now() | 作成日時 |

### `receipts` - レシート

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| receipt_number | text | NO | - | レシート番号 |
| table_number | text | YES | NULL | テーブル番号 |
| customer_name | text | YES | NULL | 顧客名 |
| oshi_name | text | YES | NULL | 推しキャスト名 |
| subtotal | integer | NO | 0 | 小計 |
| tax | integer | NO | 0 | 税額 |
| service_charge | integer | NO | 0 | サービス料 |
| total | integer | NO | 0 | 合計 |
| payment_method | text | YES | NULL | 支払い方法 |
| business_date | date | NO | - | 営業日 |
| created_at | timestamptz | YES | now() | 作成日時 |

### `order_items` - 注文明細

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| receipt_id | integer | NO | - | レシートID（外部キー） |
| product_name | text | NO | - | 商品名 |
| cast_name | text | YES | NULL | キャスト名 |
| category_name | text | YES | NULL | カテゴリ名 |
| quantity | integer | NO | 1 | 数量 |
| unit_price | integer | NO | 0 | 単価 |
| total_price | integer | NO | 0 | 合計価格 |
| created_at | timestamptz | YES | now() | 作成日時 |

### `payments` - 支払い情報

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| receipt_id | integer | NO | - | レシートID（外部キー） |
| payment_method | text | NO | - | 支払い方法 |
| amount | integer | NO | 0 | 金額 |
| created_at | timestamptz | YES | now() | 作成日時 |

### `table_status` - テーブル状態

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| table_number | text | NO | - | テーブル番号 |
| customer_name | text | YES | NULL | 顧客名 |
| oshi_name | text | YES | NULL | 推しキャスト名 |
| status | text | NO | 'empty' | ステータス（empty/occupied） |
| seated_at | timestamptz | YES | NULL | 着席日時 |
| page_number | integer | YES | 1 | ページ番号 |

### `current_order_items` - 現在進行中の注文

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| table_number | text | NO | - | テーブル番号 |
| product_name | text | NO | - | 商品名 |
| cast_name | text | YES | NULL | キャスト名 |
| quantity | integer | NO | 1 | 数量 |
| price | integer | NO | 0 | 価格 |
| created_at | timestamptz | YES | now() | 作成日時 |

### `system_settings` - システム設定

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| setting_key | text | NO | - | 設定キー |
| setting_value | text | YES | NULL | 設定値 |
| created_at | timestamptz | YES | now() | 作成日時 |
| updated_at | timestamptz | YES | now() | 更新日時 |

**主な設定キー:**
- `tax_rate` - 消費税率
- `service_charge_rate` - サービス料率
- `business_day_change_hour` - 営業日切替時刻

### `cash_counts` - 現金カウント

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| date | date | NO | - | 日付 |
| amount | integer | NO | 0 | 金額 |
| counted_by | integer | YES | NULL | カウント者ID |
| created_at | timestamptz | YES | now() | 作成日時 |

### `daily_reports` - 日次レポート

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| report_date | date | NO | - | レポート日 |
| total_sales | integer | YES | 0 | 売上合計 |
| customer_count | integer | YES | 0 | 来客数 |
| notes | text | YES | NULL | 備考 |
| created_at | timestamptz | YES | now() | 作成日時 |

### `monthly_targets` - 月次目標

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| year | integer | NO | - | 年 |
| month | integer | NO | - | 月 |
| target_amount | integer | NO | 0 | 目標金額 |
| created_at | timestamptz | YES | now() | 作成日時 |

---

## 管理画面専用テーブル

### `admin_users` - 管理者アカウント

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| id | integer | NO | auto | 主キー |
| store_id | integer | NO | - | 店舗ID |
| username | text | NO | - | ユーザー名 |
| password_hash | text | NO | - | パスワードハッシュ（bcrypt） |
| is_active | boolean | NO | true | 有効フラグ |
| created_at | timestamptz | YES | now() | 作成日時 |
| updated_at | timestamptz | YES | now() | 更新日時 |

---

## リレーション図

```
stores (1) ─────┬───── (*) casts
                │
                ├───── (*) shifts ────── (cast_id) ───── casts
                │
                ├───── (*) shift_requests ── (cast_id) ── casts
                │
                ├───── (*) attendance ──── (cast_name) ── casts.name
                │
                ├───── (*) products ───── (category_id) ── product_categories
                │
                ├───── (*) receipts
                │         │
                │         └── (*) order_items
                │         │
                │         └── (*) payments
                │
                ├───── (*) admin_users
                │
                └───── (*) system_settings
```

---

## 重要な注意事項

### 1. キャスト名の一意性
- `attendance`テーブルは`cast_name`でキャストを識別
- 同じ店舗内でキャスト名が重複すると、売上集計が正しく行われない
- VI Adminでは新規作成・編集時に自動で重複チェックを実施

### 2. LINE User IDの形式
```
Ubd24e1f2b324e3deb8377dd46593c33f
```
- 大文字の`U` + 32文字の16進数文字列
- `casts.line_number`に格納

### 3. 営業日の概念
- POSシステムでは「営業日」と「カレンダー日」が異なる
- `system_settings`の`business_day_change_hour`で切替時刻を設定
- 例：6時切替の場合、2025/1/15 AM2:00は営業日2025/1/14として扱う

### 4. 削除されたカラム
以下のカラムは削除済み：
- `casts.line_msg_user_id` - 2025/11/28削除

### 5. データベース共有の注意
- 3つのアプリケーションが同じデータベースを共有
- テーブル構造の変更は全アプリに影響
- 変更前に必ず全アプリへの影響を確認

### 6. Row Level Security (RLS)
- 本番環境ではRLSを有効化推奨
- 各テーブルに適切なポリシーを設定

---

## 更新履歴

| 日付 | 変更内容 |
|------|----------|
| 2025-11-28 | 初版作成 |
| 2025-11-28 | line_msg_user_idカラム削除を反映 |
