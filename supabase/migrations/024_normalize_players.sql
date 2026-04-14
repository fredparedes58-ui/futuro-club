-- =====================================================================
-- 024: Normalizar tabla players — extraer campos del jsonb `data`
-- SEGURO: Solo agrega columnas nuevas. No modifica ni elimina nada.
-- La columna `data` jsonb permanece intacta como backup.
-- =====================================================================

-- ── Agregar columnas relacionales ─────────────────────────────────────
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS age int,
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS foot text,
  ADD COLUMN IF NOT EXISTS height_cm numeric,
  ADD COLUMN IF NOT EXISTS weight_kg numeric,
  ADD COLUMN IF NOT EXISTS sitting_height numeric,
  ADD COLUMN IF NOT EXISTS leg_length numeric,
  ADD COLUMN IF NOT EXISTS competitive_level text DEFAULT 'Regional',
  ADD COLUMN IF NOT EXISTS minutes_played int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gender text DEFAULT 'M',
  ADD COLUMN IF NOT EXISTS metric_speed numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metric_technique numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metric_vision numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metric_stamina numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metric_shooting numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metric_defending numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vsi numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vsi_history numeric[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS phv_category text,
  ADD COLUMN IF NOT EXISTS phv_offset numeric;

-- ── Backfill desde jsonb existente ────────────────────────────────────
UPDATE public.players SET
  name              = data->>'name',
  age               = (data->>'age')::int,
  position          = data->>'position',
  foot              = data->>'foot',
  height_cm         = (data->>'height')::numeric,
  weight_kg         = (data->>'weight')::numeric,
  sitting_height    = (data->>'sittingHeight')::numeric,
  leg_length        = (data->>'legLength')::numeric,
  competitive_level = COALESCE(data->>'competitiveLevel', 'Regional'),
  minutes_played    = COALESCE((data->>'minutesPlayed')::int, 0),
  gender            = COALESCE(data->>'gender', 'M'),
  metric_speed      = COALESCE((data->'metrics'->>'speed')::numeric, 0),
  metric_technique  = COALESCE((data->'metrics'->>'technique')::numeric, 0),
  metric_vision     = COALESCE((data->'metrics'->>'vision')::numeric, 0),
  metric_stamina    = COALESCE((data->'metrics'->>'stamina')::numeric, 0),
  metric_shooting   = COALESCE((data->'metrics'->>'shooting')::numeric, 0),
  metric_defending  = COALESCE((data->'metrics'->>'defending')::numeric, 0),
  vsi               = COALESCE((data->>'vsi')::numeric, 0),
  phv_category      = data->>'phvCategory',
  phv_offset        = (data->>'phvOffset')::numeric
WHERE name IS NULL;  -- solo filas no migradas aún

-- ── Indexes en columnas relacionales ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_players_name ON public.players(name);
CREATE INDEX IF NOT EXISTS idx_players_vsi ON public.players(vsi DESC);
CREATE INDEX IF NOT EXISTS idx_players_age ON public.players(age);
CREATE INDEX IF NOT EXISTS idx_players_position ON public.players(position);
CREATE INDEX IF NOT EXISTS idx_players_phv_category ON public.players(phv_category);

-- ── Trigger: auto-sync columnas desde jsonb en INSERT/UPDATE ──────────
-- Seguridad: si algún código escribe solo `data`, las columnas se actualizan.
CREATE OR REPLACE FUNCTION sync_player_columns_from_jsonb()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.data IS NOT NULL THEN
    NEW.name              := COALESCE(NEW.name, NEW.data->>'name');
    NEW.age               := COALESCE(NEW.age, (NEW.data->>'age')::int);
    NEW.position          := COALESCE(NEW.position, NEW.data->>'position');
    NEW.foot              := COALESCE(NEW.foot, NEW.data->>'foot');
    NEW.height_cm         := COALESCE(NEW.height_cm, (NEW.data->>'height')::numeric);
    NEW.weight_kg         := COALESCE(NEW.weight_kg, (NEW.data->>'weight')::numeric);
    NEW.sitting_height    := COALESCE(NEW.sitting_height, (NEW.data->>'sittingHeight')::numeric);
    NEW.leg_length        := COALESCE(NEW.leg_length, (NEW.data->>'legLength')::numeric);
    NEW.competitive_level := COALESCE(NEW.competitive_level, NEW.data->>'competitiveLevel', 'Regional');
    NEW.minutes_played    := COALESCE(NEW.minutes_played, (NEW.data->>'minutesPlayed')::int, 0);
    NEW.gender            := COALESCE(NEW.gender, NEW.data->>'gender', 'M');
    NEW.metric_speed      := COALESCE(NEW.metric_speed, (NEW.data->'metrics'->>'speed')::numeric, 0);
    NEW.metric_technique  := COALESCE(NEW.metric_technique, (NEW.data->'metrics'->>'technique')::numeric, 0);
    NEW.metric_vision     := COALESCE(NEW.metric_vision, (NEW.data->'metrics'->>'vision')::numeric, 0);
    NEW.metric_stamina    := COALESCE(NEW.metric_stamina, (NEW.data->'metrics'->>'stamina')::numeric, 0);
    NEW.metric_shooting   := COALESCE(NEW.metric_shooting, (NEW.data->'metrics'->>'shooting')::numeric, 0);
    NEW.metric_defending  := COALESCE(NEW.metric_defending, (NEW.data->'metrics'->>'defending')::numeric, 0);
    NEW.vsi               := COALESCE(NEW.vsi, (NEW.data->>'vsi')::numeric, 0);
    NEW.phv_category      := COALESCE(NEW.phv_category, NEW.data->>'phvCategory');
    NEW.phv_offset        := COALESCE(NEW.phv_offset, (NEW.data->>'phvOffset')::numeric);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_player_columns ON public.players;
CREATE TRIGGER trg_sync_player_columns
  BEFORE INSERT OR UPDATE ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION sync_player_columns_from_jsonb();
