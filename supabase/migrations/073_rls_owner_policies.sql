-- =====================================================================
-- 073 · RLS dueño/tenant para bienestar, perfil conductual y snapshots
--       · sustituye las 10 políticas que comparan players.tenant_id con
--         auth.uid() (un id de TENANT contra un id de USUARIO)
--       · regla única en un helper: public.caller_manages_player(text)
-- =====================================================================
-- ESTADO DE LA EVIDENCIA (léelo antes de aplicar)
--
-- VERIFICADO EN PRODUCCIÓN (consultas de solo lectura del dueño, 29-30 sep 2026):
--   · players: 3 filas. tenant_id = user_id en 0 filas; tenant_id <> user_id en 3;
--     tenant_id NULL en 0; user_id NULL en 0; 1 único valor de tenant_id, que NO es
--     un organizations.id NI un auth.users.id.
--   · Antes de la 050, behavioral_profiles, attendance_records,
--     engagement_snapshots, wellbeing_questionnaires y dropout_risk_assessments
--     tenían RLS activada y NINGUNA política (Advisor de Supabase + pg_policies).
--   · La 050 se aplicó el 30 sep («Success») ANTES de que su comprobación previa
--     pasara: creó behavioral_owner_all, attendance_owner_all, engagement_owner_all,
--     questionnaires_owner_all y dropout_owner_all (FOR ALL, sin TO) con
--     player_id IN (SELECT id FROM players WHERE tenant_id = auth.uid()).
--   · Aplicadas también: 045-049, 051, 052, 054, 057, 060-064, 066, 067, 069,
--     070, 072, el script de emergencia anon y el script provisional 03 (DSAR).
--   · public.tenant_id() existe (lee el claim tenant_id del JWT, repo 003:126).
--   · public.user_org_ids() / user_in_org(uuid) de producción NO son las del repo
--     (038): usan team_members.org_owner_id. Esta migración NO las usa ni las toca.
--
-- DEDUCIDO de esos datos (y reproducido en SIMULACIÓN, ver abajo): con el dato
-- verificado, la regla «tenant_id = auth.uid()» no da acceso a NADIE. La 050 no
-- abrió nada: el navegador recibe 0 filas y sus upserts fallan (42501), igual que
-- antes de la 050.
--
-- VERIFICADO EN EL REPOSITORIO (origin/main 0c3a438, lectura de ficheros + el
-- test src/test/migrations/rlsOwnerPolicies.test.ts, ROJO sin esta migración):
--   · Las 10 políticas rotas y aún vigentes (ninguna migración posterior las
--     cambia; 072:590-607 solo quitó snapshots_insert_own y valuations_insert_own,
--     y conservó snapshots_read_own a propósito, 072:566-567; 071 no define
--     ninguna política):
--       050:19-22 behavioral_owner_all · 050:27-30 attendance_owner_all ·
--       050:34-37 engagement_owner_all · 050:41-44 questionnaires_owner_all ·
--       050:48-51 dropout_owner_all · 044:33-37 org_members_read_injuries ·
--       044:39-43 org_members_insert_injuries · 044:45-49 org_members_update_injuries ·
--       044:80-83 snapshots_read_own · 044:116-119 valuations_read_own.
--   · Qué necesita el NAVEGADOR (cliente supabase con el JWT del usuario,
--     src/lib/supabase.ts:27), y por tanto qué se concede aquí, nada más:
--       - behavioral_profiles: SELECT (behavioralProfileService.ts:149-155, vivo vía
--         useBehavioralProfile.ts:63 y useDMScore.ts:67) + upsert
--         (localStorageMigrationService.ts:182-184) ⇒ SELECT, INSERT, UPDATE.
--       - attendance_records: SELECT (wellbeingService.ts:108-113) + upsert
--         (wellbeingService.ts:147-157; localStorageMigrationService.ts:211-213)
--         ⇒ SELECT, INSERT, UPDATE.
--       - engagement_snapshots: SELECT (wellbeingService.ts:169-174) + upsert
--         (wellbeingService.ts:203-205; localStorageMigrationService.ts:236-238)
--         ⇒ SELECT, INSERT, UPDATE.
--       - wellbeing_questionnaires y dropout_risk_assessments: upsert
--         (localStorageMigrationService.ts:265-267 y :298-300). Un upsert
--         (INSERT ... ON CONFLICT DO UPDATE) exige también política SELECT
--         (SIMULADO: sin ella, el upsert sobre una fila existente y el INSERT ...
--         RETURNING fallan con 42501; el INSERT simple pasa) ⇒ SELECT, INSERT, UPDATE.
--       - player_metric_snapshots: solo SELECT (useMetricSnapshots.ts:40-47 →
--         /players/:id/evolution). 072:598 ya retiró las escrituras a authenticated.
--       - player_injuries y player_valuations: NINGÚN llamador de navegador (grep de
--         src/). Sus lectores/escritores son de servidor con service_role (salta la
--         RLS). ⇒ se retiran sus políticas rotas y NO se crea ninguna de cliente.
--       - DELETE: ningún llamador vivo de navegador ⇒ no se concede.
--   · Regla canónica de la app: api/_lib/ownership.ts ownsPlayer (:44, user_id) y
--     ownsPlayerOrTenant (:78-103, user_id O mismo tenant). Aquí:
--       players.user_id = auth.uid()
--       OR (players.tenant_id IS NOT NULL AND players.tenant_id = public.tenant_id())
--     public.tenant_id() lee SOLO el claim RAÍZ (003:126-132); el TS y la 072
--     (dsar_caller_manages_player) aceptan además app_metadata.tenant_id. Esta
--     versión es, por tanto, igual o MÁS estrecha, nunca más amplia.
--   · Toda política SELECT de players del repositorio incluye user_id = auth.uid()
--     (000:19-20, 001:27-31, 027:41-52, 038:76-80), y el listado de jugadores del
--     propio navegador depende de ello (supabasePlayerService.ts:89-93).
--
-- DECISIÓN: helper SECURITY INVOKER (no DEFINER).
--   Se evalúa con los permisos y la RLS de players de quien consulta. Así una
--   tabla hija NUNCA da más que la tabla players: si el usuario no puede ver al
--   jugador, tampoco ve su bienestar. No añade superficie SECURITY DEFINER (el lint
--   de 072 no tiene nada que permitir). Contrapartida declarada: la rama por tenant
--   solo funciona si la RLS de players deja ver al compañero de tenant (en el repo,
--   players_tenant_isolation de 003:239-247; en producción NO verificado: la
--   comprobación previa lo lista). Si falta, falla CERRADA (sin acceso), nunca abre.
--   No se reutiliza dsar_caller_manages_player: 072:386 la revoca a authenticated
--   y esta migración no toca objetos de la 072.
--
-- SIMULACIÓN PGlite 0.5.8 / PostgreSQL 18.3 (NO es la base de datos real), con
-- la forma verificada de producción (3 jugadores, 1 tenant que no es ni usuario ni
-- organización, dueños A y B, 050 y 072 aplicadas, cuerpos de producción de
-- user_org_ids/user_in_org):
--   · ANTES de 073: en las 5 tablas de bienestar/perfil y en player_metric_snapshots
--     y player_valuations, dueño, compañero de tenant, otro usuario y anon ven 0
--     filas (anon: permiso denegado en snapshots/valoraciones, por la 072) y sus
--     escrituras fallan (42501). EXCEPCIÓN: en player_injuries cualquier usuario con
--     sesión podía INSERTAR una lesión para CUALQUIER jugador (rama created_by).
--   · DESPUÉS: el dueño A hace EXACTAMENTE las operaciones del navegador (SELECT,
--     INSERT, UPDATE/upsert, upsert con RETURNING) sobre filas de SU jugador y nada
--     sobre las de B (ni leer, ni insertar, ni mover una fila suya a B, ni pisar una
--     de B por upsert); DELETE borra 0 filas; anon nada; player_metric_snapshots
--     solo lectura; player_injuries y player_valuations nada para el cliente.
--   · Mismo tenant: con claim raíz tenant_id en el JWT, el compañero ve y escribe;
--     sin el claim (o con solo app_metadata.tenant_id), nada.
--   · 073 corre dos veces sin error y deja el mismo estado; también sobre la cadena
--     SIN la 050 (otros entornos, p. ej. demo: no verificado si la tienen), sobre
--     una base vacía (todo se salta con NOTICE) y sin players.tenant_id.
--   · Ninguna función, vista ni permiso distinto de los de abajo cambia (DSAR,
--     user_org_ids, user_in_org, PHV: definición y ACL idénticas antes y después).
--
-- NO VERIFICADO (no se ha consultado la base de datos de producción para esto):
--   · Si la 044 está aplicada en producción (player_injuries,
--     player_metric_snapshots, player_valuations). Por eso todo va con to_regclass.
--   · Las políticas REALES de players en producción (la comprobación previa las
--     mira: si ninguna deja al dueño leer su jugador, esta migración queda inerte y
--     cerrada, no abre nada).
--   · Si los JWT de producción llevan el claim raíz tenant_id (hook 057 activado en
--     Authentication > Hooks). docs/pendientes-metricas.md (C1) dice que se activó
--     el 28 ago; no se ha vuelto a comprobar. Si lo llevan y coincide con el
--     tenant_id de los jugadores, TODOS los usuarios de ese tenant verán el
--     bienestar de esos jugadores (regla ownsPlayerOrTenant). La comprobación
--     previa cuenta cuántos usuarios no dueños quedarían dentro.
--   · Las columnas reales de las 5 tablas en producción. Según el repo, algunas
--     escrituras del navegador fallarán por COLUMNA aunque la RLS ya deje:
--     attendance «notes», questionnaires «date», dropout «date»/«primary_factor»
--     (no existen en 046). Fallo silencioso y a la caché local, como hoy.
--
-- QUÉ NO TOCA: PHV ni bio-banding (invariante #4: ninguna fórmula, fila ni vista);
-- DSAR ni ningún objeto de la 072; user_org_ids/user_in_org; permisos de tabla
-- (GRANT/REVOKE de tablas); datos. Solo: una función nueva, sus permisos y
-- políticas de las 8 tablas (DROP POLICY IF EXISTS + CREATE POLICY).
--
-- ORDEN DEL OPERADOR: 1) comprobación previa de solo lectura
-- (supabase/checks/073_previa.sql): todas las filas ok = true. 2) esta migración.
-- 3) comprobación posterior (supabase/checks/073_comprobacion.sql): resultado =
-- esperado en todas. Es idempotente: se puede ejecutar varias veces.
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1) Helper: ¿el llamador (JWT) gestiona este jugador?
--    Espejo en SQL de ownsPlayerOrTenant (api/_lib/ownership.ts). Si cambia la
--    regla, cambiar ambas (invariante #7) con una migración nueva.
--    SECURITY INVOKER (ver DECISIÓN en la cabecera). search_path fijado y nombres
--    cualificados. Variante sin tenant si players.tenant_id o public.tenant_id()
--    no existen (entornos que no aplicaron 003): solo cuenta el dueño.
-- =====================================================================
DO $do$
DECLARE
  v_tenant boolean;
BEGIN
  IF to_regclass('public.players') IS NULL THEN
    RAISE NOTICE '073: public.players no existe: no se crea el helper ni se tocan políticas';
    RETURN;
  END IF;

  v_tenant := EXISTS (SELECT 1 FROM pg_attribute
                       WHERE attrelid = to_regclass('public.players')
                         AND attname = 'tenant_id' AND NOT attisdropped)
              AND to_regprocedure('public.tenant_id()') IS NOT NULL;

  IF v_tenant THEN
    CREATE OR REPLACE FUNCTION public.caller_manages_player(p_player_id text)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = public, pg_temp
    AS $fn$
      SELECT EXISTS (
        SELECT 1
          FROM public.players p
         WHERE p.id::text = p_player_id
           AND (   (p.user_id IS NOT NULL AND p.user_id = (SELECT auth.uid()))
                OR (p.tenant_id IS NOT NULL AND p.tenant_id = (SELECT public.tenant_id())))
      )
    $fn$;
  ELSE
    CREATE OR REPLACE FUNCTION public.caller_manages_player(p_player_id text)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = public, pg_temp
    AS $fn$
      SELECT EXISTS (
        SELECT 1
          FROM public.players p
         WHERE p.id::text = p_player_id
           AND p.user_id IS NOT NULL AND p.user_id = (SELECT auth.uid())
      )
    $fn$;
    RAISE NOTICE '073: players.tenant_id o public.tenant_id() no existen: helper solo por dueño (user_id)';
  END IF;

  -- Los default privileges de Supabase dan EXECUTE a anon al crear la función.
  -- Las políticas son TO authenticated: anon nunca las evalúa ni necesita EXECUTE.
  REVOKE ALL ON FUNCTION public.caller_manages_player(text) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.caller_manages_player(text) TO authenticated, service_role;

  COMMENT ON FUNCTION public.caller_manages_player(text) IS
    '073 · ¿El llamador (JWT) gestiona este jugador? players.user_id = auth.uid() O mismo tenant (public.tenant_id(), claim raíz). SECURITY INVOKER: respeta la RLS de players. Espejo de ownsPlayerOrTenant (api/_lib/ownership.ts).';
END $do$;

-- =====================================================================
-- 2) Políticas. Cada tabla se salta si no existe. Siempre TO authenticated
--    (nunca anon), solo las operaciones que usa el navegador y WITH CHECK en las
--    escrituras. service_role salta la RLS (el backend no depende de esto).
-- =====================================================================
DO $do$
BEGIN
  IF to_regprocedure('public.caller_manages_player(text)') IS NULL THEN
    RAISE NOTICE '073: sin helper (public.players no existe): no se tocan políticas';
    RETURN;
  END IF;

  -- ── behavioral_profiles (045; política rota de 050:19-22) ──────────────
  IF to_regclass('public.behavioral_profiles') IS NOT NULL THEN
    ALTER TABLE public.behavioral_profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "behavioral_owner_all" ON public.behavioral_profiles;
    DROP POLICY IF EXISTS "behavioral_profiles_select_owner_or_tenant" ON public.behavioral_profiles;
    DROP POLICY IF EXISTS "behavioral_profiles_insert_owner_or_tenant" ON public.behavioral_profiles;
    DROP POLICY IF EXISTS "behavioral_profiles_update_owner_or_tenant" ON public.behavioral_profiles;
    CREATE POLICY "behavioral_profiles_select_owner_or_tenant" ON public.behavioral_profiles
      FOR SELECT TO authenticated
      USING (public.caller_manages_player(player_id::text));
    CREATE POLICY "behavioral_profiles_insert_owner_or_tenant" ON public.behavioral_profiles
      FOR INSERT TO authenticated
      WITH CHECK (public.caller_manages_player(player_id::text));
    CREATE POLICY "behavioral_profiles_update_owner_or_tenant" ON public.behavioral_profiles
      FOR UPDATE TO authenticated
      USING (public.caller_manages_player(player_id::text))
      WITH CHECK (public.caller_manages_player(player_id::text));
  ELSE
    RAISE NOTICE '073: behavioral_profiles no existe: se salta';
  END IF;

  -- ── attendance_records (046; política rota de 050:27-30) ───────────────
  IF to_regclass('public.attendance_records') IS NOT NULL THEN
    ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "attendance_owner_all" ON public.attendance_records;
    DROP POLICY IF EXISTS "attendance_records_select_owner_or_tenant" ON public.attendance_records;
    DROP POLICY IF EXISTS "attendance_records_insert_owner_or_tenant" ON public.attendance_records;
    DROP POLICY IF EXISTS "attendance_records_update_owner_or_tenant" ON public.attendance_records;
    CREATE POLICY "attendance_records_select_owner_or_tenant" ON public.attendance_records
      FOR SELECT TO authenticated
      USING (public.caller_manages_player(player_id::text));
    CREATE POLICY "attendance_records_insert_owner_or_tenant" ON public.attendance_records
      FOR INSERT TO authenticated
      WITH CHECK (public.caller_manages_player(player_id::text));
    CREATE POLICY "attendance_records_update_owner_or_tenant" ON public.attendance_records
      FOR UPDATE TO authenticated
      USING (public.caller_manages_player(player_id::text))
      WITH CHECK (public.caller_manages_player(player_id::text));
  ELSE
    RAISE NOTICE '073: attendance_records no existe: se salta';
  END IF;

  -- ── engagement_snapshots (046; política rota de 050:34-37) ─────────────
  IF to_regclass('public.engagement_snapshots') IS NOT NULL THEN
    ALTER TABLE public.engagement_snapshots ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "engagement_owner_all" ON public.engagement_snapshots;
    DROP POLICY IF EXISTS "engagement_snapshots_select_owner_or_tenant" ON public.engagement_snapshots;
    DROP POLICY IF EXISTS "engagement_snapshots_insert_owner_or_tenant" ON public.engagement_snapshots;
    DROP POLICY IF EXISTS "engagement_snapshots_update_owner_or_tenant" ON public.engagement_snapshots;
    CREATE POLICY "engagement_snapshots_select_owner_or_tenant" ON public.engagement_snapshots
      FOR SELECT TO authenticated
      USING (public.caller_manages_player(player_id::text));
    CREATE POLICY "engagement_snapshots_insert_owner_or_tenant" ON public.engagement_snapshots
      FOR INSERT TO authenticated
      WITH CHECK (public.caller_manages_player(player_id::text));
    CREATE POLICY "engagement_snapshots_update_owner_or_tenant" ON public.engagement_snapshots
      FOR UPDATE TO authenticated
      USING (public.caller_manages_player(player_id::text))
      WITH CHECK (public.caller_manages_player(player_id::text));
  ELSE
    RAISE NOTICE '073: engagement_snapshots no existe: se salta';
  END IF;

  -- ── wellbeing_questionnaires (046; política rota de 050:41-44) ─────────
  IF to_regclass('public.wellbeing_questionnaires') IS NOT NULL THEN
    ALTER TABLE public.wellbeing_questionnaires ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "questionnaires_owner_all" ON public.wellbeing_questionnaires;
    DROP POLICY IF EXISTS "wellbeing_questionnaires_select_owner_or_tenant" ON public.wellbeing_questionnaires;
    DROP POLICY IF EXISTS "wellbeing_questionnaires_insert_owner_or_tenant" ON public.wellbeing_questionnaires;
    DROP POLICY IF EXISTS "wellbeing_questionnaires_update_owner_or_tenant" ON public.wellbeing_questionnaires;
    CREATE POLICY "wellbeing_questionnaires_select_owner_or_tenant" ON public.wellbeing_questionnaires
      FOR SELECT TO authenticated
      USING (public.caller_manages_player(player_id::text));
    CREATE POLICY "wellbeing_questionnaires_insert_owner_or_tenant" ON public.wellbeing_questionnaires
      FOR INSERT TO authenticated
      WITH CHECK (public.caller_manages_player(player_id::text));
    CREATE POLICY "wellbeing_questionnaires_update_owner_or_tenant" ON public.wellbeing_questionnaires
      FOR UPDATE TO authenticated
      USING (public.caller_manages_player(player_id::text))
      WITH CHECK (public.caller_manages_player(player_id::text));
  ELSE
    RAISE NOTICE '073: wellbeing_questionnaires no existe: se salta';
  END IF;

  -- ── dropout_risk_assessments (046; política rota de 050:48-51) ─────────
  IF to_regclass('public.dropout_risk_assessments') IS NOT NULL THEN
    ALTER TABLE public.dropout_risk_assessments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "dropout_owner_all" ON public.dropout_risk_assessments;
    DROP POLICY IF EXISTS "dropout_risk_assessments_select_owner_or_tenant" ON public.dropout_risk_assessments;
    DROP POLICY IF EXISTS "dropout_risk_assessments_insert_owner_or_tenant" ON public.dropout_risk_assessments;
    DROP POLICY IF EXISTS "dropout_risk_assessments_update_owner_or_tenant" ON public.dropout_risk_assessments;
    CREATE POLICY "dropout_risk_assessments_select_owner_or_tenant" ON public.dropout_risk_assessments
      FOR SELECT TO authenticated
      USING (public.caller_manages_player(player_id::text));
    CREATE POLICY "dropout_risk_assessments_insert_owner_or_tenant" ON public.dropout_risk_assessments
      FOR INSERT TO authenticated
      WITH CHECK (public.caller_manages_player(player_id::text));
    CREATE POLICY "dropout_risk_assessments_update_owner_or_tenant" ON public.dropout_risk_assessments
      FOR UPDATE TO authenticated
      USING (public.caller_manages_player(player_id::text))
      WITH CHECK (public.caller_manages_player(player_id::text));
  ELSE
    RAISE NOTICE '073: dropout_risk_assessments no existe: se salta';
  END IF;

  -- ── player_metric_snapshots (044; política rota 044:80-83) ─────────────
  --    Solo lectura para /players/:id/evolution. La escritura sigue siendo solo
  --    service_role (snapshots_insert_service_role de 072, que NO se toca).
  IF to_regclass('public.player_metric_snapshots') IS NOT NULL THEN
    ALTER TABLE public.player_metric_snapshots ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "snapshots_read_own" ON public.player_metric_snapshots;
    DROP POLICY IF EXISTS "player_metric_snapshots_select_owner_or_tenant" ON public.player_metric_snapshots;
    CREATE POLICY "player_metric_snapshots_select_owner_or_tenant" ON public.player_metric_snapshots
      FOR SELECT TO authenticated
      USING (public.caller_manages_player(player_id::text));
  ELSE
    RAISE NOTICE '073: player_metric_snapshots no existe (044 no aplicada): se salta';
  END IF;

  -- ── player_injuries (044; políticas rotas 044:33-49) ───────────────────
  --    Datos de salud (RGPD art. 9) sin ningún llamador de navegador: se retiran
  --    las 3 políticas y NO se crea ninguna de cliente (solo service_role, que
  --    salta la RLS). La rama created_by = auth.uid() de 044:41 dejaba además a
  --    cualquier usuario con sesión INSERTAR una lesión para CUALQUIER jugador
  --    poniendo created_by = él mismo (SIMULADO en PGlite).
  IF to_regclass('public.player_injuries') IS NOT NULL THEN
    ALTER TABLE public.player_injuries ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "org_members_read_injuries" ON public.player_injuries;
    DROP POLICY IF EXISTS "org_members_insert_injuries" ON public.player_injuries;
    DROP POLICY IF EXISTS "org_members_update_injuries" ON public.player_injuries;
  ELSE
    RAISE NOTICE '073: player_injuries no existe (044 no aplicada): se salta';
  END IF;

  -- ── player_valuations (044; política rota 044:116-119) ─────────────────
  --    Sin lector ni escritor en todo el repositorio: se retira la lectura de
  --    cliente. valuations_insert_service_role (072) NO se toca.
  IF to_regclass('public.player_valuations') IS NOT NULL THEN
    ALTER TABLE public.player_valuations ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "valuations_read_own" ON public.player_valuations;
  ELSE
    RAISE NOTICE '073: player_valuations no existe (044 no aplicada): se salta';
  END IF;
END $do$;

-- =====================================================================
-- 3) Comprobación final (solo lectura): avisa con WARNING de cualquier política
--    de public que siga comparando tenant_id con auth.uid() (p. ej. creada a
--    mano). No aborta: tras 073 debería salir 0.
-- =====================================================================
DO $do$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname,
           regexp_replace(regexp_replace(lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')),
                                         '::[a-z_]+( varying| precision)?', '', 'g'),
                          '[[:space:]()"]', '', 'g') AS expr
      FROM pg_policies
     WHERE schemaname = 'public'
  LOOP
    IF r.expr ~ 'tenant_id(=|in)(select)?auth\.uid'
       OR r.expr ~ 'auth\.uid(asuid)?=([a-z0-9_]+\.)*tenant_id' THEN
      n := n + 1;
      RAISE WARNING '073: la política %.% sigue comparando tenant_id con auth.uid()', r.tablename, r.policyname;
    END IF;
  END LOOP;
  RAISE NOTICE '073: comprobación final: % política(s) de public comparan tenant_id con auth.uid()', n;
END $do$;

COMMIT;
