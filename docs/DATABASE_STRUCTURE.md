# vi-admin データベース構造

> **最終更新**: 2024-12 (Supabase CLIでDB確認済み)
> **テーブル数**: 44テーブル

## 概要

このドキュメントでは、vi-adminシステムの全データベーステーブルの構造、目的、およびアクセス制御に関する考慮事項を説明します。

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

### 関連ドキュメント
- [RLS_DESIGN.md](../RLS_DESIGN.md) - Row Level Security設計書
- [migrations/README.md](../migrations/README.md) - マイグレーション手順

---

## アプリ別テーブル使用状況

### POSシステム (table-management-system)

| テーブル | 操作 | 用途 |
|---------|------|------|
| `orders` | SELECT, INSERT | レシート生成、チェックアウト |
| `order_items` | SELECT, INSERT | 注文明細、レシート印刷 |
| `current_order_items` | CRUD | リアルタイム注文管理 |
| `payments` | SELECT, INSERT | 支払い記録 |
| `table_status` | CRUD | 卓状態管理（空席/使用中） |
| `attendance` | SELECT, INSERT, UPDATE | 勤怠打刻・編集 |
| `attendance_statuses` | CRUD | ステータス設定 |
| `casts` | CRUD | キャスト情報管理 |
| `products` | CRUD | 商品マスタ管理 |
| `product_categories` | CRUD | カテゴリ管理 |
| `receipts` | SELECT, UPDATE | レシートロゴ設定 |
| `receipt_settings` | CRUD | レシート印刷設定 |
| `system_settings` | CRUD | 税率、営業時間等 |
| `daily_reports` | SELECT, INSERT | 日次レポート |
| `cash_counts` | SELECT, INSERT | 金庫金額記録 |
| `monthly_targets` | CRUD | 月間目標設定 |
| `cast_positions` | CRUD | 役職マスタ |
| `costumes` | SELECT | 衣装情報 |
| `shifts` | SELECT | シフト参照 |
| `users` | SELECT, INSERT | 認証 |

### シフト管理アプリ (shift-management-app)

| テーブル | 操作 | 用途 |
|---------|------|------|
| `casts` | SELECT, UPDATE | キャスト情報、LINE連携 |
| `shifts` | CRUD | シフト確定データ |
| `shift_requests` | CRUD | シフト希望申請 |
| `shift_locks` | SELECT, UPDATE | シフト編集ロック |
| `stores` | SELECT | 店舗情報 |
| `store_line_configs` | SELECT | LINE設定 |
| `line_register_requests` | CRUD | LINE登録申請 |
| `admin_emergency_logins` | SELECT | 緊急ログイン |

### VI Admin (vi-admin)

| テーブル | 操作 | 用途 |
|---------|------|------|
| 全テーブル | CRUD | 管理者フルアクセス |
| `compensation_settings` | CRUD | 報酬設定 |
| `cast_back_rates` | CRUD | 商品バック率 |
| `cast_daily_stats` | CRUD | 日別統計 |
| `payslips` | CRUD | 給与明細 |
| `deduction_types` | CRUD | 控除設定 |
| `sales_settings` | CRUD | 売上計算設定 |

### カテゴリ別テーブル数
- コア（マスタ・認証）: 3
- 取引: 3
- 勤怠・シフト: 6
- 商品・カテゴリ: 2
- 設定: 2
- 売上・報酬: 3
- 日別統計: 2
- 時給システム: 5
- 控除・給与: 5
- BASE連携: 4
- POS関連: 6
- LINE連携: 2
- 認証・緊急: 2
- レポート・目標: 2
- サンプルデータ: 2
- 予約: 1
- その他: 3

---

## RLSポリシー現状（2024-12確認）

### ポリシータイプ別サマリー

| ロール | テーブル数 | 説明 |
|-------|-----------|------|
| `{public}` | 38 | 全員アクセス可（anon/authenticated両方） |
| `{authenticated}` | 4 | ログイン必須 |
| ポリシーなし | 3 | RLS未設定または無効 |

