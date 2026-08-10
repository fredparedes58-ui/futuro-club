-- 054 · Ledger de gasto IA + tripwire de presupuesto mensual global
--
-- Red de seguridad EN CÓDIGO contra "runaway costs" (defensa en profundidad; el
-- tope duro real se fija en los dashboards de Modal/Anthropic). Acumula el gasto
-- ESTIMADO del mes por servicio (claude / gemini / modal). El guard del backend
-- (api/_lib/budgetGuard.ts) suma el mes y, si supera GLOBAL_MONTHLY_BUDGET_USD
-- (default $10), CORTA las llamadas de pago antes de ejecutarlas.
--
-- Solo el backend (service_role) escribe/lee esto → RLS activo sin políticas
-- públicas (service_role bypassa RLS; anon/authenticated no acceden).

BEGIN;

CREATE TABLE IF NOT EXISTS ai_spend_ledger (
  month      text        NOT NULL,               -- "YYYY-MM" (UTC), igual que el guard
  service    text        NOT NULL,               -- 'claude' | 'gemini' | 'modal'
  spent_usd  numeric(12,4) NOT NULL DEFAULT 0,   -- gasto estimado acumulado del mes
  calls      integer     NOT NULL DEFAULT 0,     -- nº de llamadas contabilizadas
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (month, service)
);

COMMENT ON TABLE ai_spend_ledger IS 'Gasto IA estimado por mes/servicio para el tripwire de presupuesto (054).';

ALTER TABLE ai_spend_ledger ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo service_role (que bypassa RLS) puede tocarla.

-- Incremento ATÓMICO + devuelve el total del mes (todos los servicios).
-- Se usa tras cada llamada de pago para contabilizar el gasto estimado.
CREATE OR REPLACE FUNCTION record_ai_spend(p_service text, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  v_total numeric;
BEGIN
  INSERT INTO ai_spend_ledger (month, service, spent_usd, calls, updated_at)
  VALUES (v_month, p_service, GREATEST(p_amount, 0), 1, now())
  ON CONFLICT (month, service)
  DO UPDATE SET spent_usd  = ai_spend_ledger.spent_usd + GREATEST(p_amount, 0),
                calls      = ai_spend_ledger.calls + 1,
                updated_at = now();

  SELECT COALESCE(SUM(spent_usd), 0) INTO v_total
  FROM ai_spend_ledger WHERE month = v_month;
  RETURN v_total;
END;
$$;

-- Gasto total del mes en curso (todos los servicios). Se usa en el pre-check.
CREATE OR REPLACE FUNCTION get_ai_spend_month()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(spent_usd), 0)
  FROM ai_spend_ledger
  WHERE month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
$$;

-- Privadas: solo el backend (service_role). Se revoca el default público.
REVOKE ALL ON FUNCTION record_ai_spend(text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_ai_spend_month() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_ai_spend(text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION get_ai_spend_month() TO service_role;

COMMIT;
