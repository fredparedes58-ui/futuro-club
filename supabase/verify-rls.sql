-- ═══════════════════════════════════════════════════════════════════════════
-- VITAS · Verificación de RLS (Sprint 0.1 / 0.8)
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de aplicar las migraciones.
-- Objetivo: garantizar aislamiento multi-tenant (cada cuenta ve solo lo suyo).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Tablas SIN RLS habilitado (debe salir VACÍO).
--    Cualquier fila aquí = tabla expuesta a todos los usuarios.
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
ORDER BY tablename;

-- 2) Tablas con RLS habilitado pero SIN políticas (debe salir VACÍO).
--    RLS on + 0 policies = nadie puede leer/escribir (feature rota) salvo service_role.
SELECT t.tablename
FROM pg_tables t
LEFT JOIN pg_policies p
  ON p.schemaname = t.schemaname AND p.tablename = t.tablename
WHERE t.schemaname = 'public'
  AND t.rowsecurity = true
  AND p.policyname IS NULL
GROUP BY t.tablename
ORDER BY t.tablename;

-- 3) Recuento de políticas por tabla (revisión rápida de cobertura).
SELECT tablename, count(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) TEST MANUAL de aislamiento con 2 cuentas (exit criteria Sprint 0)
-- ═══════════════════════════════════════════════════════════════════════════
-- a) Crea 2 usuarios (A y B) vía la app (registro real).
-- b) Con la cuenta A, crea 1 jugador. Anota su id.
-- c) Inicia sesión como B y, desde el navegador (consola), pide el jugador de A:
--      await (await fetch(
--        `${SUPABASE_URL}/rest/v1/players?id=eq.<ID_DE_A>`,
--        { headers: { apikey: ANON_KEY, Authorization: `Bearer ${TOKEN_DE_B}` } }
--      )).json()
--    → DEBE devolver [] (array vacío). Si devuelve el jugador, la RLS está mal.
-- d) Repite para tablas sensibles: analyses, reports, subscriptions,
--    behavioral_profiles, development_plans, wellbeing_questionnaires.
