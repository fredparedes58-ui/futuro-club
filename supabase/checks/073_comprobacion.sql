-- =====================================================================
-- VITAS · 073 · COMPROBACIÓN POSTERIOR · SOLO LECTURA
-- Ejecútala DESPUÉS de la migración 073 y manda el resultado completo.
-- Correcto = ok = true en TODAS las filas (resultado igual a esperado).
-- No escribe nada (una sola consulta SELECT) y no falla si falta algún objeto:
-- entonces el resultado lo dice («no existe», «tabla no existe»).
-- Probada en SIMULACIÓN PGlite (NO en tu base): base vacía, antes de 073 (da
-- ok = false donde toca), después de 073, 073 dos veces, cadena sin 050, y 050
-- re-ejecutada después de 073 (la detecta).
-- =====================================================================
WITH
tablas5(tabla) AS (
  VALUES ('behavioral_profiles'), ('attendance_records'), ('engagement_snapshots'),
         ('wellbeing_questionnaires'), ('dropout_risk_assessments')
),
tablas8(tabla) AS (
  SELECT tabla FROM tablas5
  UNION ALL VALUES ('player_metric_snapshots'), ('player_injuries'), ('player_valuations')
),
pol AS (
  SELECT tablename, policyname, cmd, roles, permissive, qual, with_check,
         regexp_replace(regexp_replace(lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')),
                                       '::[a-z_]+( varying| precision)?', '', 'g'),
                        '[[:space:]()"]', '', 'g') AS expr
    FROM pg_policies
   WHERE schemaname = 'public'
),
helper AS (
  SELECT to_regprocedure('public.caller_manages_player(text)') AS oid
),
filas(n, comprobacion, resultado, esperado) AS (
  SELECT 1, 'helper public.caller_manages_player(text): tipo · search_path',
         CASE WHEN h.oid IS NULL THEN 'no existe'
              ELSE (SELECT CASE WHEN p.prosecdef THEN 'definer' ELSE 'invoker' END
                           || ' · ' || coalesce(array_to_string(p.proconfig, ','), 'sin search_path')
                      FROM pg_proc p WHERE p.oid = h.oid) END,
         'invoker · search_path=public, pg_temp'
    FROM helper h
  UNION ALL
  SELECT 2, 'helper: quién puede ejecutarlo',
         CASE WHEN h.oid IS NULL THEN 'no existe'
              WHEN to_regrole('anon') IS NULL OR to_regrole('authenticated') IS NULL THEN 'faltan roles'
              ELSE 'anon=' || has_function_privilege('anon', h.oid, 'EXECUTE')::text
                   || ' · authenticated=' || has_function_privilege('authenticated', h.oid, 'EXECUTE')::text END,
         'anon=false · authenticated=true'
    FROM helper h
  UNION ALL
  SELECT 3, 'políticas de public que comparan tenant_id con auth.uid()',
         count(*)::text, '0'
    FROM pol
   WHERE expr ~ 'tenant_id(=|in)(select)?auth\.uid'
      OR expr ~ 'auth\.uid(asuid)?=([a-z0-9_]+\.)*tenant_id'
  UNION ALL
  -- Las 5 tablas de bienestar / perfil conductual: exactamente SELECT, INSERT y
  -- UPDATE, TO authenticated, con el helper en USING y/o WITH CHECK según toque.
  SELECT 4 + (row_number() OVER (ORDER BY t.tabla))::int, t.tabla || ': políticas (cmd:rol:regla)',
         CASE WHEN to_regclass('public.' || t.tabla) IS NULL THEN 'tabla no existe'
              ELSE coalesce((
                SELECT string_agg(p.cmd || ':' || array_to_string(p.roles, ',') || ':' ||
                         CASE WHEN p.permissive = 'PERMISSIVE'
                               AND ((p.cmd = 'SELECT' AND p.qual LIKE '%caller_manages_player(%' AND p.with_check IS NULL)
                                 OR (p.cmd = 'INSERT' AND p.with_check LIKE '%caller_manages_player(%' AND p.qual IS NULL)
                                 OR (p.cmd = 'UPDATE' AND p.qual LIKE '%caller_manages_player(%'
                                                      AND p.with_check LIKE '%caller_manages_player(%'))
                              THEN 'helper' ELSE 'OTRA' END,
                         ' · ' ORDER BY p.cmd, p.policyname)
                  FROM pol p WHERE p.tablename = t.tabla), 'sin políticas') END,
         CASE WHEN to_regclass('public.' || t.tabla) IS NULL THEN 'tabla no existe'
              ELSE 'INSERT:authenticated:helper · SELECT:authenticated:helper · UPDATE:authenticated:helper' END
    FROM tablas5 t
  UNION ALL
  SELECT 10, 'player_metric_snapshots: políticas (nombre:cmd:rol)',
         CASE WHEN to_regclass('public.player_metric_snapshots') IS NULL THEN 'tabla no existe'
              ELSE coalesce((SELECT string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ','), ' · ' ORDER BY policyname)
                               FROM pol WHERE tablename = 'player_metric_snapshots'), 'sin políticas') END,
         CASE WHEN to_regclass('public.player_metric_snapshots') IS NULL THEN 'tabla no existe'
              ELSE 'player_metric_snapshots_select_owner_or_tenant:SELECT:authenticated · snapshots_insert_service_role:INSERT:service_role' END
  UNION ALL
  SELECT 11, 'player_metric_snapshots: la lectura usa el helper',
         CASE WHEN to_regclass('public.player_metric_snapshots') IS NULL THEN 'tabla no existe'
              ELSE coalesce((SELECT (qual LIKE '%caller_manages_player(%')::text FROM pol
                              WHERE tablename = 'player_metric_snapshots'
                                AND policyname = 'player_metric_snapshots_select_owner_or_tenant'), 'no existe') END,
         CASE WHEN to_regclass('public.player_metric_snapshots') IS NULL THEN 'tabla no existe' ELSE 'true' END
  UNION ALL
  SELECT 12, 'player_injuries: políticas',
         CASE WHEN to_regclass('public.player_injuries') IS NULL THEN 'tabla no existe'
              ELSE coalesce((SELECT string_agg(policyname || ':' || cmd, ' · ' ORDER BY policyname)
                               FROM pol WHERE tablename = 'player_injuries'), 'sin políticas') END,
         CASE WHEN to_regclass('public.player_injuries') IS NULL THEN 'tabla no existe' ELSE 'sin políticas' END
  UNION ALL
  SELECT 13, 'player_valuations: políticas (nombre:cmd:rol)',
         CASE WHEN to_regclass('public.player_valuations') IS NULL THEN 'tabla no existe'
              ELSE coalesce((SELECT string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ','), ' · ' ORDER BY policyname)
                               FROM pol WHERE tablename = 'player_valuations'), 'sin políticas') END,
         CASE WHEN to_regclass('public.player_valuations') IS NULL THEN 'tabla no existe'
              ELSE 'valuations_insert_service_role:INSERT:service_role' END
  UNION ALL
  SELECT 14, 'tablas de la 073 con RLS DESACTIVADA',
         coalesce((SELECT string_agg(t.tabla, ', ' ORDER BY t.tabla)
                     FROM tablas8 t JOIN pg_class c ON c.oid = to_regclass('public.' || t.tabla)
                    WHERE NOT c.relrowsecurity), 'ninguna'),
         'ninguna'
  UNION ALL
  SELECT 15, 'políticas de las 8 tablas que aplican a anon o a public (sin TO)',
         count(*)::text, '0'
    FROM pol p JOIN tablas8 t ON t.tabla = p.tablename
   WHERE p.roles && ARRAY['anon', 'public']::name[]
  UNION ALL
  -- La 073 no toca la 072: el helper de las DSAR sigue revocado a authenticated.
  SELECT 16, 'DSAR (072) intacta: dsar_caller_manages_player(text) ejecutable por authenticated',
         CASE WHEN to_regprocedure('public.dsar_caller_manages_player(text)') IS NULL THEN 'no existe'
              WHEN to_regrole('authenticated') IS NULL THEN 'faltan roles'
              ELSE has_function_privilege('authenticated', to_regprocedure('public.dsar_caller_manages_player(text)'), 'EXECUTE')::text END,
         'false'
)
SELECT n, comprobacion, resultado, esperado, resultado = esperado AS ok
  FROM filas
 ORDER BY n;
