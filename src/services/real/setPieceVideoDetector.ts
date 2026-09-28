/**
 * VITAS · Set Piece — generador de jugadas de EJEMPLO (MOCK)
 *
 * HONESTIDAD (CLAUDE.md inv. 1-3, .claude/rules/metricas.md): este módulo NO
 * analiza ningún vídeo. No existe todavía un modelo que detecte y clasifique
 * jugadas a balón parado. Antes se presentaba como «tracking YOLO + ByteTrack /
 * pose» con una barra de progreso teatral y generaba 8-14 jugadas con xG,
 * confianza y nombres inventados a partir de un PRNG sembrado con el id del vídeo
 * (MOCK disfrazado), incluso sobre los vídeos REALES del usuario.
 *
 * Ahora:
 *  - Vídeo real del usuario ⇒ BLOQUEADO con `gate_reason` (no se inventa nada).
 *  - Partido demo (`demo_match_*`) ⇒ jugadas de ejemplo con `provenance: "MOCK"`,
 *    que la UI rotula con el badge canónico («Datos de ejemplo») y el
 *    DemoDataBanner.
 *  - Todo lo guardado antes en `vitas_setpiece_video_events` también era
 *    simulado ⇒ se lee siempre como MOCK.
 */

import type {
  SetPieceEvent,
  SetPieceType,
  AttackingPattern,
  SetPieceOutcome,
  SetPieceSide,
  PlayerOnSetPiece,
  SetPieceRecommendation,
} from "@/lib/setPiece/types";
import { SetPieceCustomStorage, type CustomSetPieceEvent } from "./setPieceCustomStorage";
import i18n from "@/i18n";

const VIDEO_EVENTS_KEY = "vitas_setpiece_video_events";
const VIDEO_RECS_KEY = "vitas_setpiece_video_recs";

/** Solo los partidos demo pueden generar jugadas de ejemplo. */
export const SET_PIECE_DEMO_VIDEO_PREFIX = "demo_match_";

export function isDemoSetPieceVideo(videoId: string): boolean {
  return videoId.startsWith(SET_PIECE_DEMO_VIDEO_PREFIX);
}

/**
 * Motivo de bloqueo de la «detección desde vídeo» para un vídeo dado, o null si
 * es un partido demo (del que solo se generan ejemplos MOCK).
 */
export function setPieceDetectionGate(videoId: string): string | null {
  return isDemoSetPieceVideo(videoId) ? null : i18n.t("videoAnalyzerDialog.gateRealVideos");
}

/** Jugada de EJEMPLO asociada a un partido demo (nunca extraída de un vídeo). */
export interface VideoSetPieceEvent extends CustomSetPieceEvent {
  /** Histórico: se llamaba «video»; siempre fue simulado. */
  source: "video";
  /** Partido demo para el que se generó el ejemplo */
  sourceVideoId: string;
  /** Minuto ficticio dentro del partido demo (ms) */
  videoOffsetMs: number;
  /** Procedencia canónica: SIEMPRE MOCK (exige banner visible). */
  provenance: "MOCK";
}

export interface DetectionProgress {
  stage: "generating" | "finished";
  pct: number;
  message: string;
}

export type DetectionListener = (progress: DetectionProgress) => void;

export type DetectionResult =
  | { status: "mock"; provenance: "MOCK"; events: VideoSetPieceEvent[]; gate_reason: null }
  | { status: "gated"; provenance: null; events: []; gate_reason: string };

const PLAYER_POOL = [
  { id: "p1", name: "Samu", number: 8 },
  { id: "p2", name: "Marco López", number: 10 },
  { id: "p3", name: "Diego Fernández", number: 9 },
  { id: "p4", name: "Tomás Sánchez", number: 4 },
  { id: "p5", name: "Andrés Rodríguez", number: 6 },
  { id: "p6", name: "Pablo Martínez", number: 11 },
  { id: "p7", name: "Lucas García", number: 7 },
  { id: "p8", name: "Nicolás Torres", number: 2 },
  { id: "p9", name: "Mateo Ruiz", number: 5 },
];

function seededRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  let s = (h >>> 0) || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function pickWeighted<T>(
  rng: () => number,
  items: Array<{ value: T; weight: number }>,
): T {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it.value;
  }
  return items[0].value;
}

