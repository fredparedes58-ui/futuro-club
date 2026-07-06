/**
 * VITAS · Set Piece Editor Page
 *
 * /set-pieces/new        — Create new custom event
 * /set-pieces/new?type=recommendation — Create new custom recommendation
 * /set-pieces/edit/:id   — Edit existing custom event
 *
 * Uses TacticalBoardEditor for the interactive board.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Save,
  Trash2,
  Crosshair,
  Lightbulb,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import TacticalBoardEditor, {
  type Drawing,
  type TextNote,
} from "@/components/setPiece/TacticalBoardEditor";
import {
  SetPieceCustomStorage,
  type CustomSetPieceEvent,
  type CustomSetPieceRecommendation,
} from "@/services/real/setPieceCustomStorage";
import {
  SET_PIECE_TYPE_LABELS,
  PATTERN_LABELS,
} from "@/services/real/setPieceService";
import type {
  SetPieceType,
  AttackingPattern,
  SetPieceOutcome,
  PlayerOnSetPiece,
} from "@/lib/setPiece/types";

const SET_PIECE_TYPES: SetPieceType[] = [
  "corner",
  "free_kick_direct",
  "free_kick_indirect",
  "penalty",
  "throw_in",
  "goal_kick",
];

const PATTERNS: AttackingPattern[] = [
  "near_post",
  "far_post",
  "penalty_spot",
  "edge_of_box",
  "short_corner",
  "trick_play",
  "direct_shot",
  "wall_curl",
  "wall_over",
];

const OUTCOMES: SetPieceOutcome[] = [
  "goal",
  "shot_on_target",
  "shot_off_target",
  "blocked",
  "cleared",
  "retained",
  "lost",
];

const OUTCOME_LABEL_KEY: Record<SetPieceOutcome, string> = {
  goal: "setPieceEditorPage.outcomeGoal",
  shot_on_target: "setPieceEditorPage.outcomeShotOnTarget",
  shot_off_target: "setPieceEditorPage.outcomeShotOffTarget",
  blocked: "setPieceEditorPage.outcomeBlocked",
  cleared: "setPieceEditorPage.outcomeCleared",
  retained: "setPieceEditorPage.outcomeRetained",
  lost: "setPieceEditorPage.outcomeLost",
};

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function SetPieceEditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode: "event" | "recommendation" =
    searchParams.get("type") === "recommendation" ? "recommendation" : "event";

  // Determine if editing existing or creating new
  const existingEvent = useMemo(
    () => (id && mode === "event" ? SetPieceCustomStorage.getCustomEvent(id) : null),
    [id, mode],
  );
  const existingRec = useMemo(
    () =>
      id && mode === "recommendation"
        ? SetPieceCustomStorage.getCustomRecommendation(id)
        : null,
    [id, mode],
  );

  // Form state
  const [title, setTitle] = useState(existingRec?.title ?? "");
  const [description, setDescription] = useState(
    existingRec?.description ??
      existingEvent?.tacticalNotes.join(". ") ??
      "",
  );
  const [type, setType] = useState<SetPieceType>(
    existingEvent?.type ?? existingRec?.type ?? "corner",
  );
  const [pattern, setPattern] = useState<AttackingPattern>(
    existingEvent?.pattern ?? existingRec?.pattern ?? "near_post",
  );
  const [outcome, setOutcome] = useState<SetPieceOutcome>(
    existingEvent?.outcome ?? "shot_on_target",
  );
  const [matchLabel, setMatchLabel] = useState(existingEvent?.matchLabel ?? "");
  const [minute, setMinute] = useState<number>(existingEvent?.minute ?? 30);
  const [successProbability, setSuccessProbability] = useState<number>(
    existingRec?.successProbability ?? 30,
  );
  const [basedOn, setBasedOn] = useState<string>(existingRec?.basedOn ?? "");

  // Board state
  const initialPlayers: PlayerOnSetPiece[] =
    existingEvent?.players ??
    existingRec?.diagram ?? [
      {
        playerId: "init1",
        playerName: t("setPieceEditorPage.playerTaker"),
        shirtNumber: 10,
        role: "taker",
        position: { x: 100, y: 0 },
      },
      {
        playerId: "init2",
        playerName: t("setPieceEditorPage.playerTarget"),
        shirtNumber: 9,
        role: "target",
        position: { x: 89, y: 50 },
      },
    ];

  const [players, setPlayers] = useState<PlayerOnSetPiece[]>(initialPlayers);
  const [drawings, setDrawings] = useState<Drawing[]>(
    existingEvent?.drawings ?? existingRec?.drawings ?? [],
  );
  const [texts, setTexts] = useState<TextNote[]>(
    existingEvent?.texts ?? existingRec?.texts ?? [],
  );

  const isRecommendation = mode === "recommendation";

  const handleSave = () => {
    if (isRecommendation) {
      if (!title.trim()) {
        toast.error(t("setPieceEditorPage.errorAddTitle"));
        return;
      }
      if (players.length < 2) {
        toast.error(t("setPieceEditorPage.errorMinTwoPlayers"));
        return;
      }
      const rec: CustomSetPieceRecommendation = {
        id: existingRec?.id ?? genId("rec"),
        type,
        pattern,
        title: title.trim(),
        description: description.trim() || `${PATTERN_LABELS[pattern]} · ${SET_PIECE_TYPE_LABELS[type]}`,
        successProbability,
        basedOn: basedOn.trim() || t("setPieceEditorPage.defaultBasedOn"),
        diagram: players,
        keyPoints: description
          .split(/\n|\./)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .slice(0, 6),
        drawings,
        texts,
        isCustom: true,
        createdAt: existingRec?.createdAt ?? new Date().toISOString(),
      };
      SetPieceCustomStorage.saveCustomRecommendation(rec);
      toast.success(t("setPieceEditorPage.recommendationSaved"));
    } else {
      if (players.length < 1) {
        toast.error(t("setPieceEditorPage.errorMinOnePlayer"));
        return;
      }
      const event: CustomSetPieceEvent = {
        id: existingEvent?.id ?? genId("event"),
        matchId: existingEvent?.matchId ?? "custom",
        matchLabel: matchLabel.trim() || t("setPieceEditorPage.defaultMatchLabel"),
        minute,
        type,
        side: existingEvent?.side ?? "right",
        origin: existingEvent?.origin ?? { x: 100, y: 0 },
        endPoint: existingEvent?.endPoint ?? { x: 89, y: 50 },
        outcome,
        pattern,
        xG: existingEvent?.xG,
        players,
        tacticalNotes: description
          .split(/\n/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .slice(0, 5),
        confidence: 1.0,
        isOffensive: true,
        drawings,
        texts,
        isCustom: true,
        createdAt: existingEvent?.createdAt ?? new Date().toISOString(),
      };
      SetPieceCustomStorage.saveCustomEvent(event);
      toast.success(t("setPieceEditorPage.eventSaved"));
    }
    navigate("/set-pieces");
  };

  const handleDelete = () => {
    if (!window.confirm(t("setPieceEditorPage.confirmDelete"))) return;
    if (isRecommendation && existingRec) {
      SetPieceCustomStorage.deleteCustomRecommendation(existingRec.id);
    } else if (existingEvent) {
      SetPieceCustomStorage.deleteCustomEvent(existingEvent.id);
    }
    toast.success(t("setPieceEditorPage.deleted"));
    navigate("/set-pieces");
  };

  const isEditing = !!(existingEvent || existingRec);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isRecommendation
                ? "bg-gradient-to-br from-primary to-purple-500"
                : "bg-gradient-to-br from-amber-500 to-orange-500"
            }`}
          >
            {isRecommendation ? (
              <Lightbulb size={18} className="text-white" />
            ) : (
              <Crosshair size={18} className="text-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-base text-foreground">
              {isEditing
                ? isRecommendation
                  ? t("setPieceEditorPage.titleEditRecommendation")
                  : t("setPieceEditorPage.titleEditEvent")
                : isRecommendation
                  ? t("setPieceEditorPage.titleNewRecommendation")
                  : t("setPieceEditorPage.titleNewEvent")}
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {t("setPieceEditorPage.subtitle")}
            </p>
          </div>
          {isEditing && (
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
              title={t("setPieceEditorPage.deleteTitle")}
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 transition-colors"
          >
            <Save size={14} />
            {t("setPieceEditorPage.save")}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 grid grid-cols-1 lg:grid-cols-[1fr,1.6fr] gap-5">
        {/* Form */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {/* Title (for recommendations) */}
          {isRecommendation && (
            <Field label={t("setPieceEditorPage.labelTitle")}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("setPieceEditorPage.placeholderTitle")}
                className="w-full bg-secondary/40 rounded-lg px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none"
              />
            </Field>
          )}

          {/* Type */}
          <Field label={t("setPieceEditorPage.labelType")}>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as SetPieceType)}
              className="w-full bg-secondary/40 rounded-lg px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none"
            >
              {SET_PIECE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SET_PIECE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>

          {/* Pattern */}
          <Field label={t("setPieceEditorPage.labelPattern")}>
            <select
              value={pattern}
              onChange={(e) => setPattern(e.target.value as AttackingPattern)}
              className="w-full bg-secondary/40 rounded-lg px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none"
            >
              {PATTERNS.map((p) => (
                <option key={p} value={p}>
                  {PATTERN_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>

          {/* Event-specific fields */}
          {!isRecommendation && (
            <>
              <Field label={t("setPieceEditorPage.labelOutcome")}>
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as SetPieceOutcome)}
                  className="w-full bg-secondary/40 rounded-lg px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none"
                >
                  {OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {t(OUTCOME_LABEL_KEY[o])}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label={t("setPieceEditorPage.labelMatch")}>
                  <input
                    type="text"
                    value={matchLabel}
                    onChange={(e) => setMatchLabel(e.target.value)}
                    placeholder={t("setPieceEditorPage.placeholderMatch")}
                    className="w-full bg-secondary/40 rounded-lg px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none"
                  />
                </Field>
                <Field label={t("setPieceEditorPage.labelMinute")}>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={minute}
                    onChange={(e) => setMinute(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-secondary/40 rounded-lg px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none"
                  />
                </Field>
              </div>
            </>
          )}

          {/* Recommendation-specific fields */}
          {isRecommendation && (
            <>
              <Field label={t("setPieceEditorPage.labelSuccessProbability")}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={successProbability}
                  onChange={(e) => setSuccessProbability(parseInt(e.target.value, 10))}
                  className="w-full"
                />
                <div className="text-center text-sm font-mono font-bold text-primary mt-1">
                  {successProbability}%
                </div>
              </Field>
              <Field label={t("setPieceEditorPage.labelBasedOn")}>
                <input
                  type="text"
                  value={basedOn}
                  onChange={(e) => setBasedOn(e.target.value)}
                  placeholder={t("setPieceEditorPage.placeholderBasedOn")}
                  className="w-full bg-secondary/40 rounded-lg px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none"
                />
              </Field>
            </>
          )}

          {/* Notes / Description */}
          <Field
            label={
              isRecommendation
                ? t("setPieceEditorPage.labelKeyPoints")
                : t("setPieceEditorPage.labelTacticalNotes")
            }
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder={
                isRecommendation
                  ? t("setPieceEditorPage.placeholderKeyPoints")
                  : t("setPieceEditorPage.placeholderTacticalNotes")
              }
              className="w-full bg-secondary/40 rounded-lg px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none resize-none"
            />
          </Field>

          {/* Quick stats */}
          <div className="glass rounded-xl p-3 text-[11px] space-y-1">
            <p className="text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 size={11} className="text-emerald-500" />
              {t("setPieceEditorPage.statPlayers", { count: players.length })}
            </p>
            <p className="text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 size={11} className="text-emerald-500" />
              {t("setPieceEditorPage.statDrawings", { count: drawings.length })}
            </p>
            <p className="text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 size={11} className="text-emerald-500" />
              {t("setPieceEditorPage.statTexts", { count: texts.length })}
            </p>
          </div>
        </motion.div>

        {/* Board */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <TacticalBoardEditor
            players={players}
            drawings={drawings}
            texts={texts}
            onPlayersChange={setPlayers}
            onDrawingsChange={setDrawings}
            onTextsChange={setTexts}
            editable
            height={460}
          />
        </motion.div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold block">
        {label}
      </label>
      {children}
    </div>
  );
}
