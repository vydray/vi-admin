# VI Admin Dashboard

キャバクラ管理システムの管理者用ダッシュボード（PC専用）

## プロジェクト概要

このプロジェクトは、以下の既存システムと連携する管理画面です：

- **シフト管理アプリ** (`C:\Users\kawau\Documents\ShiftLineProject\shift-management-app`)
  - LINEミニアプリ（ユーザー向け）
  - シフト希望提出、承認、閲覧機能

- **POSシステム** (`C:\Users\kawau\Documents\table-management-system`)
  - テーブル管理、注文管理
  - 勤怠登録、レシート発行

**このプロジェクトの役割：**
- 管理者がPCから全データを閲覧・編集できる統合管理画面
- POSとシフトアプリのデータを一元管理

## 技術スタック

- **フロントエンド:** Next.js 16 (App Router)
- **言語:** TypeScript
- **データベース:** Supabase (PostgreSQL)
- **認証:** 今後実装予定
- **デプロイ:** 未定（Vercel推奨）

## データベース構造

### Supabaseプロジェクト
- **URL:** `https://ivgkberavxekkqgoavmo.supabase.co`
- **プロジェクト:** POSシステムとシフトアプリと同じデータベースを共有

### 全テーブル一覧

#### **共通テーブル（3システムで共有）**

##### `stores` (店舗情報)
```sql
- id: number (主キー)
- name: string (店舗名)
- created_at: timestamp
```

##### `casts` (キャスト情報)
```sql
- id: number (主キー)
- store_id: number (店舗ID: 1=Memorable, 2=MistressMirage)
- name: string (キャスト名/源氏名)
- status: string (ステータス: レギュラー/体験/etc)
- line_number: string (LINE User ID - "U"で始まる33文字)
- line_msg_state: string (LINE連携状態: registered/pending/etc)
- line_msg_registered_at: timestamp (LINE登録日時)
- is_active: boolean (有効フラグ)
- is_admin: boolean (管理者フラグ)
- is_manager: boolean (マネージャーフラグ)
- email: string
- created_at: timestamp
```

---

#### **シフトアプリ専用テーブル**

##### `shifts` (確定シフト)
```sql
- id: number
- cast_id: number (castsテーブルへの外部キー)
- store_id: number
- date: date (シフト日付)
- start_time: string (開始時刻 "HH:MM")
- end_time: string (終了時刻 "HH:MM")
- status: string (ステータス)
- created_at: timestamp
```

##### `shift_requests` (シフト希望)
```sql
- id: number
- cast_id: number
- store_id: number
- date: date
- start_time: string
- end_time: string
- status: string (pending/approved/rejected)
- created_at: timestamp
- updated_at: timestamp
```

##### `shift_locks` (シフトロック - 編集制御)
```sql
- id: number
- store_id: number
- year: number
- month: number
- is_locked: boolean (true=編集不可)
- locked_at: timestamp
- locked_by: number (ロックしたユーザーID)
```

##### `store_line_configs` (LINE設定)
```sql
- id: number
- store_id: number
- line_channel_id: string
- line_channel_secret: string
- line_channel_access_token: string
- liff_id: string
- is_active: boolean
- created_at: timestamp
```

##### `line_register_requests` (LINE登録リクエスト)
```sql
- id: number
- store_id: number
- line_user_id: string
- requested_name: string
- cast_id: number (既存キャストとマッチした場合)
- status: string (pending/approved/rejected)
- created_at: timestamp
```

##### `admin_emergency_logins` (緊急管理者ログイン)
```sql
- id: number
- store_id: number
- username: string
- password_hash: string
- is_active: boolean
- created_at: timestamp
```

---

#### **POSシステム専用テーブル**

##### `attendance` (勤怠情報)
```sql
- id: number
- cast_id: number
- store_id: number
- date: date
- check_in_time: string
- check_out_time: string
- status: string (出勤/当欠/無欠/遅刻/早退/公欠/事前欠)
- late_minutes: number (遅刻分数)
- break_minutes: number (休憩分数)
- daily_payment: number (日払い額)
- created_at: timestamp
```

