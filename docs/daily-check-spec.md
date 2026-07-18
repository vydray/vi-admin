# デイリー異常チェック 実装指示書

毎日の店舗オペレーションの異常を自動検知し、内勤がログイン時／毎朝に確認できるようにする機能の仕様。
**全クエリ read-only**（集計のみ・DBへの書き込みなし）。お客様向けの通知は一切行わない（社内向けのみ）。

## 背景・目的

これまで快晟・内勤が毎日目視で追っていたチェック（現金が合うか、退勤が打たれてるか、日報が入力されてるか等）をシステムが先に拾い、**異常だけ**を提示する。実データ（2026-05）で以下が検出済み：

- 現金差異 5/28 Mary Mare −¥111,400 / 5/30 Memorable −¥18,000
- 小口現金ズレ Memorable 6/2-6/3 で差額¥240〜317万（理論残高がマイナス）
- 業務日報の未入力 5/19・5/20・5/23 Mary Mare ほか
- 釣銭の小銭不足 Mary Mare が連日

---

## 重要な前提定義（自己流で式を変えない）

### 店舗ID
`1`=Memorable / `2`=MistressMirage / `3`=circus / `7`=Mary Mare

### 現金差異の計算式（出典: `app/page.tsx` の理論値計算ロジック）
```
理論値 = 釣銭準備金(register_amount) + 現金売上
        − 日払い(Σ attendance.daily_payment) − 経費入金(daily_reports.expense_amount)
        − 未収(unpaid_amount) − 不明金(unknown_amount)
過不足 = 実現金(cash_counts.total_amount) − 理論値
```
※`daily_payment` を引き忘れると、日払いで出た現金を「不足」と誤検知する。必ず attendance 合算を引く。

⚠️ **現金売上は `daily_reports.cash_sales` 列を使ってはいけない**（2026-07 に誤検知の原因になった罠）。
- この列は vi-admin 側で一切書き込まれず（POS/日報フロー依存）、店により未入力。**Mary Mare は 0 のまま**のため、そのまま使うと現金売上0＝理論値が過小＝「現金過剰（＝現金売上と同額）」を毎日誤検知する。
- 正しくは **ホーム `app/page.tsx:919` と同じく `payments` から算出**：`現金売上 = Σ(payments.cash_amount − change_amount)`（注文を `order_date` の日付で集計、1注文=1payment行前提で `payments[0]`）。
- 検証（2026-07 Mary Mare）: cash_sales列=0の日でも payments算出なら差額¥0（実際に合っている）。本物の差異（5/28 MaryMare −¥111,400 / 5/30 Memorable −¥18,000）は算出方式を変えても正しく検出される。

### 勤怠ステータスの分類（`attendance_statuses.code`）
- **出勤系**（退勤打刻があるべき）: `present`(出勤) / `late`(遅刻) / `early_leave`(早退) / `request_shift`(リクエスト出勤)
- **欠勤系**（check_out が無くて当然＝退勤漏れ対象外）: `same_day_absence`(当欠) / `advance_absence`(事前欠勤) / `excused`(公欠) / `no_call_no_show`(無欠)

---

## 検知7項目

すべて `:from`（対象開始日）以降を集計。**運用上は「前日のみ」ではなく直近3日窓を推奨**（後追い入力があるため、前日だけだと取りこぼす）。

### ① 入力漏れ（土台・最優先）
営業した（orders あり）のに業務日報 or レジ締めが無い日。これが抜けると他チェックが空振りするため最重要。
```sql
WITH biz AS (
  SELECT DISTINCT store_id, order_date::date AS d FROM orders
  WHERE deleted_at IS NULL AND order_date >= :from AND order_date < :to
)
SELECT b.store_id, b.d,
  (dr.id IS NOT NULL) AS has_report,
  (cc.id IS NOT NULL) AS has_cashcount
FROM biz b
LEFT JOIN daily_reports dr ON dr.store_id=b.store_id AND dr.business_date=b.d
LEFT JOIN cash_counts cc ON cc.store_id=b.store_id AND cc.business_date=b.d
WHERE dr.id IS NULL OR cc.id IS NULL
ORDER BY b.d DESC, b.store_id;
```
→ `has_report=false` なら「業務日報 未入力」、`has_cashcount=false` なら「レジ締め 未入力」。

### ② 経費ズレ（小口現金）
小口現金の理論残高と実残高の差。
```sql
SELECT store_id, check_date, system_balance, actual_balance, difference, note
FROM petty_cash_checks
WHERE check_date >= :from AND difference <> 0
ORDER BY check_date DESC, store_id;
```
→ ⚠️ **実装前に要確認**: `system_balance`（理論残高）の算出ロジックを `lib/`・`app/expenses/` で確認すること。2026-06時点で Memorable の理論残高がマイナス300万超＝計算式の問題（入金未記録等）か実ズレか未判定。差額の検出自体は `difference` カラムで確実。

