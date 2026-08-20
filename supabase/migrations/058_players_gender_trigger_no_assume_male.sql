-- =====================================================================
-- 058 · players.gender: quitar el fallback 'M' del TRIGGER de sincronización
-- =====================================================================
-- Invariante #5 (CLAUDE.md): la maduración PHV es sexo-específica; si falta el
-- sexo registrado, se BLOQUEA pidiendo el dato — NUNCA se asume 'M'.
--
-- La migración 056 quitó el DEFAULT 'M' de la COLUMNA `players.gender`, pero el
-- trigger `sync_player_columns_from_jsonb()` (migración 024, línea 78) tenía su
-- PROPIO fallback:
--     NEW.gender := COALESCE(NEW.gender, NEW.data->>'gender', 'M');
-- Ese tercer argumento re-inyecta 'M' en cada INSERT/UPDATE cuando el sexo está
-- ausente tanto en la columna como en el blob → un `UPDATE ... SET gender = NULL`
-- no se pega: el trigger lo revierte a 'M'. Es un assume-male en la capa de BD.
--
-- Este fix recrea la función SIN el fallback 'M' (el resto de columnas intactas)
-- y re-nulea las filas legacy cuyo sexo ya se estripó del blob pero seguían en 'M'
-- en la columna plana por culpa del trigger.
--
-- Idempotente. NO toca las fórmulas M/F ni el cálculo PHV (invariante #4).
-- =====================================================================

BEGIN;

-- 1) Recrear la función de sync sin el fallback 'M' en gender ────────────
CREATE OR REPLACE FUNCTION sync_player_columns_from_jsonb()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
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
    -- invariante #5: sin fallback 'M'. Sexo ausente ⇒ NULL (se bloquea aguas abajo).
    NEW.gender            := COALESCE(NEW.gender, NEW.data->>'gender');
    NEW.metric_speed      := COALESCE(NEW.metric_speed, (NEW.data->'metrics'->>'speed')::numeric, 0);
    NEW.metric_technique  := COALESCE(NEW.metric_technique, (NEW.data->'metrics'->>'technique')::numeric, 0);
    NEW.metric_vision     := COALESCE(NEW.metric_vision, (NEW.data->'metrics'->>'vision')::numeric, 0);
    NEW.metric_stamina    := COALESCE(NEW.metric_stamina, (NEW.data->'metrics'->>'stamina')::numeric, 0);
    NEW.metric_shooting   := COALESCE(NEW.metric_shooting, (NEW.data->'metrics'->>'shooting')::numeric, 0);
    NEW.metric_defending  := COALESCE(NEW.metric_defending, (NEW.data->'metrics'->>'defending')::numeric, 0);
    NEW.vsi               := COALESCE(NEW.vsi, (NEW.data->>'vsi')::numeric, 0);
    NEW.phv_category      := COALESCE(NEW.phv_category, NEW.data->>'phvCategory');
    NEW.phv_offset        := COALESCE(NEW.phv_offset, (NEW.data->>'phvOffset')::numeric);
  END IF;
  RETURN NEW;
END;
$$;

-- El trigger trg_sync_player_columns ya apunta a esta función (024); no se recrea.

-- 2) Re-nulear el sexo de las filas cuyo blob ya no tiene gender pero la columna
--    quedó en 'M' por el fallback del trigger. Ahora que el fallback no existe,
--    el UPDATE se pega (COALESCE(NULL, NULL) = NULL).
UPDATE public.players
SET gender = NULL
WHERE gender = 'M'
  AND (data->>'gender') IS NULL;

COMMENT ON FUNCTION sync_player_columns_from_jsonb() IS
  'Sincroniza columnas planas desde el blob data en INSERT/UPDATE. gender SIN '
  'fallback ''M'' (invariante #5: no asumir sexo; ausente ⇒ NULL).';

COMMIT;
