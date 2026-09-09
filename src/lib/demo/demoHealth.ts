/**
 * VITAS · Salud y Valoración de ejemplo del DEMO (piso piloto)
 *
 * En el demo no hay backend (los agentes injury-risk / valuation viven en /api,
 * interceptado por demoApiGuard → null). Aquí se PRE-HORNEAN ejemplos derivados
 * de la ficha del jugador para que las pestañas Salud y Valoración no queden
 * vacías. Son datos de EJEMPLO: coldStartWarning:true + confianza baja + el
 * GlobalDemoBanner ya declaran que no son datos reales. Nunca se presentan como
 * medidos. Prosa localizada es/en (cae a es en otros idiomas).
 */

import type { Player } from "@/services/real/playerService";
import { normalizeLocale, pickLocale, type ReportLocale } from "@/lib/shared/locale";
import i18n from "@/i18n";
import type { ValuationData } from "@/components/valuation/ValuationCard";
import type { InjuryRiskData } from "@/components/injury/InjuryRiskCard";

const clamp = (n: number) => Math.max(2, Math.min(96, Math.round(n)));

export function buildDemoValuation(
  player: Player,
  locale: ReportLocale = normalizeLocale(i18n.language),
): ValuationData {
  const vsi = typeof player.vsi === "number" ? player.vsi : 60;
  const score = Math.round(vsi);
  const tier = vsi >= 80 ? "Élite" : vsi >= 70 ? "Pro" : vsi >= 55 ? "Talento" : "Desarrollo";
  const tierColor = vsi >= 80 ? "#0059B3" : vsi >= 70 ? "#A855F7" : vsi >= 55 ? "#F59E0B" : "#EF4444";
  return {
    playerId: player.id,
    overallScore: score,
    tier,
    tierColor,
    tierDescription: pickLocale(locale, {
      es: "Valoración de ejemplo derivada de la ficha; sin datos de mercado reales.",
      en: "Example valuation derived from the profile; no real market data.",
    }),
    factors: [
      { factor: pickLocale(locale, { es: "VSI ajustado por PHV", en: "PHV-adjusted VSI" }), weight: 0.4, score, label: tier },
      { factor: pickLocale(locale, { es: "Proyección de maduración", en: "Maturation projection" }), weight: 0.35, score: clamp(vsi + 6), label: pickLocale(locale, { es: "Al alza", en: "Upward" }) },
      { factor: pickLocale(locale, { es: "Consistencia (sesiones)", en: "Consistency (sessions)" }), weight: 0.25, score: 40, label: pickLocale(locale, { es: "Insuficiente en la demo", en: "Insufficient in demo" }) },
    ],
    probabilities: {
      prob1Year: clamp(vsi - 25),
      prob3Year: clamp(vsi - 12),
      prob5Year: clamp(vsi - 4),
      probFirstDiv: clamp(vsi - 30),
      probTop5League: clamp(vsi - 46),
    },
    coldStartWarning: true,
    confidenceLevel: 0.4,
    dataPointsUsed: 1,
    analysisCount: 1,
  };
}

export function buildDemoInjuryRisk(
  player: Player,
  locale: ReportLocale = normalizeLocale(i18n.language),
): InjuryRiskData {
  const seed = ([...player.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) || 7) % 8;
  const inWindow = player.age <= 15;
  const overallRisk = clamp(20 + (inWindow ? 12 : 2) + seed);
  const riskCategory = overallRisk < 25 ? "low" : overallRisk < 45 ? "moderate" : "high";
  return {
    playerId: player.id,
    overallRisk,
    riskCategory,
    riskFactors: [
      {
        factor: pickLocale(locale, { es: "Ventana de maduración (PHV)", en: "Maturation window (PHV)" }),
        weight: 0.4,
        score: inWindow ? 60 : 25,
        description: pickLocale(locale, {
          es: "Durante el estirón el riesgo de sobrecarga en tendones y cartílagos de crecimiento sube.",
          en: "During the growth spurt, overload risk on tendons and growth plates rises.",
        }),
      },
      {
        factor: pickLocale(locale, { es: "Carga acumulada (ACWR)", en: "Accumulated load (ACWR)" }),
        weight: 0.35,
        score: 30,
        description: pickLocale(locale, { es: "Sin serie de carga real en la demo.", en: "No real load series in the demo." }),
      },
      {
        factor: pickLocale(locale, { es: "Historial de lesiones", en: "Injury history" }),
        weight: 0.25,
        score: 15,
        description: pickLocale(locale, { es: "Sin lesiones registradas.", en: "No injuries logged." }),
      },
    ],
    acuteChronicRatio: null,
    phvRiskMultiplier: inWindow ? 1.2 : 1.0,
    recommendations: [
      pickLocale(locale, { es: "Priorizar coordinación y técnica sobre fuerza máxima durante el estirón.", en: "Prioritise coordination and technique over max strength during the growth spurt." }),
      pickLocale(locale, { es: "Vigilar molestias en rodilla/talón (Osgood-Schlatter / Sever).", en: "Watch knee/heel discomfort (Osgood-Schlatter / Sever)." }),
    ],
    returnToPlayReady: true,
    confidenceLevel: 0.4,
    dataPointsUsed: 0,
    coldStartWarning: true,
  };
}
