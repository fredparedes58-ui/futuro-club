/**
 * VITAS · GET /api/match/availability?locale= — ¿se ofrece el análisis de partido por vídeo?
 *
 * SOLO LECTURA. La UI lo consulta ANTES de ofrecer la ruta de vídeo: si `enabled` es
 * false la muestra como «En validación» (deshabilitada, con `reason`) y deja el informe
 * con notas funcionando. No lista nombres de variables de entorno (solo el 503 de /start).
 */
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";
import { normalizeLocale } from "../../src/lib/shared/locale";
import { matchAvailability } from "../_lib/matchJob/availability";

export default withHandler({ method: "GET", requireAuth: true, maxRequests: 60 }, async ({ query }) =>
  successResponse(matchAvailability(normalizeLocale(query.locale))),
);
