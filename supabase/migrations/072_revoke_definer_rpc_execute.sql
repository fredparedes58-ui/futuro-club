-- =====================================================================
-- 072 · Cerrar la clase «SECURITY DEFINER / permisos del dueño»
--        · RPC solo-servidor: fuera anon/authenticated (solo service_role)
--        · DSAR (exportar / pedir borrado): firma TEXT + solo el dueño
--        · vistas del esquema public: security_invoker + fuera anon
--        · políticas USING/WITH CHECK (true) sin rol → TO service_role
-- =====================================================================
-- ESTADO DE LA EVIDENCIA (léelo antes de aplicar)
--
-- VERIFICADO (y cómo):
--   · Repositorio (origin/main cdb1a8f, lectura de ficheros):
--       - Ninguna migración revoca a anon/authenticated las funciones SECURITY
--         DEFINER de 002 (match_knowledge, search_knowledge_text), 021/059
--         (get_ranked_players), 036 (dsar_*), 054 (record_ai_spend,
--         get_ai_spend_month) ni 061 (increment_analyses_used). 054:67-70 y
--         061:36-37 solo revocan a PUBLIC.
--       - Ninguna de las 14 vistas de main usa security_invoker ni revoca permisos
--         (004, 005/053, 008, 036, 037, 038, 039, 047, 049).
--       - players.id es TEXT (000_full_schema.sql:9, 001_players.sql:10), igual que
--         videos.player_id (000:26), player_analyses.player_id (000:99),
--         tracking_sessions.player_id (009:7) y consent_audit_log.player_id
--         (036:125). La firma dsar_*(p_player_id UUID) de 036 no puede funcionar.
--       - Todos los llamadores de servidor de las RPC/vistas que aquí se cierran
--         usan SUPABASE_SERVICE_ROLE_KEY: budgetGuard.ts:58, usageGuard.ts:56,
--         rankings/_list.ts:86, rag/_query.ts:35 (la PR quita su fallback a la clave
--         anon), billing/status.ts:16, crons/process-analyses-queue.ts:42,
--         crons/rescue-tracking-jobs.ts (serviceHeaders), delete-me.ts:31,
--         verify-consent.ts:33, data-retention.ts:30, identify-player.ts:25.
--       - Lectores de NAVEGADOR afectados: /admin/bias (BiasAuditDashboard.tsx:113,
--         120,127 → v_bias_*), /admin/consent (ParentalConsentPage.tsx:324,348 →
--         dsar_*), /players/:id/evolution (useMetricSnapshots.ts:41 → tabla
--         player_metric_snapshots, solo SELECT). Rutas bajo ProtectedRoute
--         (App.tsx:236,237,253).
--   · Lint estático src/test/migrations/securityDefinerGrants.test.ts: ROJO sin
--     esta migración (30 exposiciones: 8 DEFINER ejecutables por anon/authenticated,
--     8 DEFINER sin search_path, 14 vistas legibles por anon) y VERDE con ella; en
--     vuelo 067/069/070/071 también pasan con 072.
--   · SIMULACIÓN PGlite 0.5.8 / PostgreSQL 18.3 (NO es la base de datos real):
--     cadena 000..066 + 067/069/070 + 072 + 071 con roles anon/authenticated/
--     service_role, default privileges de Supabase y auth.uid()/auth.jwt()
--     simulados. Resultado: anon denegado en las RPC, vistas y tablas de abajo;
--     authenticated exporta/pide borrar SOLO su jugador (o el de su tenant);
--     service_role puede todo; /admin/bias sigue cargando (con las cifras de sus
--     jugadores); 072 corre dos veces sin error y deja el MISMO estado de permisos
--     con y sin el script de emergencia aplicado antes; también con 044/047/049/
--     052/054/061 ausentes y con vector en «extensions».
--
-- NO VERIFICADO (no se ha consultado la base de datos de producción):
--   · Los permisos reales de producción. La exposición se DEDUCE del repositorio
--     y de los default privileges de Supabase (EXECUTE/SELECT explícitos a anon y
--     authenticated en cada objeto nuevo; REVOKE ... FROM PUBLIC no los quita).
--   · Qué migraciones están aplicadas (054, 061, 044, 047, 049, 030, 052…). Por
--     eso TODO va protegido con to_regprocedure/to_regclass: si el objeto no
--     existe, se salta.
--   · Que SUPABASE_SERVICE_ROLE_KEY esté configurada en Vercel.
--   · La versión de Postgres (security_invoker exige 15+; si es menor se omite,
--     se avisa con NOTICE y el REVOKE protege igual).
--   · El esquema donde vive la extensión vector (se detecta al ejecutar).
--   · Que service_role tenga BYPASSRLS y SELECT sobre las tablas base de las
--     vistas (default de Supabase; el backend ya lee esas tablas directamente,
--     p. ej. anthropometrics.ts:138, _webhook.ts:75).
--   · Si existen en producción funciones creadas a mano fuera de las migraciones
--     (get_user_email, exec_sql…). Si existen, se revocan (bloque A10) y el final
--     de la migración lista con WARNING lo que siga abierto a anon.
--
-- ORDEN DEL OPERADOR: 067 → 069 → 070 → 072 → 071.
--   · Después de 069: 069 hace CREATE OR REPLACE VIEW player_latest_anthropometrics
--     SIN cláusula WITH, lo que quita security_invoker (el REVOKE sí se conserva).
--     Si alguna vez se re-ejecuta 069 tras 072, volver a ejecutar 072.
--   · Antes de 071: 071 rellena players.birth_date, que es lo que llena la vista
--     v_players_ai_blocked (nombre + fecha de nacimiento de menores de 14 sin
--     consentimiento). Esta migración la cierra a anon/authenticated.
--   · Es idempotente y funciona se haya aplicado o no antes el script de
--     emergencia (01_emergencia_cerrar_anon.sql): solo hace REVOKE/GRANT/ALTER,
--     DROP/CREATE de las DSAR y DROP/CREATE de políticas con IF EXISTS.
--
-- NO toca PHV ni bio-banding (invariante #4): ninguna fórmula, ninguna fila y
-- ningún cuerpo de vista cambia; sobre player_latest_anthropometrics solo se
-- cambian permisos y la opción security_invoker.
-- =====================================================================

BEGIN;

-- 0) search_path LOCAL de esta transacción: incluye el esquema de la extensión
--    vector para que la firma match_knowledge(vector, …) se resuelva aunque la
--    extensión viva en «extensions» (no verificado dónde vive en producción).
DO $$
DECLARE
  v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'vector';
  IF v_schema IS NOT NULL AND v_schema <> 'public' THEN
    PERFORM set_config('search_path', format('public, %I', v_schema), true);
  END IF;
