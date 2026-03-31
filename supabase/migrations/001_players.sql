-- =====================================================================
-- VITAS · Football Intelligence — Fase 3 · Supabase Schema
-- Migration 001: Players table
-- =====================================================================
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =====================================================================

-- ── Tabla de jugadores ────────────────────────────────────────────────
create table if not exists public.players (
  id          text primary key,               -- ID local "p1234..." (preservar sync)
  user_id     uuid references auth.users(id)
                on delete cascade not null,    -- dueño del jugador
  data        jsonb not null,                  -- Player JSON completo (flexible)
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── Índices ────────────────────────────────────────────────────────────
create index if not exists players_user_id_idx on public.players(user_id);
create index if not exists players_updated_at_idx on public.players(updated_at desc);

-- ── Row Level Security ─────────────────────────────────────────────────
alter table public.players enable row level security;

-- Cada usuario solo puede ver y modificar sus propios jugadores
create policy "Users manage own players"
  on public.players
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Trigger: auto-update updated_at ───────────────────────────────────
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger players_updated_at
  before update on public.players
  for each row execute function public.update_updated_at();


-- =====================================================================
-- Migration 002: Videos table (Fase 2 metadata)
-- =====================================================================

create table if not exists public.videos (
  id          text primary key,               -- Bunny Stream GUID
  user_id     uuid references auth.users(id)
                on delete cascade not null,
  player_id   text references public.players(id)
                on delete set null,
  data        jsonb not null,                  -- VideoRecord JSON
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists videos_user_id_idx on public.videos(user_id);
create index if not exists videos_player_id_idx on public.videos(player_id);

alter table public.videos enable row level security;

create policy "Users manage own videos"
  on public.videos
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger videos_updated_at
  before update on public.videos
  for each row execute function public.update_updated_at();


-- =====================================================================
-- Migration 003: User profiles (display_name, academy_name)
-- =====================================================================

create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  academy_name    text,
  avatar_url      text,
  plan            text default 'free',         -- 'free' | 'pro' | 'elite'
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-crear perfil al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name, academy_name)
  values (
    new.id,
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'display_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