### ログイン必須テーブル（{authenticated}）
| テーブル | ポリシー |
|---------|---------|
| `attendance_history` | Allow all for authenticated users |
| `cast_daily_items` | Allow all for authenticated users |
| `cast_daily_stats` | Allow all for authenticated users |
| `payslips` | SELECT/INSERT/UPDATE/DELETE個別 |

### RLSポリシーなし（要確認）
- `receipts`
- `casts_backup`
- `receipt_sequences`

### 重複ポリシーあり（整理推奨）
- `base_orders` - anon + public
- `base_products` - anon + public
- `base_settings` - anon + public
- `base_variations` - anon + public
- `system_settings` - allow_all_access + system_settings_allow_all

---

## 未使用テーブル分析

### 3プロジェクトで使用確認できないテーブル

| テーブル | 状態 | 備考 |
|---------|------|------|
| `casts_backup` | 未使用？ | バックアップ用、通常運用では不要 |
| `visitor_reservations` | 未使用？ | 予約機能未実装？ |
| `receipt_sequences` | 内部用？ | レシート番号採番用？ |
| `wage_statuses` | VI Adminのみ？ | 時給システム |
| `wage_status_conditions` | VI Adminのみ？ | 時給システム |
| `special_wage_days` | VI Adminのみ？ | 時給システム |
| `store_wage_settings` | VI Adminのみ？ | 時給システム |
| `compensation_sample_*` | テスト用 | 報酬計算テスト用 |

### BASE連携テーブル
`base_settings`, `base_products`, `base_variations`, `base_orders`
→ BASE連携機能の実装状況要確認

---

## テーブル一覧

### 1. コアテーブル（マスタ・認証）

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `stores` | 店舗マスタ | `id` |
| `casts` | キャスト（従業員）マスタ | `store_id`, `id` |
| `admin_users` | 管理者ユーザー | `store_id`, `role` |

### 2. 取引テーブル

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `receipts` | レシート（会計） | `store_id` |
| `order_items` | 注文明細 | `order_id` → `receipts` |
| `payments` | 支払い情報 | `order_id` → `receipts` |

### 3. 勤怠・シフト

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `attendance` | 勤怠記録 | `store_id`, `cast_name` |
| `attendance_statuses` | 勤怠ステータスマスタ | `store_id` |
| `attendance_history` | 勤怠修正履歴 | `store_id`, `attendance_id` |
| `shifts` | シフト確定 | `store_id`, `cast_id` |
| `shift_requests` | シフト申請 | `store_id`, `cast_id` |
| `shift_locks` | シフトロック状態 | `store_id` |

### 4. 商品・カテゴリ

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `products` | 商品マスタ | `store_id` |
| `categories` | カテゴリマスタ | `store_id` |

### 5. 設定テーブル

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `system_settings` | システム設定（税率など） | `store_id` |
| `store_settings` | 店舗設定（住所など） | `store_id` |

### 6. 売上・報酬設定

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `sales_settings` | 売上計算設定 | `store_id` |
| `compensation_settings` | キャスト報酬設定 | `store_id`, `cast_id` |
| `cast_back_rates` | キャスト×商品別バック率 | `store_id`, `cast_id` |

### 7. 日別統計

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `cast_daily_items` | 日別商品詳細 | `store_id`, `cast_id` |
| `cast_daily_stats` | 日別売上サマリー | `store_id`, `cast_id` |

### 8. 時給システム

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `wage_statuses` | 時給ステータス（研修、レギュラー等） | `store_id` |
| `wage_status_conditions` | 昇格/降格条件 | `status_id` → `wage_statuses` |
| `special_wage_days` | 特別日カレンダー（加算日） | `store_id` |
| `costumes` | 衣装マスタ（時給加算） | `store_id` |
| `store_wage_settings` | 店舗別時給ルール | `store_id` |

### 9. 控除・給与

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `deduction_types` | 控除項目マスタ | `store_id` |
| `late_penalty_rules` | 遅刻罰金ルール | `deduction_type_id` |
| `late_penalty_tiers` | 遅刻罰金の段階ルール | `late_penalty_rule_id` |
| `cast_deductions` | キャスト別控除実績 | `store_id`, `cast_id` |
| `payslips` | 報酬明細 | `store_id`, `cast_id` |