### ③ 現金差異（レジ）
```sql
WITH dp AS (
  SELECT store_id, date, SUM(COALESCE(daily_payment,0)) AS daily_payment
  FROM attendance WHERE date >= :from GROUP BY store_id, date
)
SELECT c.store_id, c.business_date,
  c.total_amount AS actual_cash,
  (c.register_amount + d.cash_sales - COALESCE(dp.daily_payment,0)
   - d.expense_amount - d.unpaid_amount - d.unknown_amount) AS theoretical,
  c.total_amount - (c.register_amount + d.cash_sales - COALESCE(dp.daily_payment,0)
   - d.expense_amount - d.unpaid_amount - d.unknown_amount) AS difference
FROM cash_counts c
JOIN daily_reports d ON d.store_id=c.store_id AND d.business_date=c.business_date
LEFT JOIN dp ON dp.store_id=c.store_id AND dp.date=c.business_date
WHERE c.business_date >= :from
  AND c.total_amount - (c.register_amount + d.cash_sales - COALESCE(dp.daily_payment,0)
   - d.expense_amount - d.unpaid_amount - d.unknown_amount) <> 0
ORDER BY c.business_date DESC, c.store_id;
```
→ `difference < 0` は不足（赤）、`> 0` は過剰（黄）。`daily_reports` が無い日は JOIN で落ちる＝①で別途検出される。

### ④ ASK伝票（金額未確定の疑い）
```sql
SELECT store_id, created_at::date AS d, product_name, subtotal
FROM order_items
WHERE created_at >= :from AND product_name ILIKE '%ask%'
ORDER BY created_at DESC;
```

### ⑤ 釣銭不足（翌日の釣銭が小銭で作れない）
```sql
SELECT store_id, business_date, bill_10000 AS man_satsu,
  (bill_5000*5000 + bill_1000*1000 + coin_500*500 + coin_100*100
   + coin_50*50 + coin_10*10 + coin_5*5 + coin_1) AS small_cash
FROM cash_counts
WHERE business_date >= :from
  AND (bill_5000*5000 + bill_1000*1000 + coin_500*500 + coin_100*100
       + coin_50*50 + coin_10*10 + coin_5*5 + coin_1) < 25000      -- 閾値: 小銭<¥25,000
  AND cash_collection < 500000                                      -- 大金日(回収¥50万超)は除外
ORDER BY business_date DESC, store_id;
```
→ 閾値（¥25,000 / ¥500,000）は運用で調整可能にすること。

### ⑥ 退勤打刻漏れ
```sql
SELECT store_id, date, cast_name, status
FROM attendance
WHERE date >= :from
  AND check_in_datetime IS NOT NULL AND check_out_datetime IS NULL
  AND status IN ('出勤','遅刻','早退','リクエスト出勤')   -- 出勤系のみ。欠勤系は対象外
ORDER BY date DESC, store_id;
```

### ⑦ 不明金・未収・不明伝票
```sql
SELECT store_id, business_date, unknown_amount, unpaid_amount, unknown_receipt
FROM daily_reports
WHERE business_date >= :from
  AND (unknown_amount <> 0 OR unpaid_amount <> 0 OR unknown_receipt <> 0)
ORDER BY business_date DESC, store_id;
```

---

## 実装方針

### 配置
- API: `app/api/cron/daily-check/route.ts`（既存 `app/api/cron/` に追加）
- Vercel Cron で毎朝実行（例: 10:00 JST）。`vercel.json` に cron 追加。
- 対象期間: 実行日の前3日（`:from` = today−3日, `:to` = today）。

### 表示
1. **ホーム通知バー**（`app/page.tsx` の既存通知バーに統合）— 内勤がログイン時に赤/黄で表示。クリックで詳細モーダル。
2. （任意）Slack/Discord webhook へ push。お客様LINEには出さない。

### 出力フォーマット（イメージ）
```
📅 デイリーチェック 2026-05-31〜06-02
🔴 現金差異   Mary Mare 5/28  −¥111,400
🔴 経費ズレ   Memorable 6/3   差額¥3,174,965（小口現金）
🟡 入力漏れ   Mary Mare 5/23  業務日報 未入力
🟡 釣銭不足   Mary Mare 5/30  小銭¥17,300
🟡 ASK伝票    Memorable 5/30  ¥212,000
✅ 退勤漏れ・不明金  なし
```
重大度: 🔴 現金差異・経費ズレ ／ 🟡 入力漏れ・釣銭・ASK・退勤 ／ ✅ 該当なし

### 注意
- 全クエリ read-only。Service Role Key はサーバーサイドのみ。
- 店舗フィルタ: super_admin は全店、店舗管理者は自店のみ（既存の権限ロジックに合わせる）。
- 閾値（⑤）と経費ズレ式（②）は実装時に再確認。「自己流で数字をズラさない」原則を厳守。

