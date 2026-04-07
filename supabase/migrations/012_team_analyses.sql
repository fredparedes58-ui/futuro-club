-- VITAS Sprint 6: Team Analyses
-- Almacena informes de análisis táctico de equipo

create table if not exists public.team_analyses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade default auth.uid(),
  video_id    text not null,
  report      jsonb,
  created_at  timestamptz default now()
);

create index if not exists idx_team_analyses_user on public.team_analyses(user_id);
create index if not exists idx_team_analyses_video on public.team_analyses(video_id);

alter table public.team_analyses enable row level security;

create policy "Users manage own team analyses"
  on public.team_analyses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
