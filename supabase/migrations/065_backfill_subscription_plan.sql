-- 065 · Backfill de subscriptions.plan desde plan_tier (ITEM #11)
--
-- El webhook de facturación vivo (api/webhooks/stripe.ts, Pipeline B) escribía
-- SOLO plan_tier; la columna `plan` (la que leen los gates premium: withHandler
-- y usePlan) se quedaba en su DEFAULT 'free' → un usuario que pagaba por la UI
-- recibía 403 PLAN_REQUIRED en todos los endpoints premium.
--
-- El código ya sincroniza plan a partir de plan_tier de aquí en adelante; esta
-- migración repara las filas existentes ya mal puestas. Idempotente (IS DISTINCT
-- FROM), solo filas activas/trialing, y solo produce free/pro/club → satisface el
-- CHECK de 005_subscriptions.sql. No toca ninguna métrica/PHV.

UPDATE public.subscriptions
SET plan = CASE
      WHEN plan_tier = 'pro'                   THEN 'pro'
      WHEN plan_tier IN ('academia', 'agencia') THEN 'club'
      ELSE 'free'
    END,
    updated_at = now()
WHERE status IN ('active', 'trialing')
  AND plan_tier IS NOT NULL
  AND plan IS DISTINCT FROM (CASE
      WHEN plan_tier = 'pro'                   THEN 'pro'
      WHEN plan_tier IN ('academia', 'agencia') THEN 'club'
      ELSE 'free'
    END);
