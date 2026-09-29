-- =====================================================================
-- 071 · players.birth_date: rellenar la columna del control RGPD con la
--        fecha de nacimiento DEL JUGADOR que ya guarda la ficha
-- =====================================================================
-- Hueco: la ficha del jugador guarda su fecha de nacimiento SOLO en el blob
-- players.data->>'birthDate'. Ningún escritor rellenaba players.birth_date, que
-- es la columna que leen el trigger trg_check_parental_consent (036:31-52), la
-- vista v_players_ai_blocked (036:56-74) y /admin/consent
-- (ParentalConsentPage.tsx: .not("birth_date","is",null)). Resultado: un menor
-- de 14 con fecha introducida en la ficha no aparecía en el control.
--
-- El código de la misma PR hace que TODOS los escritores de players escriban
-- birth_date con toIsoBirthDate (src/lib/shared/birthDate.ts). Esta migración
-- rellena las filas existentes con la MISMA regla, exacta:
--   · solo 'YYYY-MM-DD' ([0-9]{4}-[0-9]{2}-[0-9]{2}, sin recortar espacios);
--   · fecha de calendario real (2014-02-30 no lo es);
--   · estrictamente anterior a hoy y no anterior a 1900-01-01;
--   · cualquier otro valor ⇒ birth_date se queda NULL. No se inventa ni se
--     «arregla» ninguna fecha.
-- Solo toca filas con birth_date IS NULL: nunca sobrescribe un valor existente.
--
-- Consentimiento: NO se modifica la lógica de 036 (función, trigger ni vista).
-- El UPDATE de birth_date dispara trg_check_parental_consent (BEFORE UPDATE OF
-- birth_date) igual que cualquier escritor:
--   · menor de 14: pasa a 'pending' si estaba NULL/'not_required';
--     'pending' / 'granted' / 'denied' se conservan (036:36-40);
--   · 14 o más: 'not_required' (036:41-43) — incluye filas que tenían
--     'granted' o 'denied'. Es la lógica existente; el NOTICE de abajo cuenta
--     cuántas filas cambian así para que el operador lo revise.
-- Ese trigger NO se desactiva. Sí se desactiva, SOLO durante el backfill y
-- dentro de esta transacción, trg_sync_player_columns (024/059): en cualquier
-- UPDATE rellena con 0 las metric_* que estén a NULL, y un backfill que solo
-- cambia birth_date no debe fabricar ceros (invariante #2).
--
-- Idempotente. NO toca PHV/bio-banding ni sus fórmulas (invariante #4): la edad
-- decimal de maduración ya sale de data->>'birthDate', que aquí no cambia.
-- =====================================================================

BEGIN;

-- 0) Defensivo: 036 crea la columna. Si faltara, se crea igual (sin DEFAULT).
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS birth_date DATE;

-- 1) Parser estricto, temporal (se borra al final). Misma regla que toIsoBirthDate.
CREATE OR REPLACE FUNCTION public._vitas_071_iso_birth_date(p_raw text)
RETURNS date
LANGUAGE plpgsql
AS $$
DECLARE
  d date;
BEGIN
  IF p_raw IS NULL OR p_raw !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN NULL;
  END IF;
  BEGIN
    d := to_date(p_raw, 'YYYY-MM-DD');
  EXCEPTION WHEN others THEN
    RETURN NULL; -- mes 13, día 32, 2014-02-30… ⇒ no es una fecha real
  END;
  -- Ida y vuelta exacta: descarta cualquier normalización silenciosa de to_date.
  IF to_char(d, 'YYYY-MM-DD') <> p_raw THEN
    RETURN NULL;
  END IF;
  IF d < DATE '1900-01-01' OR d >= CURRENT_DATE THEN
    RETURN NULL;
  END IF;
  RETURN d;
END;
$$;

-- 2) Informe previo (solo lectura) para el operador.
DO $$
DECLARE
  v_fill      int;
  v_minors    int;
  v_adults_decided int;
  v_invalid   int;
  v_col_only  int;
  v_conflict  int;