##### `attendance_statuses` (勤怠ステータス設定)
```sql
- id: number
- store_id: number
- status_name: string
- color: string
- display_order: number
```

##### `cast_positions` (キャスト位置情報)
```sql
- id: number
- cast_id: number
- store_id: number
- x_position: number
- y_position: number
- updated_at: timestamp
```

##### `orders` (注文履歴)
```sql
- id: number
- store_id: number
- table_number: string
- customer_name: string
- oshi_name: string (推しキャスト名)
- total_amount: number
- payment_method: string
- order_date: timestamp
- created_at: timestamp
```

##### `order_items` (注文アイテム)
```sql
- id: number
- order_id: number
- product_name: string
- cast_name: string (キャスト指名)
- quantity: number
- unit_price: number
- total_price: number
```

##### `current_order_items` (現在進行中の注文)
```sql
- id: number
- table_number: string
- product_name: string
- cast_name: string
- quantity: number
- price: number
- created_at: timestamp
```

##### `payments` (支払い履歴)
```sql
- id: number
- order_id: number
- amount: number
- payment_method: string
- paid_at: timestamp
```

##### `products` (商品マスタ)
```sql
- id: number
- store_id: number
- category_id: number
- name: string (商品名)
- price: number
- tax_rate: number
- discount_rate: number
- needs_cast: boolean (キャスト指名が必要か)
- is_active: boolean
- display_order: number
- created_at: timestamp
```

##### `product_categories` (商品カテゴリ)
```sql
- id: number
- store_id: number
- name: string (カテゴリ名)
- display_order: number
- show_oshi_first: boolean
- created_at: timestamp
```

##### `receipts` (レシート設定)
```sql
- id: number
- store_id: number
- store_name: string
- address: string
- phone: string
- logo_url: string
- footer_message: string
- created_at: timestamp
```

##### `receipt_settings` (レシート詳細設定)
```sql
- id: number
- store_id: number
- header_text: string
- footer_text: string
- show_logo: boolean
- updated_at: timestamp
```

##### `system_settings` (システム設定)
```sql
- id: number
- store_id: number
- setting_key: string
- setting_value: string
- created_at: timestamp
- updated_at: timestamp
```

##### `table_status` (テーブル状態)
```sql
- id: number
- store_id: number
- table_number: string
- customer_name: string
- oshi_name: string
- status: string (empty/occupied)
- seated_at: timestamp
- page_number: number
```

##### `cash_counts` (現金カウント)
```sql
- id: number
- store_id: number
- date: date
- amount: number
- counted_by: number
- created_at: timestamp
```

##### `daily_reports` (日次レポート)
```sql
- id: number
- store_id: number
- report_date: date
- total_sales: number
- customer_count: number
- notes: text
- created_at: timestamp
```

##### `monthly_targets` (月次目標)
```sql
- id: number
- store_id: number
- year: number
- month: number
- target_amount: number
- created_at: timestamp
```

##### `users` (POSユーザー - 管理画面とは別)
```sql
- id: number
- store_id: number
- username: string
- password_hash: string
- role: string
- is_active: boolean
- created_at: timestamp
```

## ディレクトリ構造

```
vi-admin/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # 全体レイアウト
│   ├── page.tsx           # ホーム画面（メニュー）
│   └── casts/
│       └── page.tsx       # キャスト管理画面
├── lib/
│   └── supabase.ts        # Supabase クライアント設定
├── components/            # 共通コンポーネント（今後追加）
├── .env.local            # 環境変数（gitignore）
├── package.json
├── tsconfig.json
└── README.md
```

## 環境変数 (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://ivgkberavxekkqgoavmo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## セットアップ

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev

