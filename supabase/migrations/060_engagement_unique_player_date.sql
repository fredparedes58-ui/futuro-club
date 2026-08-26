-- =====================================================================
-- 060 · engagement_snapshots: UNIQUE (player_id, date) — idempotencia de la
--        valoración manual del entrenador
-- =====================================================================
-- La entrada MANUAL del entrenador (EngagementLogForm) es hoy la ÚNICA fuente
-- honesta de engagement POR JUGADOR: el engagement por tracking se calcula sobre
-- PISTAS ANÓNIMAS y la identidad por dorsal que lo ataría a un nombre NO está
-- construida (el sistema abstiene, ver .claude/rules/identidad.md).
--
-- Una valoración es una observación de UN jugador en UNA fecha. Si el entrenador
-- corrige la valoración de una fecha ya registrada, debe SOBRESCRIBIR, no crear
-- una segunda fila: dos filas para el mismo (player_id, date) hacen que el heatmap
-- promedie la corrección con el valor viejo (muestra un intermedio que nadie
-- observó) y que el timeline pinte dos puntos en la misma fecha.
--
-- La 046 creó `attendance_records` CON `UNIQUE (player_id, date)` pero
-- `engagement_snapshots` SIN esa restricción, así que el upsert `onConflict:"id"`
-- (con id de cliente omitido por no ser UUID) nunca casaba → cada guardado era un
-- INSERT nuevo. Esta migración alinea engagement con attendance.
--
-- Idempotente. NO toca PHV/bio-banding ni ninguna fórmula (invariante #4): solo
-- restringe la unicidad de una observación manual.
-- =====================================================================

BEGIN;

-- 1) Deduplicar filas legacy antes de poder crear la restricción. Si ya existen
--    duplicados (player_id, date) en prod, ADD CONSTRAINT fallaría. Se conserva
--    la fila MÁS RECIENTE por created_at (desempate por id) — la última
--    valoración del entrenador es la corrección vigente.
DELETE FROM public.engagement_snapshots a
USING public.engagement_snapshots b
WHERE a.player_id = b.player_id
  AND a.date = b.date
  AND (a.created_at < b.created_at
       OR (a.created_at = b.created_at AND a.id < b.id));

-- 2) Añadir la restricción de unicidad (idempotente: solo si no existe ya).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'engagement_player_date_unique'
      AND conrelid = 'public.engagement_snapshots'::regclass
  ) THEN
    ALTER TABLE public.engagement_snapshots
      ADD CONSTRAINT engagement_player_date_unique UNIQUE (player_id, date);
  END IF;
END$$;

COMMENT ON CONSTRAINT engagement_player_date_unique ON public.engagement_snapshots IS
  'Una valoración de engagement por jugador y fecha. Corregir una fecha ya '
  'registrada SOBRESCRIBE (upsert onConflict player_id,date), no duplica.';

COMMIT;
