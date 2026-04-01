-- ─── Match Events — VAEP Manual Logging ─────────────────────────────────────

create table if not exists match_events (
  id          text        primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  player_id   text        not null,
  type        text        not null check (type in
    ('pass','shot','dribble','tackle','press','cross','header')),
  result      text        not null check (result in ('success','fail')),
  minute      integer     not null check (minute between 1 and 120),
  match_date  date        not null,
  x_zone      text        check (x_zone in ('defensive','middle','offensive')),
  created_at  timestamptz not null default now()
);

create index if not exists match_events_player_id_idx on match_events (player_id);
create index if not exists match_events_user_id_idx   on match_events (user_id);

alter table match_events enable row level security;

create policy "Users manage their own events"
  on match_events for all to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Service role full access"
  on match_events for all to service_role using (true);