# ブラウザで開く
# http://localhost:3000
```

## 実装済み機能

### ✅ ホーム画面 (`/`)
- 4つのメニューカード
  - 👥 キャスト管理
  - 📅 シフト管理
  - ⏰ 勤怠管理
  - 📊 レポート

### ✅ キャスト管理画面 (`/casts`)
- キャスト一覧表示（店舗別）
- 店舗切り替え機能
- LINE連携ステータス表示
- 有効/無効フラグ表示
- 登録日表示

## 実装予定機能

### 🚧 キャスト管理（編集機能）
- [ ] キャスト情報編集（名前、ステータス、有効フラグ）
- [ ] 新規キャスト追加
- [ ] キャスト削除（論理削除）
- [ ] LINE連携解除機能
- [ ] キャスト検索・フィルタリング

### 🚧 シフト管理画面 (`/shifts`)
- [ ] 月間シフトカレンダー表示
- [ ] シフト編集機能（ドラッグ&ドロップ）
- [ ] シフト希望の一覧・承認
- [ ] シフト表のエクスポート（PDF/Excel）

### 🚧 勤怠管理画面 (`/attendance`)
- [ ] 勤怠データ一覧（POSデータ連携）
- [ ] 出退勤時刻の編集
- [ ] 遅刻・休憩時間の修正
- [ ] 日払い額の確認・編集
- [ ] 月次給与計算レポート

### 🚧 レポート画面 (`/reports`)
- [ ] 売上レポート（POSデータ連携）
- [ ] キャスト別売上
- [ ] 商品別売上
- [ ] 月次統計データ
- [ ] グラフ表示（Chart.js等）

### 🚧 認証機能
- [ ] ログイン画面
- [ ] 管理者権限チェック
- [ ] セッション管理

## データ連携について

### POSシステム (`table-management-system`)
- **共有テーブル:** `casts`, `attendance`, `stores`
- POSで登録された勤怠データをこの管理画面で閲覧・編集可能

### シフトアプリ (`shift-management-app`)
- **共有テーブル:** `casts`, `shifts`, `stores`
- LINE連携情報（`line_number`）はシフトアプリで登録
- この管理画面でシフトの承認・編集が可能

### 重要な注意点
- `line_number`カラムにLINE User ID（`U`で始まる33文字）が格納される
- 以前は`line_msg_user_id`という名前だったが、`line_number`に統一済み
- 同じSupabaseプロジェクトを3つのアプリで共有しているため、データ整合性に注意

## LINE連携について

### LINE User IDの形式
```
Ubd24e1f2b324e3deb8377dd46593c33f
```
- 大文字の`U` + 32文字の16進数文字列
- LINE Messaging API / LIFF から取得

### 登録フロー（シフトアプリ側）
1. ユーザーがLINE公式アカウントで「キャスト登録」を押す
2. LINE表示名とデータベースの`casts.name`を完全一致検索
3. 「○○様ですか？」と確認
4. 「はい」を選択 → `line_number`に登録
5. LIFFアプリへのログイン時に`line_number`で認証

## 開発時の注意事項

1. **データベース直接編集は慎重に**
   - 3つのアプリが同じデータベースを使用しているため、他のアプリへの影響を考慮

2. **store_idは必須**
   - Store 1 = Memorable
   - Store 2 = MistressMirage

3. **TypeScriptの型定義**
   - 各テーブルの型はインターフェースで定義すること
   - `any`型の使用は避ける

4. **環境変数**
   - `.env.local`はgitにコミットしない
   - Service Role Keyは慎重に扱う（サーバーサイドのみ使用）

## トラブルシューティング

### Supabaseへの接続エラー
- 環境変数が正しく設定されているか確認
- ネットワーク接続を確認

### データが表示されない
- `store_id`が正しいか確認
- Supabaseダッシュボードでデータが存在するか確認

## 関連プロジェクト

- **シフトアプリ:** `C:\Users\kawau\Documents\ShiftLineProject\shift-management-app`
- **POSシステム:** `C:\Users\kawau\Documents\table-management-system`

## 今後の改善案

- [ ] 認証機能の実装
- [ ] ダークモード対応
- [ ] レスポンシブデザイン（モバイルでも閲覧可能に）
- [ ] データのエクスポート機能（CSV/Excel）
- [ ] リアルタイム更新（Supabase Realtime）
- [ ] 通知機能（シフト変更時など）
- [ ] バックアップ機能

---

**最終更新:** 2025-11-13
**作成者:** Claude Code
