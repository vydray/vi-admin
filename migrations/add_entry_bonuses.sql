-- 入店祝い金（Mary Mare/store7専用・super_admin管理）
-- 乙が入店日から2ヶ月以内に月売上ランク(30/40/50万)を達成したら、窓内最高ランクの祝い金を支給。
-- 未達成なら窓後に初めて達成した月のランク。1人1回限り。
-- このテーブルは「支給予定月・支給済み状態」を保存する（該当額/達成月は売上から自動計算し、確定時にスナップショット）。

CREATE TABLE IF NOT EXISTS entry_bonuses (
  id            BIGSERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL,
  cast_id       BIGINT  NOT NULL,
  amount        INTEGER NOT NULL DEFAULT 0,   -- 50000 / 100000 / 150000
  achieved_rank INTEGER,                       -- 30 / 40 / 50 (万)
  achieved_ym   TEXT,                          -- 'YYYY-MM' 達成月
  pay_ym        TEXT,                          -- 'YYYY-MM' 支給予定月（手入力）
  is_paid       BOOLEAN NOT NULL DEFAULT false,-- 支給済み
  paid_at       TIMESTAMPTZ,
  memo          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cast_id)                             -- 1人1回限り
);

CREATE INDEX IF NOT EXISTS idx_entry_bonuses_store ON entry_bonuses (store_id);
