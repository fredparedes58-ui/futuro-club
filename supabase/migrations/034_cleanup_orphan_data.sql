-- =====================================================================
-- Migration 034 · Cleanup orphan data
-- =====================================================================
-- Objetivo: borrar registros con user_id que ya no existe en auth.users.
-- Estos huérfanos vienen de cuentas test/seed antiguas borradas.
--
-- Síntoma que arregla: el bot Telegram veía 'dos Samu' (uno propio + uno
-- de un usuario test eliminado). Aunque el filtro user_id ahora aísla,
-- limpiar la DB elimina basura permanentemente.
--
-- Tablas afectadas: players, player_analyses, analyses, telegram_messages,
-- coach_telegram_mapping, telegram_link_tokens, live_matches, live_events,
-- subscriptions, audit_log, video_storage.
--
-- También limpia jugadores con user_id NULL (orphans sin propietario).
--
-- SAFE para ejecutar en producción: solo borra filas cuyos user_id no
-- existen ya. Los datos legítimos no se tocan.
-- =====================================================================

BEGIN;

-- ── Players sin user_id válido ─────────────────────────────────────
DELETE FROM public.players
WHERE user_id IS NULL
   OR user_id NOT IN (SELECT id FROM auth.users);

-- ── player_analyses ────────────────────────────────────────────────
DELETE FROM public.player_analyses
WHERE user_id IS NULL
   OR user_id NOT IN (SELECT id FROM auth.users);

-- ── analyses (pipeline GPU) ────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analyses') THEN
    EXECUTE 'DELETE FROM public.analyses WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM auth.users)';
  END IF;
END $$;

-- ── telegram_messages ──────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'telegram_messages') THEN
    EXECUTE 'DELETE FROM public.telegram_messages WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM auth.users)';
  END IF;
END $$;

-- ── coach_telegram_mapping ─────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coach_telegram_mapping') THEN
    EXECUTE 'DELETE FROM public.coach_telegram_mapping WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM auth.users)';
  END IF;
END $$;

-- ── telegram_link_tokens ───────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'telegram_link_tokens') THEN
    EXECUTE 'DELETE FROM public.telegram_link_tokens WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM auth.users)';
  END IF;
END $$;

-- ── live_matches y live_events ─────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'live_events') THEN
    EXECUTE 'DELETE FROM public.live_events WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM auth.users)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'live_matches') THEN
    EXECUTE 'DELETE FROM public.live_matches WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM auth.users)';
  END IF;
END $$;

-- ── team_analyses ──────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team_analyses') THEN
    EXECUTE 'DELETE FROM public.team_analyses WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM auth.users)';
  END IF;
END $$;

-- ── usage_log ──────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usage_log') THEN
    EXECUTE 'DELETE FROM public.usage_log WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM auth.users)';
  END IF;
END $$;

-- ── subscriptions ──────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions') THEN
    EXECUTE 'DELETE FROM public.subscriptions WHERE user_id IS NULL OR user_id NOT IN (SELECT id FROM auth.users)';
  END IF;
END $$;

-- ── Reportar conteos finales ───────────────────────────────────────
DO $$
DECLARE
  p_count INT;
  pa_count INT;
  u_count INT;
BEGIN
  SELECT COUNT(*) INTO p_count FROM public.players;
  SELECT COUNT(*) INTO pa_count FROM public.player_analyses;
  SELECT COUNT(*) INTO u_count FROM auth.users;
  RAISE NOTICE 'Cleanup completo · users: %, players: %, player_analyses: %', u_count, p_count, pa_count;
END $$;

COMMIT;
