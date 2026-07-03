/**
 * VITAS · Wellbeing Questionnaire Form (Sprint 22)
 *
 * 3 versions based on respondent:
 *   - Player (<10 years): emoji-based scale
 *   - Player (≥10 years): 1-5 Likert scale
 *   - Coach: motivation + integration + progress
 *   - Parent: enjoyment + stress + sleep
 *
 * Mobile-first, accessible, glass morphism.
 */

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

// ─── Types ────────────────────────────────────────────────────────────────

type Respondent = "player" | "coach" | "parent";

interface QuestionnaireProps {
  playerId: string;
  playerName: string;
  playerAge: number;
  respondent: Respondent;
  onSubmit: (data: QuestionnaireResult) => void;
  onCancel?: () => void;
}

export interface QuestionnaireResult {
  playerId: string;
  respondent: Respondent;
  responses: Record<string, number>;
  score: number;
  filledAt: string;
}

interface Question {
  id: string;
  textKey: string;
  textYoungKey?: string; // simplified text key for <10
}

// ─── Questions ──────────────────────────────────────────────────────────

const PLAYER_QUESTIONS: Question[] = [
  { id: "enjoyment", textKey: "wellbeingForm.playerEnjoyment", textYoungKey: "wellbeingForm.playerEnjoymentYoung" },
  { id: "energy", textKey: "wellbeingForm.playerEnergy", textYoungKey: "wellbeingForm.playerEnergyYoung" },
  { id: "friends", textKey: "wellbeingForm.playerFriends", textYoungKey: "wellbeingForm.playerFriendsYoung" },
  { id: "confidence", textKey: "wellbeingForm.playerConfidence", textYoungKey: "wellbeingForm.playerConfidenceYoung" },
  { id: "wantToCome", textKey: "wellbeingForm.playerWantToCome", textYoungKey: "wellbeingForm.playerWantToComeYoung" },
  { id: "sleep", textKey: "wellbeingForm.playerSleep", textYoungKey: "wellbeingForm.playerSleepYoung" },
];

const COACH_QUESTIONS: Question[] = [
  { id: "motivation", textKey: "wellbeingForm.coachMotivation" },
  { id: "integration", textKey: "wellbeingForm.coachIntegration" },
  { id: "progress", textKey: "wellbeingForm.coachProgress" },
  { id: "attitude", textKey: "wellbeingForm.coachAttitude" },
  { id: "effort", textKey: "wellbeingForm.coachEffort" },
  { id: "concern", textKey: "wellbeingForm.coachConcern" },
];

const PARENT_QUESTIONS: Question[] = [
  { id: "enjoyment", textKey: "wellbeingForm.parentEnjoyment" },
  { id: "stress", textKey: "wellbeingForm.parentStress" },
  { id: "sleep", textKey: "wellbeingForm.parentSleep" },
  { id: "appetite", textKey: "wellbeingForm.parentAppetite" },
  { id: "socialLife", textKey: "wellbeingForm.parentSocialLife" },
  { id: "balance", textKey: "wellbeingForm.parentBalance" },
];

// ─── Emojis for young players ──────────────────────────────────────────

const EMOJI_SCALE = [
  { emoji: "😢", labelKey: "wellbeingForm.emojiVeryBad", value: 1 },
  { emoji: "😕", labelKey: "wellbeingForm.emojiBad", value: 2 },
  { emoji: "😐", labelKey: "wellbeingForm.emojiNormal", value: 3 },
  { emoji: "😊", labelKey: "wellbeingForm.emojiGood", value: 4 },
  { emoji: "🤩", labelKey: "wellbeingForm.emojiGreat", value: 5 },
];

const LIKERT_SCALE = [
  { labelKey: "wellbeingForm.likertVeryLittle", value: 1 },
  { labelKey: "wellbeingForm.likertLittle", value: 2 },
  { labelKey: "wellbeingForm.likertNormal", value: 3 },
  { labelKey: "wellbeingForm.likertQuiteALot", value: 4 },
  { labelKey: "wellbeingForm.likertALot", value: 5 },
];

// ─── Component ──────────────────────────────────────────────────────────

