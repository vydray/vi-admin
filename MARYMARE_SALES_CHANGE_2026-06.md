# Mary Mare 売上ルール変更（2026年6月分〜）実装・適用手順

> 2026-06-12 快晟と仕様確定。Mary Mare(store_id=7) のヘルプ売上ルールを 6月分から MistressMirage(store_id=2)式に変える。
> 5月までは現行ルールを維持（過去月を再計算しても変わらない）。他店(1/3)は無影響。

## 変更内容（Mary Mare の 2026-06 以降のみ）

| 設定 | 現行(〜5月) | 6月〜(みすみら式) |
|---|---|---|
| `item_help_sales_inclusion` | both | **self_only**（ヘルプ先での自分名義売上を計上しない） |
| `item_help_ratio` | 100 | **50**（推し/ヘルプ 0/100 → 50/50） |
| `item_help_distribution_method` | ratio | **equal_per_person**（人数で等分） |
| `exclude_service_charge` | true | **false**（サービス料を売上に含める）※ |
| `base_cutoff_hour` | 6 | **13** |

※ `exclude_service_charge`(トップレベル) が item_based の payslip 計算に実際に効くかは、STEP4 の新旧比較で確認（効かなくてもヘルプ3項目は確実に効く）。

## 仕組み：適用開始月(effective_from_ym)

`sales_settings` に `effective_from_ym`('YYYY-MM') を持たせ、store_id ごとに複数行を許可する。
計算時は「対象月以下で最大の effective_from_ym 行」を選ぶ（コードの共通getter `getSalesSettingsForMonth` / shift-app `getStoreSalesDisplayMode(... , ym)`）。
→ 5月を計算すれば '2000-01' 行（旧ルール）、6月を計算すれば '2026-06' 行（新ルール）。**順序非依存で過去月は絶対動かない。**

---

## ⚠️ リリース順（厳守・無停止）

順序を誤ると、6月行を入れた瞬間に「複数行」になり、まだ対応していない `.single()` 箇所が**エラーで画面が落ちる**。必ずこの順で。

### STEP 1 — DBにカラムだけ追加（SQL Editor）

```sql
ALTER TABLE sales_settings
  ADD COLUMN effective_from_ym text NOT NULL DEFAULT '2000-01';
```
- 既存4行（store_id 1/2/3/7）が自動的に `'2000-01'` になり、過去全月を旧ルールがカバー。
- この時点では制約は `UNIQUE(store_id)` のままなので **まだ1店舗1行**。旧コード(`.single()`)も新コードも両方動く。

確認:
```sql
SELECT store_id, effective_from_ym, item_help_sales_inclusion, item_help_ratio
FROM sales_settings ORDER BY store_id;
```
→ 4行すべて `effective_from_ym='2000-01'` であること。

### STEP 2 — コードをデプロイ（vi-admin + shift-management-app）

下の「変更済みコード一覧」をコミット→push→Vercelデプロイ。
- この時点でも sales_settings は1行なので、`lte+order desc+limit1` は1行を返す＝**挙動は完全に据え置き**。
- vi-admin と shift-app の**両方**を出すこと（shift-app が複数行未対応のままだと STEP3 で6月キャスト画面が落ちる）。

### STEP 3 — 制約を張り替えて Mary Mare の6月行を追加（SQL Editor）

