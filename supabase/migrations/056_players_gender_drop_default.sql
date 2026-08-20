-- 056 · players.gender: quitar el DEFAULT 'M' (invariante #5: no asumir sexo)
--
-- La migración 024 añadió `players.gender text DEFAULT 'M'`. Ese default hace que
-- un INSERT que OMITA gender obtenga 'M' en silencio → a una jugadora se le
-- aplicaría la fórmula PHV masculina. El sexo debe ser una elección explícita
-- (el formulario ya lo exige; #136). Aquí quitamos el default a nivel de BD para
-- que cualquier escritura que no lo especifique deje NULL (sexo desconocido),
-- que el motor de maduración trata como "bloquear pidiendo el dato".
--
-- La columna SIGUE siendo nullable (no se añade NOT NULL): los jugadores legacy
-- sin sexo confirmado quedan con NULL, no forzados a un sexo inventado. La
-- decisión de re-confirmar el sexo de los legacy guardados como 'M' es de
-- producto (requiere criterio humano) — ver tarea de seguimiento.

BEGIN;

ALTER TABLE players ALTER COLUMN gender DROP DEFAULT;

COMMENT ON COLUMN players.gender IS
  'Sexo biológico (M/F) para el cálculo PHV sexo-específico. NULL = no registrado (se bloquea el PHV, no se asume). Sin DEFAULT: exige elección explícita.';

COMMIT;