### ⑧ 勤怠登録の不備（勤怠未登録 / 衣装未選択）

**他項目と違い期間は「月初〜昨日」**。報酬計算に直結するため月末までに潰す必要があり、直っていない古い漏れを3日窓だと取りこぼすため。直るまで毎日出続ける。
**当日は除外**（営業中で入力途中＝毎日必ず誤検知になる）。

#### A. 勤怠未登録（全店共通）
シフトが入っている（`is_cancelled=false`）のに勤怠レコードが無い。
欠勤（当欠/公欠/事前欠勤）は勤怠レコード自体は存在するのでここには出ない＝正常。
`attendance` は `cast_id` ではなく **`cast_name`** 参照のため、`shifts.cast_id → casts.name` に変換して `store_id|date|cast_name` で突合する。

#### B. 衣装未選択（衣装を運用している店舗のみ）
```sql
-- 対象店舗は store_uniform_settings.is_enabled で判定（ハードコード禁止）
SELECT a.store_id, a.date, a.cast_name, a.status
FROM attendance a
WHERE a.store_id IN (SELECT store_id FROM store_uniform_settings WHERE is_enabled)
  AND a.date >= :month_start AND a.date <= :yesterday
  AND a.status IN ('出勤','遅刻','早退','リクエスト出勤')   -- ※リクエスト含む
  AND a.costume_id IS NULL
  AND NOT EXISTS (                                          -- 内勤は衣装なしが正常
    SELECT 1 FROM casts c
    WHERE c.store_id = a.store_id AND c.name = a.cast_name
      AND (c.is_admin OR c.is_manager)
  );
```

**重要な前提（自己流で変えない）**
- `attendance.costume_id` はカラム名に反して **`uniforms.id`** を指す。`costumes` テーブルは空でFK制約も無い。
- `uniforms` は 2026-07 時点で **store 7 のみ6件**（A赤/A黒/B赤/B黒/C赤/C黒, `class_label`=A/B/C）。`store_uniform_settings` は `{store_id:7, is_enabled:true}` の1行のみ。
- **店舗ごとにルールが違う**（Mary Mareのみ衣装あり）。全店対象にすると store1/2 の出勤266件が毎日誤爆する。判定は必ず `store_uniform_settings` を読む。
- **内勤を除外しないと誤検知が大半を占める**（2026-07 の store7 では衣装未選択41件中31件が内勤＝あやと/さとる/ももと/川上）。
- Mary Mare は衣装クラスが時給に直結する（store7 の報酬設定284件中239件が `use_uniform_based_wage=true`）。**衣装未選択は見た目ではなく報酬計算の実害**。

**検証結果（2026-07-17 実行）**: store1=0件 / store2=0件 / store7=勤怠未登録9件・衣装未選択10件。

### ⑨ 出勤写真の不備（写真なし / 時刻ズレ）

全店対象（「全店で出勤写真を必須化する」方針）。**窓は直近3日（当日除外）**。⑧と違い月初窓にしない理由: 写真を運用していない店(2026-07 時点で MistressMirage / Mary Mare)は全出勤が該当し、月初窓だと毎日200件超が並び他の異常が埋もれるため。直近3日の日次ナッジにする。内勤(admin/manager)は写真対象外なので除外。

#### A. 写真なし（`check_in_photo_url` が空）
出勤系(出勤・遅刻・早退・リクエスト出勤)なのに写真URLが無い。**(store, date) 単位で集計**し、
- その日の出勤者が**全員写真なし**（＝写真を撮らない店）→ 1行に集約: `出勤N人 全員写真なし`
- **一部だけ**なし → 氏名を出す（誰に撮らせるかが分かる）: `写真なし: A・B・C`

#### B. 時刻ズレ（写真の撮影時刻と記録出勤時刻の乖離）
`check_in_photo_url` のファイル名は **`{store_id}/{date}/{cast_id}_checkin_{epochMs}.jpg`** 形式で、`_checkin_` と `.jpg` の間が**撮影時刻の Unix ミリ秒（UTC instant）**。これと記録された `check_in_datetime` を比較し、**60分以上ズレ**たら氏名で通知。

**重要（時差の罠）**: `check_in_datetime` は `timestamp without time zone` に **JST 壁時計**を保持している。JS の `new Date("2026-07-15T17:00:00")` はローカル(Vercel=UTC)解釈で9時間ズレるため、必ず **`+09:00` を明示**して UTC instant に変換してから写真epochと比較する。誤ると全件が約9時間ズレで誤検知する。

**検証（2026-07-18 基準・直近3日）**:
- Memorable: 写真なし(一部)を氏名で3日分、時刻ズレ1件（まる 記録17:00／写真19:02 の2時間ズレを検出）。
- MistressMirage / Mary Mare: 「出勤N人 全員写真なし」を日別に集約（写真運用なしのため）。
- 時差補正が正しく効き、正常な出勤（写真≒記録）は誤検知ゼロ。
