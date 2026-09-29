-- =====================================================================
-- 069 · Gate único de PHV (regla del owner 28-sep) + archivo de insights
--        con afirmaciones de maduración anteriores a #156
-- =====================================================================
-- Regla del owner: «si no están todas las métricas para PHV no se puede
-- calcular». El PHV (offset Mirwald / APHV / categoría) solo existe con talla,
-- peso, talla sentado, pierna, edad DECIMAL desde la fecha de nacimiento del
-- jugador y sexo registrado. Un players.phv_category / phv_offset persistido solo
-- cuenta si viene de una fila COMPLETA de player_anthropometrics calculada con
-- esa edad exacta. El gate vive en src/lib/phv/phvGate.ts (invariante #7).
--
-- Hasta hoy ninguna fila cumplía eso:
--   · api/players/anthropometrics.ts calculaba Mirwald con el ENTERO player.age
--     (PlayerPhvSection.tsx:99 → anthropometrics.ts:336,354) — no con la fecha;
--   · el cliente (pushOne / _crud) volcaba a players.phv_category/phv_offset lo
--     que tuviera su blob (incl. el agente PHV legacy que sobrescribía el VSI), y
--     el trigger sync_player_columns_from_jsonb() re-copiaba data->>'phvCategory'
--     en cada INSERT/UPDATE con la columna a NULL.
--
-- Esta migración (idempotente, SIN borrar filas, SIN tocar fórmulas — inv #4):
--   1) player_anthropometrics: + age_source ('birth_date' | 'integer_age') y
--      + phv_gate_reason (motivo cuando el endpoint bloquea el PHV). Las filas
--      antiguas quedan con age_source NULL ⇒ NO fiables para PHV (se conservan
--      como histórico de medidas). La vista player_latest_anthropometrics añade
--      ambas columnas AL FINAL (CREATE OR REPLACE: se conservan grants).
--      1b) CREATE OR REPLACE VIEW NO conserva las OPCIONES de la vista: las
--      reemplaza por las del statement (ninguna). Si 072 (rama
--      fix/revoke-definer-rpc-execute: security_invoker = true + REVOKE a
--      anon/authenticated) ya estaba aplicada, re-ejecutar 069 devolvía la vista a
--      derechos del DUEÑO (salta la RLS de player_anthropometrics). Por eso 069
--      re-fija security_invoker = true justo después, en la misma transacción,
--      solo en PG15+ (antes la opción no existe; un WITH sin condición abortaría
--      069 entero). Los REVOKE de 072 sobreviven al CREATE OR REPLACE (la ACL se
--      conserva). VERIFICADO SOLO EN SIMULACIÓN (PGlite 18.3; cadena 000-066, en
--      la que 7 ficheros ajenos fallan en PGlite; + 069 + borrador de 072 + 069
--      otra vez): tras la re-ejecución la vista sigue con security_invoker=true,
--      anon/authenticated sin SELECT, service_role lee sus filas y el backfill (3)
--      conserva el PHV respaldado por una fila fiable, también ejecutando 069 con
--      un rol dueño sin superusuario ni BYPASSRLS. Verificado en el
--      código (grep): los 7 lectores de la vista (api/agents/_pipeline-
--      orchestrator, api/crons/process-analyses-queue, api/pipeline/_gemini-
--      analyze, api/players/{anthropometrics,baseline-analysis,phv-window-plan},
--      api/transfer/_create-listing) usan SUPABASE_SERVICE_ROLE_KEY y ningún
--      código de src/ la lee. NO VERIFICADO: versión de Postgres, grants y
--      reloptions de producción. En PG<15 este paso no hace nada y lo único que
--      cierra la vista a anon/authenticated es el REVOKE de 072.
--   2) sync_player_columns_from_jsonb(): deja de copiar phv_category/phv_offset
--      desde el blob (resto de columnas byte-idéntico a 059) y solo deja
--      cambiarlas a escrituras service_role. Esas columnas pasan a ser propiedad
--      EXCLUSIVA del endpoint gateado de antropometría.
--   3) players: el phv_category/phv_offset legacy (ninguno calculado con edad por
--      fecha) se COPIA a players.phv_legacy (jsonb, auditable) y se anula. Todos
--      los lectores servidor de esas columnas (Telegram, comparador de rival,
--      benchmark de pares, baseline de equipo…) pasan así a ver NULL = «sin PHV»
--      en vez de una categoría fabricada. Los triggers de updated_at / sync se
--      desactivan SOLO durante ese backfill (no es una edición del usuario: no
--      debe mover updated_at ni la sincronización offline del cliente).
--      3b) Igual para player_metric_snapshots.phv_offset/phv_category (serie
--      «PHV offset» del histórico, calculada con edad entera).
--      RE-EJECUTABLE: el criterio no es «aún sin archivar» sino «NO respaldado
--      por una fila FIABLE de player_anthropometrics» (misma regla que
--      trustAnthropometricsRow en src/lib/phv/phvGate.ts). Si 069 se aplicó antes
--      del despliegue y código antiguo re-escribió la columna, volver a ejecutarla
--      archiva lo re-contaminado y conserva lo que escribió el endpoint gateado.
--      phv_legacy nunca se pisa: la 1.ª copia se conserva y las siguientes se
--      añaden a phv_legacy->'rearchived'.
--
-- ORDEN DEL OPERADOR: primero desplegar el código de este PR, DESPUÉS aplicar
-- esta migración (el código degrada sin ella: sin age_source ninguna fila es
-- fiable ⇒ PHV oculto). Aplicarla antes deja al código antiguo re-escribir
-- players.phv_category desde el blob con service_role; si ocurrió, basta con
-- volver a ejecutarla tras el despliegue.
-- CON 072: el orden previsto es 069 y después 072. Si 072 ya está aplicada y se
-- vuelve a ejecutar 069, ver 1b): en PG15+ 069 re-fija security_invoker y los
-- REVOKE de 072 se conservan (simulación PGlite; en producción no verificado).
--   4) scout_insights: + archived_at / archived_reason (archivo de SISTEMA,
--      distinto del is_archived que pulsa el usuario) y se archivan las filas
--      creadas ANTES de #156 que mencionan maduración/PHV en su texto visible.
--      Hasta #156 (PR mergeado 2026-08-26T11:06:01Z, commit 1a1cc40)
--      api/scout/generate.ts mandaba al LLM el phv_category/phv_offset
--      PERSISTIDOS sin validar; para un menor sin medidas el LLM los citaba como
--      hecho (p.ej. «categoría PHV early y offset −1.2», «Sub-10 con early-PHV»).
--      #156 solo arregló los insights NUEVOS. Corte = merge + margen de despliegue
--      de Vercel → 2026-08-26 12:00 UTC (conservador: archiva de más, nunca de
--      menos). La API (/api/scout/insights) oculta del feed las filas con
--      archived_at. No se borra ninguna fila (inv #8: el dato queda auditable).
-- =====================================================================

BEGIN;

-- 1) Procedencia de la edad en cada medición ─────────────────────────────
ALTER TABLE public.player_anthropometrics
  ADD COLUMN IF NOT EXISTS age_source text
    CHECK (age_source IS NULL OR age_source IN ('birth_date', 'integer_age')),
  ADD COLUMN IF NOT EXISTS phv_gate_reason text;

