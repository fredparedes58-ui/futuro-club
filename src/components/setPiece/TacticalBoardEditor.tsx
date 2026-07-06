/**
 * VITAS · TacticalBoardEditor — Interactive tactical board
 *
 * Allows the user to:
 * - Drag players to new positions
 * - Draw arrows (movement runs) and lines (passes)
 * - Add text annotations
 * - Erase elements
 *
 * Designed for both editing and viewing modes.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  MousePointer2,
  ArrowUpRight,
  Minus,
  Type,
  Eraser,
  Plus,
  X,
} from "lucide-react";
import type {
  PlayerOnSetPiece,
  PitchPosition,
} from "@/lib/setPiece/types";

export type DrawingType = "arrow" | "line" | "dashed";

export interface Drawing {
  id: string;
  type: DrawingType;
  start: PitchPosition;
  end: PitchPosition;
  color: string;
}

export interface TextNote {
  id: string;
  position: PitchPosition;
  content: string;
  color: string;
}

type Tool = "select" | "arrow" | "line" | "dashed" | "text" | "erase" | "addPlayer";

interface Props {
  players: PlayerOnSetPiece[];
  drawings: Drawing[];
  texts: TextNote[];
  onPlayersChange: (players: PlayerOnSetPiece[]) => void;
  onDrawingsChange: (drawings: Drawing[]) => void;
  onTextsChange: (texts: TextNote[]) => void;
  editable?: boolean;
  height?: number;
}

const ROLE_COLORS: Record<PlayerOnSetPiece["role"], { fill: string; stroke: string }> = {
  taker: { fill: "#a855f7", stroke: "#7e22ce" },
  target: { fill: "#10b981", stroke: "#047857" },
  screener: { fill: "#3b82f6", stroke: "#1d4ed8" },
  decoy: { fill: "#f59e0b", stroke: "#b45309" },
  defender: { fill: "#ef4444", stroke: "#b91c1c" },
};

const ROLES: PlayerOnSetPiece["role"][] = [
  "taker",
  "target",
  "screener",
  "decoy",
  "defender",
];

const DRAW_COLORS = ["#fbbf24", "#10b981", "#ef4444", "#3b82f6", "#ffffff"];

// SVG viewBox setup — show attacking half (x: 50-100, y: 0-100 normalized)
const VIEW_X_MIN = 50;
const VIEW_X_RANGE = 50;
const SVG_W = 600;
const SVG_H = 400;

function normalizedToSvg(p: PitchPosition): { x: number; y: number } {
  return {
    x: ((p.x - VIEW_X_MIN) / VIEW_X_RANGE) * SVG_W,
    y: (p.y / 100) * SVG_H,
  };
}

function svgToNormalized(p: { x: number; y: number }): PitchPosition {
  return {
    x: VIEW_X_MIN + (p.x / SVG_W) * VIEW_X_RANGE,
    y: (p.y / SVG_H) * 100,
  };
}

function clampToPitch(p: PitchPosition): PitchPosition {
  return {
    x: Math.max(VIEW_X_MIN, Math.min(100, p.x)),
    y: Math.max(2, Math.min(98, p.y)),
  };
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function TacticalBoardEditor({
  players,
  drawings,
  texts,
  onPlayersChange,
  onDrawingsChange,
  onTextsChange,
  editable = true,
  height = 400,
}: Props) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [activeRole, setActiveRole] = useState<PlayerOnSetPiece["role"]>("target");

  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const [drawStart, setDrawStart] = useState<PitchPosition | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<PitchPosition | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Convert pointer event to normalized pitch coords
  const getPitchPoint = useCallback((clientX: number, clientY: number): PitchPosition | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgPt = pt.matrixTransform(ctm.inverse());
    return clampToPitch(svgToNormalized({ x: svgPt.x, y: svgPt.y }));
  }, []);

  // ── Player dragging ────────────────────────────────────────────────
  const handlePlayerPointerDown = (e: React.PointerEvent, playerId: string) => {
    if (!editable || tool === "erase") {
      if (tool === "erase") {
        onPlayersChange(players.filter((p) => p.playerId !== playerId));
      }
      return;
    }
    if (tool === "select") {
      e.stopPropagation();
      setDraggingPlayerId(playerId);
      (e.target as Element).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const point = getPitchPoint(e.clientX, e.clientY);
    if (!point) return;

    if (draggingPlayerId) {
      onPlayersChange(
        players.map((p) =>
          p.playerId === draggingPlayerId ? { ...p, position: point } : p,
        ),
      );
    } else if (drawStart) {
      setDrawCurrent(point);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingPlayerId) {
      setDraggingPlayerId(null);
      return;
    }
    if (drawStart && drawCurrent) {
      const dist = Math.hypot(drawCurrent.x - drawStart.x, drawCurrent.y - drawStart.y);
      if (dist > 2 && (tool === "arrow" || tool === "line" || tool === "dashed")) {
        onDrawingsChange([
          ...drawings,
          {
            id: genId(),
            type: tool,
            start: drawStart,
            end: drawCurrent,
            color: drawColor,
          },
        ]);
      }
      setDrawStart(null);
      setDrawCurrent(null);
    }
  };

  // ── Canvas click (for adding text, players, starting draws) ────────
  const handleSvgPointerDown = (e: React.PointerEvent) => {
    if (!editable) return;
    const point = getPitchPoint(e.clientX, e.clientY);
    if (!point) return;

    if (tool === "text") {
      const id = genId();
      onTextsChange([
        ...texts,
        { id, position: point, content: t("tacticalBoardEditor.defaultTextContent"), color: drawColor },
      ]);
      setEditingTextId(id);
      return;
    }

    if (tool === "addPlayer") {
      const number = (players.length % 11) + 1;
      onPlayersChange([
        ...players,
        {
          playerId: genId(),
          playerName: t("tacticalBoardEditor.playerName", { number }),
          shirtNumber: number,
          role: activeRole,
          position: point,
        },
      ]);
      return;
    }

    if (tool === "arrow" || tool === "line" || tool === "dashed") {
      setDrawStart(point);
      setDrawCurrent(point);
    }
  };

  const handleTextClick = (id: string, e: React.MouseEvent) => {
    if (!editable) return;
    e.stopPropagation();
    if (tool === "erase") {
      onTextsChange(texts.filter((t) => t.id !== id));
    } else {
      setEditingTextId(id);
    }
  };

  const handleDrawingClick = (id: string, e: React.MouseEvent) => {
    if (!editable) return;
    e.stopPropagation();
    if (tool === "erase") {
      onDrawingsChange(drawings.filter((d) => d.id !== id));
    }
  };

  const handleClearAll = () => {
    if (window.confirm(t("tacticalBoardEditor.clearAllConfirm"))) {
      onPlayersChange([]);
      onDrawingsChange([]);
      onTextsChange([]);
    }
  };

  // Update text content
  const updateText = (id: string, content: string) => {
    onTextsChange(texts.map((t) => (t.id === id ? { ...t, content } : t)));
  };

  const editingText = editingTextId ? texts.find((t) => t.id === editingTextId) : null;

  // Cursor style based on tool
  const cursorClass =
    tool === "select"
      ? "cursor-default"
      : tool === "erase"
      ? "cursor-not-allowed"
      : tool === "text"
      ? "cursor-text"
      : "cursor-crosshair";

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      {editable && (
        <div className="glass rounded-xl p-2 flex flex-wrap items-center gap-2">
          <ToolButton
            active={tool === "select"}
            onClick={() => setTool("select")}
            icon={<MousePointer2 size={14} />}
            label={t("tacticalBoardEditor.toolMove")}
          />
          <ToolButton
            active={tool === "arrow"}
            onClick={() => setTool("arrow")}
            icon={<ArrowUpRight size={14} />}
            label={t("tacticalBoardEditor.toolArrow")}
          />
          <ToolButton
            active={tool === "line"}
            onClick={() => setTool("line")}
            icon={<Minus size={14} />}
            label={t("tacticalBoardEditor.toolLine")}
          />
          <ToolButton
            active={tool === "dashed"}
            onClick={() => setTool("dashed")}
            icon={<span className="text-[10px] font-bold tracking-widest">- - -</span>}
            label={t("tacticalBoardEditor.toolRun")}
          />
          <ToolButton
            active={tool === "text"}
            onClick={() => setTool("text")}
            icon={<Type size={14} />}
            label={t("tacticalBoardEditor.toolText")}
          />
          <ToolButton
            active={tool === "addPlayer"}
            onClick={() => setTool("addPlayer")}
            icon={<Plus size={14} />}
            label={t("tacticalBoardEditor.toolPlayer")}
          />
          <ToolButton
            active={tool === "erase"}
            onClick={() => setTool("erase")}
            icon={<Eraser size={14} />}
            label={t("tacticalBoardEditor.toolErase")}
          />

          {/* Separator */}
          <div className="w-px h-6 bg-border" />

          {/* Color picker */}
          <div className="flex items-center gap-1">
            {DRAW_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setDrawColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${
                  drawColor === c ? "border-foreground scale-110" : "border-border"
                }`}
                style={{ background: c }}
                title={t("tacticalBoardEditor.colorTitle", { color: c })}
              />
            ))}
          </div>

          {/* Player role selector — visible when adding players */}
          {tool === "addPlayer" && (
            <>
              <div className="w-px h-6 bg-border" />
              <div className="flex items-center gap-1">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setActiveRole(r)}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${
                      activeRole === r ? "border-foreground scale-110" : "border-border"
                    }`}
                    style={{ background: ROLE_COLORS[r].fill }}
                    title={r}
                  />
                ))}
              </div>
            </>
          )}

          {/* Clear all */}
          <button
            onClick={handleClearAll}
            className="ml-auto px-2.5 py-1 rounded-md text-[10px] font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
          >
            {t("tacticalBoardEditor.clearAll")}
          </button>
        </div>
      )}

      {/* Helper hint */}
      {editable && (
        <p className="text-[10px] text-muted-foreground px-1">
          {tool === "select" && t("tacticalBoardEditor.hintSelect")}
          {tool === "arrow" && t("tacticalBoardEditor.hintArrow")}
          {tool === "line" && t("tacticalBoardEditor.hintLine")}
          {tool === "dashed" && t("tacticalBoardEditor.hintDashed")}
          {tool === "text" && t("tacticalBoardEditor.hintText")}
          {tool === "addPlayer" && t("tacticalBoardEditor.hintAddPlayer")}
          {tool === "erase" && t("tacticalBoardEditor.hintErase")}
        </p>
      )}

      {/* SVG Board */}
      <div className="relative rounded-xl overflow-hidden" style={{ height }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className={`w-full h-full ${cursorClass}`}
          style={{ background: "linear-gradient(135deg, #0f5132 0%, #14532d 50%, #0f5132 100%)" }}
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Pitch stripes */}
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={i * 150}
              y={0}
              width={150}
              height={SVG_H}
              fill={i % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.04)"}
            />
          ))}

          {/* Center line on left edge */}
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={SVG_H}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth={2}
          />

          {/* Penalty box: x=83-100, y=20-80 normalized */}
          <rect
            x={normalizedToSvg({ x: 83, y: 20 }).x}
            y={normalizedToSvg({ x: 83, y: 20 }).y}
            width={normalizedToSvg({ x: 100, y: 0 }).x - normalizedToSvg({ x: 83, y: 0 }).x}
            height={normalizedToSvg({ x: 0, y: 80 }).y - normalizedToSvg({ x: 0, y: 20 }).y}
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth={2}
          />

          {/* Small box: x=94-100, y=37-63 */}
          <rect
            x={normalizedToSvg({ x: 94, y: 37 }).x}
            y={normalizedToSvg({ x: 94, y: 37 }).y}
            width={normalizedToSvg({ x: 100, y: 0 }).x - normalizedToSvg({ x: 94, y: 0 }).x}
            height={normalizedToSvg({ x: 0, y: 63 }).y - normalizedToSvg({ x: 0, y: 37 }).y}
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth={2}
          />

          {/* Penalty spot */}
          <circle
            cx={normalizedToSvg({ x: 89, y: 50 }).x}
            cy={normalizedToSvg({ x: 0, y: 50 }).y}
            r={3}
            fill="rgba(255,255,255,0.7)"
          />

          {/* Goal */}
          <rect
            x={normalizedToSvg({ x: 100, y: 0 }).x - 3}
            y={normalizedToSvg({ x: 0, y: 43 }).y}
            width={6}
            height={normalizedToSvg({ x: 0, y: 57 }).y - normalizedToSvg({ x: 0, y: 43 }).y}
            fill="rgba(255,255,255,0.9)"
          />

          {/* Center circle (visible at left edge) */}
          <circle
            cx={0}
            cy={SVG_H / 2}
            r={50}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={2}
          />

          {/* Drawing arrowhead defs */}
          <defs>
            {DRAW_COLORS.map((c) => (
              <marker
                key={c}
                id={`arrow-${c.replace("#", "")}`}
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 10 3, 0 6" fill={c} />
              </marker>
            ))}
          </defs>

          {/* Drawings */}
          {drawings.map((d) => {
            const s = normalizedToSvg(d.start);
            const e = normalizedToSvg(d.end);
            const isArrow = d.type === "arrow";
            const isDashed = d.type === "dashed";
            return (
              <line
                key={d.id}
                x1={s.x}
                y1={s.y}
                x2={e.x}
                y2={e.y}
                stroke={d.color}
                strokeWidth={3}
                strokeDasharray={isDashed ? "8 5" : undefined}
                markerEnd={isArrow ? `url(#arrow-${d.color.replace("#", "")})` : undefined}
                strokeLinecap="round"
                style={{ cursor: tool === "erase" ? "pointer" : "default", pointerEvents: "stroke" }}
                onClick={(e) => handleDrawingClick(d.id, e)}
              />
            );
          })}

          {/* Drawing preview (while dragging) */}
          {drawStart && drawCurrent && (
            <line
              x1={normalizedToSvg(drawStart).x}
              y1={normalizedToSvg(drawStart).y}
              x2={normalizedToSvg(drawCurrent).x}
              y2={normalizedToSvg(drawCurrent).y}
              stroke={drawColor}
              strokeWidth={3}
              strokeDasharray={tool === "dashed" ? "8 5" : undefined}
              markerEnd={tool === "arrow" ? `url(#arrow-${drawColor.replace("#", "")})` : undefined}
              opacity={0.7}
              strokeLinecap="round"
            />
          )}

          {/* Text notes */}
          {texts.map((t) => {
            const p = normalizedToSvg(t.position);
            return (
              <g key={t.id} style={{ cursor: editable ? "pointer" : "default" }}>
                <rect
                  x={p.x - 4}
                  y={p.y - 10}
                  width={Math.max(20, t.content.length * 7)}
                  height={18}
                  rx={3}
                  fill="rgba(0,0,0,0.55)"
                  onClick={(e) => handleTextClick(t.id, e)}
                />
                <text
                  x={p.x}
                  y={p.y + 3}
                  fill={t.color}
                  fontSize="12"
                  fontWeight="600"
                  onClick={(e) => handleTextClick(t.id, e)}
                  style={{ userSelect: "none" }}
                >
                  {t.content}
                </text>
              </g>
            );
          })}

          {/* Players */}
          {players.map((p) => {
            const colors = ROLE_COLORS[p.role];
            const pos = normalizedToSvg(p.position);
            const isDragging = draggingPlayerId === p.playerId;
            return (
              <g
                key={p.playerId}
                onPointerDown={(e) => handlePlayerPointerDown(e, p.playerId)}
                style={{
                  cursor: editable
                    ? tool === "erase"
                      ? "pointer"
                      : tool === "select"
                      ? "grab"
                      : "default"
                    : "default",
                  touchAction: "none",
                }}
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={isDragging ? 16 : 14}
                  fill={colors.fill}
                  stroke={colors.stroke}
                  strokeWidth={isDragging ? 3 : 2}
                  opacity={isDragging ? 0.9 : 1}
                />
                <text
                  x={pos.x}
                  y={pos.y + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize="12"
                  fontWeight="bold"
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  {p.shirtNumber}
                </text>
                <text
                  x={pos.x}
                  y={pos.y + 26}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.9)"
                  fontSize="9"
                  fontWeight="600"
                  style={{ userSelect: "none", pointerEvents: "none" }}
                >
                  {p.playerName.split(" ")[0]}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-2 text-[9px] text-white/90 bg-black/40 backdrop-blur-sm rounded px-2 py-1">
          {ROLES.map((role) => (
            <div key={role} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ background: ROLE_COLORS[role].fill }} />
              <span className="capitalize">{role}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Inline text editor */}
      {editingText && (
        <div className="glass rounded-xl p-3 flex items-center gap-2">
          <Type size={14} className="text-primary shrink-0" />
          <input
            type="text"
            value={editingText.content}
            onChange={(e) => updateText(editingText.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                setEditingTextId(null);
              }
            }}
            autoFocus
            className="flex-1 bg-secondary/50 rounded-md px-3 py-1.5 text-sm border border-border focus:border-primary focus:outline-none"
            placeholder={t("tacticalBoardEditor.annotationPlaceholder")}
          />
          <button
            onClick={() => setEditingTextId(null)}
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
            title={t("tacticalBoardEditor.close")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
