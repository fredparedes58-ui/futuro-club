-- VITAS — Push Subscriptions Table
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  subscription jsonb not null,
  endpoint    text generated always as (subscription->>'endpoint') stored,
  created_at  timestamptz default now()
);
create unique index if not exists push_subscriptions_endpoint_idx
  on public.push_subscriptions(endpoint);
alter table public.push_subscriptions enable row level security;
create policy "Service role manages push subscriptions"
  on public.push_subscriptions for all to service_role using (true);
