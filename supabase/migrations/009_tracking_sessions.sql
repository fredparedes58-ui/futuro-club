-- VITAS · Tracking Sessions
-- Almacena resultados de sesiones de tracking YOLO por jugador

create table if not exists tracking_sessions (
  id                  text        primary key default gen_random_uuid()::text,
  user_id             uuid        not null references auth.users(id) on delete cascade,
  player_id           text        not null,
  video_id            text        not null,
  target_track_id     integer,
  duration_ms         bigint      default 0,
  metrics             jsonb       not null default '{}',
  scan_events         jsonb       not null default '[]',
  duel_events         jsonb       not null default '[]',
  calibration_preset  text        default 'full_corners',
  created_at          timestamptz not null default now()
);

create index if not exists tracking_sessions_player_id_idx on tracking_sessions (player_id);
create index if not exists tracking_sessions_user_id_idx   on tracking_sessions (user_id);
create index if not exists tracking_sessions_created_at_idx on tracking_sessions (created_at desc);

alter table tracking_sessions enable row level security;

create policy "Users manage their own tracking sessions"
  on tracking_sessions for all
  to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
