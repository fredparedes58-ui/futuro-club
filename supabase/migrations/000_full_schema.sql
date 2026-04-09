-- =====================================================================
-- VITAS · Football Intelligence — Schema Completo
-- Ejecutar TODO de una vez en:
-- https://supabase.com/dashboard/project/tloadypygzqyfefanrza/sql/new
-- =====================================================================

-- ── 1. PLAYERS (jugadores de la academia) ────────────────────────────
create table if not exists public.players (
  id          text primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  data        jsonb not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists players_user_id_idx on public.players(user_id);
create index if not exists players_updated_at_idx on public.players(updated_at desc);
alter table public.players enable row level security;
drop policy if exists "Users manage own players" on public.players;
create policy "Users manage own players" on public.players
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 2. VIDEOS (metadatos Bunny Stream) ──────────────────────────────
create table if not exists public.videos (
  id          text primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  player_id   text references public.players(id) on delete set null,
  data        jsonb not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists videos_user_id_idx on public.videos(user_id);
create index if not exists videos_player_id_idx on public.videos(player_id);
alter table public.videos enable row level security;
drop policy if exists "Users manage own videos" on public.videos;
create policy "Users manage own videos" on public.videos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 3. PROFILES (academia / entrenador) ─────────────────────────────
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  academy_name    text,
  avatar_url      text,
  plan            text default 'free',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── 4. PRO_PLAYERS (base de datos de jugadores profesionales) ────────
-- Lectura pública (anon puede consultar para similitud)
-- Escritura solo con service_role (cargada por admin)
create table if not exists public.pro_players (
  id              text primary key,          -- "haaland_erling"
  name            text not null,
  short_name      text not null,             -- "Haaland"
  overall         int  not null,             -- 0-99
  potential       int  default 0,
  age             int,
  nationality     text,
  club            text,
  league          text,
  position        text not null,             -- "ST", "CM", "CB"...
  positions       text[] default '{}',       -- posiciones alternativas
  foot            text default 'right',
  height          int,                       -- cm
  -- Métricas normalizadas 0-99 (= VSI keys)
  pace            int not null,              -- velocidad
  shooting        int not null,              -- disparo
  passing         int not null,              -- visión / pase
  dribbling       int not null,              -- técnica
  defending       int not null,              -- defensa
  physic          int not null,              -- resistencia/físico
  -- Metadatos opcionales
  image_url       text,
  transfermarkt_value_eur bigint,
  created_at      timestamptz default now()
);

create index if not exists pro_players_position_idx on public.pro_players(position);
create index if not exists pro_players_overall_idx  on public.pro_players(overall desc);

-- Lectura pública para el motor de similitud
alter table public.pro_players enable row level security;
drop policy if exists "Anyone can read pro players" on public.pro_players;
create policy "Anyone can read pro players"
  on public.pro_players for select using (true);

-- ── 5. PLAYER_ANALYSES (informes de video guardados) ─────────────────
create table if not exists public.player_analyses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  player_id       text references public.players(id) on delete cascade,
  video_id        text,
  report          jsonb not null,            -- informe completo VITAS Intelligence
  similarity_top5 jsonb,                     -- top 5 jugadores similares
  projection      jsonb,                     -- proyección de carrera
  created_at      timestamptz default now()
);
create index if not exists analyses_player_id_idx on public.player_analyses(player_id);
create index if not exists analyses_user_id_idx   on public.player_analyses(user_id);
alter table public.player_analyses enable row level security;
drop policy if exists "Users manage own analyses" on public.player_analyses;
create policy "Users manage own analyses" on public.player_analyses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── 6. TRIGGERS updated_at ──────────────────────────────────────────
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists players_updated_at on public.players;
create trigger players_updated_at
  before update on public.players
  for each row execute function public.update_updated_at();

drop trigger if exists videos_updated_at on public.videos;
create trigger videos_updated_at
  before update on public.videos
  for each row execute function public.update_updated_at();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- ── 7. AUTO-CREAR PERFIL al registrarse ─────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, display_name, academy_name)
  values (
    new.id,
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'display_name'
  ) on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
