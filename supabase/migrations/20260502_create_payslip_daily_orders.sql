-- shift-app の「日別明細を開く」ダイアログ用の伝票単位 snapshot を保存するテーブル
-- 1キャスト1日 = 1行、orders JSONB に伝票配列、各伝票に items 配列
--
-- 用途: shift-app payslip ページで動的計算を完全廃止し、保存値だけで描画する
--
-- 設計メモ:
--   - PK = id (BIGSERIAL), 重複防止は (cast_id, year_month, date) で UNIQUE
--   - store_id は別 INDEX で持つ (店舗単位クエリ用 / RLS 用)
--   - orders[] は per-cast per-day の伝票一覧。recalc 時にキャスト視点で再構築
--
-- 関連ドキュメント: shift-app integration plan (memory)

CREATE TABLE IF NOT EXISTS payslip_daily_orders (
  id BIGSERIAL PRIMARY KEY,
  store_id INT NOT NULL,
  cast_id INT NOT NULL,
  year_month TEXT NOT NULL,
  date DATE NOT NULL,

  -- 日次 totals (このキャストの当日の合計値)
  self_sales_total INT NOT NULL DEFAULT 0,
  help_sales_total INT NOT NULL DEFAULT 0,
  self_back_total INT NOT NULL DEFAULT 0,
  help_back_total INT NOT NULL DEFAULT 0,
  wage_amount INT NOT NULL DEFAULT 0,
  work_hours NUMERIC(5,2) NOT NULL DEFAULT 0,

  -- 1日分の伝票配列 (キャスト視点)
  orders JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 重複防止 (1キャスト1日に1行)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pdo_unique
  ON payslip_daily_orders (cast_id, year_month, date);

-- 店舗単位クエリ用
CREATE INDEX IF NOT EXISTS idx_pdo_store_month
  ON payslip_daily_orders (store_id, year_month);

-- RLS 有効化 (service_role のみ書き込み・読み取り可、anon/auth は遮断)
ALTER TABLE payslip_daily_orders ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE payslip_daily_orders IS 'shift-app 用の日別伝票 snapshot。recalc 時に書き込む。';
COMMENT ON COLUMN payslip_daily_orders.orders IS 'キャスト視点の伝票配列。各要素は order_id/type/items[] 等を含む';
