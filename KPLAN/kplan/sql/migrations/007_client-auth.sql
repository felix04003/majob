-- sql/migrations/007_client-auth.sql
-- Migrate client_access from token-based to user-based auth

-- 1. Add new columns
alter table client_access
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists email text,
  add column if not exists is_revoked boolean not null default false,
  add column if not exists invited_at timestamptz not null default now();

-- 2. Make user_id + event_id unique (one row per user per event)
create unique index if not exists client_access_user_event_idx
  on client_access(user_id, event_id)
  where user_id is not null;

-- 3. Drop old columns (after verifying new columns exist)
alter table client_access
  drop column if exists client_token,
  drop column if exists expires_at;

-- 4. Add index for fast user lookup
create index if not exists client_access_user_id_idx on client_access(user_id);

-- RLS for client dashboard
alter table client_access enable row level security;
create policy "clients can read own access" on client_access
  for select using (auth.uid() = user_id);
