-- ============================================================================
-- VITAS · Development Curves + Player History
-- Curvas de desarrollo calculadas de Kaggle FIFA 15-FC24 (45,630 jugadores)
-- ============================================================================

-- Curvas promedio por posición/bracket/edad
create table if not exists development_curves (
  id              serial primary key,
  position_group  text    not null,        -- ST, W, AM, CM, DM, FB, CB, GK
  overall_bracket text    not null,        -- '60-69', '70-79', '80-89', '90+'
  age             int     not null,        -- 16-35
  pct_of_peak     float   not null,        -- 0.0-1.0 (overall)
  pct_pace        float   not null,
  pct_shooting    float   not null,
  pct_passing     float   not null,
  pct_dribbling   float   not null,
  pct_defending   float   not null,
  pct_physic      float   not null,
  sample_size     int     not null,
  source          text    default 'kaggle_fifa',
  created_at      timestamptz default now(),
  unique(position_group, overall_bracket, age)
);

-- Historial individual de jugadores pro (para "a qué edad X tenía Y")
create table if not exists player_history (
  id              serial primary key,
  player_id       text    not null,        -- FIFA player_id consistente entre versiones
  player_name     text    not null,
  fifa_version    text    not null,        -- "FIFA 15", "FIFA 20", "FC24"
  age             int     not null,
  overall         int,
  potential       int,
  pace            int,
  shooting        int,
  passing         int,
  dribbling       int,
  defending       int,
  physic          int,
  position        text,
  club            text,
  created_at      timestamptz default now(),
  unique(player_id, fifa_version)
);

-- Índices para queries frecuentes
create index if not exists idx_dev_curves_lookup
  on development_curves(position_group, overall_bracket);

create index if not exists idx_player_history_player
  on player_history(player_id, age);

create index if not exists idx_player_history_name
  on player_history(player_name);

-- RLS (lectura pública, escritura solo service role)
alter table development_curves enable row level security;
alter table player_history enable row level security;

drop policy if exists "development_curves_read" on development_curves;
create policy "development_curves_read"
  on development_curves for select
  using (true);

drop policy if exists "player_history_read" on player_history;
create policy "player_history_read"
  on player_history for select
  using (true);
