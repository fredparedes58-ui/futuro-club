-- =====================================================================
-- Migration 035 · played_position por video
-- =====================================================================
-- Cada análisis/video registra en qué posición jugó el jugador.
-- Esto permite que un mismo jugador polivalente tenga informes
-- contextualizados por posición jugada en cada partido.
--
-- Defaults a NULL para registros existentes (sin posición específica).
-- Nuevos registros deben especificar playedPosition al insertar (manejado
-- en el cliente · si no se pasa, usa player.position por defecto).
-- =====================================================================

-- Añadir played_position a player_analyses
ALTER TABLE public.player_analyses
  ADD COLUMN IF NOT EXISTS played_position text;

CREATE INDEX IF NOT EXISTS idx_player_analyses_played_position
  ON public.player_analyses(played_position)
  WHERE played_position IS NOT NULL;

COMMENT ON COLUMN public.player_analyses.played_position IS
  'Posición que jugó el jugador en este video específico. Default = player.position si no se especifica al subir.';

-- Añadir played_position a analyses (pipeline GPU)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analyses') THEN
    EXECUTE 'ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS played_position text';
  END IF;
END $$;

-- Añadir played_position a videos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'videos') THEN
    EXECUTE 'ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS played_position text';
  END IF;
END $$;
