-- =====================================================================
-- 015 · analyses_used — Tracks monthly analysis usage per user
-- =====================================================================

create table if not exists public.analyses_used (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  month       text        not null,           -- "2026-04"
  count       integer     not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.analyses_used enable row level security;

drop policy if exists "Users manage own analyses_used" on public.analyses_used;
create policy "Users manage own analyses_used" on public.analyses_used
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Service role full access analyses_used" on public.analyses_used;
create policy "Service role full access analyses_used" on public.analyses_used
  for all to service_role using (true) with check (true);