function generatePlayers(
  rng: () => number,
  type: SetPieceType,
  side: SetPieceSide,
): PlayerOnSetPiece[] {
  const taker = PLAYER_POOL[Math.floor(rng() * 3) + 1]; // Marco/Diego/Tomás
  const others = PLAYER_POOL.filter((p) => p.id !== taker.id)
    .sort(() => rng() - 0.5)
    .slice(0, 4);

  if (type === "corner") {
    const cornerX = 100;
    const cornerY = side === "left" ? 0 : 100;
    return [
      {
        playerId: taker.id,
        playerName: taker.name,
        shirtNumber: taker.number,
        role: "taker",
        position: { x: cornerX, y: cornerY },
      },
      ...others.map((p, i) => ({
        playerId: p.id,
        playerName: p.name,
        shirtNumber: p.number,
        role: (i === 0 ? "target" : i === 3 ? "decoy" : "target") as PlayerOnSetPiece["role"],
        position: {
          x: 86 + (rng() - 0.5) * 8,
          y: 30 + i * 10 + (rng() - 0.5) * 5,
        },
      })),
    ];
  }

  // Free kick / penalty
  return [
    {
      playerId: taker.id,
      playerName: taker.name,
      shirtNumber: taker.number,
      role: "taker",
      position:
        type === "penalty"
          ? { x: 89, y: 50 }
          : { x: 72 + rng() * 12, y: 35 + rng() * 30 },
    },
    ...others.map((p, i) => ({
      playerId: p.id,
      playerName: p.name,
      shirtNumber: p.number,
      role: (i < 2 ? "target" : "screener") as PlayerOnSetPiece["role"],
      position: {
        x: 87 + (rng() - 0.5) * 6,
        y: 35 + i * 8 + (rng() - 0.5) * 5,
      },
    })),
  ];
}

const PATTERNS_BY_TYPE: Record<SetPieceType, AttackingPattern[]> = {
  corner: ["near_post", "far_post", "penalty_spot", "edge_of_box", "short_corner", "trick_play"],
  free_kick_direct: ["direct_shot", "wall_curl", "wall_over"],
  free_kick_indirect: ["near_post", "far_post", "penalty_spot", "edge_of_box"],
  penalty: ["direct_shot"],
  throw_in: ["short_corner"],
  goal_kick: ["edge_of_box"],
};

const OUTCOME_WEIGHTS: Array<{ value: SetPieceOutcome; weight: number }> = [
  { value: "goal", weight: 8 },
  { value: "shot_on_target", weight: 20 },
  { value: "shot_off_target", weight: 18 },
  { value: "blocked", weight: 12 },
  { value: "cleared", weight: 22 },
  { value: "retained", weight: 8 },
  { value: "lost", weight: 12 },
];

const TYPE_WEIGHTS: Array<{ value: SetPieceType; weight: number }> = [
  { value: "corner", weight: 45 },
  { value: "free_kick_direct", weight: 22 },
  { value: "free_kick_indirect", weight: 15 },
  { value: "throw_in", weight: 10 },
  { value: "penalty", weight: 4 },
  { value: "goal_kick", weight: 4 },
];

const TACTICAL_NOTES_POOL = [
  "Bloque de pantalla efectivo en primer palo",
  "Saque cerrado con curva interior",
  "Centro al segundo palo con jugador alto",
  "Movimiento de desmarque cruzado",
  "Pase corto para mantener posesión",
  "Disparo con curva sobre la barrera",
  "Llegada desde fuera del área",
  "Decoy del 11 hacia segundo palo",
  "Bloque del rematador sobre el central",
  "Cambio de orientación rápido",
  "Centro al punto de penal sin marca",
  "Tiro raso buscando el segundo palo",
];

const SIDE_WEIGHTS: Array<{ value: SetPieceSide; weight: number }> = [
  { value: "left", weight: 45 },
  { value: "right", weight: 45 },
  { value: "center", weight: 10 },
];

/**
 * «Detección» de jugadas a balón parado.
 *  - Vídeo real ⇒ `{ status: "gated", gate_reason }`: NO se genera ni guarda nada.
 *  - Partido demo ⇒ jugadas de EJEMPLO (`provenance: "MOCK"`), persistidas en
 *    localStorage para que aparezcan en la lista con su badge.
 * Sin barra de progreso simulada: no hay análisis que esperar.
 */