COMMENT ON COLUMN public.player_anthropometrics.age_source IS
  '''birth_date'' = chronological_age es la edad DECIMAL desde la fecha de nacimiento del jugador en measured_at (única fuente válida para PHV). ''integer_age'' = edad entera (PHV bloqueado). NULL = fila anterior a 069 (PHV no fiable).';
COMMENT ON COLUMN public.player_anthropometrics.phv_gate_reason IS
  'Motivo por el que el PHV de esta medición es NULL (p.ej. ''Falta: fecha de nacimiento del jugador'').';

-- Mismas columnas y orden que 053 + las dos nuevas AL FINAL (permitido por
-- CREATE OR REPLACE VIEW; no hace falta DROP y se conservan los permisos, pero
-- NO las opciones de la vista: ver 1b justo debajo).
CREATE OR REPLACE VIEW public.player_latest_anthropometrics AS
SELECT DISTINCT ON (player_id)
  id,
  tenant_id,
  player_id,
  height_cm,
  weight_kg,
  sitting_height_cm,
  leg_length_cm,
  chronological_age,
  maturity_offset,
  phv_category,
  phv_status,
  development_window,
  measured_at,
  age_source,
  phv_gate_reason
FROM public.player_anthropometrics
ORDER BY player_id, measured_at DESC;

-- 1b) El CREATE OR REPLACE de arriba acaba de BORRAR las opciones de la vista
-- (p.ej. security_invoker = true puesto por 072; visto en simulación PGlite
-- 18.3 con el 069 anterior a este cambio). Se re-fija aquí para que 069
-- nunca deje la vista con derechos del dueño. PG15+ solo; EXECUTE para que en
-- PG<15 el bloque no llegue a analizar la opción y 069 no se aborte.
-- El backfill (3) lee esta vista como quien ejecuta la migración, que tiene que
-- ser su dueño (o miembro del rol dueño) para poder hacer el CREATE OR REPLACE:
-- con o sin security_invoker se comprueban los derechos de ese mismo rol
-- (simulación PGlite con un dueño sin BYPASSRLS: mismo resultado del backfill).
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    EXECUTE 'ALTER VIEW public.player_latest_anthropometrics SET (security_invoker = true)';
  END IF;
END $$;

COMMENT ON VIEW public.player_latest_anthropometrics IS
  'Última medida antropométrica por jugador (+ age_source / phv_gate_reason, 069).';

-- 2) El trigger deja de re-inyectar la categoría PHV del blob y PROTEGE las
--    columnas: solo una escritura con rol service_role (los endpoints servidor;
--    de ellos, solo api/players/anthropometrics.ts las incluye — _crud las
--    retira) puede cambiar phv_category/phv_offset. Un upsert del cliente
--    (pushOne con la anon key + JWT de usuario) conserva el valor anterior en
--    UPDATE y deja NULL en INSERT. Así el blob del navegador nunca vuelve a
--    contaminar la columna que leen Telegram, benchmark, rival y baseline.
CREATE OR REPLACE FUNCTION sync_player_columns_from_jsonb()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  jwt_role text := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
BEGIN
  IF jwt_role IS DISTINCT FROM 'service_role' THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.phv_category := OLD.phv_category;
      NEW.phv_offset   := OLD.phv_offset;
    ELSE
      NEW.phv_category := NULL;
      NEW.phv_offset   := NULL;
    END IF;
  END IF;

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
    -- invariante #5: sin fallback 'M' (058)
    NEW.gender            := COALESCE(NEW.gender, NEW.data->>'gender');
    NEW.metric_speed      := COALESCE(NEW.metric_speed, (NEW.data->'metrics'->>'speed')::numeric, 0);
    NEW.metric_technique  := COALESCE(NEW.metric_technique, (NEW.data->'metrics'->>'technique')::numeric, 0);
    NEW.metric_vision     := COALESCE(NEW.metric_vision, (NEW.data->'metrics'->>'vision')::numeric, 0);
    NEW.metric_stamina    := COALESCE(NEW.metric_stamina, (NEW.data->'metrics'->>'stamina')::numeric, 0);
    NEW.metric_shooting   := COALESCE(NEW.metric_shooting, (NEW.data->'metrics'->>'shooting')::numeric, 0);
    NEW.metric_defending  := COALESCE(NEW.metric_defending, (NEW.data->'metrics'->>'defending')::numeric, 0);
    -- invariante #2: sin fallback 0 (059)
    NEW.vsi               := COALESCE(NEW.vsi, (NEW.data->>'vsi')::numeric);
    -- 069: phv_category / phv_offset YA NO se copian del blob. Son propiedad del
    -- endpoint gateado de antropometría (fila completa + edad por fecha + sexo).
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_player_columns_from_jsonb() IS
  'Sincroniza columnas planas desde el blob data en INSERT/UPDATE. gender SIN '
  'fallback ''M'' (inv #5), vsi SIN fallback 0 (inv #2) y SIN copiar '
  'phv_category/phv_offset del blob; esas dos columnas solo cambian con rol '
  'service_role (069: las escribe el endpoint gateado de antropometría).';

-- 3) PHV legacy: copia auditable + anulación ─────────────────────────────
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS phv_legacy jsonb;

COMMENT ON COLUMN public.players.phv_legacy IS
  'Copia auditable del phv_category/phv_offset anulado por 069 (no respaldado por una fila fiable de player_anthropometrics; las re-ejecuciones se añaden en ''rearchived''). No se lee en ninguna superficie.';

-- Backfill de sistema: sin mover updated_at ni re-sincronizar columnas.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'players_updated_at'
             AND tgrelid = 'public.players'::regclass) THEN
    ALTER TABLE public.players DISABLE TRIGGER players_updated_at;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_player_columns'
             AND tgrelid = 'public.players'::regclass) THEN
    ALTER TABLE public.players DISABLE TRIGGER trg_sync_player_columns;
  END IF;
END $$;

-- Se anula todo PHV de la columna que NO coincida con la ÚLTIMA fila FIABLE del
-- jugador: 4 medidas (pierna introducida o talla > talla sentado), edad por fecha
-- de nacimiento (age_source), offset y categoría. En la 1.ª ejecución ninguna fila
-- tiene age_source ⇒ se archiva todo; al re-ejecutar se conserva lo gateado.
UPDATE public.players p
SET phv_legacy = CASE
      WHEN p.phv_legacy IS NULL THEN jsonb_build_object(
        'phv_category', p.phv_category,
        'phv_offset',   p.phv_offset,
        'archived_at',  now(),
        'reason',       'pre_069_untrusted_inputs'
      )
      ELSE p.phv_legacy || jsonb_build_object(
        'rearchived',
        COALESCE(p.phv_legacy -> 'rearchived', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'phv_category', p.phv_category,
          'phv_offset',   p.phv_offset,
          'archived_at',  now(),
          'reason',       'not_backed_by_trusted_row'
        ))
      )
    END,
    phv_category = NULL,
    phv_offset   = NULL
WHERE (p.phv_category IS NOT NULL OR p.phv_offset IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM public.player_latest_anthropometrics a
    WHERE a.player_id = p.id
      AND a.age_source = 'birth_date'
      AND a.height_cm IS NOT NULL
      AND a.weight_kg IS NOT NULL
      AND a.sitting_height_cm IS NOT NULL
      AND (a.leg_length_cm IS NOT NULL OR a.height_cm > a.sitting_height_cm)
      AND a.maturity_offset IS NOT NULL
      AND a.phv_category IS NOT NULL
      AND p.phv_offset = a.maturity_offset
      AND (CASE p.phv_category WHEN 'ontme' THEN 'ontime' ELSE p.phv_category END) = a.phv_category
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'players_updated_at'
             AND tgrelid = 'public.players'::regclass) THEN
    ALTER TABLE public.players ENABLE TRIGGER players_updated_at;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_player_columns'
             AND tgrelid = 'public.players'::regclass) THEN
    ALTER TABLE public.players ENABLE TRIGGER trg_sync_player_columns;
  END IF;
END $$;

-- 3b) Snapshots longitudinales: el «PHV offset» que pinta SnapshotHistoryChart
--     salía del maturity_offset de filas con edad ENTERA (orquestador). Misma
--     regla: copia auditable + anulación. Desde este PR el orquestador solo
--     escribe PHV de filas fiables (gateAnthropometricsRow). Re-ejecutable igual
--     que 3): se conserva el PHV de un snapshot solo si coincide con ALGUNA fila
--     fiable del jugador (el snapshot es histórico, no tiene por qué ser la última).
DO $$
BEGIN
  IF to_regclass('public.player_metric_snapshots') IS NOT NULL THEN
    ALTER TABLE public.player_metric_snapshots ADD COLUMN IF NOT EXISTS phv_legacy jsonb;
    UPDATE public.player_metric_snapshots s
    SET phv_legacy = CASE
          WHEN s.phv_legacy IS NULL THEN jsonb_build_object(
            'phv_category', s.phv_category, 'phv_offset', s.phv_offset,
            'archived_at', now(), 'reason', 'pre_069_untrusted_inputs')
          ELSE s.phv_legacy || jsonb_build_object(
            'rearchived',
            COALESCE(s.phv_legacy -> 'rearchived', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
              'phv_category', s.phv_category, 'phv_offset', s.phv_offset,
              'archived_at', now(), 'reason', 'not_backed_by_trusted_row')))
        END,
        phv_category = NULL,
        phv_offset   = NULL
    WHERE (s.phv_category IS NOT NULL OR s.phv_offset IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1
        FROM public.player_anthropometrics a
        WHERE a.player_id = s.player_id
          AND a.age_source = 'birth_date'
          AND a.height_cm IS NOT NULL
          AND a.weight_kg IS NOT NULL
          AND a.sitting_height_cm IS NOT NULL
          AND (a.leg_length_cm IS NOT NULL OR a.height_cm > a.sitting_height_cm)
          AND a.maturity_offset IS NOT NULL
          AND a.phv_category IS NOT NULL
          -- phv_offset es REAL en snapshots; maturity_offset numeric(4,2).
          AND round(s.phv_offset::numeric, 2) = a.maturity_offset
          AND (CASE s.phv_category WHEN 'ontme' THEN 'ontime' ELSE s.phv_category END) = a.phv_category
      );
  END IF;
END $$;

-- 4) scout_insights: archivo de sistema de los insights pre-#156 con PHV ──
ALTER TABLE public.scout_insights
  ADD COLUMN IF NOT EXISTS archived_at     timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text;

COMMENT ON COLUMN public.scout_insights.archived_at IS
  'Archivo de SISTEMA (no del usuario): la fila se conserva pero no se muestra en el feed. Ver archived_reason.';
COMMENT ON COLUMN public.scout_insights.archived_reason IS
  'Motivo del archivo de sistema. ''phv_pre_gate_156'' = afirmaciones de maduración generadas antes del gate PHV del ScoutFeed (#156).';

-- Solo el texto VISIBLE de la tarjeta (context_data no se pinta salvo posición,
-- edad y VSI: no cuenta como «mención»).
UPDATE public.scout_insights
SET archived_at     = now(),
    archived_reason = 'phv_pre_gate_156'
WHERE archived_at IS NULL
  AND created_at < timestamptz '2026-08-26 12:00:00+00'
  AND (
        insight_type = 'phv-alert'
     OR concat_ws(' ',
          title, description, metric, metric_value, benchmark,
          array_to_string(tags, ' '),
          action_items::text, rag_drills::text
        ) ~* '(phv|estir[oó]n|madur|maturity|maturation|growth spurt|offset|pre-pico|post-pico)'
  );

-- Índice parcial para el feed (solo no archivadas por sistema).
CREATE INDEX IF NOT EXISTS idx_scout_insights_user_live
  ON public.scout_insights (user_id, created_at DESC)
  WHERE archived_at IS NULL;

COMMIT;