export const WellbeingQuestionnaireForm: React.FC<QuestionnaireProps> = ({
  playerId,
  playerName,
  playerAge,
  respondent,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation();
  const isYoungPlayer = respondent === "player" && playerAge < 10;
  const questions =
    respondent === "player" ? PLAYER_QUESTIONS :
    respondent === "coach" ? COACH_QUESTIONS :
    PARENT_QUESTIONS;

  const [currentQ, setCurrentQ] = useState(0);
  const [responses, setResponses] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleAnswer = (questionId: string, value: number) => {
    const updated = { ...responses, [questionId]: value };
    setResponses(updated);

    // Auto-advance after short delay
    if (currentQ < questions.length - 1) {
      setTimeout(() => setCurrentQ(prev => prev + 1), 300);
    }
  };

  const handleSubmit = () => {
    const values = Object.values(responses);
    const avgScore = values.length > 0
      ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 20) // 1-5 → 0-100
      : 0;

    setSubmitted(true);

    onSubmit({
      playerId,
      respondent,
      responses,
      score: avgScore,
      filledAt: new Date().toISOString(),
    });
  };

  const allAnswered = questions.every(q => responses[q.id] !== undefined);
  const progress = Object.keys(responses).length / questions.length;

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass rounded-xl p-6 text-center"
      >
        <div className="text-4xl mb-3">✅</div>
        <h3 className="text-lg font-semibold text-white mb-2">
          {t("wellbeingForm.thankYouTitle")}
        </h3>
        <p className="text-sm text-gray-400">
          {t("wellbeingForm.responsesSaved")}
        </p>
      </motion.div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {respondent === "player" ? (isYoungPlayer ? t("wellbeingForm.helloPlayer", { name: playerName }) : t("wellbeingForm.titlePlayer")) :
             respondent === "coach" ? t("wellbeingForm.titleCoach") :
             t("wellbeingForm.titleParent")}
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {respondent === "player" ? (isYoungPlayer ? t("wellbeingForm.subtitleYoung") : t("wellbeingForm.subtitleAbout", { name: playerName })) :
             t("wellbeingForm.subtitleEvaluating", { name: playerName })}
          </p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-300 text-sm"
          >
            {t("wellbeingForm.cancel")}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-white/10 rounded-full h-1.5">
        <motion.div
          className="bg-emerald-500 h-1.5 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <p className="text-xs text-gray-500 text-right">
        {Object.keys(responses).length}/{questions.length}
      </p>

      {/* Question navigator (dots) */}
      <div className="flex gap-1.5 justify-center">
        {questions.map((q, i) => (
          <button
            key={q.id}
            onClick={() => setCurrentQ(i)}
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              i === currentQ ? "bg-emerald-500" :
              responses[q.id] !== undefined ? "bg-emerald-500/50" :
              "bg-white/20"
            }`}
          />
        ))}
      </div>

      {/* Current question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="min-h-[140px]"
        >
          <p className={`text-center mb-6 ${isYoungPlayer ? "text-xl font-medium text-white" : "text-base text-gray-200"}`}>
            {isYoungPlayer
              ? t(questions[currentQ].textYoungKey ?? questions[currentQ].textKey)
              : t(questions[currentQ].textKey)}
          </p>

          {/* Answer options */}
          {isYoungPlayer ? (
            // Emoji scale for young players
            <div className="flex justify-center gap-3 sm:gap-5">
              {EMOJI_SCALE.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleAnswer(questions[currentQ].id, opt.value)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                    responses[questions[currentQ].id] === opt.value
                      ? "bg-emerald-500/30 scale-110 ring-2 ring-emerald-500"
                      : "hover:bg-white/10 hover:scale-105"
                  }`}
                >
                  <span className="text-3xl sm:text-4xl">{opt.emoji}</span>
                  <span className="text-[10px] text-gray-400">{t(opt.labelKey)}</span>
                </button>
              ))}
            </div>
          ) : (
            // Likert scale for older players, coaches, parents
            <div className="flex flex-col gap-2">
              {LIKERT_SCALE.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleAnswer(questions[currentQ].id, opt.value)}
                  className={`w-full text-left px-4 py-2.5 rounded-lg transition-all text-sm ${
                    responses[questions[currentQ].id] === opt.value
                      ? "bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-500/50"
                      : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-xs">
                      {opt.value}
                    </span>
                    {t(opt.labelKey)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button
          onClick={() => setCurrentQ(Math.max(0, currentQ - 1))}
          disabled={currentQ === 0}
          className="text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {t("wellbeingForm.previous")}
        </button>

        {currentQ < questions.length - 1 ? (
          <button
            onClick={() => setCurrentQ(currentQ + 1)}
            className="text-sm text-emerald-400 hover:text-emerald-300"
          >
            {t("wellbeingForm.next")}
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!allAnswered}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              allAnswered
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
            }`}
          >
            {t("wellbeingForm.submit")}
          </button>
        )}
      </div>
    </div>
  );
};

export default WellbeingQuestionnaireForm;