export async function runDetection(
  videoId: string,
  videoTitle: string,
  options: { eventCount?: number; onProgress?: DetectionListener } = {},
): Promise<DetectionResult> {
  const { eventCount, onProgress } = options;

  const gate = setPieceDetectionGate(videoId);
  if (gate) {
    return { status: "gated", provenance: null, events: [], gate_reason: gate };
  }

  onProgress?.({ stage: "generating", pct: 50, message: i18n.t("videoAnalyzerDialog.analyzing") });
  const rng = seededRng(videoId);

  // Número de jugadas de ejemplo (8-14)
  const count = eventCount ?? 8 + Math.floor(rng() * 7);
  const events: VideoSetPieceEvent[] = [];

  for (let i = 0; i < count; i++) {
    const type = pickWeighted(rng, TYPE_WEIGHTS);
    const side = pickWeighted(rng, SIDE_WEIGHTS);
    const patterns = PATTERNS_BY_TYPE[type];
    const pattern = patterns[Math.floor(rng() * patterns.length)];
    const outcome = pickWeighted(rng, OUTCOME_WEIGHTS);
    const minute = 1 + Math.floor(rng() * 90);
    const isOffensive = rng() > 0.4;

    const players = generatePlayers(rng, type, side);
    const origin =
      type === "corner"
        ? { x: 100, y: side === "left" ? 0 : 100 }
        : type === "penalty"
          ? { x: 89, y: 50 }
          : { x: 70 + rng() * 20, y: 20 + rng() * 60 };
    const endPoint = { x: 85 + rng() * 12, y: 35 + rng() * 30 };

    const noteIdx = Math.floor(rng() * TACTICAL_NOTES_POOL.length);
    const tacticalNotes = [
      TACTICAL_NOTES_POOL[noteIdx],
      ...(rng() > 0.55 ? [TACTICAL_NOTES_POOL[(noteIdx + 3) % TACTICAL_NOTES_POOL.length]] : []),
    ];

    const xG =
      outcome === "goal" || outcome.startsWith("shot")
        ? Math.round((0.05 + rng() * 0.4) * 100) / 100
        : undefined;

    events.push({
      id: `video_event_${videoId}_${i}`,
      matchId: `video_${videoId}`,
      matchLabel: videoTitle,
      minute,
      type,
      side,
      origin,
      endPoint,
      outcome,
      pattern,
      xG,
      players,
      tacticalNotes,
      confidence: 0.78 + rng() * 0.2,
      isOffensive,
      drawings: [],
      texts: [],
      isCustom: true,
      source: "video",
      sourceVideoId: videoId,
      videoOffsetMs: minute * 60_000 + Math.floor(rng() * 60_000),
      provenance: "MOCK",
      createdAt: new Date().toISOString(),
    });
  }

  // Persist
  const all = readVideoEvents();
  const filtered = all.filter((e) => e.sourceVideoId !== videoId);
  const updated = [...filtered, ...events];
  writeVideoEvents(updated);

  // Also save to custom storage so they show up alongside others
  for (const ev of events) {
    SetPieceCustomStorage.saveCustomEvent(ev);
  }

  onProgress?.({ stage: "finished", pct: 100, message: "" });
  return { status: "mock", provenance: "MOCK", events, gate_reason: null };
}

