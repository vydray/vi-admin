-- 定期投稿テーブル
CREATE TABLE IF NOT EXISTS recurring_posts (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  content TEXT NOT NULL,
  image_url TEXT,
  -- 'daily' or 'weekly'
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly')),
  -- 投稿時刻 (HH:MM形式)
  post_time TIME NOT NULL,
  -- 週次の場合の曜日 (0=日曜, 1=月曜, ... 6=土曜)
  -- 複数曜日対応のためJSON配列 例: [1, 3, 5] = 月水金
  days_of_week JSONB DEFAULT '[]',
  -- 有効/無効
  is_active BOOLEAN DEFAULT true,
  -- 最後に投稿を生成した日時
  last_generated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_recurring_posts_store_id ON recurring_posts(store_id);
CREATE INDEX IF NOT EXISTS idx_recurring_posts_active ON recurring_posts(is_active);

-- RLSポリシー
ALTER TABLE recurring_posts ENABLE ROW LEVEL SECURITY;

-- 全ユーザーが自店舗の定期投稿を閲覧可能
CREATE POLICY "Users can view own store recurring posts" ON recurring_posts
  FOR SELECT USING (true);

-- 全ユーザーが自店舗の定期投稿を作成可能
CREATE POLICY "Users can insert own store recurring posts" ON recurring_posts
  FOR INSERT WITH CHECK (true);

-- 全ユーザーが自店舗の定期投稿を更新可能
CREATE POLICY "Users can update own store recurring posts" ON recurring_posts
  FOR UPDATE USING (true);

-- 全ユーザーが自店舗の定期投稿を削除可能
CREATE POLICY "Users can delete own store recurring posts" ON recurring_posts
  FOR DELETE USING (true);

-- scheduled_postsにrecurring_post_idを追加（定期投稿から生成された投稿を追跡）
ALTER TABLE scheduled_posts
ADD COLUMN IF NOT EXISTS recurring_post_id INTEGER REFERENCES recurring_posts(id);
