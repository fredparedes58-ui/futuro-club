-- ─── Subscriptions — Plan / Stripe ──────────────────────────────────────────

create table if not exists subscriptions (
  user_id                 uuid        primary key references auth.users(id) on delete cascade,
  plan                    text        not null default 'free'
                            check (plan in ('free','pro','club')),
  status                  text        not null default 'active',
  stripe_customer_id      text,
  stripe_subscription_id  text,
  current_period_end      timestamptz,
  updated_at              timestamptz not null default now()
);

-- Índice para búsqueda por Stripe customer
create index if not exists subscriptions_stripe_customer_idx
  on subscriptions (stripe_customer_id);

-- RLS
alter table subscriptions enable row level security;

drop policy if exists "Users read own subscription" on subscriptions;
create policy "Users read own subscription"
  on subscriptions for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Service role full access" on subscriptions;
create policy "Service role full access"
  on subscriptions for all to service_role using (true);
