/**
 * VITAS · Highlights — Types
 *
 * Auto-generated highlight reels from analyzed videos.
 */

export type ClipMoment =
  | "goal"
  | "shot"
  | "assist"
  | "key_pass"
  | "dribble"
  | "tackle"
  | "save"
  | "recovery"
  | "scan"
  | "set_piece"
  | "duel"
  | "skill";

export interface HighlightClip {
  id: string;
  /** Timestamp in source video (ms) where the clip starts */
  startMs: number;
  /** Timestamp in source video (ms) where the clip ends */
  endMs: number;
  moment: ClipMoment;
  /** Player(s) involved — optional */
  playerName?: string;
  /** Short description for the clip card */
  description: string;
  /** Confidence 0-1 of the auto-detection */
  confidence: number;
  /** True if user added manually, false if auto-detected */
  manual: boolean;
}

export interface HighlightReel {
  id: string;
  title: string;
  /** Source video id from VideoService */
  sourceVideoId: string;
  sourceVideoTitle: string;
  sourceVideoUrl: string;
  /** Total duration of all clips combined (ms) */
  totalDurationMs: number;
  clips: HighlightClip[];
  createdAt: string;
  updatedAt: string;
  /** Optional cover image URL */
  thumbnailUrl?: string | null;
  /** Optional notes from user */
  notes?: string;
  /** Tag system — useful for filtering ("U14", "vs Rival FC", "Skills") */
  tags?: string[];
}

export interface GenerationOptions {
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  videoDurationSec: number;
  /** Target duration in seconds (the reel will roughly hit this) */
  targetDurationSec: number;
  /** Which moment types to include */
  momentTypes: ClipMoment[];
  /** Optional: focus on a single player */
  playerName?: string;
  /** Optional title override */
  title?: string;
}

export const MOMENT_META: Record<
  ClipMoment,
  { label: string; color: string; emoji: string }
> = {
  goal: { label: "Gol", color: "#10b981", emoji: "⚽" },
  shot: { label: "Tiro", color: "#3b82f6", emoji: "🎯" },
  assist: { label: "Asistencia", color: "#a855f7", emoji: "🤝" },
  key_pass: { label: "Pase clave", color: "#6366f1", emoji: "🎯" },
  dribble: { label: "Regate", color: "#f59e0b", emoji: "⚡" },
  tackle: { label: "Entrada", color: "#ef4444", emoji: "🛡️" },
  save: { label: "Parada", color: "#06b6d4", emoji: "🧤" },
  recovery: { label: "Recuperación", color: "#10b981", emoji: "🔁" },
  scan: { label: "Scan", color: "#ec4899", emoji: "👁️" },
  set_piece: { label: "Balón parado", color: "#fbbf24", emoji: "🔱" },
  duel: { label: "Duelo", color: "#f97316", emoji: "⚔️" },
  skill: { label: "Habilidad", color: "#8b5cf6", emoji: "✨" },
};

export const ALL_MOMENTS: ClipMoment[] = [
  "goal",
  "shot",
  "assist",
  "key_pass",
  "dribble",
  "tackle",
  "save",
  "recovery",
  "scan",
  "set_piece",
  "duel",
  "skill",
];
