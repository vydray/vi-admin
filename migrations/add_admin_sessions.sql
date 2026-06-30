-- opaque DBセッションの土台。
-- 平文JSON cookie(role/store_id/permissions を素で格納し署名なし=偽造可能)を廃止し、
-- cookieにはランダムtokenのみを置く。毎リクエストここを引いて admin_users と突合し、
-- 現在の role/store_id/permissions/有効性を「DBの真実」から読む。
--
-- 手動適用: Supabase SQL Editor で実行(本番DBは3アプリ共有のため、additiveな本DDLは
-- POS/シフトアプリに影響しない)。

create table if not exists admin_sessions (
  id uuid primary key default gen_random_uuid(),
  -- cookieの生tokenは保存せず sha256 ハッシュのみ保存(DB漏洩時に生tokenが漏れない)
  token_hash text not null unique,
  admin_user_id integer not null references admin_users(id) on delete cascade,
  -- 発行時点の admin_users.session_version。権限変更/退職で版を上げると既存セッションが失効する
  session_version integer not null,
  auth_method text not null default 'password',  -- 'password' | (将来)'line'
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  ip text
);

create index if not exists idx_admin_sessions_user on admin_sessions(admin_user_id);
create index if not exists idx_admin_sessions_expires on admin_sessions(expires_at);

-- 権限変更・退職時にこの版を +1 すると、その管理者の既存セッションを一括失効できる
alter table admin_users add column if not exists session_version integer not null default 1;

-- Service Role 経由(サーバーAPI)でのみ操作する。RLSを有効化しポリシーを置かない
-- =anon/authenticated からは一切触れない(Service RoleはRLSをバイパス)。
alter table admin_sessions enable row level security;
