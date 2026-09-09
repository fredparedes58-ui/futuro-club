/**
 * VITAS · Match-day Live de EJEMPLO del DEMO (piso piloto)
 *
 * En el demo no hay backend de live (/api/live/* → demoApiGuard null). Aquí se
 * PRE-HORNEA UN partido "finished" de ejemplo con sus eventos y su agregación,
 * derivando nombres de jugadores del club sembrado. Es un partido de ejemplo:
 * el GlobalDemoBanner lo cubre; el tagging en vivo (crear partido) se gatea
 * honestamente (requiere un partido real). Prosa es/en.
 */

import { PlayerService } from "@/services/real/playerService";
import { normalizeLocale, pickLocale, type ReportLocale } from "@/lib/shared/locale";
import i18n from "@/i18n";

export const DEMO_LIVE_MATCH_ID = "demo-live-1";
const TEAM = "Sub-14 · Club Demo";
const RIVAL = "CD Ejemplo";
const CREATED = "2026-09-06T18:00:00.000Z";
const ENDED = "2026-09-06T19:35:00.000Z";
const DURATION = 5400; // 90'

export function buildDemoLiveMatchSummary() {
  return {
    id: DEMO_LIVE_MATCH_ID,
    team_name: TEAM,
    opponent_name: RIVAL,
    status: "finished" as const,
    duration_seconds: DURATION,
    score_home: 2,
    score_away: 1,
    created_at: CREATED,
    ended_at: ENDED,
  };
}

export function buildDemoLiveMatchDetail() {
  const match = {
    id: DEMO_LIVE_MATCH_ID,
    team_name: TEAM,
    opponent_name: RIVAL,
    status: "finished" as const,
    started_at: CREATED,
    ended_at: ENDED,
    duration_seconds: DURATION,
    score_home: 2,
    score_away: 1,
  };
  const players = PlayerService.getAll().slice(0, 4);
  const ev = (i: number, playerIdx: number, type: string, ts: number, notes?: string) => ({
    id: `demo-live-ev-${i}`,
    player_id: players[playerIdx]?.id ?? null,
    event_type: type,
    timestamp_seconds: ts,
    half: ts < 2700 ? 1 : 2,
    client_event_id: `demo-live-ev-${i}`,
    notes: notes ?? null,
    created_at: CREATED,
  });
  const events = [
    ev(1, 0, "pase_clave", 620),
    ev(2, 0, "asistencia", 1180),
    ev(3, 1, "gol", 1185, "Remate a la escuadra"),
    ev(4, 2, "recuperacion", 2050),
    ev(5, 3, "duelo_ganado", 2410),
    ev(6, 0, "gol", 3720, "Contra bien resuelta"),
    ev(7, 1, "duelo_perdido", 4310),
    ev(8, 2, "pase_clave", 5020),
  ];
  return { match, events };
}

export function buildDemoLiveAggregate(locale: ReportLocale = normalizeLocale(i18n.language)) {
  const players = PlayerService.getAll().slice(0, 4);
  const name = (i: number) => players[i]?.name ?? `Jugador ${i + 1}`;
  const statsByPlayer = players.map((p, i) => ({
    playerId: p.id,
    playerName: p.name,
    goles: i === 1 || i === 0 ? 1 : 0,
    asistencias: i === 0 ? 1 : 0,
    pases_clave: i === 0 ? 2 : i === 3 ? 1 : 0,
    recuperaciones: i === 2 ? 3 : 1,
    perdidas: i === 3 ? 2 : 1,
    duelos_ganados: 3 - i * 0 + (i % 2),
    duelos_perdidos: 1 + (i % 2),
    tarjetas: 0,
    totalEvents: 4 - i,
    netImpact: 6 - i * 2,
  }));
  return {
    cached: true,
    match: {
      id: DEMO_LIVE_MATCH_ID,
      status: "finished",
      score_home: 2,
      score_away: 1,
      duration_seconds: DURATION,
      team_name: TEAM,
      opponent_name: RIVAL,
    },
    analysis: {
      generated_at: ENDED,
      total_events: 8,
      stats_by_player: statsByPlayer,
      reports: [
        {
          type: "team-summary",
          model: "demo",
          content: {
            result_phrase: pickLocale(locale, { es: `Victoria 2-1 ante ${RIVAL} con buena gestión de las transiciones.`, en: `2-1 win against ${RIVAL} with strong transition play.` }),
            mvp: { player_name: name(0), reason: pickLocale(locale, { es: "Un gol, una asistencia y dos pases clave.", en: "One goal, one assist and two key passes." }) },
            key_moments: [
              pickLocale(locale, { es: "Min 20': asistencia que abre el marcador.", en: "20': assist opening the score." }),
              pickLocale(locale, { es: "Min 62': contra bien resuelta para el 2-0.", en: "62': well-finished counter for 2-0." }),
            ],
            team_strengths: [pickLocale(locale, { es: "Salida rápida tras recuperación.", en: "Fast exit after regaining possession." })],
            team_weaknesses: [pickLocale(locale, { es: "Pérdida de intensidad en el último tramo.", en: "Intensity drop in the final stretch." })],
            next_focus: pickLocale(locale, { es: "Cerrar partidos manteniendo la presión.", en: "Closing out games while keeping the press." }),
          },
        },
        {
          type: "per-player",
          model: "demo",
          content: {
            players: players.map((p, i) => ({
              player_name: p.name,
              rating: 8 - i * 0.4,
              summary: pickLocale(locale, { es: "Participación de ejemplo derivada de los eventos.", en: "Example contribution derived from the events." }),
              highlight: i === 0 ? pickLocale(locale, { es: "Gol + asistencia.", en: "Goal + assist." }) : pickLocale(locale, { es: "Sólido en su zona.", en: "Solid in his zone." }),
            })),
          },
        },
        {
          type: "tactical-take",
          model: "demo",
          content: {
            what_worked: [pickLocale(locale, { es: "Transiciones ofensivas rápidas.", en: "Fast offensive transitions." })],
            what_didnt: [pickLocale(locale, { es: "Repliegue tardío en los últimos minutos.", en: "Late recovery runs in the closing minutes." })],
            next_match_adjustment: pickLocale(locale, { es: "Rotar para sostener la intensidad 90'.", en: "Rotate to sustain intensity for 90'." }),
            recommended_drills: [pickLocale(locale, { es: "Transición 4v3 con finalización.", en: "4v3 transition with finishing." })],
          },
        },
      ],
    },
  };
}
