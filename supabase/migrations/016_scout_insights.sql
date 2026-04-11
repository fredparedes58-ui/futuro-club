-- Scout Insights table — persists AI-generated scouting insights
create table if not exists scout_insights (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  player_id   text        not null,
  player_name text        not null,
  insight_type text       not null check (insight_type in ('breakout','comparison','phv-alert','drill-record','regression','milestone')),
  title       text        not null,
  description text        not null,
  metric      text,
  metric_value text,
  urgency     text        check (urgency in ('high','medium','low')),
  tags        text[]      default '{}',
  context_data jsonb      default '{}',
  rag_drills  jsonb       default '[]',
  action_items jsonb      default '[]',
  benchmark   text,
  is_read     boolean     default false,
  is_archived boolean     default false,
  created_at  timestamptz default now()
);

-- Indexes
create index if not exists idx_scout_insights_user
  on scout_insights(user_id, created_at desc);

create index if not exists idx_scout_insights_player
  on scout_insights(player_id);

create index if not exists idx_scout_insights_type
  on scout_insights(insight_type);

create index if not exists idx_scout_insights_unread
  on scout_insights(user_id, is_read, is_archived)
  where is_read = false and is_archived = false;

-- RLS
alter table scout_insights enable row level security;

drop policy if exists "Users see own insights" on scout_insights;
create policy "Users see own insights"
  on scout_insights for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users update own insights" on scout_insights;
create policy "Users update own insights"
  on scout_insights for update to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users delete own insights" on scout_insights;
create policy "Users delete own insights"
  on scout_insights for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "Service role manages insights" on scout_insights;
create policy "Service role manages insights"
  on scout_insights for all to service_role
  using (true);
