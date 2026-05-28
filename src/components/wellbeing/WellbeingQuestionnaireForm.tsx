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
  text: string;
  textYoung?: string; // simplified text for <10
}

// ─── Questions ──────────────────────────────────────────────────────────

const PLAYER_QUESTIONS: Question[] = [
  { id: "enjoyment", text: "¿Cuánto disfrutas los entrenamientos?", textYoung: "¿Te diviertes entrenando?" },
  { id: "energy", text: "¿Cómo te sientes de energía después de entrenar?", textYoung: "¿Estás cansado después de entrenar?" },
  { id: "friends", text: "¿Te sientes bien con tus compañeros de equipo?", textYoung: "¿Te llevas bien con los amigos del equipo?" },
  { id: "confidence", text: "¿Te sientes seguro cuando juegas?", textYoung: "¿Te sientes valiente cuando juegas?" },
  { id: "wantToCome", text: "¿Tienes ganas de venir a entrenar?", textYoung: "¿Quieres venir a entrenar?" },
  { id: "sleep", text: "¿Duermes bien por las noches?", textYoung: "¿Duermes bien?" },
];

const COACH_QUESTIONS: Question[] = [
  { id: "motivation", text: "¿Cómo calificarías la motivación del jugador en las últimas sesiones?" },
  { id: "integration", text: "¿Cómo es su nivel de integración social con el grupo?" },
  { id: "progress", text: "¿Está mostrando progresión técnica/táctica?" },
  { id: "attitude", text: "¿Cómo es su actitud ante errores y correcciones?" },
  { id: "effort", text: "¿El nivel de esfuerzo es consistente con su capacidad?" },
  { id: "concern", text: "¿Tienes alguna preocupación sobre su bienestar general?" },
];

const PARENT_QUESTIONS: Question[] = [
  { id: "enjoyment", text: "¿Su hijo/a disfruta yendo a los entrenamientos?" },
  { id: "stress", text: "¿Nota signos de estrés o ansiedad relacionados con el fútbol?" },
  { id: "sleep", text: "¿Duerme bien y descansa lo suficiente?" },
  { id: "appetite", text: "¿Come bien y tiene buen apetito?" },
  { id: "socialLife", text: "¿Mantiene buenas relaciones con los compañeros fuera del campo?" },
  { id: "balance", text: "¿Consigue equilibrar el fútbol con los estudios y la vida social?" },
];

// ─── Emojis for young players ──────────────────────────────────────────

const EMOJI_SCALE = [
  { emoji: "😢", label: "Muy mal", value: 1 },
  { emoji: "😕", label: "Mal", value: 2 },
  { emoji: "😐", label: "Normal", value: 3 },
  { emoji: "😊", label: "Bien", value: 4 },
  { emoji: "🤩", label: "¡Genial!", value: 5 },
];

const LIKERT_SCALE = [
  { label: "Muy poco", value: 1 },
  { label: "Poco", value: 2 },
  { label: "Normal", value: 3 },
  { label: "Bastante", value: 4 },
  { label: "Mucho", value: 5 },
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
          ¡Gracias por completar el cuestionario!
        </h3>
        <p className="text-sm text-gray-400">
          Las respuestas se han guardado correctamente.
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
            {respondent === "player" ? (isYoungPlayer ? `¡Hola ${playerName}!` : "Cuestionario de bienestar") :
             respondent === "coach" ? "Evaluación del entrenador" :
             "Cuestionario para padres"}
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {respondent === "player" ? (isYoungPlayer ? "Toca el emoji que mejor te represente" : `Sobre: ${playerName}`) :
             `Evaluando a: ${playerName}`}
          </p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-300 text-sm"
          >
            Cancelar
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
              ? (questions[currentQ].textYoung ?? questions[currentQ].text)
              : questions[currentQ].text}
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
                  <span className="text-[10px] text-gray-400">{opt.label}</span>
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
                    {opt.label}
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
          ← Anterior
        </button>

        {currentQ < questions.length - 1 ? (
          <button
            onClick={() => setCurrentQ(currentQ + 1)}
            className="text-sm text-emerald-400 hover:text-emerald-300"
          >
            Siguiente →
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
            Enviar
          </button>
        )}
      </div>
    </div>
  );
};

export default WellbeingQuestionnaireForm;
