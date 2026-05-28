/**
 * VITAS · Highlights Detector
 *
 * Phase 1: simulates detection of highlight-worthy moments from a video.
 * Phase 2 hook: replace runHighlightsDetection() with a call to
 * /api/highlights/_detect.
 */

import type {
  HighlightClip,
  HighlightReel,
  ClipMoment,
  GenerationOptions,
} from "@/lib/highlights/types";
import { HighlightsStorage } from "./highlightsStorage";

export interface DetectionProgress {
  stage:
    | "loading"
    | "tracking"
    | "ball_events"
    | "shot_classification"
    | "skill_detection"
    | "ranking"
    | "compiling"
    | "finished";
  pct: number;
  message: string;
}

export type DetectionListener = (p: DetectionProgress) => void;

const STAGE_FLOW: Array<{
  stage: DetectionProgress["stage"];
  message: string;
  duration: number;
  pct: number;
}> = [
  { stage: "loading", message: "Cargando video y metadatos…", duration: 500, pct: 5 },
  { stage: "tracking", message: "Tracking de los 22 jugadores (YOLO + ByteTrack)…", duration: 900, pct: 25 },
  { stage: "ball_events", message: "Detectando eventos con el balón…", duration: 800, pct: 45 },
  { stage: "shot_classification", message: "Clasificando tiros, goles, paradas…", duration: 700, pct: 62 },
  { stage: "skill_detection", message: "Detectando regates, scans y duelos…", duration: 700, pct: 78 },
  { stage: "ranking", message: "Rankeando momentos por impacto (xG, gol, asistencia)…", duration: 600, pct: 90 },
  { stage: "compiling", message: "Compilando el reel…", duration: 500, pct: 97 },
  { stage: "finished", message: "Reel listo", duration: 0, pct: 100 },
];

const PLAYER_POOL = [
  "Samu",
  "Marco López",
  "Diego Fernández",
  "Tomás Sánchez",
  "Andrés Rodríguez",
  "Pablo Martínez",
  "Lucas García",
  "Nicolás Torres",
  "Mateo Ruiz",
];

const MOMENT_WEIGHTS: Array<{ moment: ClipMoment; weight: number; duration: number }> = [
  { moment: "goal", weight: 3, duration: 8 },
  { moment: "shot", weight: 14, duration: 5 },
  { moment: "assist", weight: 6, duration: 7 },
  { moment: "key_pass", weight: 12, duration: 5 },
  { moment: "dribble", weight: 10, duration: 6 },
  { moment: "tackle", weight: 8, duration: 4 },
  { moment: "save", weight: 5, duration: 5 },
  { moment: "recovery", weight: 10, duration: 4 },
  { moment: "scan", weight: 7, duration: 3 },
  { moment: "set_piece", weight: 8, duration: 7 },
  { moment: "duel", weight: 9, duration: 4 },
  { moment: "skill", weight: 8, duration: 6 },
];

const DESCRIPTIONS: Record<ClipMoment, string[]> = {
  goal: [
    "Gol desde dentro del área tras pase filtrado",
    "Definición precisa al primer palo",
    "Gol de cabeza tras córner",
    "Vaselina sobre el portero",
  ],
  shot: [
    "Disparo potente al ángulo",
    "Tiro desde fuera del área",
    "Remate de primeras dentro del área",
    "Disparo con efecto rozando el larguero",
  ],
  assist: [
    "Asistencia en bandeja para el rematador",
    "Centro al segundo palo perfecto",
    "Pase filtrado entre líneas",
    "Pase de exterior al espacio",
  ],
  key_pass: [
    "Pase clave al espacio",
    "Cambio de orientación largo",
    "Pase entre líneas que rompe la presión",
    "Pase vertical agresivo",
  ],
  dribble: [
    "Regate en velocidad eliminando al rival",
    "Caño limpio y salida con balón",
    "Doble bicicleta y centro",
    "Recorte hacia adentro y disparo",
  ],
  tackle: [
    "Entrada limpia robando el balón",
    "Anticipación perfecta en zona defensiva",
    "Recuperación con barrida",
    "Marcaje agresivo y robo",
  ],
  save: [
    "Parada con reflejos del portero",
    "Estirada al palo largo",
    "Achique a tiempo y blocaje",
    "Parada doble dentro del área",
  ],
  recovery: [
    "Recuperación tras presión alta",
    "Robo en campo rival",
    "Intercepción en zona media",
    "Recuperación en transición",
  ],
  scan: [
    "Scan triple antes de recibir",
    "Observación previa al pase",
    "Cabeza alta y decisión rápida",
    "Visión periférica para evitar la presión",
  ],
  set_piece: [
    "Córner peligroso al primer palo",
    "Falta directa con curva sobre la barrera",
    "Penal ejecutado al ángulo",
    "Saque de banda largo al área",
  ],
  duel: [
    "Duelo aéreo ganado",
    "Mano a mano resuelto",
    "Pelea por la posición ganada",
    "Duelo 1v1 con regate exitoso",
  ],
  skill: [
    "Sombrero al rival",
    "Control orientado de pecho",
    "Toque exquisito al espacio",
    "Sutil enganche cambiando el ritmo",
  ],
};

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

