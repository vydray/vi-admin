-- キャスト面談記録(プロデュース・ダッシュボードの入力先)。
-- 管理者がキャストと面談しながら手入力する。質問項目は将来店舗ごとに増やせるよう
-- answers を JSONB(可変)で持つ。自動下書き保存に is_draft を使う。
--
-- 手動適用: Supabase SQL Editor で実行(additive・3アプリ無影響)。

create table if not exists cast_interviews (
  id uuid primary key default gen_random_uuid(),
  cast_id integer not null references casts(id) on delete cascade,
  store_id integer not null,
  interview_date date not null,                 -- 面談日
  interviewer_id integer references admin_users(id) on delete set null,  -- 入力した管理者
  interviewer_name text,                        -- 表示用(退職等でid消えても名前は残す)
  -- 可変項目の回答。質問キー→値。例: {"recent":"🩵","guest_count":50,"target_sales":500}
  answers jsonb not null default '{}'::jsonb,
  is_draft boolean not null default false,      -- 自動下書き(true=未確定の下書き)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cast_interviews_store on cast_interviews(store_id, interview_date desc);
-- キャスト×面談日で1件(自動下書き→保存を同じ行でupsert。is_draftで未確定/確定を区別)
create unique index if not exists uq_cast_interviews_cast_date
  on cast_interviews(cast_id, interview_date);

-- Service Role 経由(サーバーAPI)のみ。RLS有効＋ポリシー無し=anon/authenticatedは触れない。
alter table cast_interviews enable row level security;