function readVideoEvents(): VideoSetPieceEvent[] {
  try {
    const raw = localStorage.getItem(VIDEO_EVENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Lo guardado antes de este cambio (sin `provenance`) también era simulado:
    // nunca existió un detector real → se lee SIEMPRE como MOCK.
    return Array.isArray(parsed)
      ? parsed.map((e: VideoSetPieceEvent) => ({ ...e, provenance: "MOCK" as const }))
      : [];
  } catch {
    return [];
  }
}

function writeVideoEvents(events: VideoSetPieceEvent[]): void {
  try {
    localStorage.setItem(VIDEO_EVENTS_KEY, JSON.stringify(events));
  } catch (err) {
    console.error("[setPieceVideoDetector] write failed", err);
  }
}

export const SetPieceVideoEvents = {
  getAll: readVideoEvents,
  getByVideo(videoId: string): VideoSetPieceEvent[] {
    return readVideoEvents().filter((e) => e.sourceVideoId === videoId);
  },
  deleteByVideo(videoId: string): void {
    const all = readVideoEvents();
    // Leer ANTES de sobrescribir (antes se leía después y nunca limpiaba custom storage).
    const events = all.filter((e) => e.sourceVideoId === videoId);
    writeVideoEvents(all.filter((e) => e.sourceVideoId !== videoId));
    for (const ev of events) {
      SetPieceCustomStorage.deleteCustomEvent(ev.id);
    }
  },
  isVideoEvent(eventId: string): boolean {
    return readVideoEvents().some((e) => e.id === eventId);
  },
};

// ─── Recomendaciones de EJEMPLO a partir de las jugadas de ejemplo ──────────

/**
 * Resume en 2-4 recomendaciones los patrones de las jugadas de EJEMPLO (MOCK).
 * Como su entrada es MOCK, su salida también lo es: el texto lo declara y la UI
 * las rotula con el badge canónico. No hay IA ni vídeo detrás.
 */
export function generateRecommendationsFromEvents(
  events: SetPieceEvent[],
): SetPieceRecommendation[] {
  const offensive = events.filter((e) => e.isOffensive);
  if (offensive.length < 3) return [];

  // Pattern success rate (gol o tiro a puerta)
  const patternStats: Record<string, { count: number; successes: number; type: SetPieceType }> = {};
  for (const e of offensive) {
    const key = `${e.type}::${e.pattern}`;
    if (!patternStats[key]) patternStats[key] = { count: 0, successes: 0, type: e.type };
    patternStats[key].count++;
    if (e.outcome === "goal" || e.outcome === "shot_on_target") {
      patternStats[key].successes++;
    }
  }

  const ranked = Object.entries(patternStats)
    .map(([k, v]) => ({
      key: k,
      type: v.type,
      pattern: k.split("::")[1] as AttackingPattern,
      count: v.count,
      successRate: v.count > 0 ? v.successes / v.count : 0,
    }))
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.successRate * b.count - a.successRate * a.count);

  const top = ranked.slice(0, 3);

  return top.map((p, i) => {
    const rng = seededRng(`rec_${p.key}_${i}`);
    const taker = PLAYER_POOL[Math.floor(rng() * 3) + 1];
    const others = PLAYER_POOL.filter((x) => x.id !== taker.id).slice(0, 3);

    const diagram: PlayerOnSetPiece[] =
      p.type === "corner"
        ? generatePlayers(rng, "corner", "right")
        : generatePlayers(rng, p.type, "right");

    const patternLabels: Record<AttackingPattern, string> = {
      near_post: "primer palo",
      far_post: "segundo palo",
      penalty_spot: "punto de penal",
      edge_of_box: "borde del área",
      short_corner: "córner corto",
      trick_play: "jugada ensayada",
      direct_shot: "tiro directo",
      wall_curl: "curva sobre barrera",
      wall_over: "elevado sobre barrera",
    };

    const titles: Record<AttackingPattern, string> = {
      near_post: "Córner cerrado al primer palo",
      far_post: "Centro al segundo palo con jugador alto",
      penalty_spot: "Centro al punto de penal sin marca",
      edge_of_box: "Saque corto + remate desde fuera del área",
      short_corner: "Córner corto con triángulo",
      trick_play: "Jugada ensayada con cambio de orientación",
      direct_shot: "Tiro directo potente al ángulo",
      wall_curl: "Curva sobre la barrera al segundo palo",
      wall_over: "Disparo elevado sobre la barrera",
    };

    return {
      id: `auto_rec_${p.key}_${Date.now()}`,
      type: p.type,
      pattern: p.pattern,
      title: titles[p.pattern] ?? `Patrón ${patternLabels[p.pattern]}`,
      description: `Ejemplo: en las jugadas de ejemplo generadas, este patrón funcionó el ${Math.round(p.successRate * 100)}% de las veces (${p.count} intentos), con ${taker.name} como ejecutor. No procede de ningún vídeo analizado.`,
      successProbability: Math.round(p.successRate * 100),
      basedOn: `${p.count} jugadas de ejemplo (no detectadas en ningún vídeo)`,
      diagram,
      keyPoints: [
        `${taker.name} (#${taker.number}) como ejecutor principal`,
        `Patrón "${patternLabels[p.pattern]}"`,
        `Rematador llega desde fuera del área`,
        ...(others[0] ? [`${others[0].name} como decoy o segundo rematador`] : []),
      ],
    };
  });
}

export const SetPieceVideoRecommendations = {
  getAll(): SetPieceRecommendation[] {
    try {
      const raw = localStorage.getItem(VIDEO_RECS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  set(recs: SetPieceRecommendation[]): void {
    try {
      localStorage.setItem(VIDEO_RECS_KEY, JSON.stringify(recs));
    } catch (err) {
      console.error("[setPieceVideoRecs] write failed", err);
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(VIDEO_RECS_KEY);
    } catch {
      /* ignore */
    }
  },
};