### 10. BASE連携

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `base_settings` | BASE API設定 | `store_id` |
| `base_products` | BASE商品マッピング | `store_id` |
| `base_variations` | BASEバリエーション | `store_id`, `base_product_id` |
| `base_orders` | BASE注文履歴 | `store_id`, `cast_id` |

### 11. POS関連

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `orders` | 会計中の注文 | `store_id` |
| `current_order_items` | 会計中の注文明細 | `order_id` |
| `table_status` | 卓状態（空席/使用中） | `store_id` |
| `cash_counts` | 金庫金額 | `store_id` |
| `receipt_sequences` | レシート連番管理 | `store_id` |
| `receipt_settings` | レシート印刷設定 | `store_id` |

### 12. LINE連携

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `store_line_configs` | 店舗LINE設定 | `store_id` |
| `line_register_requests` | LINE登録リクエスト | `store_id` |

### 13. 認証・緊急ログイン

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `users` | ユーザー（Supabase Auth連携） | `id` |
| `admin_emergency_logins` | 緊急ログイン履歴 | `store_id` |

### 14. レポート・目標

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `daily_reports` | 日報 | `store_id` |
| `monthly_targets` | 月間売上目標 | `store_id` |

### 15. 報酬計算サンプル

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `compensation_sample_receipts` | 報酬計算テスト用レシート | `store_id` |
| `compensation_sample_items` | 報酬計算テスト用明細 | `receipt_id` |

### 16. 予約

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `visitor_reservations` | 来店予約 | `store_id` |

### 17. その他

| テーブル名 | 目的 | アクセス制御キー |
|-----------|------|-----------------|
| `cast_positions` | 役職マスタ | `store_id` |
| `product_categories` | 商品カテゴリマスタ | `store_id` |
| `casts_backup` | キャストバックアップ | - |

---

## 詳細説明

### stores（店舗）
```
id: 店舗ID (PK)
name: 店舗名
created_at: 作成日時
```
**アクセス制御**: 全システムの最上位エンティティ。super_adminは全店舗、store_adminは所属店舗のみ。

---

### casts（キャスト）
```
id: キャストID (PK)
store_id: 店舗ID (FK)
name: 源氏名
employee_name: 本名
birthday: 生年月日
status: 在籍状況
is_active: 有効フラグ
is_admin: 管理者フラグ
is_manager: マネージャーフラグ
show_in_pos: POSに表示
line_user_id: LINEユーザーID
primary_cast_id: 同一人物のメインcast_id（ヘルプ用）
...その他各種情報
```
**アクセス制御**:
- `store_id` で店舗フィルタ
- キャスト自身は `id` または `line_user_id` で識別
- 個人情報（birthday, employee_name等）は管理者のみ閲覧可能にすべき

---

### admin_users（管理者ユーザー）
```
id: ユーザーID (PK)
username: ログイン名
password_hash: パスワードハッシュ
role: 権限 ('super_admin' | 'store_admin')
store_id: 店舗ID（super_adminはNULL）
is_active: 有効フラグ
```
**アクセス制御**: 認証用テーブル。RBACの基盤。

---

### receipts（レシート）
```
id: レシートID (PK)
store_id: 店舗ID (FK)
table_number: 卓番号
guest_name: 顧客名
staff_name: 担当スタッフ（配列）
subtotal_excl_tax: 税抜小計
tax_amount: 税額
service_charge: サービス料
total_incl_tax: 税込合計
order_date: 営業日
checkout_datetime: 会計日時
deleted_at: 削除日時（論理削除）
```
**アクセス制御**:
- `store_id` で店舗フィルタ
- キャストは `staff_name` に自分が含まれるレシートのみ閲覧可能にすべき

---

### order_items（注文明細）
```
id: 明細ID (PK)
order_id: レシートID (FK → receipts)
product_name: 商品名
category: カテゴリ
cast_name: キャスト名（配列）
quantity: 数量
unit_price: 単価
subtotal: 小計
```
**アクセス制御**: `order_id` → `receipts` 経由で `store_id` を取得

---

