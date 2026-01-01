# DATABASE.md - Supabase データベース構造

最終更新: 2024-12-17

## 概要
このドキュメントは、3つのプロジェクト（vi-admin, table-management-system, shift-management-app）で共有されるSupabaseデータベースの構造を記述します。

**テーブル数**: 51

## プロジェクト別テーブル使用状況

| プロジェクト | 主な使用テーブル |
|-------------|-----------------|
| vi-admin | admin_users, stores, casts, sales_settings, compensation_settings, wage_statuses, deduction_types 等 |
| table-management-system (POS) | orders, order_items, payments, products, table_status, current_order_items 等 |
| shift-management-app | shifts, shift_requests, attendance, attendance_history, casts, cast_sales_targets 等 |

---

## テーブル一覧（カテゴリ別）

### 管理系 (Admin)
- `admin_users` 
- `admin_emergency_logins` 
- `stores` 
- `users` 
- `system_settings` 
- `store_line_configs` 
- `line_register_requests` 

### キャスト管理
- `casts` 
- `casts_backup` 
- `cast_positions` 
- `costumes` - 衣装マスタ（衣装ごとの時給調整）
- `visitor_reservations` 

### シフト・勤怠
- `shifts` 
- `shift_requests` 
- `shift_locks` 
- `attendance` 
- `attendance_history` - 勤怠修正履歴
- `attendance_statuses` 

### 売上・バック・目標
- `cast_daily_stats` - キャスト別日別売上サマリー
- `cast_daily_items` - キャスト別日別商品詳細
- `sales_settings` - 店舗別売上計算設定
- `cast_back_rates` - キャスト×商品別バック率設定
- `monthly_targets` 
- `cast_sales_targets` 

### 給与・報酬
- `compensation_settings` - キャスト別報酬設定
- `wage_statuses` - 時給ステータス定義（研修、レギュラー、ゴールド等）
- `wage_status_conditions` - ステータス昇格/降格条件
- `store_wage_settings` - 店舗別時給ルール設定
- `special_wage_days` - 特別日カレンダー（クリスマス等の時給加算日）
- `deduction_types` - 控除項目マスタ（店舗ごと）
- `late_penalty_rules` - 遅刻罰金ルール（段階式）
- `late_penalty_tiers` 
- `cast_deductions` - キャスト別控除（月ごと）
- `payslips` 
- `compensation_sample_receipts` 
- `compensation_sample_items` 

### POS・会計
- `orders` 
- `order_items` 
- `current_order_items` 
- `payments` 
- `products` 
- `product_categories` 
- `receipt_sequences` 
- `receipt_settings` 
- `table_status` 
- `cash_counts` 
- `daily_reports` 

### BASE連携
- `base_settings` - BASE API連携設定
- `base_orders` - BASE注文履歴
- `base_products` - BASE商品マッピング
- `base_variations` - BASEバリエーション（キャストマッピング）

---

## 主要テーブル詳細

### stores
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_name | varchar(255) | ✓ |  |  |
| store_code | varchar(50) | ✓ |  |  |
| is_active | boolean |  | True |  |
| created_at | timestamptz |  | CURRENT_TIMESTAMP |  |

