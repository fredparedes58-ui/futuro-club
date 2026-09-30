-- =====================================================================
-- VITAS · 073 · COMPROBACIÓN PREVIA · SOLO LECTURA
-- Ejecútala ANTES de la migración 073 y manda el resultado completo.
--   · Si ALGUNA fila tiene ok = false  →  NO apliques la 073; manda el resultado.
--   · ok vacío (NULL) = fila informativa: no bloquea, pero mándala también.
-- No escribe nada (una sola consulta SELECT). No falla si faltan tablas o
-- funciones: usa to_regclass / to_regprocedure, y los conteos de datos se hacen
-- con query_to_xml SOLO cuando la tabla existe.
-- Probada en SIMULACIÓN PGlite (NO en tu base): base vacía, cadena completa sin
-- datos y cadena con la forma verificada de producción (con y sin la 050).
-- =====================================================================
WITH
tablas(tabla) AS (
  VALUES ('behavioral_profiles'), ('attendance_records'), ('engagement_snapshots'),
         ('wellbeing_questionnaires'), ('dropout_risk_assessments'),
         ('player_metric_snapshots'), ('player_injuries'), ('player_valuations')
),
-- Políticas que la 073 espera encontrar (044 / 050 / 072) o que crea ella misma.
conocidas(tabla, politica) AS (
  VALUES ('behavioral_profiles', 'behavioral_owner_all'),
         ('attendance_records', 'attendance_owner_all'),
         ('engagement_snapshots', 'engagement_owner_all'),
         ('wellbeing_questionnaires', 'questionnaires_owner_all'),
         ('dropout_risk_assessments', 'dropout_owner_all'),
         ('player_injuries', 'org_members_read_injuries'),
         ('player_injuries', 'org_members_insert_injuries'),
         ('player_injuries', 'org_members_update_injuries'),
         ('player_metric_snapshots', 'snapshots_read_own'),
         ('player_metric_snapshots', 'snapshots_insert_own'),
         ('player_metric_snapshots', 'snapshots_insert_service_role'),
         ('player_valuations', 'valuations_read_own'),
         ('player_valuations', 'valuations_insert_own'),
         ('player_valuations', 'valuations_insert_service_role'),
         ('behavioral_profiles', 'behavioral_profiles_select_owner_or_tenant'),
         ('behavioral_profiles', 'behavioral_profiles_insert_owner_or_tenant'),
         ('behavioral_profiles', 'behavioral_profiles_update_owner_or_tenant'),
         ('attendance_records', 'attendance_records_select_owner_or_tenant'),
         ('attendance_records', 'attendance_records_insert_owner_or_tenant'),
         ('attendance_records', 'attendance_records_update_owner_or_tenant'),
         ('engagement_snapshots', 'engagement_snapshots_select_owner_or_tenant'),
         ('engagement_snapshots', 'engagement_snapshots_insert_owner_or_tenant'),
         ('engagement_snapshots', 'engagement_snapshots_update_owner_or_tenant'),
         ('wellbeing_questionnaires', 'wellbeing_questionnaires_select_owner_or_tenant'),
         ('wellbeing_questionnaires', 'wellbeing_questionnaires_insert_owner_or_tenant'),
         ('wellbeing_questionnaires', 'wellbeing_questionnaires_update_owner_or_tenant'),
         ('dropout_risk_assessments', 'dropout_risk_assessments_select_owner_or_tenant'),
         ('dropout_risk_assessments', 'dropout_risk_assessments_insert_owner_or_tenant'),
         ('dropout_risk_assessments', 'dropout_risk_assessments_update_owner_or_tenant'),
         ('player_metric_snapshots', 'player_metric_snapshots_select_owner_or_tenant')
),
-- Expresiones normalizadas (minúsculas, sin casts, sin espacios/comillas). q además
-- sin paréntesis; qp los conserva (para distinguir la FUNCIÓN tenant_id() de la
-- columna tenant_id). Ojo: con public en el search_path, pg_policies escribe
-- «tenant_id()» sin «public.»; por eso el esquema es opcional en los patrones.
pol AS (
  SELECT tablename, policyname, cmd, roles, permissive,
         regexp_replace(regexp_replace(lower(coalesce(qual, '')), '::[a-z_]+( varying| precision)?', '', 'g'),
                        '[[:space:]()"]', '', 'g') AS q,
         regexp_replace(regexp_replace(lower(coalesce(qual, '')), '::[a-z_]+( varying| precision)?', '', 'g'),
                        '[[:space:]"]', '', 'g') AS qp
    FROM pg_policies
   WHERE schemaname = 'public'
),
pl AS (
  SELECT to_regclass('public.players') IS NOT NULL AS existe,
         EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = to_regclass('public.players')
                    AND attname = 'tenant_id' AND NOT attisdropped) AS con_tenant,
         EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = to_regclass('auth.users')
                    AND attname = 'raw_app_meta_data' AND NOT attisdropped) AS con_app_meta
),
filas(n, comprobacion, resultado, esperado, ok) AS (
  -- 1 · BLOQUEA. Tipos que da por hechos la 073 (helper con p_player_id text).
  SELECT 1, 'players: columnas id / tenant_id / user_id',
         r, 'id:text · tenant_id:uuid · user_id:uuid', r = 'id:text · tenant_id:uuid · user_id:uuid'
    FROM (SELECT coalesce((SELECT string_agg(attname || ':' || format_type(atttypid, atttypmod), ' · ' ORDER BY attname)
                             FROM pg_attribute
                            WHERE attrelid = to_regclass('public.players')
                              AND attname IN ('id', 'tenant_id', 'user_id') AND NOT attisdropped),
                          'players no existe') AS r) x
  UNION ALL
  -- 2 · BLOQUEA. La rama por tenant usa public.tenant_id() (003:126).
  SELECT 2, 'public.tenant_id() existe',
         (to_regprocedure('public.tenant_id()') IS NOT NULL)::text, 'true',
         to_regprocedure('public.tenant_id()') IS NOT NULL
  UNION ALL
  -- 3 · BLOQUEA. Nadie más usa ya el nombre del helper (CREATE OR REPLACE lo pisaría).
  SELECT 3, 'funciones public.caller_manages_player que NO son de la 073',
         count(*)::text, '0', count(*) = 0
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname = 'caller_manages_player'
     AND coalesce(obj_description(p.oid, 'pg_proc'), '') NOT LIKE '073 ·%'
  UNION ALL
  -- 4 · BLOQUEA. El helper es SECURITY INVOKER: lee players con los permisos de quien consulta.
  SELECT 4, 'authenticated puede hacer SELECT en players',
         r, 'true', r = 'true'
    FROM (SELECT CASE WHEN to_regclass('public.players') IS NULL OR to_regrole('authenticated') IS NULL THEN 'no aplica'
                      ELSE has_table_privilege('authenticated', to_regclass('public.players'), 'SELECT')::text END AS r) x
  UNION ALL
  -- 5 · BLOQUEA. Sin una política de players que deje al dueño leer SU jugador, la 073
  --     quedaría inerte (cerrada, no abre nada). Deben salir 1 o más.
  SELECT 5, 'players: políticas SELECT/ALL de dueño (user_id = auth.uid()) para authenticated',
         count(*)::text, '1 o más', count(*) >= 1
    FROM pol
   WHERE tablename = 'players' AND permissive = 'PERMISSIVE'
     AND cmd IN ('SELECT', 'ALL')
     AND roles && ARRAY['authenticated', 'public']::name[]
     AND (q ~ 'user_id=(select)?auth\.uid' OR q ~ 'auth\.uid(asuid)?=([a-z0-9_]+\.)*user_id')
  UNION ALL
  -- 6 · INFO. La rama por tenant de la 073 solo funciona si la RLS de players deja ver
  --     al compañero de tenant (p. ej. players_tenant_isolation de 003).
  SELECT 6, 'players: políticas SELECT/ALL por tenant (public.tenant_id())',
         count(*)::text, 'informativo', NULL::boolean
    FROM pol
   WHERE tablename = 'players' AND cmd IN ('SELECT', 'ALL')
     AND (qp ~ 'tenant_id=\(?(select)?(public\.)?tenant_id\(\)'
          OR qp ~ '(public\.)?tenant_id\(\)\)?=([a-z0-9_]+\.)*tenant_id')
  UNION ALL
  -- 7 · INFO. RLS de players.
  SELECT 7, 'players: RLS activada',
         coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.players')), 'players no existe'),
         'informativo', NULL::boolean
  UNION ALL
  -- 8 · INFO. La 073 se salta las que no existan (p. ej. si la 044 no está aplicada).
  SELECT 8, 'tablas de la 073 que NO existen',
         coalesce(string_agg(tabla, ', ' ORDER BY tabla), 'ninguna'), 'informativo', NULL::boolean
    FROM tablas WHERE to_regclass('public.' || tabla) IS NULL
  UNION ALL
  -- 9 · INFO. Las políticas de la 073 convierten player_id a text.
  SELECT 9, 'tablas cuyo player_id NO es text',
         coalesce(string_agg(t.tabla || ':' || format_type(a.atttypid, a.atttypmod), ', ' ORDER BY t.tabla), 'ninguna'),
         'informativo', NULL::boolean
    FROM tablas t
    JOIN pg_attribute a ON a.attrelid = to_regclass('public.' || t.tabla) AND a.attname = 'player_id' AND NOT a.attisdropped
   WHERE format_type(a.atttypid, a.atttypmod) <> 'text'
  UNION ALL
  -- 10 · BLOQUEA. Una política que la 073 no conoce seguiría ahí y podría dar acceso.
  SELECT 10, 'políticas DESCONOCIDAS en las 8 tablas',
         coalesce(string_agg(p.tablename || ':' || p.policyname, ', ' ORDER BY p.tablename, p.policyname), 'ninguna'),
         'ninguna', count(*) = 0
    FROM pol p
    JOIN tablas t ON t.tabla = p.tablename
   WHERE NOT EXISTS (SELECT 1 FROM conocidas c WHERE c.tabla = p.tablename AND c.politica = p.policyname)
  UNION ALL
  -- 11 · INFO. Registro de lo que hay hoy (se reemplaza).
  SELECT 11, 'políticas actuales en las 8 tablas',
         coalesce(string_agg(p.tablename || ':' || p.policyname || ':' || p.cmd, ', ' ORDER BY p.tablename, p.policyname), 'ninguna'),
         'informativo', NULL::boolean
    FROM pol p JOIN tablas t ON t.tabla = p.tablename
  UNION ALL
  -- 12 · INFO. Producción (verificado 29-30 sep): 3 · 0 · 0.
  SELECT 12, 'jugadores: total · sin user_id · sin tenant_id',
         CASE WHEN NOT pl.existe THEN 'players no existe'
              WHEN NOT pl.con_tenant THEN substring(query_to_xml(
                'select count(*)::text || '' · '' || count(*) filter (where user_id is null)::text || '' · sin columna tenant_id'' as c from public.players',
                false, true, '')::text from '<c>([^<]*)</c>')
              ELSE substring(query_to_xml(
                'select count(*)::text || '' · '' || count(*) filter (where user_id is null)::text || '' · '' || count(*) filter (where tenant_id is null)::text as c from public.players',
                false, true, '')::text from '<c>([^<]*)</c>')
         END,
         'informativo', NULL::boolean
    FROM pl
  UNION ALL
  -- 13 · DECISIÓN DEL DUEÑO. Usuarios que NO son dueños de un jugador pero cuyo
  --      app_metadata.tenant_id (lo que el hook 057 copia al claim raíz) coincide con el
  --      tenant_id de ese jugador. Con el hook activo, tras la 073 verían y escribirían
  --      el bienestar de ese jugador (regla ownsPlayerOrTenant). Si sale distinto de
  --      «0 usuario(s) · 0 jugador(es)», NO apliques hasta decidirlo.
  SELECT 13, 'usuarios NO dueños que entrarían por tenant · jugadores afectados',
         r, '0 usuario(s) · 0 jugador(es)', r = '0 usuario(s) · 0 jugador(es)'
    FROM (SELECT CASE WHEN NOT pl.existe OR NOT pl.con_tenant OR NOT pl.con_app_meta
                        THEN '0 usuario(s) · 0 jugador(es)'
                      ELSE substring(query_to_xml(
                        'select count(distinct u.id)::text || '' usuario(s) · '' || count(distinct p.id)::text || '' jugador(es)'' as c
                           from auth.users u
                           join public.players p
                             on p.tenant_id is not null
                            and p.tenant_id::text = u.raw_app_meta_data ->> ''tenant_id''
                          where p.user_id is distinct from u.id',
                        false, true, '')::text from '<c>([^<]*)</c>')
                 END AS r
            FROM pl) x
  UNION ALL
  -- 14 · DECISIÓN DEL DUEÑO. La 073 retira la rama created_by = auth.uid() de
  --      player_injuries (044). Filas que dependían de ella para el cliente.
  SELECT 14, 'player_injuries: filas con created_by (dejarían de verse desde el navegador)',
         r, '0', r IN ('0', 'tabla no existe')
    FROM (SELECT CASE WHEN to_regclass('public.player_injuries') IS NULL THEN 'tabla no existe'
                      WHEN NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.player_injuries')
                                          AND attname = 'created_by' AND NOT attisdropped) THEN '0'
                      ELSE substring(query_to_xml('select count(*) filter (where created_by is not null)::text as c from public.player_injuries',
                                                  false, true, '')::text from '<c>([^<]*)</c>')
                 END AS r) x
  UNION ALL
  -- 15 · INFO. Filas que hay hoy (lo que el dueño/tenant empezará a ver tras la 073).
  SELECT 15, 'filas por tabla',
         string_agg(t.tabla || '=' || CASE WHEN to_regclass('public.' || t.tabla) IS NULL THEN 'no existe'
                                           ELSE substring(query_to_xml(format('select count(*)::text as c from public.%I', t.tabla),
                                                                       false, true, '')::text from '<c>([^<]*)</c>') END,
                    ' · ' ORDER BY t.tabla),
         'informativo', NULL::boolean
    FROM tablas t
  UNION ALL
  -- 16 · INFO. Si la función del hook existe. Si está ACTIVADA solo se ve en
  --      Dashboard > Authentication > Hooks (no es visible por SQL).
  SELECT 16, 'función del hook 057 (custom_access_token_hook) existe',
         (to_regprocedure('public.custom_access_token_hook(jsonb)') IS NOT NULL)::text
           || ' · activación: mirar Dashboard > Authentication > Hooks',
         'informativo', NULL::boolean
)
SELECT n, comprobacion, resultado, esperado, ok
  FROM filas
 ORDER BY n;