END $$;

-- =====================================================================
-- A) RPC que SOLO llama el backend (service_role)
--    REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT service_role.
--    service_role tiene BYPASSRLS (deducido), así que SECURITY DEFINER no le
--    aporta nada: basta con que nadie más pueda ejecutarlas.
-- =====================================================================
DO $$
BEGIN
  -- A1/A2 · 054. Exposición deducida: anon inflaba el gasto del mes
  --   (record_ai_spend) → el tripwire cortaba la IA de pago a todos; y leía el
  --   gasto total (get_ai_spend_month). search_path ya fijado en 054.
  IF to_regprocedure('public.record_ai_spend(text, numeric)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.record_ai_spend(text, numeric) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.record_ai_spend(text, numeric) TO service_role;
  END IF;
  IF to_regprocedure('public.get_ai_spend_month()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.get_ai_spend_month() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_ai_spend_month() TO service_role;
  END IF;

  -- A3 · 061. Exposición deducida: sumar +1 a la cuota mensual de CUALQUIER
  --   usuario (p_user_id libre). search_path ya fijado en 061.
  IF to_regprocedure('public.increment_analyses_used(uuid, text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.increment_analyses_used(uuid, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.increment_analyses_used(uuid, text) TO service_role;
  END IF;

  -- A4 · 021/059. Exposición deducida (la más grave): con la clave anon y el UUID
  --   de un entrenador devolvía TODOS sus jugadores (nombre, edad, blob data con
  --   fecha de nacimiento y antropometría) saltando la RLS. p_limit NO se recorta:
  --   #301 pide hasta 100000 filas con filtro PHV (api/rankings/_list.ts).
  IF to_regprocedure('public.get_ranked_players(uuid, text, text, integer, integer, text, text, text, text, text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.get_ranked_players(uuid, text, text, integer, integer, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_ranked_players(uuid, text, text, integer, integer, text, text, text, text, text) TO service_role;
    ALTER FUNCTION public.get_ranked_players(uuid, text, text, integer, integer, text, text, text, text, text) SET search_path = public, pg_temp;
  END IF;

  -- A6 · 002. Búsqueda de texto del RAG: anon leía knowledge_base saltando su RLS
  --   (que solo permite authenticated). Solo la llama api/rag/_query.ts.
  IF to_regprocedure('public.search_knowledge_text(text, integer, text, text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.search_knowledge_text(text, integer, text, text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.search_knowledge_text(text, integer, text, text) TO service_role;
    ALTER FUNCTION public.search_knowledge_text(text, integer, text, text) SET search_path = public, pg_temp;
  END IF;

  -- A7 · 040/052 (SECURITY INVOKER). Deducido de la RLS de analyses (003/055): con
  --   JWT de tenant, un cliente podía marcar como 'processing' los análisis en cola
  --   de su tenant y el cron los saltaba. Solo los llaman los crons con service_role
  --   (process-analyses-queue.ts:264, rescue-tracking-jobs.ts:109).
  IF to_regprocedure('public.claim_queued_analyses(integer)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.claim_queued_analyses(integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.claim_queued_analyses(integer) TO service_role;
    ALTER FUNCTION public.claim_queued_analyses(integer) SET search_path = public, pg_temp;
  END IF;
  IF to_regprocedure('public.claim_queued_tracking_jobs(integer)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.claim_queued_tracking_jobs(integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.claim_queued_tracking_jobs(integer) TO service_role;
    ALTER FUNCTION public.claim_queued_tracking_jobs(integer) SET search_path = public, pg_temp;
  END IF;

  -- A8 · 003 (INVOKER, sin llamadores: el cron data-retention purga en TS).
  IF to_regprocedure('public.run_data_retention_purge()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.run_data_retention_purge() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.run_data_retention_purge() TO service_role;
    ALTER FUNCTION public.run_data_retention_purge() SET search_path = public, pg_temp;
  END IF;

  -- A9 · 003 log_gdpr_action (INVOKER). Cualquier authenticated podía escribir
  --   filas arbitrarias en el registro RGPD (usuario, tenant, acción, IP). Sus
  --   llamadores RPC usan service_role (delete-me.ts, verify-consent.ts,
  --   data-retention.ts, identify-player.ts). La llaman además los triggers
  --   audit_consent_changes (003, parental_consents) y audit_subscription_changes
  --   (008, subscriptions), que se QUEDAN como SECURITY INVOKER a propósito:
  --   · con service_role (los escritores del código: sign-consent.ts,
  --     verify-consent.ts, stripe/_webhook.ts) siguen auditando igual;
  --   · una escritura DIRECTA de cliente en parental_consents ya fallaba antes de
  --     072 (simulación PGlite: el INSERT ... RETURNING de log_gdpr_action choca
  --     con audit_read_own → 42501) y tras 072 sigue fallando (42501, sin
  --     EXECUTE). Hacerlos DEFINER habría ABIERTO esa escritura. No hay ningún
  --     escritor de cliente de esas tablas en src/ (grep).
  IF to_regprocedure('public.log_gdpr_action(uuid, uuid, text, text, text, jsonb, inet)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.log_gdpr_action(uuid, uuid, text, text, text, jsonb, inet) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.log_gdpr_action(uuid, uuid, text, text, text, jsonb, inet) TO service_role;
    ALTER FUNCTION public.log_gdpr_action(uuid, uuid, text, text, text, jsonb, inet) SET search_path = public, pg_temp;
  END IF;
END $$;

-- A5 · 002 match_knowledge (búsqueda vectorial del RAG; mismo caso que A6).
--   search_path incluye «extensions» por si pgvector vive ahí; si vive en otro
--   esquema, se añade ese (EXECUTE) para no romper el operador <=>.
DO $$
DECLARE
  v_schema text;
BEGIN
  IF to_regtype('vector') IS NOT NULL THEN
    IF to_regprocedure('public.match_knowledge(vector, double precision, integer, text, text)') IS NOT NULL THEN
      REVOKE EXECUTE ON FUNCTION public.match_knowledge(vector, double precision, integer, text, text) FROM PUBLIC, anon, authenticated;
      GRANT EXECUTE ON FUNCTION public.match_knowledge(vector, double precision, integer, text, text) TO service_role;
      ALTER FUNCTION public.match_knowledge(vector, double precision, integer, text, text) SET search_path = public, extensions, pg_temp;
      SELECT n.nspname INTO v_schema
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE t.oid = to_regtype('vector');
      IF v_schema NOT IN ('public', 'extensions') THEN
        EXECUTE format(
          'ALTER FUNCTION public.match_knowledge(vector, double precision, integer, text, text) SET search_path = public, %I, pg_temp',
          v_schema);
        RAISE NOTICE '072: vector vive en %; añadido al search_path de match_knowledge', v_schema;
      END IF;
    END IF;
  END IF;
END $$;

-- A10 · Funciones que el código llama pero que NO están en ninguna migración del
--   repositorio (usageGuard.ts:129 get_user_email, scripts/migrate.sh:69 exec_sql,
--   api/__tests__/rls-isolation.test.ts exec_sql_admin / create_test_player_for_rls).
--   No verificado si existen en producción. Si existen, se cierran a
--   PUBLIC/anon/authenticated (todos sus llamadores usan service_role). No se
--   toca su search_path: su cuerpo no está en el repositorio.
DO $$
DECLARE
  f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('get_user_email', 'exec_sql', 'exec_sql_admin', 'create_test_player_for_rls')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    RAISE NOTICE '072: % no está en las migraciones del repo; revocada a PUBLIC/anon/authenticated', f;
  END LOOP;
END $$;

-- =====================================================================
-- B) DSAR (RGPD art. 15 y 17) · /admin/consent → ParentalConsentPage
--    036 declaraba p_player_id UUID contra players.id TEXT: toda llamada fallaba
--    (22P02 / 42883) y NO tenía comprobación de dueño, así que corregir solo el
--    tipo habría dado a la clave anon el expediente completo de cualquier menor.
--    Se reemplazan por versiones TEXT limitadas al dueño. CREATE OR REPLACE no
--    puede cambiar el tipo de un parámetro (crearía una sobrecarga y PostgREST
--    respondería PGRST203), por eso se borran las firmas UUID.
-- =====================================================================
DROP FUNCTION IF EXISTS public.dsar_export_player_data(uuid);
DROP FUNCTION IF EXISTS public.dsar_request_deletion(uuid, text);

-- ¿El llamador gestiona este jugador? Espejo de api/_lib/ownership.ts
-- ownsPlayerOrTenant (misma regla, invariante #7): players.user_id = auth.uid()
-- O players.tenant_id = tenant del JWT (claim raíz tenant_id; si falta,
-- app_metadata.tenant_id, como extractTenantId en api/_lib/auth.ts:34-45).
-- service_role (claim role del JWT firmado) pasa siempre. Pertenecer a la
-- organización (org_id) NO basta, igual que en ownsPlayerOrTenant.
-- INVOKER y revocada a todos: solo la llaman las DSAR (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.dsar_caller_manages_player(p_player_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_role   text  := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), v_claims ->> 'role');
  v_uid    uuid  := auth.uid();
  v_tenant text  := COALESCE(NULLIF(v_claims ->> 'tenant_id', ''), NULLIF(v_claims -> 'app_metadata' ->> 'tenant_id', ''));
  v_ok     boolean := false;
BEGIN
  IF p_player_id IS NULL OR p_player_id = '' THEN
    RETURN false;
  END IF;
  IF v_role = 'service_role' THEN
    RETURN true;
  END IF;
  IF v_uid IS NULL AND v_tenant IS NULL THEN
    RETURN false;
  END IF;
  -- players.tenant_id lo añade 003 (no verificado que exista en producción):
  -- sin la columna, solo cuenta el dueño por user_id.
  IF EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = 'public.players'::regclass
                AND attname = 'tenant_id' AND NOT attisdropped) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.players p
       WHERE p.id::text = p_player_id
         AND ((p.user_id IS NOT NULL AND p.user_id = v_uid)
           OR (p.tenant_id IS NOT NULL AND v_tenant IS NOT NULL AND p.tenant_id::text = v_tenant))
    ) INTO v_ok;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.players p
       WHERE p.id::text = p_player_id
         AND p.user_id IS NOT NULL AND p.user_id = v_uid
    ) INTO v_ok;
  END IF;
  RETURN v_ok;
END;
$$;

COMMENT ON FUNCTION public.dsar_caller_manages_player(text) IS
  '072 · ¿El llamador (JWT) gestiona este jugador? Espejo de ownsPlayerOrTenant (api/_lib/ownership.ts). Solo la usan las DSAR.';

-- Exportación DSAR (art. 15). Mismas claves que 036. «No existe» y «no es tuyo»
-- devuelven el MISMO error (42501) para no permitir sondear qué ids existen.
-- Deja constancia en consent_audit_log con el actor REAL del JWT (nunca del
-- cliente): actor_email = claim email (NULL si el JWT no lo trae; no se inventa).
CREATE OR REPLACE FUNCTION public.dsar_export_player_data(p_player_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid  := auth.uid();
  v_claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_role   text  := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), v_claims ->> 'role');
  v_result jsonb;
BEGIN
  IF NOT public.dsar_caller_manages_player(p_player_id) THEN
    RAISE EXCEPTION 'dsar: jugador no encontrado o sin permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players p WHERE p.id::text = p_player_id) THEN
    RAISE EXCEPTION 'dsar: jugador no encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'export_date', now(),
    'export_type', 'DSAR_access_request',
    'player', (SELECT to_jsonb(p.*) FROM public.players p WHERE p.id::text = p_player_id),
    'analyses', (SELECT COALESCE(jsonb_agg(to_jsonb(pa.*)), '[]'::jsonb)
                   FROM public.player_analyses pa WHERE pa.player_id::text = p_player_id),
    'videos', (SELECT COALESCE(jsonb_agg(to_jsonb(v.*)), '[]'::jsonb)
                 FROM public.videos v WHERE v.player_id::text = p_player_id),
    'tracking_sessions', (SELECT COALESCE(jsonb_agg(to_jsonb(ts.*)), '[]'::jsonb)
                            FROM public.tracking_sessions ts WHERE ts.player_id::text = p_player_id)
  ) INTO v_result;

  INSERT INTO public.consent_audit_log (player_id, action, actor_email, details)
  VALUES (p_player_id, 'data_exported', NULLIF(v_claims ->> 'email', ''),
          jsonb_build_object('actor_user_id', v_uid, 'actor_role', v_role, 'via', 'rpc:dsar_export_player_data'));

  RETURN v_result;
END;
$$;

-- Solicitud de supresión (art. 17): marca players.deletion_requested_* (la
-- revisa una persona; no borra nada) y deja constancia en consent_audit_log.
-- El solicitante sale del JWT (email; si falta, auth.uid()), NUNCA del
-- parámetro. p_requested_by se ignora: solo se conserva (DEFAULT NULL) para que
-- los clientes ya desplegados, que envían {p_player_id, p_requested_by:'admin'},
-- sigan enlazando la función. La primera solicitud no se pisa (la fecha cuenta).
CREATE OR REPLACE FUNCTION public.dsar_request_deletion(p_player_id text, p_requested_by text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid  := auth.uid();
  v_claims jsonb := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  v_role   text  := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), v_claims ->> 'role');
  v_actor  text;
BEGIN
  IF NOT public.dsar_caller_manages_player(p_player_id) THEN
    RAISE EXCEPTION 'dsar: jugador no encontrado o sin permiso' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players p WHERE p.id::text = p_player_id) THEN
    RAISE EXCEPTION 'dsar: jugador no encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_actor := COALESCE(NULLIF(v_claims ->> 'email', ''), v_uid::text,
                      CASE WHEN v_role = 'service_role' THEN 'service_role' END);

  UPDATE public.players
     SET deletion_requested_at = now(),
         deletion_requested_by = v_actor
   WHERE id::text = p_player_id
     AND deletion_requested_at IS NULL;

  INSERT INTO public.consent_audit_log (player_id, action, actor_email, details)
  VALUES (p_player_id, 'deletion_requested', NULLIF(v_claims ->> 'email', ''),
          jsonb_build_object('actor_user_id', v_uid, 'actor_role', v_role, 'via', 'rpc:dsar_request_deletion'));
END;
$$;

-- El REVOKE va DESPUÉS del CREATE: los default privileges vuelven a conceder
-- EXECUTE a anon al crear la función.
REVOKE ALL ON FUNCTION public.dsar_caller_manages_player(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dsar_export_player_data(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dsar_request_deletion(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dsar_export_player_data(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dsar_request_deletion(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.dsar_export_player_data(text) IS
  '072 · Exportación DSAR (RGPD art. 15) solo para el dueño/tenant del jugador o service_role. Registra data_exported en consent_audit_log.';
COMMENT ON FUNCTION public.dsar_request_deletion(text, text) IS
  '072 · Solicitud de supresión (RGPD art. 17) solo para el dueño/tenant o service_role. El solicitante sale del JWT; p_requested_by se ignora.';

-- =====================================================================
-- C) Vistas del esquema public
--    security_invoker = true (se evalúan con los permisos y la RLS de quien
--    consulta) + REVOKE a PUBLIC/anon/authenticated + SELECT a service_role.
--    Excepción: las 5 v_bias_* las lee /admin/bias desde el navegador con sesión:
--    conservan SELECT para authenticated y, con security_invoker, sus cifras pasan
--    a ser las de los jugadores que la RLS deja ver al usuario (ya no las de todos
--    los tenants). La página sigue cargando.
-- =====================================================================
DO $$
DECLARE
  v_pg15 boolean := current_setting('server_version_num')::int >= 150000;
BEGIN
  IF NOT v_pg15 THEN
    RAISE NOTICE '072: Postgres < 15: se omite security_invoker (el REVOKE a anon/authenticated protege igual)';
  END IF;

  -- 005/053 (069 la recrea). Última talla, peso, talla sentado, pierna, edad y
  -- PHV de cada menor de todos los tenants. Lectores: backend (service_role).
  IF to_regclass('public.player_latest_anthropometrics') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.player_latest_anthropometrics SET (security_invoker = true); END IF;
    REVOKE ALL ON public.player_latest_anthropometrics FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.player_latest_anthropometrics TO service_role;
  END IF;

  -- 036. Nombre, fecha de nacimiento y user_id de los menores de 14 sin
  -- consentimiento (vista actualizable). Sin lectores en el código.
  IF to_regclass('public.v_players_ai_blocked') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.v_players_ai_blocked SET (security_invoker = true); END IF;
    REVOKE ALL ON public.v_players_ai_blocked FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.v_players_ai_blocked TO service_role;
  END IF;

  -- 004. vsi/phv de cada análisis completado de todos los tenants. Sin lectores.
  IF to_regclass('public.player_latest_analysis') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.player_latest_analysis SET (security_invoker = true); END IF;
    REVOKE ALL ON public.player_latest_analysis FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.player_latest_analysis TO service_role;
  END IF;

  -- 008. user_id/tenant/plan de cada suscriptor. Lector: billing/status.ts (service_role).
  IF to_regclass('public.user_active_subscription') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.user_active_subscription SET (security_invoker = true); END IF;
    REVOKE ALL ON public.user_active_subscription FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.user_active_subscription TO service_role;
  END IF;

  -- 038. Estadísticas de todas las academias. Sin lectores.
  IF to_regclass('public.v_org_dashboard') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.v_org_dashboard SET (security_invoker = true); END IF;
    REVOKE ALL ON public.v_org_dashboard FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.v_org_dashboard TO service_role;
  END IF;

  -- 039. Nombre de cada jugador con su VSI medio/min/max. Sin lectores.
  IF to_regclass('public.v_player_evolution') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.v_player_evolution SET (security_invoker = true); END IF;
    REVOKE ALL ON public.v_player_evolution FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.v_player_evolution TO service_role;
  END IF;

  -- 039. Recuentos globales del RAG. Sin lectores.
  IF to_regclass('public.v_rag_stats') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.v_rag_stats SET (security_invoker = true); END IF;
    REVOKE ALL ON public.v_rag_stats FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.v_rag_stats TO service_role;
  END IF;

  -- 047 (puede no estar aplicada). Planes de desarrollo de todos los tenants. Sin lectores.
  IF to_regclass('public.v_active_idp_summary') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.v_active_idp_summary SET (security_invoker = true); END IF;
    REVOKE ALL ON public.v_active_idp_summary FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.v_active_idp_summary TO service_role;
  END IF;

  -- 049 (puede no estar aplicada). Anuncios activos incluidos los privados. Sin lectores.
  IF to_regclass('public.v_active_listings_summary') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.v_active_listings_summary SET (security_invoker = true); END IF;
    REVOKE ALL ON public.v_active_listings_summary FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.v_active_listings_summary TO service_role;
  END IF;

  -- 070 (en vuelo). Ya se crea con este mismo patrón; se reafirma por si acaso.
  IF to_regclass('public.v_vsi_default_suspects') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.v_vsi_default_suspects SET (security_invoker = true); END IF;
    REVOKE ALL ON public.v_vsi_default_suspects FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.v_vsi_default_suspects TO service_role;
  END IF;

  -- 037. /admin/bias (navegador con sesión). v_bias_dashboard anida
  -- v_bias_by_position y v_bias_by_age: las cinco pasan a security_invoker.
  IF to_regclass('public.v_bias_by_position') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.v_bias_by_position SET (security_invoker = true); END IF;
    REVOKE ALL ON public.v_bias_by_position FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.v_bias_by_position TO authenticated, service_role;
  END IF;
  IF to_regclass('public.v_bias_by_age') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.v_bias_by_age SET (security_invoker = true); END IF;
    REVOKE ALL ON public.v_bias_by_age FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.v_bias_by_age TO authenticated, service_role;
  END IF;
  IF to_regclass('public.v_bias_by_visibility') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.v_bias_by_visibility SET (security_invoker = true); END IF;
    REVOKE ALL ON public.v_bias_by_visibility FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.v_bias_by_visibility TO authenticated, service_role;
  END IF;
  IF to_regclass('public.v_bias_by_recency') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.v_bias_by_recency SET (security_invoker = true); END IF;
    REVOKE ALL ON public.v_bias_by_recency FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.v_bias_by_recency TO authenticated, service_role;
  END IF;
  IF to_regclass('public.v_bias_dashboard') IS NOT NULL THEN
    IF v_pg15 THEN ALTER VIEW public.v_bias_dashboard SET (security_invoker = true); END IF;
    REVOKE ALL ON public.v_bias_dashboard FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON public.v_bias_dashboard TO authenticated, service_role;
  END IF;
END $$;

-- C2) Cualquier OTRA vista de public que aún lea anon (creada a mano, no
--     verificado si existe alguna): se revoca SOLO a anon/PUBLIC, igual que el
--     script de emergencia; authenticated conserva lo que tuviera.
DO $$
DECLARE
  r        record;
  auth_had boolean;
BEGIN
  FOR r IN
    SELECT c.oid, c.oid::regclass AS v
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind IN ('v', 'm')
       AND has_table_privilege('anon', c.oid, 'SELECT')
  LOOP
    auth_had := has_table_privilege('authenticated', r.oid, 'SELECT');
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC, anon', r.v);
    EXECUTE format('GRANT SELECT ON %s TO service_role', r.v);
    IF auth_had AND NOT has_table_privilege('authenticated', r.oid, 'SELECT') THEN
      EXECUTE format('GRANT SELECT ON %s TO authenticated', r.v);
    END IF;
    RAISE NOTICE '072: vista % no listada en 072: revocada a anon (authenticated sin cambios)', r.v;
  END LOOP;
END $$;

-- =====================================================================
-- D) Auxiliares de RLS y trigger SECURITY DEFINER: solo search_path.
--    user_org_ids / user_in_org NO se revocan: las evalúan políticas RLS sin
--    cláusula TO (038, 039, 052), también para anon; revocarlas haría fallar esas
--    lecturas. Ambas se limitan a auth.uid(). handle_new_user es el trigger de
--    alta en auth.users (RETURNS trigger: no invocable por RPC). Sus cuerpos usan
--    public.* o tablas de public, así que fijar search_path no cambia resultados.
-- =====================================================================
DO $$
BEGIN
  IF to_regprocedure('public.user_org_ids()') IS NOT NULL THEN
    ALTER FUNCTION public.user_org_ids() SET search_path = public, pg_temp;
  END IF;
  IF to_regprocedure('public.user_in_org(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.user_in_org(uuid) SET search_path = public, pg_temp;
  END IF;
  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
  END IF;
END $$;

-- =====================================================================
-- E) Tablas con políticas USING/WITH CHECK (true) SIN rol (aplican también a
--    anon). Todas sus escrituras del código van por service_role (ver cabecera);
--    service_role salta la RLS, así que la política pasa a ser explícitamente
--    TO service_role y se retiran privilegios de escritura a los clientes.
--    Lectura por el navegador que se CONSERVA: player_metric_snapshots (SELECT,
--    política snapshots_read_own intacta) para /players/:id/evolution.
-- =====================================================================
DO $$
BEGIN
  -- 029 · usage_log: anon tenía CRUD completo (user_id, endpoint, org_id).
  IF to_regclass('public.usage_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS "service_role_full_access_usage" ON public.usage_log;
    CREATE POLICY "service_role_full_access_usage" ON public.usage_log
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    REVOKE ALL ON public.usage_log FROM anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.usage_log FROM authenticated;
  END IF;

  -- 030 · legal_acceptances (IP, user agent, aceptaciones de consentimiento).
  --   Se conservan las políticas por usuario de 003 (SELECT/INSERT propios).
  IF to_regclass('public.legal_acceptances') IS NOT NULL THEN
    DROP POLICY IF EXISTS "service_role_full_legal" ON public.legal_acceptances;
    CREATE POLICY "service_role_full_legal" ON public.legal_acceptances
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    REVOKE ALL ON public.legal_acceptances FROM anon;
    REVOKE UPDATE, DELETE, TRUNCATE ON public.legal_acceptances FROM authenticated;
  END IF;

  -- 044 · player_metric_snapshots / player_valuations: anon podía INSERTAR
  --   snapshots falsos (incl. phv_offset/phv_category) y valoraciones en euros.
  IF to_regclass('public.player_metric_snapshots') IS NOT NULL THEN
    DROP POLICY IF EXISTS "snapshots_insert_own" ON public.player_metric_snapshots;
    DROP POLICY IF EXISTS "snapshots_insert_service_role" ON public.player_metric_snapshots;
    CREATE POLICY "snapshots_insert_service_role" ON public.player_metric_snapshots
      FOR INSERT TO service_role WITH CHECK (true);
    REVOKE ALL ON public.player_metric_snapshots FROM anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.player_metric_snapshots FROM authenticated;
  END IF;
  IF to_regclass('public.player_valuations') IS NOT NULL THEN
    DROP POLICY IF EXISTS "valuations_insert_own" ON public.player_valuations;
    DROP POLICY IF EXISTS "valuations_insert_service_role" ON public.player_valuations;
    CREATE POLICY "valuations_insert_service_role" ON public.player_valuations
      FOR INSERT TO service_role WITH CHECK (true);
    REVOKE ALL ON public.player_valuations FROM anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.player_valuations FROM authenticated;
  END IF;

  -- 014 · rag_feedback: INSERT WITH CHECK (true) sin rol. Lo escribe
  --   api/rag/_feedback.ts (service_role; la PR quita su fallback a anon). La
  --   política "service_role_full_access" de 014 sigue cubriendo al backend.
  IF to_regclass('public.rag_feedback') IS NOT NULL THEN
    DROP POLICY IF EXISTS "authenticated_insert" ON public.rag_feedback;
    REVOKE ALL ON public.rag_feedback FROM anon, authenticated;
  END IF;

  -- 003 · gdpr_audit_log: audit_insert_authenticated (WITH CHECK (true)) dejaba a
  --   cualquier authenticated falsear el registro RGPD. Se conserva la lectura
  --   propia (audit_read_own).
  IF to_regclass('public.gdpr_audit_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS audit_insert_authenticated ON public.gdpr_audit_log;
    REVOKE ALL ON public.gdpr_audit_log FROM anon;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.gdpr_audit_log FROM authenticated;
  END IF;

  -- 054 · ai_spend_ledger: RLS sin políticas; además sin privilegios de cliente.
  IF to_regclass('public.ai_spend_ledger') IS NOT NULL THEN
    REVOKE ALL ON public.ai_spend_ledger FROM anon, authenticated;
  END IF;
END $$;

-- =====================================================================
-- F) Comprobación final (solo lectura): lista con WARNING lo que siga abierto a
--    anon en public (funciones SECURITY DEFINER que no son auxiliares de RLS ni
--    triggers, y vistas). Tras 072 debería salir 0.
-- =====================================================================
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS f
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.prosecdef
       AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
       AND p.proname NOT IN ('user_org_ids', 'user_in_org')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    n := n + 1;
    RAISE WARNING '072: función SECURITY DEFINER aún ejecutable por anon: %', r.f;
  END LOOP;
  FOR r IN
    SELECT c.oid::regclass AS v
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind IN ('v', 'm')
       AND has_table_privilege('anon', c.oid, 'SELECT')
  LOOP
    n := n + 1;
    RAISE WARNING '072: vista aún legible por anon: %', r.v;
  END LOOP;
  RAISE NOTICE '072: comprobación final: % objeto(s) de public aún abiertos a anon', n;
END $$;

-- PostgREST: recargar la caché de esquema (nuevas firmas DSAR).
NOTIFY pgrst, 'reload schema';

COMMIT;
