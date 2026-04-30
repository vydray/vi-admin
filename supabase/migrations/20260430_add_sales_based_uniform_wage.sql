-- 売上連動時給システム（衣装クラス連動）
-- 月間売上のブラケット × 衣装クラス（A/B/C等）で時給が決まる仕組み
-- 月内全日に同じブラケット適用（リアルタイム遡及）

-- 1) uniforms にカラム追加
--    class_label: 時給テーブル参照用ラベル（A/B/C等）
--    wage_adjustment: 旧 costumes 互換の加算ボーナス（売上連動を使わない店舗用）
ALTER TABLE uniforms ADD COLUMN IF NOT EXISTS class_label VARCHAR(8);
ALTER TABLE uniforms ADD COLUMN IF NOT EXISTS wage_adjustment INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN uniforms.class_label IS '時給テーブル参照用のクラスラベル（A/B/C 等）。同じラベルの衣装は同じ時給ブラケット行を参照';
COMMENT ON COLUMN uniforms.wage_adjustment IS '時給加算額（売上連動を使わない店舗向け、旧 costumes 互換）';

-- 既存6行のラベル設定（Mary Mare 想定: A赤/A黒→A, B赤/B黒→B, C赤/C黒→C）
-- name の先頭1文字でクラス推定（A〜Z のみ対象）
UPDATE uniforms
SET class_label = SUBSTRING(name FROM 1 FOR 1)
WHERE class_label IS NULL
  AND name ~ '^[A-Z]';

-- 2) 売上連動時給ブラケットテーブル新規作成
--    1店舗1テーブルで運用（複数バージョン管理は将来拡張）
CREATE TABLE IF NOT EXISTS sales_based_wage_brackets (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  bracket_min BIGINT NOT NULL,            -- ブラケット下限（円, 0以上）
  bracket_max BIGINT,                     -- ブラケット上限（円, NULL=無限大）
  rates JSONB NOT NULL,                   -- { "A": 1300, "B": 1400, "C": 1500 } クラス可変
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_based_wage_brackets_store
  ON sales_based_wage_brackets(store_id, display_order)
  WHERE is_active = true;

COMMENT ON TABLE sales_based_wage_brackets IS '売上連動時給ブラケット（月間売上×衣装クラスで時給確定）';
COMMENT ON COLUMN sales_based_wage_brackets.bracket_min IS '月間売上の下限（円, 含む）';
COMMENT ON COLUMN sales_based_wage_brackets.bracket_max IS '月間売上の上限（円, 含まず）。NULLは上限なし';
COMMENT ON COLUMN sales_based_wage_brackets.rates IS 'クラスラベル→時給のマップ（例: {"A":1300,"B":1400,"C":1500}）';

-- 3) Mary Mare (store_id=7) の契約書通り 8段階を登録
--    https://（契約書） 参照
INSERT INTO sales_based_wage_brackets (store_id, display_order, bracket_min, bracket_max, rates)
VALUES
  (7, 1,       0,  150000, '{"A":1300,"B":1400,"C":1500}'::jsonb),
  (7, 2,  150000,  350000, '{"A":1500,"B":1600,"C":1700}'::jsonb),
  (7, 3,  350000,  500000, '{"A":1600,"B":1700,"C":1800}'::jsonb),
  (7, 4,  500000,  650000, '{"A":1700,"B":1800,"C":1900}'::jsonb),
  (7, 5,  650000,  800000, '{"A":1800,"B":1900,"C":2000}'::jsonb),
  (7, 6,  800000, 1000000, '{"A":1900,"B":2000,"C":2100}'::jsonb),
  (7, 7, 1000000, 1500000, '{"A":2100,"B":2200,"C":2300}'::jsonb),
  (7, 8, 1500000,    NULL, '{"A":2300,"B":2400,"C":2500}'::jsonb)
ON CONFLICT DO NOTHING;
