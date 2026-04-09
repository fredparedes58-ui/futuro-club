-- VITAS · Players Indexed (StatsBomb / FBref / Understat)
-- Jugadores reales con métricas VSI calculadas desde fuentes abiertas.

CREATE TABLE IF NOT EXISTS players_indexed (
  id                  TEXT PRIMARY KEY,                -- "statsbomb_3456" | "fbref_abc123"
  source              TEXT NOT NULL,                   -- "statsbomb" | "fbref" | "understat"
  name                TEXT NOT NULL,
  short_name          TEXT,
  position            TEXT,                            -- "ST", "CM", "CB", etc.
  age                 INT,
  nationality         TEXT,
  club                TEXT,
  league              TEXT,                            -- "La Liga", "Premier League", etc.
  season              TEXT,                            -- "2023-24"
  foot                TEXT DEFAULT 'right',
  height              INT,

  -- Métricas VSI (0-100, calculadas del mapeo)
  metric_speed        FLOAT DEFAULT 0,
  metric_shooting     FLOAT DEFAULT 0,
  metric_vision       FLOAT DEFAULT 0,
  metric_technique    FLOAT DEFAULT 0,
  metric_defending    FLOAT DEFAULT 0,
  metric_stamina      FLOAT DEFAULT 0,
  vsi_estimated       FLOAT DEFAULT 0,

  -- Stats originales crudas
  raw_stats           JSONB DEFAULT '{}',

  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar extensión pg_trgm para búsqueda fuzzy (ya incluida en Supabase)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_players_indexed_position ON players_indexed(position);
CREATE INDEX IF NOT EXISTS idx_players_indexed_league   ON players_indexed(league);
CREATE INDEX IF NOT EXISTS idx_players_indexed_name     ON players_indexed USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_players_indexed_club     ON players_indexed(club);
CREATE INDEX IF NOT EXISTS idx_players_indexed_vsi      ON players_indexed(vsi_estimated DESC);

-- RLS: lectura pública, escritura solo service_role
ALTER TABLE players_indexed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_indexed" ON players_indexed;
CREATE POLICY "public_read_indexed"
  ON players_indexed FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "service_role_write" ON players_indexed;
CREATE POLICY "service_role_write"
  ON players_indexed FOR ALL
  TO service_role
  USING (true);
