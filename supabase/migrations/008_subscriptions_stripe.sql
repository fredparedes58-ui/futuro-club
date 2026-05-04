-- ════════════════════════════════════════════════════════════════════════════
-- VITAS · Migration 008 · Subscriptions con Stripe
-- Sprint 5 · Día 2
-- ════════════════════════════════════════════════════════════════════════════

-- Asegurar columnas Stripe en subscriptions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_tier text CHECK (plan_tier IN ('personal','pro','academia','agencia'));
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS status text CHECK (status IN ('trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid'));
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_start timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean DEFAULT false;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS canceled_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_end timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_persona text CHECK (user_persona IN ('parent','player','coach','scout','academy_director','agent','club_director','other'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_subs_stripe_subscription ON subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status, plan_tier);

-- Cuotas por plan (verdad única)
CREATE TABLE IF NOT EXISTS plan_quotas (
  plan_tier text PRIMARY KEY CHECK (plan_tier IN ('personal','pro','academia','agencia')),
  videos_per_month int NOT NULL,
  max_players int NOT NULL,
  white_label boolean NOT NULL DEFAULT false,
  api_access boolean NOT NULL DEFAULT false,
  description text
);

INSERT INTO plan_quotas (plan_tier, videos_per_month, max_players, white_label, description) VALUES
  ('personal',  5,    2,   false, 'Padres, jugadores y entrenadores individuales'),
  ('pro',       50,   50,  false, 'Scouts y entrenadores con varios jugadores'),
  ('academia',  250,  300, false, 'Academias, clubes base y equipos formativos'),
  ('agencia',   250,  300, true,  'Agencias de representación y agentes')
ON CONFLICT (plan_tier) DO UPDATE SET
  videos_per_month = EXCLUDED.videos_per_month,
  max_players = EXCLUDED.max_players,
  white_label = EXCLUDED.white_label,
  description = EXCLUDED.description;

-- Vista: subscripción activa por usuario (consulta rápida)
CREATE OR REPLACE VIEW user_active_subscription AS
SELECT DISTINCT ON (user_id)
  s.id,
  s.user_id,
  s.tenant_id,
  s.plan_tier,
  s.status,
  s.current_period_end,
  s.cancel_at_period_end,
  s.user_persona,
  q.videos_per_month,
  q.max_players,
  q.white_label
FROM subscriptions s
LEFT JOIN plan_quotas q ON q.plan_tier = s.plan_tier
WHERE s.status IN ('active','trialing')
ORDER BY user_id, s.current_period_end DESC NULLS LAST;

COMMENT ON VIEW user_active_subscription IS 'Suscripción activa por usuario con cuotas pre-resueltas';

-- RLS
ALTER TABLE plan_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_quotas_read_all ON plan_quotas
  FOR SELECT TO authenticated USING (true);

-- Audit log subscription changes
CREATE OR REPLACE FUNCTION audit_subscription_changes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_gdpr_action(
      NEW.user_id, NEW.tenant_id, 'subscription_created',
      'subscriptions', NEW.id::text,
      jsonb_build_object('plan_tier', NEW.plan_tier, 'status', NEW.status),
      NULL
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.log_gdpr_action(
      NEW.user_id, NEW.tenant_id, 'subscription_status_changed',
      'subscriptions', NEW.id::text,
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'plan', NEW.plan_tier),
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_audit_subs ON subscriptions;
CREATE TRIGGER tr_audit_subs
AFTER INSERT OR UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION audit_subscription_changes();
