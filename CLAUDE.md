# プロジェクト概要

キャバクラ管理システム「VI Admin」の管理者用ダッシュボード（PC専用）

## システム構成

- **本プロジェクト (vi-admin)**: 管理者用ダッシュボード（Next.js 16 + TypeScript）
- **POSシステム**: テーブル管理、注文管理、勤怠登録
- **シフトアプリ**: LINEミニアプリ（キャスト向け）

3つのアプリが同一のSupabaseデータベースを共有している。

## 技術スタック

- Next.js 16 (App Router)
- TypeScript
- Supabase (PostgreSQL)
- bcryptベースの独自認証
- Vercel (デプロイ)

## 主要機能

| ページ | パス | 説明 |
|--------|------|------|
| ホーム | `/` | ダッシュボード、月間売上グラフ |
| キャスト売上 | `/cast-sales` | キャスト別売上集計 |
| 勤怠管理 | `/attendance` | 月間勤怠カレンダー |
| シフト管理 | `/shifts/manage` | シフトカレンダー、編集 |
| 伝票管理 | `/receipts` | レシート一覧、編集 |
| 報酬明細 | `/payslip` | キャスト個別報酬明細 |
| 報酬明細一覧 | `/payslip-list` | 全キャスト月間報酬一覧 |
| 報酬形態一覧 | `/compensation-list` | キャスト別報酬形態設定一覧 |
| キャスト管理 | `/casts` | キャスト一覧、編集 |
| 報酬計算設定 | `/compensation-settings` | キャスト別報酬形態設定 |
| 売上設定 | `/sales-settings` | 売上計算ルール設定 |
| 時給設定 | `/wage-settings` | 時給ステータス、昇格条件 |
| 控除設定 | `/deduction-settings` | 控除項目、遅刻ペナルティ |
| バック設定 | `/cast-back-rates` | 商品別バック率 |
| 商品管理 | `/products` | 商品マスタ |
| カテゴリー管理 | `/categories` | 商品カテゴリ |
| 出勤表作成 | `/schedule/*` | 写真、テンプレート、生成 |
| Twitter | `/twitter-posts`, `/twitter-settings` | 予約投稿 |
| BASE連携 | `/base-settings` | ECサイト連携 |
| 店舗設定 | `/store-settings` | 店舗情報 |
| 店舗管理 | `/stores` | 複数店舗管理（super_admin専用） |

## ディレクトリ構造

```
vi-admin/
├── app/                    # Next.js App Router（ページ）
│   ├── api/               # API Routes
│   │   ├── payslips/      # 報酬計算API
│   │   ├── cast-stats/    # キャスト統計API
│   │   ├── cron/          # 定期実行（Vercel Cron）
│   │   └── ...
│   └── [各ページ]/page.tsx
├── components/             # 共通コンポーネント
├── contexts/               # React Context（Auth, Store, Confirm）
├── hooks/                  # カスタムフック
├── lib/                    # ユーティリティ
│   ├── supabase.ts        # Supabaseクライアント
│   ├── salesCalculation.ts # 売上計算ロジック
│   ├── pdfExport.ts       # PDF出力
│   └── ...
├── types/                  # TypeScript型定義
│   ├── database.ts        # DBテーブル型
│   └── index.ts           # 公開型
└── supabase/              # Edge Functions
```

## 主要テーブル

| テーブル | 説明 |
|----------|------|
| `stores` | 店舗 |
| `casts` | キャスト（源氏名、本名、LINE連携等） |
| `attendance` | 勤怠（出退勤、日払い、遅刻等） |
| `shifts` | 確定シフト |
| `orders` | 注文（伝票） |
| `order_items` | 注文明細 |
| `payments` | 支払い |
| `products` | 商品マスタ |
| `product_categories` | 商品カテゴリ |
| `compensation_settings` | キャスト別報酬設定 |
| `sales_settings` | 店舗別売上計算設定 |
| `payslips` | 月間報酬明細 |
| `cast_daily_stats` | キャスト日別売上統計 |
| `cast_daily_items` | キャスト日別売上明細 |
| `wage_statuses` | 時給ステータス（研修、レギュラー等） |
| `deduction_types` | 控除項目種別 |
| `base_products` | BASE商品マッピング |
| `base_orders` | BASE注文履歴 |

## 報酬計算フロー

1. `cast_daily_items` - 日別の売上明細（POSトリガーで自動作成）
2. `cast_daily_stats` - 日別の売上集計（API再計算）
3. `payslips` - 月間報酬明細（`/api/payslips/recalculate`で計算）

計算要素:
- 時給 × 勤務時間
- 売上バック（固定% or スライド%）
- 商品バック（カテゴリ/商品別バック率）
- 固定額
- 控除（日払い、遅刻ペナルティ、源泉徴収等）

---

# ルール

## DB操作
- **DB変更前に必ずmemory-keeperで既存構造を確認**
- **テーブル構造を勝手に変えるな**
- store_idは必須（Store 1=Memorable, Store 2=MistressMirage）
- 3つのアプリが同じDBを共有しているため、他アプリへの影響を考慮

## 重要な決定
- **重要な決定はmemory-keeperに保存**
- 大きな変更は事前に確認を取る

## コーディング
- TypeScriptの型定義は`types/`で一元管理
- `any`型の使用は避ける
- 環境変数は`.env.local`（gitにコミットしない）
- Service Role Keyはサーバーサイドのみで使用

## 命名規則
- 日本語コメントOK
- キャスト名の一意性制約あり（同一store_id内で重複不可）

## MCP
- memory-keeper: 会話記憶、重要な決定の保存
- playwright: ブラウザ操作・テスト
- supabase: DB構造確認、クエリ実行

---

**本番URL:** https://vi-admin-psi.vercel.app/
**最終更新:** 2025-12-26