BEGIN
  SELECT count(*) INTO v_fill
    FROM public.players
   WHERE birth_date IS NULL
     AND public._vitas_071_iso_birth_date(data->>'birthDate') IS NOT NULL;

  SELECT count(*) INTO v_minors
    FROM public.players
   WHERE birth_date IS NULL
     AND public._vitas_071_iso_birth_date(data->>'birthDate') IS NOT NULL
     AND EXTRACT(YEAR FROM AGE(NOW(), public._vitas_071_iso_birth_date(data->>'birthDate'))) < 14;

  SELECT count(*) INTO v_adults_decided
    FROM public.players
   WHERE birth_date IS NULL
     AND public._vitas_071_iso_birth_date(data->>'birthDate') IS NOT NULL
     AND EXTRACT(YEAR FROM AGE(NOW(), public._vitas_071_iso_birth_date(data->>'birthDate'))) >= 14
     AND parental_consent_status IN ('granted', 'denied');

  SELECT count(*) INTO v_invalid
    FROM public.players
   WHERE birth_date IS NULL
     AND data ? 'birthDate'
     AND public._vitas_071_iso_birth_date(data->>'birthDate') IS NULL;

  -- Columna con fecha pero blob sin fecha válida: el cliente nuevo proyecta el
  -- blob → la columna, así que el próximo guardado la dejaría en NULL. Debería
  -- ser 0 (antes de esta PR nada escribía birth_date). Si no lo es, revisar a
  -- mano ANTES de desplegar el cliente.
  SELECT count(*) INTO v_col_only
    FROM public.players
   WHERE birth_date IS NOT NULL
     AND public._vitas_071_iso_birth_date(data->>'birthDate') IS NULL;

  SELECT count(*) INTO v_conflict
    FROM public.players
   WHERE birth_date IS NOT NULL
     AND public._vitas_071_iso_birth_date(data->>'birthDate') IS NOT NULL
     AND public._vitas_071_iso_birth_date(data->>'birthDate') <> birth_date;

  RAISE NOTICE '071 birth_date: % filas a rellenar (% menores de 14 → quedan/pasan a pending si no había decisión)', v_fill, v_minors;
  RAISE NOTICE '071 birth_date: % filas de 14+ con consentimiento granted/denied pasarán a not_required (lógica 036:41-43)', v_adults_decided;
  RAISE NOTICE '071 birth_date: % filas con data.birthDate no válido → birth_date queda NULL', v_invalid;
  RAISE NOTICE '071 birth_date: % filas con birth_date sin fecha válida en el blob · % con fecha distinta en blob y columna (NO se tocan; revisar)', v_col_only, v_conflict;
END;
$$;

-- 3) Sin trg_sync_player_columns durante el backfill (no fabricar metric_* = 0).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_sync_player_columns'
       AND tgrelid = 'public.players'::regclass
  ) THEN
    ALTER TABLE public.players DISABLE TRIGGER trg_sync_player_columns;
  END IF;
END;
$$;

-- 4) Backfill. Dispara trg_check_parental_consent (UPDATE OF birth_date).
UPDATE public.players
   SET birth_date = public._vitas_071_iso_birth_date(data->>'birthDate')
 WHERE birth_date IS NULL
   AND public._vitas_071_iso_birth_date(data->>'birthDate') IS NOT NULL;

-- 5) Restaurar el trigger de sincronización.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_sync_player_columns'
       AND tgrelid = 'public.players'::regclass
  ) THEN
    ALTER TABLE public.players ENABLE TRIGGER trg_sync_player_columns;
  END IF;
END;
$$;

-- 6) Quitar el parser temporal.
DROP FUNCTION IF EXISTS public._vitas_071_iso_birth_date(text);

COMMENT ON COLUMN public.players.birth_date IS
  'Fecha de nacimiento DEL JUGADOR (proyección de data->>''birthDate'' por '
  'toIsoBirthDate). La lee el control RGPD de consentimiento parental (036). '
  'NULL = sin fecha válida; nunca se inventa.';

COMMIT;
