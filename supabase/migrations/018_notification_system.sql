-- ─── Notification Preferences — Per-user push notification control ──────────
-- Synced from client Settings page to control which triggers the cron sends

create table if not exists notification_preferences (
  user_id              uuid        primary key references auth.users(id) on delete cascade,
  rendimiento_bajo     boolean     not null default true,
  inactividad          boolean     not null default true,
  limite_plan          boolean     not null default true,
  analisis_completado  boolean     not null default true,
  updated_at           timestamptz not null default now()
);

alter table notification_preferences enable row level security;

drop policy if exists "Users manage own notification preferences" on notification_preferences;
create policy "Users manage own notification preferences"
  on notification_preferences for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Service role manages notification preferences" on notification_preferences;
create policy "Service role manages notification preferences"
  on notification_preferences for all
  to service_role
  using (true);

-- ─── Notification Log — Deduplication + Audit Trail ─────────────────────────
-- Prevents sending the same trigger for the same player within 24 hours

create table if not exists notification_log (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  trigger_type  text        not null,
  player_id     text        not null default '',
  channel       text        not null default 'push',  -- 'push' | 'email'
  sent_at       timestamptz not null default now()
);

-- Index for deduplication query (last 24h lookups)
create index if not exists idx_notification_log_dedup
  on notification_log (user_id, trigger_type, player_id, sent_at desc);

-- Index for cleanup (purge old logs > 30 days)
create index if not exists idx_notification_log_sent_at
  on notification_log (sent_at);

alter table notification_log enable row level security;

drop policy if exists "Users read own notification log" on notification_log;
create policy "Users read own notification log"
  on notification_log for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Service role manages notification log" on notification_log;
create policy "Service role manages notification log"
  on notification_log for all
  to service_role
  using (true);