### payments（支払い）
```
id: 支払いID (PK)
order_id: レシートID (FK → receipts)
cash_amount: 現金
credit_card_amount: カード
other_payment_amount: その他
change_amount: お釣り
```
**アクセス制御**: `order_id` → `receipts` 経由で `store_id` を取得

---

### attendance（勤怠）
```
id: 勤怠ID (PK)
store_id: 店舗ID (FK)
cast_name: キャスト名
date: 営業日
status: ステータス名
status_id: ステータスID (FK → attendance_statuses)
check_in_datetime: 出勤日時
check_out_datetime: 退勤日時
late_minutes: 遅刻分数
break_minutes: 休憩分数
daily_payment: 日払い額
costume_id: 衣装ID
is_modified: 修正済みフラグ
last_modified_at: 最終修正日時
```
**アクセス制御**:
- `store_id` で店舗フィルタ
- キャストは自分の `cast_name` のみ閲覧可能にすべき
- `daily_payment` は金銭情報なので要注意

---

### attendance_statuses（勤怠ステータス）
```
id: ステータスID (PK, UUID)
store_id: 店舗ID (FK)
name: ステータス名（出勤、遅刻、当欠、無欠等）
color: 表示色
order_index: 表示順
is_active: 有効フラグ
```
**アクセス制御**: `store_id` で店舗フィルタ

---

### attendance_history（勤怠修正履歴）
```
id: 履歴ID (PK)
attendance_id: 勤怠ID (FK)
store_id: 店舗ID (FK)
previous_*: 修正前の各値
new_*: 修正後の各値
modified_at: 修正日時
modified_source: 修正元 ('pos' | 'admin')
modified_by: 修正者ID
reason: 修正理由
```
**アクセス制御**: 管理者のみ閲覧。監査用途。

---

### shifts（シフト確定）
```
id: シフトID (PK)
cast_id: キャストID (FK)
store_id: 店舗ID (FK)
date: 日付
start_time: 開始時刻
end_time: 終了時刻
status: ステータス
```
**アクセス制御**:
- `store_id` で店舗フィルタ
- キャストは自分の `cast_id` のみ閲覧（他キャストのシフトは一部閲覧可能にする場合あり）

---

### shift_requests（シフト申請）
```
id: 申請ID (PK)
cast_id: キャストID (FK)
store_id: 店舗ID (FK)
date: 日付
start_time: 開始時刻
end_time: 終了時刻
status: 申請ステータス
```
**アクセス制御**:
- キャストは自分の申請のみ作成・閲覧可能
- 管理者は全申請を閲覧・承認可能

---

### shift_locks（シフトロック）
```
id: ロックID (PK)
store_id: 店舗ID (FK)
year: 年
month: 月
is_locked: ロック状態
locked_at: ロック日時
locked_by: ロック者ID
```
**アクセス制御**: 管理者のみ変更可能

---

### products（商品）
```
id: 商品ID (PK)
store_id: 店舗ID (FK)
name: 商品名
price: 価格
category_id: カテゴリID
display_order: 表示順
is_active: 有効フラグ
needs_cast: キャスト指定必要
tax_rate: 税率
discount_rate: 割引率
```
**アクセス制御**: `store_id` で店舗フィルタ

---

### categories（カテゴリ）
```
id: カテゴリID (PK)
store_id: 店舗ID (FK)
name: カテゴリ名
display_order: 表示順
show_oshi_first: 推し優先表示
```
**アクセス制御**: `store_id` で店舗フィルタ

---

### system_settings（システム設定）
```
store_id: 店舗ID (識別キー)
setting_key: 設定キー
setting_value: 設定値
```
主な設定:
- `tax_rate`: 税率（10 = 10%）
- `service_fee_rate`: サービス料率
- `business_day_start_hour`: 営業日切替時刻
- `allow_multiple_nominations`: 複数推し機能

**アクセス制御**: `store_id` で店舗フィルタ。管理者のみ変更可能。

---

