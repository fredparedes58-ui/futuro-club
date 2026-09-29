-- =====================================================================
-- 070 · VSI de ficha: marcar para REVISIÓN HUMANA los 57.5 fabricados
--        (sin borrar nada) + vista v_vsi_default_suspects
-- =====================================================================
-- Invariantes #1/#2 (CLAUDE.md). Antes de #146 (commit e36822b, mergeado el
-- 2026-08-22 00:06:21 +02:00 = 2026-08-21 22:06:21 UTC), el alta desde onboarding /
-- «Nuevo jugador» y CADA guardado del formulario de edición guardaban las barras por
-- defecto 60/60/60/60/50/50 aunque nadie las tocara, y eso da exactamente
--   calculateFichaVsi(DEFAULT_METRICS) = 0.18·60 + 0.22·60 + 0.20·60 + 0.15·60
--                                      + 0.13·50 + 0.12·50 = 57.5
-- La 059 solo re-nuleó vsi = 0 cuando el blob no tenía métricas (059:71-76): los
-- 57.5 siguen en players.vsi_history / data->'vsiHistory' y se leían como una
-- evaluación real (p.ej. el «67.4 (+9.9)» del ScoutFeed = 67.4 − 57.5).
--
-- Qué hace esta migración (idempotente; NO borra ni modifica ninguna fila de players):
--   1) Crea public.vsi_history_reviews: una marca de revisión por jugador.
--   2) Marca {status 'pending'} a los jugadores cuyo historial LEGACY contiene 57.5
--      y cuyo created_at es anterior al merge de #146. No toca vsi, vsi_history ni
--      data: una persona decide. (Tabla aparte y no columna en players a propósito:
--      un UPDATE sobre players dispararía los triggers de updated_at/sync de columnas
--      y el upsert del cliente no tiene por qué conocer la marca.)
--   3) Crea la vista v_vsi_default_suspects (solo service_role) para revisarlos.
--      El panel /admin (pestaña «Revisión VSI») la lee vía /api/admin/vsi-suspects.
--
-- Desde fix/vsi-delta-provenance las variaciones del VSI ya NO usan el historial
-- legacy: salen de data->'vsiEvaluations' ([{value, at, source}], escrito por
-- PlayerService.updateMetrics y /api/players/crud). Esa lista vive en el blob
-- `data` (lo que pullAll sincroniza), por eso no necesita columna propia.
--
-- Cómo resolver un caso (a mano, tras revisarlo con el entrenador):
--   UPDATE public.vsi_history_reviews
--   SET status = 'reviewed', reviewed_at = now(),
--       reviewed_by = '<email de quien revisa>',
--       resolution = '<p.ej. "57.5 era relleno: re-evaluar" | "evaluación real">'
--   WHERE player_id = '<player id>';
--
-- NO toca PHV ni bio-banding (invariante #4) ni las fórmulas del VSI.
-- Requiere Postgres 15+ (security_invoker en la vista).
-- =====================================================================

BEGIN;

-- 1) Tabla de marcas de revisión ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vsi_history_reviews (
  -- ON DELETE CASCADE: si se borra al jugador (derecho de supresión RGPD) su marca
  -- desaparece con él.
  player_id              text PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'reviewed')),
  reason                 text NOT NULL,
  flagged_at             timestamptz NOT NULL DEFAULT now(),
  flagged_by             text NOT NULL,
  -- Pistas para quien revisa (no deciden nada por sí solas):
  current_vsi_is_default boolean NOT NULL DEFAULT false, -- el VSI actual ES 57.5
  metrics_are_default    boolean NOT NULL DEFAULT false, -- las 6 barras actuales = 60/60/60/60/50/50
  reviewed_at            timestamptz,
  reviewed_by            text,
  resolution             text
);

COMMENT ON TABLE public.vsi_history_reviews IS
  'Revisión humana del historial VSI legacy (070): jugadores con 57.5 = '
  'calculateFichaVsi(60,60,60,60,50,50) guardado sin evaluación antes de #146. '
  'Marcado, nunca borrado. Solo service_role (RLS sin políticas).';

-- Solo el operador / service_role: RLS activa SIN políticas ⇒ anon/authenticated no
-- ven ni escriben nada (service_role salta RLS). Revocamos además los privilegios.
ALTER TABLE public.vsi_history_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vsi_history_reviews FROM PUBLIC;
REVOKE ALL ON public.vsi_history_reviews FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vsi_history_reviews TO service_role;

-- 2) Marcar sospechosos (ON CONFLICT DO NOTHING → idempotente; no pisa revisiones) ─
INSERT INTO public.vsi_history_reviews
  (player_id, status, reason, flagged_by, current_vsi_is_default, metrics_are_default)
SELECT
  p.id,
  'pending',
  'vsi_history contiene 57.5 = VSI de las barras por defecto (60/60/60/60/50/50) '
  'guardadas sin evaluación antes de #146 (corte 2026-08-21 22:06:21 UTC); '
  'revisar con el entrenador',
  'migration_070',
  COALESCE(p.vsi = 57.5, false) OR COALESCE((p.data->>'vsi') = '57.5', false),
  COALESCE(
    p.data->'metrics' = '{"speed":60,"technique":60,"vision":60,"stamina":60,"shooting":50,"defending":50}'::jsonb,
    false)
FROM public.players p
WHERE p.created_at < timestamptz '2026-08-21 22:06:21+00'
  AND (
    COALESCE(57.5 = ANY (p.vsi_history), false)
    OR COALESCE(p.data->'vsiHistory' @> '[57.5]'::jsonb, false)
  )
ON CONFLICT (player_id) DO NOTHING;

-- 3) Vista para la revisión humana ───────────────────────────────────
-- security_invoker: se evalúa con los permisos de QUIEN consulta (no del dueño), así
-- que no abre un bypass de RLS sobre datos de menores. Revocada a anon/authenticated.
CREATE OR REPLACE VIEW public.v_vsi_default_suspects
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.user_id,
  p.name,
  p.created_at,
  p.updated_at,
  p.vsi,
  p.vsi_history,
  p.data->'vsiHistory'     AS data_vsi_history,
  p.data->'vsiEvaluations' AS data_vsi_evaluations,
  r.status                 AS review_status,
  r.reason                 AS review_reason,
  r.flagged_at,
  r.current_vsi_is_default,
  r.metrics_are_default
FROM public.vsi_history_reviews r
JOIN public.players p ON p.id = r.player_id
WHERE r.status = 'pending';

COMMENT ON VIEW public.v_vsi_default_suspects IS
  'Jugadores con historial VSI legacy sospechoso (57.5 fabricado antes de #146) '
  'pendientes de revisión humana. Solo service_role. Ver migración 070.';

REVOKE ALL ON public.v_vsi_default_suspects FROM PUBLIC;
REVOKE ALL ON public.v_vsi_default_suspects FROM anon, authenticated;
GRANT SELECT ON public.v_vsi_default_suspects TO service_role;

COMMIT;
