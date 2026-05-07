-- =====================================================================
-- 032 · Match-day Live Mode (Sprint B2)
-- =====================================================================
-- Killer mobile feature: el coach apunta eventos en directo desde el
-- móvil durante el partido. Post-pitido, los eventos agregados disparan
-- la pipeline de reportes individuales + team baseline.
--
-- Diseño:
--   live_matches  → 1 fila por partido (cronómetro, score, contexto)
--   live_events   → N filas por partido (1 por tap del coach)
--
-- RLS: aislada por tenant_id · service role bypass para el cron.
-- =====================================================================

-- ── Live Matches ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.live_matches (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Contexto del partido
  team_name       text        NOT NULL DEFAULT 'Mi equipo',
  opponent_name   text,
  competition     text,                              -- "Liga", "Amistoso", etc.
  match_date      date,

  -- Cronómetro
  started_at      timestamptz,
  ended_at        timestamptz,
  duration_seconds integer    DEFAULT 0,             -- tiempo real jugado (descontando paradas)

  -- Resultado
  score_home      integer     DEFAULT 0,
  score_away      integer     DEFAULT 0,

  -- Estado del partido
  status          text        NOT NULL DEFAULT 'live'
                  CHECK (status IN ('live','paused','finished','aborted')),

  notes           text,

  -- Resultado del análisis post-partido (si ya se procesó)
  analysis_result jsonb,                             -- agregaciones por jugador
  analysis_at     timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_matches_tenant   ON public.live_matches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_live_matches_user     ON public.live_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_live_matches_status   ON public.live_matches(status);
CREATE INDEX IF NOT EXISTS idx_live_matches_created  ON public.live_matches(created_at DESC);

-- ── Live Events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.live_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  match_id        uuid        NOT NULL REFERENCES public.live_matches(id) ON DELETE CASCADE,
  player_id       text        REFERENCES public.players(id) ON DELETE SET NULL,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Tipo de evento (los 6 botones del UI · plus extensiones)
  event_type      text        NOT NULL CHECK (event_type IN (
                    'gol','pase_clave','recuperacion','perdida',
                    'duelo_ganado','duelo_perdido',
                    'asistencia','tarjeta_amarilla','tarjeta_roja',
                    'parada_portero','penalti_provocado','penalti_cometido'
                  )),

  -- Tiempo y ubicación
  timestamp_seconds integer   NOT NULL,             -- desde inicio del partido
  half            integer     DEFAULT 1
                  CHECK (half IN (1,2,3,4)),        -- 1ª/2ª parte · 3-4 prórroga

  -- Zona del campo (9 cuadrantes · opcional)
  zone_row        text        CHECK (zone_row IN ('defensa','medio','ataque')),
  zone_col        text        CHECK (zone_col IN ('izq','cen','dcha')),

  -- Contexto adicional
  metadata        jsonb       DEFAULT '{}'::jsonb,  -- ej. { "rival_jersey": 7 }
  notes           text,

  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Para deduplicar eventos enviados desde offline queue (idempotencia)
  client_event_id text                              -- UUID generado en cliente
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_live_events_client_id
  ON public.live_events(match_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_events_match    ON public.live_events(match_id);
CREATE INDEX IF NOT EXISTS idx_live_events_player   ON public.live_events(player_id);
CREATE INDEX IF NOT EXISTS idx_live_events_tenant   ON public.live_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_live_events_type     ON public.live_events(event_type);

-- ── RLS Policies ─────────────────────────────────────────────────────
ALTER TABLE public.live_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_events  ENABLE ROW LEVEL SECURITY;

-- live_matches · usuarios ven y editan los suyos
DROP POLICY IF EXISTS "Users own live matches" ON public.live_matches;
CREATE POLICY "Users own live matches" ON public.live_matches
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access live matches" ON public.live_matches;
CREATE POLICY "Service role full access live matches" ON public.live_matches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- live_events · usuarios ven y editan los suyos
DROP POLICY IF EXISTS "Users own live events" ON public.live_events;
CREATE POLICY "Users own live events" ON public.live_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access live events" ON public.live_events;
CREATE POLICY "Service role full access live events" ON public.live_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Trigger updated_at ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at_live_matches()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_matches_updated_at ON public.live_matches;
CREATE TRIGGER trg_live_matches_updated_at
  BEFORE UPDATE ON public.live_matches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_live_matches();

-- ── Comments ─────────────────────────────────────────────────────────
COMMENT ON TABLE public.live_matches IS 'Partidos en directo registrados desde el móvil del coach (Sprint B2 · Match-day Live Mode)';
COMMENT ON TABLE public.live_events  IS 'Eventos puntuales (gol, pase clave, recuperación, etc.) tageados al jugador y minuto del partido';
COMMENT ON COLUMN public.live_events.client_event_id IS 'UUID generado en cliente para idempotencia · evita duplicados al sync offline queue';