### sales_settings（売上計算設定）
```
id: 設定ID (PK)
store_id: 店舗ID (FK)

# 推し小計ベース（item_based）設定
item_use_tax_excluded: 税抜き計算
item_exclude_consumption_tax: 消費税除外
item_multi_cast_distribution: 複数キャスト分配方法
item_help_sales_inclusion: ヘルプ売上計上方法
item_rounding_*: 端数処理設定

# 伝票小計ベース（receipt_based）設定
receipt_*: 上記と同様の設定

# 公開設定
published_aggregation: キャストに公開する集計方法

# BASE連携
include_base_in_*_sales: BASE売上の計上設定
```
**アクセス制御**: 管理者のみ変更可能。キャストは `published_aggregation` の結果のみ閲覧可能。

---

### compensation_settings（報酬設定）
```
id: 設定ID (PK)
cast_id: キャストID (FK)
store_id: 店舗ID (FK)
pay_type: 給与形態
hourly_rate: 時給
commission_rate: バック率
sliding_rates: スライド率テーブル (JSONB)
deduction_items: 控除項目 (JSONB)
compensation_types: 報酬形態配列 (JSONB)
target_year/month: 対象年月
is_locked: ロック済み
```
**アクセス制御**:
- **機密情報**: 給与・バック率は非常に機密性が高い
- 管理者のみフルアクセス
- キャストは自分の設定のみ閲覧可能（店舗設定次第）

---

### cast_back_rates（商品別バック率）
```
id: バック率ID (PK)
cast_id: キャストID (FK)
store_id: 店舗ID (FK)
category: カテゴリ（NULLは全カテゴリ）
product_name: 商品名（NULLは全商品）
back_type: バック種別 ('ratio' | 'fixed')
back_ratio: バック率
self_back_ratio: SELF用バック率
help_back_ratio: HELP用バック率
use_sliding_back: スライド式使用
sliding_back_rates: スライドテーブル (JSONB)
```
**アクセス制御**: 機密情報。管理者のみ。

---

### cast_daily_items（日別商品詳細）
```
id: 明細ID (PK)
cast_id: キャストID (FK)
store_id: 店舗ID (FK)
date: 日付
category: カテゴリ
product_name: 商品名
quantity: 数量
subtotal: 小計
back_amount: バック額
```
**アクセス制御**:
- 管理者はフルアクセス
- キャストは自分の `cast_id` のみ（`back_amount` は設定次第で非公開）

---

### cast_daily_stats（日別統計）
```
id: 統計ID (PK)
cast_id: キャストID (FK)
store_id: 店舗ID (FK)
date: 日付
self_sales_item_based: SELF売上（推し小計）
help_sales_item_based: HELP売上（推し小計）
self_sales_receipt_based: SELF売上（伝票小計）
...
work_hours: 勤務時間
total_hourly_wage: 合計時給
wage_amount: 時給収入
is_finalized: 確定済み
```
**アクセス制御**:
- 管理者はフルアクセス
- キャストは `sales_settings.published_aggregation` に従って公開

---

### wage_statuses（時給ステータス）
```
id: ステータスID (PK)
store_id: 店舗ID (FK)
name: ステータス名（研修、レギュラー、ゴールド等）
hourly_wage: 時給
priority: 優先順位
is_default: デフォルトフラグ
```
**アクセス制御**: 管理者のみ設定可能。

---

### special_wage_days（特別日カレンダー）
```
id: 特別日ID (PK)
store_id: 店舗ID (FK)
date: 日付
name: 名称（クリスマス等）
wage_adjustment: 時給加算額
```
**アクセス制御**: 管理者のみ設定可能。

---

### costumes（衣装）
```
id: 衣装ID (PK)
store_id: 店舗ID (FK)
name: 衣装名
wage_adjustment: 時給加算額
display_order: 表示順
```
**アクセス制御**: 読み取りは全員可能、設定は管理者のみ。

---

### deduction_types（控除項目マスタ）
```
id: 控除項目ID (PK)
store_id: 店舗ID (FK)
name: 項目名
type: 種別（percentage, fixed, penalty_status, penalty_late, daily_payment, manual）
percentage: %率
default_amount: デフォルト額
attendance_status_id: ステータス連動
penalty_amount: 罰金額
```
**アクセス制御**: 管理者のみ。

---