```sql
BEGIN;

-- 1) store_id 単独UNIQUE を (store_id, effective_from_ym) に張り替え
ALTER TABLE sales_settings DROP CONSTRAINT sales_settings_store_id_key;
ALTER TABLE sales_settings ADD CONSTRAINT sales_settings_store_ym_key UNIQUE (store_id, effective_from_ym);

-- 2) Mary Mare(7) の現行行を丸ごと複製し、effective_from_ym と5項目だけ上書きして6月行を作る
INSERT INTO sales_settings (
  store_id, effective_from_ym,
  rounding_method, rounding_timing, help_calculation_method, help_ratio, help_fixed_amount,
  use_tax_excluded, description, exclude_consumption_tax, exclude_service_charge, distribute_to_help,
  item_use_tax_excluded, item_exclude_consumption_tax, item_exclude_service_charge,
  item_multi_cast_distribution, item_help_sales_inclusion, item_help_calculation_method,
  item_help_ratio, item_help_fixed_amount, item_rounding_method, item_rounding_position,
  receipt_use_tax_excluded, receipt_exclude_consumption_tax, receipt_exclude_service_charge,
  receipt_multi_cast_distribution, receipt_help_sales_inclusion, receipt_help_calculation_method,
  receipt_help_ratio, receipt_help_fixed_amount, receipt_rounding_method, receipt_rounding_position,
  published_aggregation, non_help_staff_names, multi_nomination_ratios,
  item_non_nomination_sales_handling, receipt_non_nomination_sales_handling,
  item_rounding_timing, receipt_rounding_timing,
  item_help_distribution_method, receipt_help_distribution_method,
  item_nomination_distribute_all, include_base_in_item_sales, include_base_in_receipt_sales,
  base_cutoff_hour, base_cutoff_enabled
)
SELECT
  store_id, '2026-06',                                     -- effective_from_ym
  rounding_method, rounding_timing, help_calculation_method, help_ratio, help_fixed_amount,
  use_tax_excluded, description, exclude_consumption_tax,
  false,                                                   -- exclude_service_charge（みすみら式）
  distribute_to_help,
  item_use_tax_excluded, item_exclude_consumption_tax, item_exclude_service_charge,
  item_multi_cast_distribution,
  'self_only',                                             -- item_help_sales_inclusion
  item_help_calculation_method,
  50,                                                      -- item_help_ratio
  item_help_fixed_amount, item_rounding_method, item_rounding_position,
  receipt_use_tax_excluded, receipt_exclude_consumption_tax, receipt_exclude_service_charge,
  receipt_multi_cast_distribution, receipt_help_sales_inclusion, receipt_help_calculation_method,
  receipt_help_ratio, receipt_help_fixed_amount, receipt_rounding_method, receipt_rounding_position,
  published_aggregation, non_help_staff_names, multi_nomination_ratios,
  item_non_nomination_sales_handling, receipt_non_nomination_sales_handling,
  item_rounding_timing, receipt_rounding_timing,
  'equal_per_person',                                      -- item_help_distribution_method
  receipt_help_distribution_method,
  item_nomination_distribute_all, include_base_in_item_sales, include_base_in_receipt_sales,
  13,                                                      -- base_cutoff_hour
  base_cutoff_enabled
FROM sales_settings WHERE store_id = 7 AND effective_from_ym = '2000-01';

-- 3) 確認（COMMIT前に目視）: store_id=7 が2行になり、6月行が self_only/50/equal_per_person/false/13 になっているか
SELECT effective_from_ym, item_help_sales_inclusion, item_help_ratio,
       item_help_distribution_method, exclude_service_charge, base_cutoff_hour
FROM sales_settings WHERE store_id = 7 ORDER BY effective_from_ym;

COMMIT;
```
期待:
| effective_from_ym | inclusion | ratio | distribution | svc除外 | base締 |
|---|---|---|---|---|---|
| 2000-01 | both | 100 | ratio | true | 6 |
| 2026-06 | self_only | 50 | equal_per_person | false | 13 |

### STEP 4 — 6月を再計算

vi-admin で Mary Mare の **2026-06** を再計算（報酬再計算ボタン / `/api/payslips/recalculate`）。
→ '2026-06' 行（新ルール）で計算され、payslips / cast_daily_stats が更新される。

---

## 検証

1. **6月が新ルールに**: ヘルプ売上のあるキャスト1人で、再計算後に sales_back / net_payment が下がる（self_only＋50%）ことを確認。
2. **5月が1円も変わらない（最重要）**: 2026-05 を再計算 → cast_daily_stats / payslips が変化しないことを SELECT 差分で確認。`getSalesSettingsForMonth('2026-05')` が '2000-01' 行に落ちる。
3. **往復テスト**: 6月→5月→6月の順で再計算しても、5月=旧値・6月=新値で確定的（順序非依存＝過去不変の証明）。
4. **shift-app**: 6月のキャスト画面（cast-daily / ranking / day-orders / payslip）が複数行エラーを出さず、self_only モードで表示。5月画面は旧モードのまま。

## ロールバック

6月行が原因で問題が出たら、6月行だけ削除すれば現行(旧ルール)に戻る:
```sql
DELETE FROM sales_settings WHERE store_id = 7 AND effective_from_ym = '2026-06';
```
（カラム・制約は残してOK。1店舗1行運用に戻るだけ）

---

## 変更済みコード一覧（STEP2でデプロイ）

**vi-admin:**
- `types/database.ts` — SalesSettings に `effective_from_ym?` 追加
- `lib/salesSettings.ts`（新規）— `getSalesSettingsForMonth(client, storeId, ym)` / `ymFromDate(date)`
- `lib/recalculateSales.ts` — `loadSalesSettings` を撤去し、日次計算で `getSalesSettingsForMonth(..., ymFromDate(date))` を使用
- `app/api/payslips/recalculate/route.ts` — 月次計算の設定取得を `getSalesSettingsForMonth(..., yearMonth)` に。rank用 published_aggregation も同設定を流用
- `app/sales-settings/page.tsx` — 設定読込を「effective_from_ym 最新行」に（複数行で `.single()` が落ちないよう limit1）

**shift-management-app:**
- `src/lib/salesAggregation.ts` — `getStoreSalesDisplayMode(client, storeId, ym?)` に ym 追加＋複数行耐性(lte+order desc+limit1)
- `src/pages/api/sales/cast-daily.ts` / `cast-ranking.ts` — 呼び出しに `startDate.slice(0,7)` を渡す
- `src/pages/api/sales/cast-day-orders.ts` — 呼び出しに `date.slice(0,7)` を渡す
- `src/pages/api/payslip/[year_month].ts` — sales_settings インライン読みを `year_month` 指定の lte+limit1 に
- `src/pages/api/compensation-settings.ts` — sales_settings インライン読みを最新行(limit1)に

**vi-pos:** 変更なし（sales_settings 未参照）。
