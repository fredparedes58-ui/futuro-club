-- ─── Push Subscriptions — Web Push Notifications ────────────────────────────

create table if not exists push_subscriptions (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  endpoint    text        not null,
  p256dh      text        not null,
  auth        text        not null,
  created_at  timestamptz not null default now(),

  -- Un endpoint es único por usuario
  constraint push_subscriptions_user_endpoint_unique unique (user_id, endpoint)
);

-- Índice para buscar suscripciones de un usuario
create index if not exists push_subscriptions_user_id_idx
  on push_subscriptions (user_id);

-- RLS
alter table push_subscriptions enable row level security;

drop policy if exists "Users can manage their own subscriptions" on push_subscriptions;
create policy "Users can manage their own subscriptions"
  on push_subscriptions for all
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Service role full access" on push_subscriptions;
create policy "Service role full access"
  on push_subscriptions for all
  to service_role
  using (true);
