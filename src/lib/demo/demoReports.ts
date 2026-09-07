/**
 * VITAS · Informes de ejemplo del DEMO (piso piloto)
 *
 * En el demo NO hay pipeline de vídeo ni Supabase, así que los informes de IA
 * (que en producción genera y guarda ese pipeline) se PRE-HORNEAN aquí como
 * ejemplo. No son análisis reales; la UI los muestra bajo el banner
 * «Datos de ejemplo». Cada informe se DERIVA de los datos reales del jugador
 * (VSI de ficha, posición, métricas, maduración) → cada jugador tiene un
 * informe distinto y coherente con su perfil, sin inventar un número global.
 *
 * Idioma (P3): el informe se redacta en el idioma activo de la UI (i18n). Los
 * tokens de enum (tier_label, prioridad, report_type) NO se traducen — la capa
 * de presentación los rotula. Solo se traduce la PROSA.
 *
 * Formato: se construye un `AnalysisDbRow` (el mismo shape que devuelve Supabase)
 * y se pasa por `mapDbRowToLegacy` en el hook → así el demo ejercita el MISMO
 * mapeo que producción, sin duplicar la lógica de presentación.
 */

import type { Player } from "@/services/real/playerService";
import type { AnalysisDbRow } from "@/hooks/usePlayerAnalysisV2";
import { playerMaturity } from "@/lib/phv/playerMaturity";
import i18n from "@/i18n";
import { normalizeLocale, type ReportLocale } from "@/lib/shared/locale";

const METRIC_LABEL: Record<ReportLocale, Record<string, string>> = {
  es: {
    speed: "Velocidad",
    technique: "Técnica con balón",
    vision: "Visión de juego",
    stamina: "Resistencia",
    shooting: "Definición",
    defending: "Trabajo defensivo",
  },
  en: {
    speed: "Speed",
    technique: "Ball technique",
    vision: "Game vision",
    stamina: "Stamina",
    shooting: "Finishing",
    defending: "Defensive work",
  },
};

// Comparables de ejemplo por familia de posición (SOLO demo — etiquetado como ejemplo).
const PRO_BY_POSITION: Array<{ match: RegExp; nombre: string; posicion: string; club: string }> = [
  { match: /portero/i,                 nombre: "Unai Simón",     posicion: "Portero",        club: "Athletic Club" },
  { match: /central|defensa/i,         nombre: "Pau Torres",     posicion: "Central",        club: "Aston Villa" },
  { match: /lateral/i,                 nombre: "Alejandro Balde",posicion: "Lateral",        club: "FC Barcelona" },
  { match: /pivote|mediocentro/i,      nombre: "Martín Zubimendi",posicion: "Pivote",        club: "Real Sociedad" },
  { match: /mediapunta|interior/i,     nombre: "Fabián Ruiz",    posicion: "Mediapunta",     club: "PSG" },
  { match: /extremo/i,                 nombre: "Nico Williams",  posicion: "Extremo",        club: "Athletic Club" },
  { match: /delantero|punta/i,         nombre: "Álvaro Morata",  posicion: "Delantero",      club: "Selección Española" },
];

function tierLabelFor(vsi: number): string {
  if (vsi >= 80) return "elite";
  if (vsi >= 70) return "alto";
  if (vsi >= 60) return "medio_alto";
  if (vsi >= 50) return "medio";
  return "desarrollo";
}

/** Ordena las 6 métricas para separar fortalezas (altas) de áreas (bajas). */
function rankedMetrics(player: Player, locale: ReportLocale): Array<{ key: string; label: string; value: number }> {
  const labels = METRIC_LABEL[locale];
  const m = player.metrics ?? ({} as Record<string, number>);
  return Object.keys(labels)
    .map((key) => ({ key, label: labels[key], value: (m as Record<string, number>)[key] ?? 0 }))
    .sort((a, b) => b.value - a.value);
}

function maturityBlurb(player: Player, locale: ReportLocale): string {
  const mat = playerMaturity(player as unknown as Parameters<typeof playerMaturity>[0]);
  if (locale === "en") {
    if (mat.timing === "late")
      return "Late maturer: today competes physically behind peers, but the growth margin is still to come. Often undervalued talent — don't rule out by size.";
    if (mat.timing === "early")
      return "Early maturer: part of the current output leans on a temporary physical edge peers will catch up to. Prioritise technical-tactical development over physical.";
    if (mat.timing === "on_time")
      return "Maturing in phase with peers: the current evaluation reflects their relative level well.";
    return "Maturation timing to be determined (data outside the reliability window); observed performance is evaluated.";
  }
  if (mat.timing === "late")
    return "Madurador tardío: hoy compite físicamente por detrás de sus pares, pero su margen de crecimiento está por llegar. Talento a menudo infravalorado — no descartar por tamaño.";
  if (mat.timing === "early")
    return "Madurador precoz: parte de su rendimiento actual se apoya en una ventaja física temporal que sus pares igualarán. Priorizar el desarrollo técnico-táctico sobre el físico.";
  if (mat.timing === "on_time")
    return "Maduración en fase con sus pares: la evaluación actual refleja bien su nivel relativo.";
  return "Timing de maduración por determinar (datos fuera de la ventana de fiabilidad); se evalúa el rendimiento observado.";
}