### cast_deductions（キャスト別控除実績）
```
id: 控除ID (PK)
cast_id: キャストID (FK)
store_id: 店舗ID (FK)
year_month: 対象年月
deduction_type_id: 控除項目
amount: 控除額
count: 回数
is_auto_calculated: 自動計算フラグ
```
**アクセス制御**:
- 管理者はフルアクセス
- キャストは自分の控除のみ閲覧可能（設定次第）

---

### payslips（報酬明細）
```
id: 明細ID (PK)
cast_id: キャストID (FK)
store_id: 店舗ID (FK)
year_month: 対象年月
status: ステータス ('draft' | 'finalized')
work_days: 出勤日数
total_hours: 勤務時間
hourly_income: 時給収入
sales_back: 売上バック
product_back: 商品バック
gross_total: 総支給額
total_deduction: 控除合計
net_payment: 差引支給額
daily_details: 日別明細 (JSONB)
deduction_details: 控除内訳 (JSONB)
```
**アクセス制御**:
- **最機密情報**: 給与明細
- 管理者はフルアクセス
- キャストは自分の明細のみ（`finalized` のみ公開など）

---

### BASE連携テーブル

#### base_settings
```
id: 設定ID (PK)
store_id: 店舗ID (FK)
client_id: クライアントID
client_secret: クライアントシークレット
access_token: アクセストークン
refresh_token: リフレッシュトークン
```
**アクセス制御**: 管理者のみ。認証情報含む。

#### base_products / base_variations / base_orders
```
store_id: 店舗ID (FK)
cast_id: キャストID（ordersのみ）
```
**アクセス制御**: 管理者はフルアクセス。キャストは自分関連の注文のみ。

---

## アクセス制御の設計方針

### 1. RLSポリシー設計の基本

```sql
-- 読み取り専用ポリシー例
CREATE POLICY "casts_select_own" ON casts
  FOR SELECT
  USING (
    -- 管理者は店舗のすべて閲覧可能
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND store_id = casts.store_id)
    OR
    -- キャストは自分のみ
    id = (SELECT id FROM casts WHERE line_user_id = auth.uid())
  );
```

### 2. データ機密レベル

| レベル | テーブル | アクセス権限 |
|-------|---------|-------------|
| **最高機密** | payslips, compensation_settings, cast_back_rates | 管理者のみ（キャストは自分のみ限定的に） |
| **高機密** | attendance (日払い), cast_deductions | 管理者 + 本人のみ |
| **中機密** | receipts, order_items, cast_daily_stats | 管理者 + 関係キャスト |
| **低機密** | shifts, products, categories, costumes | 全スタッフ閲覧可 |
| **公開** | stores, attendance_statuses | 全員 |

### 3. ロール定義案

```typescript
type Role =
  | 'super_admin'    // 全店舗フルアクセス
  | 'store_owner'    // 単一店舗フルアクセス（給与閲覧可）
  | 'store_manager'  // 単一店舗管理（給与閲覧不可）
  | 'store_viewer'   // 単一店舗閲覧のみ
  | 'cast'           // キャスト（自分のデータのみ）
```

### 4. 複雑なアクセスパターン

#### レシートのキャスト閲覧
キャストがヘルプで参加したレシートを閲覧する場合:
```sql
-- キャストが関与したレシートを取得
SELECT r.* FROM receipts r
JOIN order_items oi ON oi.order_id = r.id
WHERE
  r.store_id = :store_id
  AND (
    -- staff_nameに含まれる
    :cast_name = ANY(r.staff_name)
    OR
    -- order_itemsのcast_nameに含まれる
    :cast_name = ANY(oi.cast_name)
  );
```

---

## 今後の実装ステップ

1. **admin_usersテーブルのロール拡張**
   - `role` カラムに新しいロール追加
   - または別テーブル `user_roles` を作成

2. **各テーブルにRLSポリシー設定**
   - 現在は `FOR ALL TO authenticated USING (true)` が多い
   - ロールベースのポリシーに置き換え

3. **APIレベルでの権限チェック**
   - RLSだけでなく、アプリケーション層でも検証
   - 特に書き込み操作は二重チェック

4. **キャスト用LINE認証の統合**
   - `casts.line_user_id` をSupabase Authと連携
   - JWT claimsにcast_id, store_idを含める
