-- 053 · Retirar la columna player_anthropometrics.biological_age
--
-- El valor se calculaba como `biological_age = chronological_age + maturity_offset`,
-- una fórmula INVÁLIDA: el maturity offset de Mirwald son "años respecto al PHV",
-- no un delta de edad, así que sumarlo no tiene sentido (e invierte early/late).
-- Retirado del código en F3 (PR #60) — ya no se escribe ni se lee. La maduración
-- se representa con `maturity_offset` + `phv_category`; el APHV válido = edad − offset.
--
-- La vista `player_latest_anthropometrics` proyecta la columna, así que hay que
-- recrearla sin ella ANTES de dropearla.

BEGIN;

DROP VIEW IF EXISTS player_latest_anthropometrics;

ALTER TABLE player_anthropometrics DROP COLUMN IF EXISTS biological_age;

CREATE VIEW player_latest_anthropometrics AS
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
  measured_at
FROM player_anthropometrics
ORDER BY player_id, measured_at DESC;

COMMENT ON VIEW player_latest_anthropometrics IS 'Última medida antropométrica por jugador';

COMMIT;