### admin_users
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| username | varchar(50) | ✓ |  |  |
| password_hash | varchar(255) | ✓ |  |  |
| role | varchar(20) | ✓ |  |  |
| store_id | integer |  |  | FK → stores.id |
| is_active | boolean |  | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| permissions | jsonb |  |  | ページ/機能ごとのアクセス権限。例: {"casts": true, "pays |

### casts
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| name | varchar(100) |  |  |  |
| twitter | varchar(100) |  |  |  |
| password | varchar(100) |  |  |  |
| instagram | varchar(100) |  |  |  |
| password2 | varchar(100) |  |  |  |
| attendance_certificate | boolean |  |  |  |
| residence_record | boolean |  |  |  |
| contract_documents | boolean |  |  |  |
| submission_contract | varchar(100) |  |  |  |
| employee_name | varchar(100) |  |  |  |
| attributes | varchar(100) |  |  |  |
| status | varchar(50) |  |  |  |
| sales_previous_day | varchar(10) |  |  |  |
| experience_date | date |  |  |  |
| hire_date | date |  |  |  |
| resignation_date | date |  |  |  |
| created_at | timestamp |  | now() |  |
| updated_at | timestamp |  | now() |  |
| store_id | integer |  |  | FK → stores.id |
| show_in_pos | boolean |  | True |  |
| birthday | varchar(4) |  |  |  |
| line_user_id | varchar(100) |  |  |  |
| is_admin | boolean |  | False |  |
| is_manager | boolean |  | False |  |
| line_msg_state | text |  | not_registered |  |
| line_msg_registered_at | timestamptz |  |  |  |
| is_active | boolean |  | True |  |
| display_order | integer |  |  |  |
| line_input_context | jsonb |  |  |  |
| primary_cast_id | integer |  |  | FK → casts.id |

### orders
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | extensions.uuid_generate_ | PK |
| receipt_number | varchar(20) | ✓ |  |  |
| visit_datetime | timestamp | ✓ |  |  |
| checkout_datetime | timestamp | ✓ |  |  |
| table_number | varchar(10) |  |  |  |
| staff_name | varchar(50) |  |  |  |
| subtotal_incl_tax | numeric |  |  | メニュー合計（税込） |
| total_incl_tax | numeric | ✓ |  |  |
| created_at | timestamp |  | CURRENT_TIMESTAMP |  |
| guest_name | varchar(100) |  |  |  |
| visit_type | varchar(20) |  |  |  |
| service_charge | numeric |  | 0 |  |
| rounding_adjustment | numeric |  | 0 |  |
| store_id | integer |  |  | FK → stores.id |
| deleted_at | timestamp |  |  |  |
| deleted_by | integer |  |  | FK → users.id |
| order_date | timestamptz |  |  |  |
| discount_amount | integer |  | 0 |  |

### order_items
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | extensions.uuid_generate_ | PK |
| order_id | uuid |  |  | FK → orders.id |
| category | varchar(50) |  |  |  |
| product_name | varchar(100) | ✓ |  |  |
| unit_price | numeric | ✓ |  |  |
| quantity | integer | ✓ |  |  |
| subtotal | numeric | ✓ |  |  |
| created_at | timestamp |  | CURRENT_TIMESTAMP |  |
| cast_name | text[] |  |  |  |
| store_id | integer |  |  | FK → stores.id |

### payments
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | extensions.uuid_generate_ | PK |
| order_id | uuid |  |  | FK → orders.id |
| cash_amount | numeric |  | 0 |  |
| change_amount | numeric |  | 0 |  |
| credit_card_amount | numeric |  | 0 |  |
| other_payment_amount | numeric |  | 0 |  |
| payment_method | varchar(50) |  |  |  |
| created_at | timestamp |  | CURRENT_TIMESTAMP |  |
| store_id | integer |  |  | FK → stores.id |
| card_fee | numeric |  | 0 |  |

### products
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| category_id | integer |  |  | FK → product_categories.id |
| name | varchar(100) | ✓ |  |  |
| price | numeric | ✓ |  |  |
| price_excl_tax | numeric |  | 0 |  |
| discount_rate | numeric |  | 0 |  |
| needs_cast | boolean |  | False |  |
| is_active | boolean |  | True |  |
| display_order | integer |  | 0 |  |
| created_at | timestamp |  | now() |  |
| updated_at | timestamp |  | now() |  |
| store_id | integer |  |  | FK → stores.id |

### shifts
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | gen_random_uuid() | PK |
| cast_id | integer | ✓ |  | FK → casts.id |
| date | date | ✓ |  |  |
| start_time | time | ✓ |  |  |
| end_time | time | ✓ |  |  |
| actual_start_time | time |  |  |  |
| actual_end_time | time |  |  |  |
| break_minutes | integer |  | 0 |  |
| notes | text |  |  |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| is_locked | boolean |  | False |  |
| is_confirmed | boolean |  | False |  |
| store_id | integer |  |  |  |
| source | varchar(20) |  | manual |  |

### shift_requests
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | gen_random_uuid() | PK |
| cast_id | integer | ✓ |  | FK → casts.id |
| date | date | ✓ |  |  |
| start_time | time | ✓ |  |  |
| end_time | time | ✓ |  |  |
| status | varchar(20) |  | pending |  |
| notes | text |  |  |  |
| rejected_reason | text |  |  |  |
| approved_by | integer |  |  | FK → casts.id |
| approved_at | timestamptz |  |  |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| is_locked | boolean |  | False |  |
| store_id | integer | ✓ |  |  |

### attendance
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| date | date | ✓ |  |  |
| cast_name | varchar(100) | ✓ |  |  |
| check_in_datetime | timestamp |  |  |  |
| check_out_datetime | timestamp |  |  |  |
| status | varchar(20) |  | 未設定 | 出勤ステータス名（後方互換用、status_idを優先） |
| late_minutes | integer |  | 0 |  |
| break_minutes | integer |  | 0 |  |
| hourly_rate | integer |  | 0 |  |
| daily_payment | integer |  | 0 |  |
| total_wage | integer |  | 0 |  |
| created_at | timestamp |  | CURRENT_TIMESTAMP |  |
| updated_at | timestamp |  | CURRENT_TIMESTAMP |  |
| created_by | integer |  |  | FK → users.id |
| role | varchar(50) |  | cast |  |
| costume_id | integer |  |  | FK → costumes.id |
| status_id | uuid |  |  | FK → attendance_statuses.id |
| is_modified | boolean | ✓ | False | 締め時刻後に修正されたかどうか |
| last_modified_at | timestamptz |  |  | 最終修正日時 |

### compensation_settings
**キャスト別報酬設定**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| cast_id | integer | ✓ |  | FK → casts.id |
| store_id | integer | ✓ |  | FK → stores.id |
| pay_type | varchar(30) | ✓ | hourly | 給与形態: hourly=時給制, commission=完全歩合, hourl |
| hourly_rate | integer | ✓ | 0 |  |
| commission_rate | numeric | ✓ | 0 |  |
| sliding_rates | jsonb |  |  | スライド制の売上別バック率（JSONB形式） |
| guarantee_enabled | boolean | ✓ | False |  |
| guarantee_amount | integer | ✓ | 0 |  |
| guarantee_period | varchar(10) |  | day |  |
| deduction_enabled | boolean | ✓ | False |  |
| deduction_items | jsonb |  |  |  |
| valid_from | date | ✓ | CURRENT_DATE |  |
| valid_to | date |  |  |  |
| is_active | boolean | ✓ | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| sales_target | varchar |  | cast_sales | 売上対象: receipt_total(伝票小計) or cast_sales( |
| fixed_amount | integer |  | 0 | 固定額（日給など） |
| use_sliding_comparison | boolean |  | False | スライド比較を使用するか（高い方を支給） |
| compare_hourly_rate | integer |  | 0 | 比較用: 時給 |
| compare_commission_rate | numeric |  | 0 | 比較用: 歩合率(%) |
| compare_sales_target | varchar |  | cast_sales | 比較用: 売上対象 |
| compare_fixed_amount | integer |  | 0 | 比較用: 固定額 |
| use_product_back | boolean | ✓ | False |  |
| target_year | integer |  |  |  |
| target_month | integer |  |  |  |
| is_locked | boolean |  | False |  |
| locked_at | timestamptz |  |  |  |
| compare_use_product_back | boolean |  | False |  |
| help_back_calculation_method | text |  | sales_based |  |
| use_help_product_back | boolean |  | False |  |
| payment_selection_method | varchar(20) | ✓ | highest | 支給方法: highest=高い方を支給, specific=特定の報酬形態を使 |
| selected_compensation_type_id | varchar(36) |  |  | specific時に使用する報酬形態のID (UUID) |
| compensation_types | jsonb |  |  | 報酬形態の配列 (JSONB) |
| status_id | integer |  |  | FK → wage_statuses.id |
| status_locked | boolean | ✓ | False | ステータス固定フラグ |
| hourly_wage_override | integer |  |  | 時給直接指定（NULLならステータスの時給） |
| min_days_rule_enabled | boolean | ✓ | True | 最低日数ルール適用 |
| first_month_exempt_override | boolean |  |  | 入店初月除外（NULL=店舗設定に従う） |
| enabled_deduction_ids | integer[] |  |  | このキャストに適用する控除項目のID配列 |

### wage_statuses
**時給ステータス定義（研修、レギュラー、ゴールド等）**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| name | varchar(50) | ✓ |  |  |
| hourly_wage | integer | ✓ | 0 |  |
| priority | integer | ✓ | 0 | 優先度（高い方が優先） |
| is_default | boolean | ✓ | False | 新規キャストのデフォルトステータス |
| is_active | boolean | ✓ | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### deduction_types
**控除項目マスタ（店舗ごと）**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| name | varchar(100) | ✓ |  |  |
| type | varchar(20) | ✓ | fixed | percentage: %計算, fixed: 固定額, penalty_sta |
| percentage | numeric |  |  |  |
| default_amount | integer |  | 0 |  |
| attendance_status_id | uuid |  |  | FK → attendance_statuses.id |
| penalty_amount | integer |  | 0 |  |
| display_order | integer |  | 0 |  |
| is_active | boolean |  | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### cast_daily_stats
**キャスト別日別売上サマリー**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| cast_id | integer | ✓ |  | FK → casts.id |
| store_id | integer | ✓ |  | FK → stores.id |
| date | date | ✓ |  |  |
| self_sales_item_based | integer | ✓ | 0 | 推し売上（推し小計ベース） |
| help_sales_item_based | integer | ✓ | 0 | ヘルプ売上（推し小計ベース） |
| total_sales_item_based | integer | ✓ | 0 |  |
| product_back_item_based | integer | ✓ | 0 |  |
| self_sales_receipt_based | integer | ✓ | 0 | 推し売上（伝票小計ベース） |
| help_sales_receipt_based | integer | ✓ | 0 | ヘルプ売上（伝票小計ベース） |
| total_sales_receipt_based | integer | ✓ | 0 |  |
| product_back_receipt_based | integer | ✓ | 0 |  |
| is_finalized | boolean | ✓ | False | 確定済みフラグ（trueの場合は再計算でスキップ） |
| finalized_at | timestamptz |  |  |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| work_hours | numeric |  | 0 | 勤務時間（時間単位、小数点2桁） |
| base_hourly_wage | integer |  | 0 | 基本時給（ステータスまたはオーバーライド） |
| special_day_bonus | integer |  | 0 | 特別日加算額 |
| costume_bonus | integer |  | 0 | 衣装加算額 |
| total_hourly_wage | integer |  | 0 | 合計時給（基本+特別日+衣装） |
| wage_amount | integer |  | 0 | 時給収入（合計時給×勤務時間） |
| costume_id | integer |  |  | FK → costumes.id |
| wage_status_id | integer |  |  | FK → wage_statuses.id |

### cast_sales_targets
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| cast_id | integer | ✓ |  | FK → casts.id |
| store_id | integer | ✓ |  | FK → stores.id |
| year_month | varchar(7) | ✓ |  |  |
| target_amount | integer | ✓ | 0 |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### sales_settings
**店舗別売上計算設定**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| rounding_method | varchar(20) | ✓ | floor_100 | 端数処理方法: floor_100=100円切捨て, floor_10=10円切 |
| rounding_timing | varchar(20) | ✓ | total | 端数処理タイミング: per_item=商品ごと, total=合計時 |
| help_calculation_method | varchar(20) | ✓ | ratio | ヘルプ売上計算方法: ratio=割合, fixed=固定額 |
| help_ratio | numeric | ✓ | 50.0 | ヘルプ売上割合（％） |
| help_fixed_amount | integer | ✓ | 0 |  |
| use_tax_excluded | boolean | ✓ | True | true=税抜き計算, false=税込み計算 |
| description | text |  |  |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| exclude_consumption_tax | boolean | ✓ | True |  |
| exclude_service_charge | boolean | ✓ | True |  |
| distribute_to_help | boolean |  | True |  |
| item_use_tax_excluded | boolean |  | True |  |
| item_exclude_consumption_tax | boolean |  | True |  |
| item_exclude_service_charge | boolean |  | False |  |
| item_multi_cast_distribution | text |  | nomination_only | 複数キャストの分配方法: nomination_only=推しに該当するキャスト |
| item_help_sales_inclusion | text |  | both | ヘルプ売上の計上方法: both=両方, self_only=SELFのみ, h |
| item_help_calculation_method | text |  | ratio |  |
| item_help_ratio | integer |  | 50 |  |
| item_help_fixed_amount | integer |  | 0 |  |
| item_rounding_method | text |  | floor_100 |  |
| item_rounding_position | integer |  | 100 |  |
| receipt_use_tax_excluded | boolean |  | True |  |
| receipt_exclude_consumption_tax | boolean |  | True |  |
| receipt_exclude_service_charge | boolean |  | False |  |
| receipt_multi_cast_distribution | text |  | nomination_only | 複数キャストの分配方法: nomination_only=推しに該当するキャスト |
| receipt_help_sales_inclusion | text |  | both | ヘルプ売上の計上方法: both=両方, self_only=SELFのみ, h |
| receipt_help_calculation_method | text |  | ratio |  |
| receipt_help_ratio | integer |  | 50 |  |
| receipt_help_fixed_amount | integer |  | 0 |  |
| receipt_rounding_method | text |  | floor_100 |  |
| receipt_rounding_position | integer |  | 100 |  |
| published_aggregation | text |  | item_based | 公開する集計方法: item_based=キャスト商品のみ, receipt_b |
| non_help_staff_names | text[] |  |  | ヘルプ扱いにしない推し名の配列 |
| multi_nomination_ratios | integer[] |  |  | 複数推しの分配率（例: [50, 50]で均等） |
| item_non_nomination_sales_handling | text |  | share_only |  |
| receipt_non_nomination_sales_handling | text |  | share_only |  |
| item_rounding_timing | text |  | per_item | 端数処理タイミング: per_item=商品ごと, total=合計時 |
| receipt_rounding_timing | text |  | per_item | 端数処理タイミング: per_item=商品ごと, total=合計時 |
| item_help_distribution_method | text |  | equal_all |  |
| receipt_help_distribution_method | text |  | equal_all |  |
| item_nomination_distribute_all | boolean |  | False |  |
| include_base_in_item_sales | boolean | ✓ | True | BASE売上を推し小計に含める |
| include_base_in_receipt_sales | boolean | ✓ | True | BASE売上を伝票小計に含める |
| base_cutoff_hour | integer | ✓ | 6 | BASE注文の営業日締め時間（0-23、例: 6 = 翌6時まで前日扱い） |
| base_cutoff_enabled | boolean | ✓ | True | BASE注文に営業日締め時間を適用するか |

---

## 全テーブル詳細（アルファベット順）

### admin_emergency_logins
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer |  |  | FK → stores.id |
| username | varchar(255) | ✓ |  |  |
| password_hash | varchar(255) | ✓ |  |  |
| is_active | boolean |  | True |  |
| created_at | timestamp |  | now() |  |
| updated_at | timestamp |  | now() |  |

### admin_users
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| username | varchar(50) | ✓ |  |  |
| password_hash | varchar(255) | ✓ |  |  |
| role | varchar(20) | ✓ |  |  |
| store_id | integer |  |  | FK → stores.id |
| is_active | boolean |  | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| permissions | jsonb |  |  | ページ/機能ごとのアクセス権限。例: {"casts": true, "pays |

### attendance
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| date | date | ✓ |  |  |
| cast_name | varchar(100) | ✓ |  |  |
| check_in_datetime | timestamp |  |  |  |
| check_out_datetime | timestamp |  |  |  |
| status | varchar(20) |  | 未設定 | 出勤ステータス名（後方互換用、status_idを優先） |
| late_minutes | integer |  | 0 |  |
| break_minutes | integer |  | 0 |  |
| hourly_rate | integer |  | 0 |  |
| daily_payment | integer |  | 0 |  |
| total_wage | integer |  | 0 |  |
| created_at | timestamp |  | CURRENT_TIMESTAMP |  |
| updated_at | timestamp |  | CURRENT_TIMESTAMP |  |
| created_by | integer |  |  | FK → users.id |
| role | varchar(50) |  | cast |  |
| costume_id | integer |  |  | FK → costumes.id |
| status_id | uuid |  |  | FK → attendance_statuses.id |
| is_modified | boolean | ✓ | False | 締め時刻後に修正されたかどうか |
| last_modified_at | timestamptz |  |  | 最終修正日時 |

### attendance_history
**勤怠修正履歴**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| attendance_id | integer | ✓ |  | FK → attendance.id |
| store_id | integer | ✓ |  | FK → stores.id |
| previous_status_id | uuid |  |  |  |
| previous_check_in_datetime | timestamptz |  |  |  |
| previous_check_out_datetime | timestamptz |  |  |  |
| previous_late_minutes | integer |  |  |  |
| previous_break_minutes | integer |  |  |  |
| previous_daily_payment | integer |  |  |  |
| previous_costume_id | integer |  |  |  |
| new_status_id | uuid |  |  |  |
| new_check_in_datetime | timestamptz |  |  |  |
| new_check_out_datetime | timestamptz |  |  |  |
| new_late_minutes | integer |  |  |  |
| new_break_minutes | integer |  |  |  |
| new_daily_payment | integer |  |  |  |
| new_costume_id | integer |  |  |  |
| modified_at | timestamptz | ✓ | now() |  |
| modified_source | varchar(20) | ✓ | admin | 修正元: pos=POS, admin=管理画面 |
| modified_by | uuid |  |  | 修正者ID（将来の権限管理用） |
| reason | text |  |  | 修正理由 |
| created_at | timestamptz |  | now() |  |

### attendance_statuses
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | extensions.uuid_generate_ | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| name | varchar(50) | ✓ |  |  |
| color | varchar(7) | ✓ |  |  |
| is_active | boolean |  | False |  |
| order_index | integer |  | 0 |  |
| created_at | timestamp |  | now() |  |
| code | text |  |  |  |

### base_orders
**BASE注文履歴**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| base_order_id | varchar(100) | ✓ |  | BASE側の注文ID |
| order_datetime | timestamptz | ✓ |  |  |
| product_name | varchar(255) | ✓ |  |  |
| variation_name | varchar(255) |  |  |  |
| cast_id | integer |  |  | FK → casts.id |
| local_product_id | integer |  |  | FK → products.id |
| base_price | integer | ✓ |  | BASE価格（手数料込み） |
| actual_price | integer |  |  | 実際の商品価格 |
| quantity | integer | ✓ | 1 |  |
| back_amount | integer |  | 0 |  |
| business_date | date |  |  |  |
| is_processed | boolean | ✓ | False | キャスト売上に反映済みか |
| processed_at | timestamptz |  |  |  |
| error_message | text |  |  |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### base_products
**BASE商品マッピング**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| base_item_id | bigint |  |  | BASE側の商品ID |
| base_product_name | varchar(255) | ✓ |  | BASE側の商品名 |
| local_product_name | varchar(255) | ✓ |  | ローカル商品名（productsと一致） |
| base_price | integer | ✓ | 0 | BASE価格（手数料込み） |
| sync_variations | boolean | ✓ | True |  |
| is_active | boolean | ✓ | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### base_settings
**BASE API連携設定**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| client_id | varchar(255) |  |  | BASE APIクライアントID |
| client_secret | varchar(255) |  |  | BASE APIクライアントシークレット |
| access_token | text |  |  | アクセストークン |
| refresh_token | text |  |  | リフレッシュトークン |
| token_expires_at | timestamptz |  |  |  |
| is_active | boolean | ✓ | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### base_variations
**BASEバリエーション（キャストマッピング）**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| base_product_id | integer | ✓ |  | FK → base_products.id |
| store_id | integer | ✓ |  | FK → stores.id |
| base_variation_id | bigint |  |  |  |
| variation_name | varchar(255) | ✓ |  | バリエーション名（キャスト名と一致） |
| cast_id | integer |  |  | FK → casts.id |
| is_synced | boolean | ✓ | False | BASEと同期済みか |
| synced_at | timestamptz |  |  |  |
| is_active | boolean | ✓ | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### cash_counts
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  |  |
| business_date | date | ✓ |  |  |
| bill_10000 | integer |  | 0 |  |
| bill_5000 | integer |  | 0 |  |
| bill_2000 | integer |  | 0 |  |
| bill_1000 | integer |  | 0 |  |
| coin_500 | integer |  | 0 |  |
| coin_100 | integer |  | 0 |  |
| coin_50 | integer |  | 0 |  |
| coin_10 | integer |  | 0 |  |
| coin_5 | integer |  | 0 |  |
| coin_1 | integer |  | 0 |  |
| total_amount | integer | ✓ |  |  |
| register_amount | integer | ✓ |  |  |
| cash_collection | integer | ✓ |  |  |
| created_at | timestamptz |  | CURRENT_TIMESTAMP |  |
| updated_at | timestamptz |  | CURRENT_TIMESTAMP |  |

### cast_back_rates
**キャスト×商品別バック率設定**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| cast_id | integer | ✓ |  | FK → casts.id |
| store_id | integer | ✓ |  | FK → stores.id |
| category | varchar(100) |  |  | 商品カテゴリ（NULLは全カテゴリ対象） |
| product_name | varchar(200) |  |  | 商品名（NULLはカテゴリ全体対象） |
| back_type | varchar(20) | ✓ | ratio | バック計算方法: ratio=割合, fixed=固定額 |
| back_ratio | numeric | ✓ | 0 |  |
| back_fixed_amount | integer | ✓ | 0 |  |
| self_back_ratio | numeric |  |  |  |
| help_back_ratio | numeric |  |  |  |
| is_active | boolean | ✓ | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| hourly_wage | integer |  |  |  |
| use_sliding_back | boolean | ✓ | False | スライド式バック率を使用するか |
| back_sales_aggregation | varchar(20) | ✓ | item_based | 売上計算方法: item_based=推し小計, receipt_based=伝 |
| sliding_back_rates | jsonb |  |  | スライド率テーブル (JSONB形式) |
| calculated_sliding_rate | numeric |  |  | 計算済みのスライドバック率 (会計時に自動更新) |
| calculated_at | timestamptz |  |  | スライドバック率の計算日時 |
| calculated_sales_amount | integer |  |  | 計算時の累計売上金額 |
| source | varchar(10) | ✓ | all | バック率適用対象: pos=POSのみ, base=BASEのみ, all=両方 |

### cast_daily_items
**キャスト別日別商品詳細**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| cast_id | integer | ✓ |  | FK → casts.id |
| store_id | integer | ✓ |  | FK → stores.id |
| date | date | ✓ |  |  |
| category | varchar(100) |  |  |  |
| product_name | varchar(200) |  |  |  |
| quantity | integer | ✓ | 0 | 個数 |
| subtotal | integer | ✓ | 0 | 小計 |
| back_amount | integer | ✓ | 0 | バック金額 |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### cast_daily_stats
**キャスト別日別売上サマリー**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| cast_id | integer | ✓ |  | FK → casts.id |
| store_id | integer | ✓ |  | FK → stores.id |
| date | date | ✓ |  |  |
| self_sales_item_based | integer | ✓ | 0 | 推し売上（推し小計ベース） |
| help_sales_item_based | integer | ✓ | 0 | ヘルプ売上（推し小計ベース） |
| total_sales_item_based | integer | ✓ | 0 |  |
| product_back_item_based | integer | ✓ | 0 |  |
| self_sales_receipt_based | integer | ✓ | 0 | 推し売上（伝票小計ベース） |
| help_sales_receipt_based | integer | ✓ | 0 | ヘルプ売上（伝票小計ベース） |
| total_sales_receipt_based | integer | ✓ | 0 |  |
| product_back_receipt_based | integer | ✓ | 0 |  |
| is_finalized | boolean | ✓ | False | 確定済みフラグ（trueの場合は再計算でスキップ） |
| finalized_at | timestamptz |  |  |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| work_hours | numeric |  | 0 | 勤務時間（時間単位、小数点2桁） |
| base_hourly_wage | integer |  | 0 | 基本時給（ステータスまたはオーバーライド） |
| special_day_bonus | integer |  | 0 | 特別日加算額 |
| costume_bonus | integer |  | 0 | 衣装加算額 |
| total_hourly_wage | integer |  | 0 | 合計時給（基本+特別日+衣装） |
| wage_amount | integer |  | 0 | 時給収入（合計時給×勤務時間） |
| costume_id | integer |  |  | FK → costumes.id |
| wage_status_id | integer |  |  | FK → wage_statuses.id |

### cast_deductions
**キャスト別控除（月ごと）**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| cast_id | integer | ✓ |  | FK → casts.id |
| store_id | integer | ✓ |  | FK → stores.id |
| year_month | varchar(7) | ✓ |  |  |
| deduction_type_id | integer |  |  | FK → deduction_types.id |
| custom_name | varchar(100) |  |  |  |
| amount | integer | ✓ |  |  |
| count | integer |  | 1 |  |
| note | text |  |  |  |
| is_auto_calculated | boolean |  | False |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### cast_positions
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  |  |
| name | varchar(100) | ✓ |  |  |
| display_order | integer |  | 0 |  |
| is_active | boolean |  | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### cast_sales_targets
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| cast_id | integer | ✓ |  | FK → casts.id |
| store_id | integer | ✓ |  | FK → stores.id |
| year_month | varchar(7) | ✓ |  |  |
| target_amount | integer | ✓ | 0 |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### casts
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| name | varchar(100) |  |  |  |
| twitter | varchar(100) |  |  |  |
| password | varchar(100) |  |  |  |
| instagram | varchar(100) |  |  |  |
| password2 | varchar(100) |  |  |  |
| attendance_certificate | boolean |  |  |  |
| residence_record | boolean |  |  |  |
| contract_documents | boolean |  |  |  |
| submission_contract | varchar(100) |  |  |  |
| employee_name | varchar(100) |  |  |  |
| attributes | varchar(100) |  |  |  |
| status | varchar(50) |  |  |  |
| sales_previous_day | varchar(10) |  |  |  |
| experience_date | date |  |  |  |
| hire_date | date |  |  |  |
| resignation_date | date |  |  |  |
| created_at | timestamp |  | now() |  |
| updated_at | timestamp |  | now() |  |
| store_id | integer |  |  | FK → stores.id |
| show_in_pos | boolean |  | True |  |
| birthday | varchar(4) |  |  |  |
| line_user_id | varchar(100) |  |  |  |
| is_admin | boolean |  | False |  |
| is_manager | boolean |  | False |  |
| line_msg_state | text |  | not_registered |  |
| line_msg_registered_at | timestamptz |  |  |  |
| is_active | boolean |  | True |  |
| display_order | integer |  |  |  |
| line_input_context | jsonb |  |  |  |
| primary_cast_id | integer |  |  | FK → casts.id |

### casts_backup
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer |  |  |  |
| name | varchar(100) |  |  |  |
| twitter | varchar(100) |  |  |  |
| password | varchar(100) |  |  |  |
| instagram | varchar(100) |  |  |  |
| password2 | varchar(100) |  |  |  |
| attendance_certificate | boolean |  |  |  |
| residence_record | boolean |  |  |  |
| contract_documents | boolean |  |  |  |
| submission_contract | varchar(100) |  |  |  |
| employee_name | varchar(100) |  |  |  |
| attributes | varchar(100) |  |  |  |
| status | varchar(50) |  |  |  |
| sales_previous_day | varchar(10) |  |  |  |
| experience_date | date |  |  |  |
| hire_date | date |  |  |  |
| resignation_date | date |  |  |  |
| birthday | date |  |  |  |
| created_at | timestamp |  |  |  |
| updated_at | timestamp |  |  |  |
| store_id | integer |  |  |  |
| show_in_pos | boolean |  |  |  |

### compensation_sample_items
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| receipt_id | integer | ✓ |  | FK → compensation_sample_receipts.id |
| product_id | integer |  |  |  |
| product_name | varchar(255) | ✓ |  |  |
| category | varchar(100) |  |  |  |
| base_price | integer | ✓ | 0 |  |
| cast_names | text[] |  |  |  |
| sort_order | integer |  | 0 |  |
| created_at | timestamptz |  | now() |  |

### compensation_sample_receipts
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  |  |
| name | varchar(100) |  | デフォルト |  |
| nominations | text[] |  |  |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### compensation_settings
**キャスト別報酬設定**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| cast_id | integer | ✓ |  | FK → casts.id |
| store_id | integer | ✓ |  | FK → stores.id |
| pay_type | varchar(30) | ✓ | hourly | 給与形態: hourly=時給制, commission=完全歩合, hourl |
| hourly_rate | integer | ✓ | 0 |  |
| commission_rate | numeric | ✓ | 0 |  |
| sliding_rates | jsonb |  |  | スライド制の売上別バック率（JSONB形式） |
| guarantee_enabled | boolean | ✓ | False |  |
| guarantee_amount | integer | ✓ | 0 |  |
| guarantee_period | varchar(10) |  | day |  |
| deduction_enabled | boolean | ✓ | False |  |
| deduction_items | jsonb |  |  |  |
| valid_from | date | ✓ | CURRENT_DATE |  |
| valid_to | date |  |  |  |
| is_active | boolean | ✓ | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| sales_target | varchar |  | cast_sales | 売上対象: receipt_total(伝票小計) or cast_sales( |
| fixed_amount | integer |  | 0 | 固定額（日給など） |
| use_sliding_comparison | boolean |  | False | スライド比較を使用するか（高い方を支給） |
| compare_hourly_rate | integer |  | 0 | 比較用: 時給 |
| compare_commission_rate | numeric |  | 0 | 比較用: 歩合率(%) |
| compare_sales_target | varchar |  | cast_sales | 比較用: 売上対象 |
| compare_fixed_amount | integer |  | 0 | 比較用: 固定額 |
| use_product_back | boolean | ✓ | False |  |
| target_year | integer |  |  |  |
| target_month | integer |  |  |  |
| is_locked | boolean |  | False |  |
| locked_at | timestamptz |  |  |  |
| compare_use_product_back | boolean |  | False |  |
| help_back_calculation_method | text |  | sales_based |  |
| use_help_product_back | boolean |  | False |  |
| payment_selection_method | varchar(20) | ✓ | highest | 支給方法: highest=高い方を支給, specific=特定の報酬形態を使 |
| selected_compensation_type_id | varchar(36) |  |  | specific時に使用する報酬形態のID (UUID) |
| compensation_types | jsonb |  |  | 報酬形態の配列 (JSONB) |
| status_id | integer |  |  | FK → wage_statuses.id |
| status_locked | boolean | ✓ | False | ステータス固定フラグ |
| hourly_wage_override | integer |  |  | 時給直接指定（NULLならステータスの時給） |
| min_days_rule_enabled | boolean | ✓ | True | 最低日数ルール適用 |
| first_month_exempt_override | boolean |  |  | 入店初月除外（NULL=店舗設定に従う） |
| enabled_deduction_ids | integer[] |  |  | このキャストに適用する控除項目のID配列 |

### costumes
**衣装マスタ（衣装ごとの時給調整）**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| name | varchar(100) | ✓ |  |  |
| wage_adjustment | integer | ✓ | 0 | 時給調整額（+500円等） |
| display_order | integer | ✓ | 0 |  |
| is_active | boolean | ✓ | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### current_order_items
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | extensions.uuid_generate_ | PK |
| table_id | varchar(20) | ✓ |  |  |
| product_name | varchar(100) | ✓ |  |  |
| cast_name | text[] |  |  |  |
| quantity | integer | ✓ | 1 |  |
| unit_price | numeric | ✓ |  |  |
| created_at | timestamp |  | CURRENT_TIMESTAMP |  |
| updated_at | timestamp |  | CURRENT_TIMESTAMP |  |
| store_id | integer |  |  | FK → stores.id |

### daily_reports
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  |  |
| business_date | date | ✓ |  |  |
| event_name | varchar(255) |  |  |  |
| weather | varchar(50) |  |  |  |
| total_sales | numeric |  | 0 |  |
| cash_sales | numeric |  | 0 |  |
| card_sales | numeric |  | 0 |  |
| other_sales | numeric |  | 0 |  |
| unknown_receipt | numeric |  | 0 |  |
| unknown_amount | numeric |  | 0 |  |
| unpaid_amount | numeric |  | 0 |  |
| expense_amount | numeric |  | 0 |  |
| daily_payment_total | numeric |  | 0 |  |
| order_count | integer |  | 0 |  |
| first_time_count | integer |  | 0 |  |
| return_count | integer |  | 0 |  |
| regular_count | integer |  | 0 |  |
| staff_count | integer |  | 0 |  |
| cast_count | integer |  | 0 |  |
| twitter_followers | integer |  | 0 |  |
| instagram_followers | integer |  | 0 |  |
| tiktok_followers | integer |  | 0 |  |
| remarks | text |  |  |  |
| created_at | timestamptz |  | CURRENT_TIMESTAMP |  |
| updated_at | timestamptz |  | CURRENT_TIMESTAMP |  |

### deduction_types
**控除項目マスタ（店舗ごと）**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| name | varchar(100) | ✓ |  |  |
| type | varchar(20) | ✓ | fixed | percentage: %計算, fixed: 固定額, penalty_sta |
| percentage | numeric |  |  |  |
| default_amount | integer |  | 0 |  |
| attendance_status_id | uuid |  |  | FK → attendance_statuses.id |
| penalty_amount | integer |  | 0 |  |
| display_order | integer |  | 0 |  |
| is_active | boolean |  | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### late_penalty_rules
**遅刻罰金ルール（段階式）**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| deduction_type_id | integer | ✓ |  | FK → deduction_types.id |
| calculation_type | varchar(20) | ✓ | fixed |  |
| fixed_amount | integer |  | 0 |  |
| interval_minutes | integer |  | 15 |  |
| amount_per_interval | integer |  | 0 |  |
| max_amount | integer |  | 0 |  |
| created_at | timestamptz |  | now() |  |

### late_penalty_tiers
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| late_penalty_rule_id | integer | ✓ |  | FK → late_penalty_rules.id |
| minutes_from | integer | ✓ | 0 |  |
| minutes_to | integer |  |  |  |
| penalty_amount | integer | ✓ | 0 |  |
| created_at | timestamptz |  | now() |  |

### line_register_requests
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | gen_random_uuid() | PK |
| line_user_id | text | ✓ |  |  |
| requested_name | text | ✓ |  |  |
| store_id | integer | ✓ |  |  |
| status | text |  | pending |  |
| cast_id | integer |  |  | FK → casts.id |
| approved_by | integer |  |  | FK → casts.id |
| approved_at | timestamptz |  |  |  |
| rejected_reason | text |  |  |  |
| created_at | timestamptz |  | now() |  |

### monthly_targets
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| year | integer | ✓ |  |  |
| month | integer | ✓ |  |  |
| sales_target | numeric |  | 0 |  |
| customer_target | integer |  | 0 |  |
| created_at | timestamptz |  | CURRENT_TIMESTAMP |  |
| updated_at | timestamptz |  | CURRENT_TIMESTAMP |  |
| store_id | integer |  |  | FK → stores.id |

### order_items
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | extensions.uuid_generate_ | PK |
| order_id | uuid |  |  | FK → orders.id |
| category | varchar(50) |  |  |  |
| product_name | varchar(100) | ✓ |  |  |
| unit_price | numeric | ✓ |  |  |
| quantity | integer | ✓ |  |  |
| subtotal | numeric | ✓ |  |  |
| created_at | timestamp |  | CURRENT_TIMESTAMP |  |
| cast_name | text[] |  |  |  |
| store_id | integer |  |  | FK → stores.id |

### orders
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | extensions.uuid_generate_ | PK |
| receipt_number | varchar(20) | ✓ |  |  |
| visit_datetime | timestamp | ✓ |  |  |
| checkout_datetime | timestamp | ✓ |  |  |
| table_number | varchar(10) |  |  |  |
| staff_name | varchar(50) |  |  |  |
| subtotal_incl_tax | numeric |  |  | メニュー合計（税込） |
| total_incl_tax | numeric | ✓ |  |  |
| created_at | timestamp |  | CURRENT_TIMESTAMP |  |
| guest_name | varchar(100) |  |  |  |
| visit_type | varchar(20) |  |  |  |
| service_charge | numeric |  | 0 |  |
| rounding_adjustment | numeric |  | 0 |  |
| store_id | integer |  |  | FK → stores.id |
| deleted_at | timestamp |  |  |  |
| deleted_by | integer |  |  | FK → users.id |
| order_date | timestamptz |  |  |  |
| discount_amount | integer |  | 0 |  |

### payments
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | extensions.uuid_generate_ | PK |
| order_id | uuid |  |  | FK → orders.id |
| cash_amount | numeric |  | 0 |  |
| change_amount | numeric |  | 0 |  |
| credit_card_amount | numeric |  | 0 |  |
| other_payment_amount | numeric |  | 0 |  |
| payment_method | varchar(50) |  |  |  |
| created_at | timestamp |  | CURRENT_TIMESTAMP |  |
| store_id | integer |  |  | FK → stores.id |
| card_fee | numeric |  | 0 |  |

### payslips
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| cast_id | integer | ✓ |  | FK → casts.id |
| store_id | integer | ✓ |  | FK → stores.id |
| year_month | varchar(7) | ✓ |  |  |
| status | varchar(20) | ✓ | draft |  |
| work_days | integer | ✓ | 0 |  |
| total_hours | numeric | ✓ | 0 |  |
| average_hourly_wage | integer | ✓ | 0 |  |
| hourly_income | integer | ✓ | 0 |  |
| sales_back | integer | ✓ | 0 |  |
| product_back | integer | ✓ | 0 |  |
| gross_total | integer | ✓ | 0 |  |
| total_deduction | integer | ✓ | 0 |  |
| net_payment | integer | ✓ | 0 |  |
| daily_details | jsonb |  |  |  |
| product_back_details | jsonb |  |  |  |
| deduction_details | jsonb |  |  |  |
| finalized_at | timestamptz |  |  |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### product_categories
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| name | varchar(50) | ✓ |  |  |
| display_order | integer |  | 0 |  |
| created_at | timestamp |  | now() |  |
| store_id | integer |  |  | FK → stores.id |
| show_oshi_first | boolean |  | False |  |

### products
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| category_id | integer |  |  | FK → product_categories.id |
| name | varchar(100) | ✓ |  |  |
| price | numeric | ✓ |  |  |
| price_excl_tax | numeric |  | 0 |  |
| discount_rate | numeric |  | 0 |  |
| needs_cast | boolean |  | False |  |
| is_active | boolean |  | True |  |
| display_order | integer |  | 0 |  |
| created_at | timestamp |  | now() |  |
| updated_at | timestamp |  | now() |  |
| store_id | integer |  |  | FK → stores.id |

### receipt_sequences
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | extensions.uuid_generate_ | PK |
| store_id | integer |  |  | FK → stores.id |
| current_number | integer |  | 1 |  |
| updated_at | timestamptz |  | now() |  |

### receipt_settings
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | extensions.uuid_generate_ | PK |
| store_id | integer |  |  | FK → stores.id |
| store_name | text |  |  |  |
| logo_url | text |  |  |  |
| footer_message | text |  | またのご来店をお待ちしております |  |
| invoice_enabled | boolean |  | False |  |
| invoice_number | text |  |  |  |
| show_tax_breakdown | boolean |  | False |  |
| current_receipt_number | integer |  | 1 |  |
| printer_device_id | text |  |  |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| store_postal_code | varchar(10) |  |  |  |
| store_address | varchar(255) |  |  |  |
| store_phone | varchar(50) |  |  |  |
| store_email | varchar(255) |  |  |  |
| business_hours | text |  |  |  |
| closed_days | text |  |  |  |
| store_registration_number | varchar(100) |  |  |  |
| show_revenue_stamp | boolean |  | True |  |
| revenue_stamp_threshold | integer |  | 50000 |  |
| receipt_templates | jsonb |  |  |  |

### sales_settings
**店舗別売上計算設定**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| rounding_method | varchar(20) | ✓ | floor_100 | 端数処理方法: floor_100=100円切捨て, floor_10=10円切 |
| rounding_timing | varchar(20) | ✓ | total | 端数処理タイミング: per_item=商品ごと, total=合計時 |
| help_calculation_method | varchar(20) | ✓ | ratio | ヘルプ売上計算方法: ratio=割合, fixed=固定額 |
| help_ratio | numeric | ✓ | 50.0 | ヘルプ売上割合（％） |
| help_fixed_amount | integer | ✓ | 0 |  |
| use_tax_excluded | boolean | ✓ | True | true=税抜き計算, false=税込み計算 |
| description | text |  |  |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| exclude_consumption_tax | boolean | ✓ | True |  |
| exclude_service_charge | boolean | ✓ | True |  |
| distribute_to_help | boolean |  | True |  |
| item_use_tax_excluded | boolean |  | True |  |
| item_exclude_consumption_tax | boolean |  | True |  |
| item_exclude_service_charge | boolean |  | False |  |
| item_multi_cast_distribution | text |  | nomination_only | 複数キャストの分配方法: nomination_only=推しに該当するキャスト |
| item_help_sales_inclusion | text |  | both | ヘルプ売上の計上方法: both=両方, self_only=SELFのみ, h |
| item_help_calculation_method | text |  | ratio |  |
| item_help_ratio | integer |  | 50 |  |
| item_help_fixed_amount | integer |  | 0 |  |
| item_rounding_method | text |  | floor_100 |  |
| item_rounding_position | integer |  | 100 |  |
| receipt_use_tax_excluded | boolean |  | True |  |
| receipt_exclude_consumption_tax | boolean |  | True |  |
| receipt_exclude_service_charge | boolean |  | False |  |
| receipt_multi_cast_distribution | text |  | nomination_only | 複数キャストの分配方法: nomination_only=推しに該当するキャスト |
| receipt_help_sales_inclusion | text |  | both | ヘルプ売上の計上方法: both=両方, self_only=SELFのみ, h |
| receipt_help_calculation_method | text |  | ratio |  |
| receipt_help_ratio | integer |  | 50 |  |
| receipt_help_fixed_amount | integer |  | 0 |  |
| receipt_rounding_method | text |  | floor_100 |  |
| receipt_rounding_position | integer |  | 100 |  |
| published_aggregation | text |  | item_based | 公開する集計方法: item_based=キャスト商品のみ, receipt_b |
| non_help_staff_names | text[] |  |  | ヘルプ扱いにしない推し名の配列 |
| multi_nomination_ratios | integer[] |  |  | 複数推しの分配率（例: [50, 50]で均等） |
| item_non_nomination_sales_handling | text |  | share_only |  |
| receipt_non_nomination_sales_handling | text |  | share_only |  |
| item_rounding_timing | text |  | per_item | 端数処理タイミング: per_item=商品ごと, total=合計時 |
| receipt_rounding_timing | text |  | per_item | 端数処理タイミング: per_item=商品ごと, total=合計時 |
| item_help_distribution_method | text |  | equal_all |  |
| receipt_help_distribution_method | text |  | equal_all |  |
| item_nomination_distribute_all | boolean |  | False |  |
| include_base_in_item_sales | boolean | ✓ | True | BASE売上を推し小計に含める |
| include_base_in_receipt_sales | boolean | ✓ | True | BASE売上を伝票小計に含める |
| base_cutoff_hour | integer | ✓ | 6 | BASE注文の営業日締め時間（0-23、例: 6 = 翌6時まで前日扱い） |
| base_cutoff_enabled | boolean | ✓ | True | BASE注文に営業日締め時間を適用するか |

### shift_locks
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | gen_random_uuid() | PK |
| cast_id | integer |  |  | FK → casts.id |
| date | date | ✓ |  |  |
| lock_type | varchar(20) |  |  |  |
| created_at | timestamptz |  | now() |  |
| created_by | integer |  |  |  |
| store_id | integer | ✓ |  | FK → stores.id |

### shift_requests
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | gen_random_uuid() | PK |
| cast_id | integer | ✓ |  | FK → casts.id |
| date | date | ✓ |  |  |
| start_time | time | ✓ |  |  |
| end_time | time | ✓ |  |  |
| status | varchar(20) |  | pending |  |
| notes | text |  |  |  |
| rejected_reason | text |  |  |  |
| approved_by | integer |  |  | FK → casts.id |
| approved_at | timestamptz |  |  |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| is_locked | boolean |  | False |  |
| store_id | integer | ✓ |  |  |

### shifts
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | gen_random_uuid() | PK |
| cast_id | integer | ✓ |  | FK → casts.id |
| date | date | ✓ |  |  |
| start_time | time | ✓ |  |  |
| end_time | time | ✓ |  |  |
| actual_start_time | time |  |  |  |
| actual_end_time | time |  |  |  |
| break_minutes | integer |  | 0 |  |
| notes | text |  |  |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| is_locked | boolean |  | False |  |
| is_confirmed | boolean |  | False |  |
| store_id | integer |  |  |  |
| source | varchar(20) |  | manual |  |

### special_wage_days
**特別日カレンダー（クリスマス等の時給加算日）**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| date | date | ✓ |  |  |
| name | varchar(100) | ✓ |  |  |
| wage_adjustment | integer | ✓ | 0 | 時給調整額（+1000円等） |
| is_active | boolean | ✓ | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### store_line_configs
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | uuid | ✓ | gen_random_uuid() | PK |
| store_id | integer | ✓ |  |  |
| store_name | text | ✓ |  |  |
| line_channel_secret | text | ✓ |  |  |
| line_channel_access_token | text | ✓ |  |  |
| webhook_url | text |  |  |  |
| is_active | boolean |  | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
| discord_webhook_url | text |  |  |  |

### store_wage_settings
**店舗別時給ルール設定**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| default_hourly_wage | integer | ✓ | 0 | デフォルト時給 |
| min_hours_for_full_day | numeric | ✓ | 5.0 | 1日出勤とカウントする最低時間 |
| min_days_for_back | integer | ✓ | 5 | バック対象となる最低出勤日数 |
| wage_only_max_days | integer | ✓ | 4 | この日数以下は時給のみ（バックなし） |
| first_month_exempt | boolean | ✓ | True | 入店初月はルールから除外 |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### stores
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_name | varchar(255) | ✓ |  |  |
| store_code | varchar(50) | ✓ |  |  |
| is_active | boolean |  | True |  |
| created_at | timestamptz |  | CURRENT_TIMESTAMP |  |

### system_settings
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| setting_key | varchar(50) | ✓ |  |  |
| setting_value | text | ✓ |  |  |
| description | varchar(200) |  |  |  |
| created_at | timestamp |  | now() |  |
| updated_at | timestamp |  | now() |  |
| store_id | integer |  |  | FK → stores.id |

### table_status
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| table_name | varchar(10) | ✓ |  |  |
| guest_name | varchar(100) |  |  |  |
| cast_name | text[] |  |  |  |
| entry_time | timestamp |  |  |  |
| visit_type | varchar(10) |  |  |  |
| created_at | timestamp |  | now() |  |
| store_id | integer |  |  | FK → stores.id |
| display_name | text |  |  |  |
| position_top | integer |  | 0 |  |
| position_left | integer |  | 0 |  |
| table_width | integer |  | 130 |  |
| table_height | integer |  | 123 |  |
| is_visible | boolean |  | True |  |
| page_number | integer |  | 1 |  |

### users
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| username | varchar(50) | ✓ |  |  |
| password | varchar(255) | ✓ |  |  |
| role | varchar(20) |  | staff |  |
| created_at | timestamp |  | now() |  |
| updated_at | timestamp |  | now() |  |
| store_id | integer |  | 1 |  |

### visitor_reservations
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| cast_id | integer |  |  | FK → casts.id |
| store_id | integer |  |  | FK → stores.id |
| date | date | ✓ |  |  |
| time | time | ✓ |  |  |
| guest_count | integer | ✓ |  |  |
| source | varchar(20) |  | line |  |
| created_at | timestamp |  | now() |  |

### wage_status_conditions
**ステータス昇格/降格条件**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| status_id | integer | ✓ |  | FK → wage_statuses.id |
| condition_type | varchar(30) | ✓ |  | 条件タイプ: attendance_days=出勤日数, sales=売上, n |
| operator | varchar(10) | ✓ | >= |  |
| value | integer | ✓ |  |  |
| logic_group | integer | ✓ | 1 | 同グループの条件はAND、別グループはOR |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |

### wage_statuses
**時給ステータス定義（研修、レギュラー、ゴールド等）**
| カラム | 型 | NOT NULL | デフォルト | 説明 |
|--------|-----|----------|-----------|------|
| id | integer | ✓ |  | PK |
| store_id | integer | ✓ |  | FK → stores.id |
| name | varchar(50) | ✓ |  |  |
| hourly_wage | integer | ✓ | 0 |  |
| priority | integer | ✓ | 0 | 優先度（高い方が優先） |
| is_default | boolean | ✓ | False | 新規キャストのデフォルトステータス |
| is_active | boolean | ✓ | True |  |
| created_at | timestamptz |  | now() |  |
| updated_at | timestamptz |  | now() |  |
