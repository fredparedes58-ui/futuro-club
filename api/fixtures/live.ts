/**
 * GET /api/fixtures/live
 * Proxy de Football-Data.org — retorna partidos en vivo / próximos del día.
 * Cache: 60 segundos.
 *
 * Requiere: FOOTBALL_DATA_API_KEY en variables de entorno.
 * Free tier: LaLiga (PD), Premier (PL), Champions (CL), Bundesliga (BL1), Serie A (SA)
 */

import { withHandler } from "../lib/withHandler";
import { successResponse } from "../lib/apiResponse";

export const config = { runtime: "edge" };

interface FDMatch {
  id: number;
  homeTeam: { name: string };
  awayTeam: { name: string };
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
  status: string;
  minute?: number;
}

interface FDResponse {
  matches: FDMatch[];
}

export default withHandler(
  { method: "GET", maxRequests: 30 },
  async () => {
    const apiKey = process.env.FOOTBALL_DATA_API_KEY;

    if (!apiKey || apiKey.startsWith("placeholder")) {
      // Sin API key → retorna array vacío (el Dashboard muestra "No hay partidos")
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    try {
      // Fetch today's matches from multiple competitions
      const competitions = ["PD", "PL", "CL", "BL1", "SA"];
      const today = new Date().toISOString().split("T")[0];

      const fetchComp = (comp: string) =>
        fetch(
          `https://api.football-data.org/v4/competitions/${comp}/matches?dateFrom=${today}&dateTo=${today}`,
          { headers: { "X-Auth-Token": apiKey } },
        )
          .then((r) => r.json() as Promise<FDResponse>)
          .catch(() => ({ matches: [] as FDMatch[] }));

      const results = await Promise.all(competitions.map(fetchComp));
      const allMatches = results.flatMap((r) => r.matches ?? []);

      // Filtrar: solo en vivo, en pausa o próximos del día
      const relevant = allMatches.filter((m) =>
        ["IN_PLAY", "PAUSED", "TIMED", "SCHEDULED"].includes(m.status),
      );

      // Ordenar: primero en vivo
      relevant.sort((a, b) => {
        const order = ["IN_PLAY", "PAUSED", "TIMED", "SCHEDULED"];
        return order.indexOf(a.status) - order.indexOf(b.status);
      });

      const mapped = relevant.slice(0, 8).map((m) => ({
        id: String(m.id),
        homeTeam: m.homeTeam.name,
        awayTeam: m.awayTeam.name,
        score: [
          m.score.fullTime.home ?? m.score.halfTime.home ?? 0,
          m.score.fullTime.away ?? m.score.halfTime.away ?? 0,
        ] as [number, number],
        minute: m.minute ?? 0,
        status: m.status === "IN_PLAY" || m.status === "PAUSED" ? "live" :
                m.status === "FINISHED" ? "finished" : "upcoming",
        playersTracked: 0,
        topPerformer: "",
        topVsi: 0,
      }));

      return successResponse(mapped);
    } catch (err) {
      console.error("[Fixtures] Error:", err);
      return successResponse([]);
    }
  },
);
