/**
 * VITAS · Player Identity Overlay (Sprint 4 — Player Re-ID)
 *
 * Canvas overlay that renders colored badges + dorsal numbers
 * over each tracked player in the video.
 *
 * Visual design:
 *   - Badge color: team-based (blue=home, red=away, green=GK, gray=unknown)
 *   - Dorsal number displayed above badge
 *   - Confidence indicator via opacity
 *   - Focused player gets a highlight ring
 */

import React, { useEffect, useRef } from "react";
import type { Track } from "@/lib/yolo/types";
import type { PlayerIdentity } from "@/lib/yolo/playerIdentityManager";

// ─── Props ─────────────────────────────────────────────────────────────────

interface PlayerIdentityOverlayProps {
  /** Canvas dimensions (should match video overlay size) */
  width: number;
  height: number;
  /** Current player tracks */
  tracks: Track[];
  /** Identity map: trackId → PlayerIdentity */
  identities: Map<number, PlayerIdentity>;
  /** Currently focused player track ID */
  focusTrackId: number | null;
  /** Video element dimensions (for coordinate scaling) */
  videoWidth: number;
  videoHeight: number;
  /** Whether to show dorsal numbers */
  showDorsals?: boolean;
  /** Whether to show team colors */
  showTeamColors?: boolean;
  /** Overlay opacity (0-1, default: 0.9) */
  opacity?: number;
}

// ─── Team Colors ───────────────────────────────────────────────────────────

const TEAM_COLORS: Record<string, string> = {
  home: "#3B82F6",       // blue-500
  away: "#EF4444",       // red-500
  goalkeeper: "#22C55E", // green-500
  referee: "#EAB308",    // yellow-500
  unknown: "#6B7280",    // gray-500
};

const FOCUS_RING_COLOR = "#00E5FF"; // cyan accent

// ─── Component ─────────────────────────────────────────────────────────────

export const PlayerIdentityOverlay: React.FC<PlayerIdentityOverlayProps> = ({
  width,
  height,
  tracks,
  identities,
  focusTrackId,
  videoWidth,
  videoHeight,
  showDorsals = true,
  showTeamColors = true,
  opacity = 0.9,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Scale factors (video coords → canvas coords)
    const scaleX = width / videoWidth;
    const scaleY = height / videoHeight;

    ctx.globalAlpha = opacity;

    for (const track of tracks) {
      const identity = identities.get(track.id);
      const [bx, by, bw, bh] = track.bbox;

      // Scale bbox to canvas coords
      const x = bx * scaleX;
      const y = by * scaleY;
      const w = bw * scaleX;
      const h = bh * scaleY;

      const isFocused = track.id === focusTrackId;
      const teamColor = showTeamColors && identity
        ? TEAM_COLORS[identity.team] ?? TEAM_COLORS.unknown
        : TEAM_COLORS.unknown;

      // ── Focus ring ──
      if (isFocused) {
        ctx.strokeStyle = FOCUS_RING_COLOR;
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
        ctx.setLineDash([]);
      }

      // ── Team color bbox outline ──
      ctx.strokeStyle = teamColor;
      ctx.lineWidth = isFocused ? 2.5 : 1.5;
      ctx.strokeRect(x, y, w, h);

      // ── Badge with dorsal number or stable ID ──
      const badgeH = 18;
      const badgeY = y - badgeH - 2;
      const label = showDorsals && identity?.dorsalNumber
        ? `#${identity.dorsalNumber}`
        : identity?.stableId?.replace("pid_", "P") ?? `T${track.id}`;

      // Measure text for badge width
      ctx.font = "bold 11px system-ui, sans-serif";
      const textWidth = ctx.measureText(label).width;
      const badgeW = textWidth + 10;

      // Badge background
      ctx.fillStyle = teamColor;
      ctx.globalAlpha = opacity * 0.85;
      roundRect(ctx, x, badgeY, badgeW, badgeH, 4);
      ctx.fill();

      // Badge text
      ctx.globalAlpha = opacity;
      ctx.fillStyle = "#FFFFFF";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 5, badgeY + badgeH / 2);

      // ── Confidence indicator (small dot) ──
      if (identity && identity.confidence > 0) {
        const dotRadius = 3;
        const dotX = x + badgeW + 4 + dotRadius;
        const dotY = badgeY + badgeH / 2;

        ctx.beginPath();
        ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = identity.confidence > 0.7
          ? "#22C55E"
          : identity.confidence > 0.4
            ? "#EAB308"
            : "#EF4444";
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
  }, [tracks, identities, focusTrackId, width, height, videoWidth, videoHeight, showDorsals, showTeamColors, opacity]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 10,
      }}
    />
  );
};

// ─── Utility: rounded rectangle ────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export default PlayerIdentityOverlay;