function genClipId(): string {
  return `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Generate a set of highlight clips from a video.
 * The reel will roughly hit `targetDurationSec` total clip duration.
 */
export async function runHighlightsDetection(
  options: GenerationOptions,
  onProgress?: DetectionListener,
): Promise<HighlightReel> {
  for (const step of STAGE_FLOW) {
    onProgress?.({ stage: step.stage, pct: step.pct, message: step.message });
    if (step.duration > 0) {
      await new Promise((r) => setTimeout(r, step.duration));
    }
  }

  const rng = seededRng(`${options.videoId}_${options.targetDurationSec}_${options.momentTypes.length}`);

  const clips: HighlightClip[] = [];
  let totalDuration = 0;
  const videoDurationMs = options.videoDurationSec * 1000;
  const targetMs = options.targetDurationSec * 1000;

  // Filter weights by allowed moments
  const allowed = MOMENT_WEIGHTS.filter((m) => options.momentTypes.includes(m.moment));
  if (allowed.length === 0) {
    throw new Error("Selecciona al menos un tipo de momento");
  }

  // Distribute clips throughout the video timeline
  let attempts = 0;
  const maxAttempts = 200;
  while (totalDuration < targetMs && attempts < maxAttempts) {
    attempts++;
    const cfg = pickWeighted(
      rng,
      allowed.map((a) => ({ value: a, weight: a.weight })),
    );
    const clipDurationMs = (cfg.duration + rng() * 2) * 1000;
    const startMs = Math.floor(rng() * Math.max(0, videoDurationMs - clipDurationMs - 1000));

    // Avoid heavy overlaps with existing clips
    const overlaps = clips.some(
      (c) => startMs < c.endMs + 2000 && startMs + clipDurationMs > c.startMs - 2000,
    );
    if (overlaps) continue;

    const descs = DESCRIPTIONS[cfg.moment];
    const description = descs[Math.floor(rng() * descs.length)];

    let playerName: string | undefined;
    if (options.playerName) {
      playerName = options.playerName;
    } else if (rng() > 0.2) {
      playerName = PLAYER_POOL[Math.floor(rng() * PLAYER_POOL.length)];
    }

    clips.push({
      id: genClipId(),
      startMs,
      endMs: startMs + clipDurationMs,
      moment: cfg.moment,
      playerName,
      description,
      confidence: 0.7 + rng() * 0.28,
      manual: false,
    });
    totalDuration += clipDurationMs;
  }

  // Sort by timestamp
  clips.sort((a, b) => a.startMs - b.startMs);

  // Persist reel
  const reel = HighlightsStorage.create({
    title:
      options.title?.trim() ||
      `Reel — ${options.videoTitle} · ${options.targetDurationSec}s`,
    sourceVideoId: options.videoId,
    sourceVideoTitle: options.videoTitle,
    sourceVideoUrl: options.videoUrl,
    thumbnailUrl: null,
    clips,
    tags: options.playerName ? [options.playerName] : [],
  });

  return reel;
}
