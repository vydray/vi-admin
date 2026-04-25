-- 制服管理機能(Mary Mareなど店舗ごとに有効化)
-- キャスト×月ごとに「どの制服を着るか」を記録する
-- 時給などのロジックには現時点では関与しない、純粋な記録テーブル

-- 店舗ごとの制服機能ON/OFF
CREATE TABLE IF NOT EXISTS store_uniform_settings (
  store_id INTEGER PRIMARY KEY REFERENCES stores(id),
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 制服マスタ(将来A/B/C以外の追加可能、店舗ごとに別定義)
CREATE TABLE IF NOT EXISTS uniforms (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, name)
);

-- キャスト×月ごとの制服割当
CREATE TABLE IF NOT EXISTS cast_uniform_assignments (
  id SERIAL PRIMARY KEY,
  cast_id INTEGER NOT NULL REFERENCES casts(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  uniform_id INTEGER NOT NULL REFERENCES uniforms(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cast_id, year_month)
);

-- RLS有効化(既存テーブルと同パターン: アプリ層認証なので全許可ポリシー)
ALTER TABLE store_uniform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE uniforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE cast_uniform_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for store_uniform_settings" ON store_uniform_settings FOR ALL USING (true);
CREATE POLICY "Allow all for uniforms" ON uniforms FOR ALL USING (true);
CREATE POLICY "Allow all for cast_uniform_assignments" ON cast_uniform_assignments FOR ALL USING (true);

-- Mary Mare(store_id=7)向けシード(初回有効化 + 制服A/B/C登録)
INSERT INTO store_uniform_settings (store_id, is_enabled) VALUES (7, TRUE)
ON CONFLICT (store_id) DO UPDATE SET is_enabled = EXCLUDED.is_enabled;

INSERT INTO uniforms (store_id, name, display_order) VALUES
  (7, 'A', 1),
  (7, 'B', 2),
  (7, 'C', 3)
ON CONFLICT (store_id, name) DO NOTHING;
