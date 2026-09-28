/**
 * VITAS · Highlights — generador de reels de EJEMPLO (MOCK) + reels manuales
 *
 * HONESTIDAD (CLAUDE.md inv. 1-3, .claude/rules/metricas.md): VITAS todavía NO
 * detecta momentos (goles, tiros, regates…) en un vídeo. Antes este módulo decía
 * «Tracking de los 22 jugadores (YOLO + ByteTrack)» con una barra teatral y
 * generaba clips con timestamps, nombres y «confianza IA» aleatorios sobre los
 * vídeos REALES del usuario.
 *
 * Ahora:
 *  - Vídeo real ⇒ la detección queda BLOQUEADA (`gate_reason`); se puede crear un
 *    reel VACÍO para añadir los clips a mano (`createManualReel`).
 *  - Partido demo (`demo_reel_*`) ⇒ reel de EJEMPLO, `provenance: "MOCK"`, que la
 *    UI rotula con el badge canónico y el DemoDataBanner.
 *  - Un clip con `manual: false` NUNCA salió de un detector real ⇒ es de ejemplo
 *    (`isSimulatedClip`), también en los reels guardados antes de este cambio.
 */

import type {
  HighlightClip,
  HighlightReel,
  ClipMoment,
  GenerationOptions,
} from "@/lib/highlights/types";
import { HighlightsStorage } from "./highlightsStorage";
import i18n from "@/i18n";

/** Solo los partidos demo pueden generar reels de ejemplo. */
export const HIGHLIGHTS_DEMO_VIDEO_PREFIX = "demo_reel_";

export function isDemoHighlightsVideo(videoId: string): boolean {
  return videoId.startsWith(HIGHLIGHTS_DEMO_VIDEO_PREFIX);
}

/** Motivo de bloqueo de la detección automática, o null si es un partido demo. */
export function highlightsDetectionGate(videoId: string): string | null {
  return isDemoHighlightsVideo(videoId) ? null : i18n.t("generateReelDialog.gateRealVideo");
}

/** Un clip no manual jamás salió de un detector real: es de ejemplo (MOCK). */
export function isSimulatedClip(clip: Pick<HighlightClip, "manual">): boolean {
  return !clip.manual;
}

/** ¿El reel contiene clips de ejemplo? ⇒ exige ProvenanceBadge MOCK + banner. */
export function reelHasSimulatedClips(reel: Pick<HighlightReel, "clips">): boolean {
  return reel.clips.some(isSimulatedClip);
}

export interface DetectionProgress {
  stage: "generating" | "finished";
  pct: number;
  message: string;
}

export type DetectionListener = (p: DetectionProgress) => void;

export type HighlightsDetectionResult =
  | { status: "mock"; provenance: "MOCK"; reel: HighlightReel; gate_reason: null }
  | { status: "gated"; provenance: null; reel: null; gate_reason: string };

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
 * Reel VACÍO para un vídeo real: el usuario añade los clips a mano en el detalle.
 * No inventa ningún momento.
 */
export function createManualReel(options: Pick<GenerationOptions, "videoId" | "videoTitle" | "videoUrl" | "title" | "playerName">): HighlightReel {
  return HighlightsStorage.create({
    title: options.title?.trim() || `Reel — ${options.videoTitle}`,
    sourceVideoId: options.videoId,
    sourceVideoTitle: options.videoTitle,
    sourceVideoUrl: options.videoUrl,
    thumbnailUrl: null,
    clips: [],
    tags: options.playerName ? [options.playerName] : [],
  });
}

/**
 * «Detección» de highlights.
 *  - Vídeo real ⇒ `{ status: "gated", gate_reason }`: no se genera ni guarda nada.
 *  - Partido demo ⇒ reel de EJEMPLO (clips aleatorios, `manual: false`,
 *    `provenance: "MOCK"`) de ~`targetDurationSec` segundos.
 */
export async function runHighlightsDetection(
  options: GenerationOptions,
  onProgress?: DetectionListener,
): Promise<HighlightsDetectionResult> {
  const gate = highlightsDetectionGate(options.videoId);
  if (gate) {
    return { status: "gated", provenance: null, reel: null, gate_reason: gate };
  }

  onProgress?.({ stage: "generating", pct: 50, message: i18n.t("generateReelDialog.analyzing") });

  const rng = seededRng(`${options.videoId}_${options.targetDurationSec}_${options.momentTypes.length}`);

  const clips: HighlightClip[] = [];
  let totalDuration = 0;
  const videoDurationMs = options.videoDurationSec * 1000;
  const targetMs = options.targetDurationSec * 1000;

  // Filter weights by allowed moments
  const allowed = MOMENT_WEIGHTS.filter((m) => options.momentTypes.includes(m.moment));
  if (allowed.length === 0) {
    throw new Error(i18n.t("errors.selectMomentType"));
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
    provenance: "MOCK",
  });

  onProgress?.({ stage: "finished", pct: 100, message: "" });
  return { status: "mock", provenance: "MOCK", reel, gate_reason: null };
}