/** Construye el/los análisis de ejemplo para un jugador del demo. */
export function buildDemoAnalysisRows(
  player: Player,
  locale: ReportLocale = normalizeLocale(i18n.language),
): AnalysisDbRow[] {
  const en = locale === "en";
  const vsi = typeof player.vsi === "number" ? player.vsi : 60;
  const ranked = rankedMetrics(player, locale);
  const strengths = ranked.slice(0, 3).map((r) => ({ title: r.label }));
  const areas = ranked.slice(-2).map((r) => ({ title: r.label }));
  const first = player.name.split(" ")[0];
  const pos = player.position;
  const posLow = pos.toLowerCase();
  const pro = PRO_BY_POSITION.find((p) => p.match.test(player.position)) ?? PRO_BY_POSITION[4];
  const matBlurb = maturityBlurb(player, locale);
  const s0 = strengths[0].title.toLowerCase();
  const a0 = areas[0].title.toLowerCase();
  const join = (arr: string[]) => arr.join(en ? " and " : " y ");

  const row: AnalysisDbRow = {
    id: `demo-analysis-${player.id}`,
    player_id: player.id,
    video_id: `demo-video-${player.id}`,
    created_at: "2026-09-01T10:00:00.000Z",
    vsi: { vsi, tierLabel: tierLabelFor(vsi), confidence: 0.78 },
    reports: [
      {
        report_type: "player-report",
        content: {
          executive_summary: en
            ? `${first} (${pos}, age ${player.age}) has a profile VSI of ${Math.round(vsi)}. ` +
              `Stands out in ${join(strengths.map((s) => s.title.toLowerCase()))}, with room to grow in ${join(areas.map((a) => a.title.toLowerCase()))}. ${matBlurb}`
            : `${first} (${pos}, ${player.age} años) presenta un VSI de ficha de ${Math.round(vsi)}. ` +
              `Destaca en ${join(strengths.map((s) => s.title.toLowerCase()))}, con recorrido en ${join(areas.map((a) => a.title.toLowerCase()))}. ${matBlurb}`,
          tier_label: tierLabelFor(vsi),
          strengths,
          areas_to_improve: areas,
        },
      },
      {
        report_type: "dna-profile",
        content: {
          primary_style: en
            ? `${pos} with a ${ranked[0].label.toLowerCase()} profile`
            : `${pos} con perfil ${ranked[0].label.toLowerCase()}`,
          style_summary: en
            ? `Game built on ${ranked[0].label.toLowerCase()} and ${ranked[1].label.toLowerCase()}. ` +
              `Decision-making in line with their ${posLow} role.`
            : `Juego apoyado en ${ranked[0].label.toLowerCase()} y ${ranked[1].label.toLowerCase()}. ` +
              `Toma de decisiones acorde a su ${posLow}.`,
          natural_role: player.position,
          pressure_behavior: en
            ? (vsi >= 65 ? "Competitive under pressure; keeps good judgement in decision zones." : "Developing under pressure; improves with repeated demanding contexts.")
            : (vsi >= 65 ? "Competitivo bajo presión; mantiene criterio en zonas de decisión." : "En desarrollo bajo presión; mejora con repetición de contextos exigentes."),
        },
      },
      {
        report_type: "best-match",
        content: {
          nombre: pro.nombre,
          posicion: pro.posicion,
          club: pro.club,
          score: Math.max(55, Math.min(88, Math.round(vsi + 8))),
          narrativa: en
            ? `Example comparable by position family (${pro.posicion}). Indicative reference, not a level equivalence.`
            : `Comparable de ejemplo por familia de posición (${pro.posicion}). Referencia orientativa, no una equivalencia de nivel.`,
        },
      },
      {
        report_type: "projection",
        content: {
          optimistic: {
            description: en
              ? `With sustained progression, ${first} could project above their current level.`
              : `Con progresión sostenida, ${first} podría proyectarse por encima de su nivel actual.`,
            level: en ? (vsi >= 70 ? "Semi-pro" : "High amateur") : (vsi >= 70 ? "Semi-pro" : "Amateur alto"),
          },
          realistic: {
            description: en
              ? `Consistent development within their age group, keeping suitable playing time and load.`
              : `Desarrollo consistente dentro de su categoría manteniendo minutos y carga adecuada.`,
            level: en ? (vsi >= 60 ? "High amateur" : "Amateur") : (vsi >= 60 ? "Amateur alto" : "Amateur"),
          },
          key_factors: en
            ? [strengths[0].title, "Consistent playing time", "Maturation monitoring"]
            : [strengths[0].title, "Continuidad de minutos", "Acompañamiento de la maduración"],
          risks: en
            ? ["Overload during the growth window", areas[0].title]
            : ["Sobrecarga en ventana de crecimiento", areas[0].title],
        },
      },
      {
        report_type: "development-plan",
        content: {
          goal_6months: en
            ? `Consolidate ${s0} and close the gap in ${a0}.`
            : `Consolidar ${s0} y reducir la brecha en ${a0}.`,
          goal_18months: en
            ? `Transition to a higher-responsibility role as ${posLow}.`
            : `Transición a un rol de mayor responsabilidad como ${posLow}.`,
          pillars: [
            {
              pilar: areas[0].title,
              acciones: en
                ? ["Targeted blocks 2×/week", "Fortnightly video feedback"]
                : ["Bloques específicos 2×/semana", "Vídeo-feedback quincenal"],
              prioridad: "alta",
            },
            {
              pilar: strengths[0].title,
              acciones: en
                ? ["Maintain with progressively harder challenges"]
                : ["Mantener con retos de dificultad creciente"],
              prioridad: "media",
            },
          ],
        },
      },
    ],
  };

  return [row];
}
