/**
 * VITAS · Tactical Pattern Prompt builder (shared)
 *
 * Single source of truth para el prompt enviado al agente
 * `_tactical-pattern` y al orquestador (si lo hubiera). Versionado.
 */

import type { TacticalPatternInput } from "../../agents/contracts";

export const TACTICAL_PROMPT_VERSION = "v1.0.0";

const PHASE_LABEL: Record<string, string> = {
  build_up: "Construcción",
  attacking: "Ataque organizado",
  defending: "Defensa organizada",
  defensive_transition: "Transición defensiva",
  offensive_transition: "Transición ofensiva",
  set_piece: "Balón parado",
};

export function buildTacticalPatternPrompt(data: TacticalPatternInput): string {
  const totalSec = Object.values(data.phaseDurations).reduce((a, b) => a + b, 0);
  const durationLines = Object.entries(data.phaseDurations)
    .map(([phase, sec]) => {
      const pct = totalSec > 0 ? Math.round((sec / totalSec) * 100) : 0;
      return `- ${PHASE_LABEL[phase] ?? phase}: ${Math.round(sec)}s (${pct}%)`;
    })
    .join("\n");

  const zonesLines = data.teamHotZonesByPhase
    .map((entry) => {
      const zones = entry.zones
        .slice(0, 3)
        .map(
          (z) =>
            `(${Math.round(z.centroidX)},${Math.round(z.centroidY)}) r${Math.round(z.radius)} share ${Math.round(z.share * 100)}% — ${z.label ?? ""}`,
        )
        .join(" · ");
      return `- ${PHASE_LABEL[entry.phase] ?? entry.phase}: ${zones || "sin zonas calientes"}`;
    })
    .join("\n");

  const gapsLines = data.coverageGaps?.length
    ? data.coverageGaps
        .slice(0, 8)
        .map((g) => `- ${PHASE_LABEL[g.phase] ?? g.phase}: ${g.label} (x=${g.zone.x}, y=${g.zone.y})`)
        .join("\n")
    : "Ninguna detectada";

  return `Eres un analista táctico de fútbol con experiencia en patrones de posicionamiento y heatmaps. Tu trabajo: leer los heatmaps de un partido (segmentados en 6 fases tácticas) y producir un análisis ACCIONABLE para el cuerpo técnico.

## DATOS DEL PARTIDO
- ID: ${data.match.id}
- Fecha: ${data.match.matchDate ?? "no especificada"}
- Duración: ${data.match.durationMin ?? "?"} min
- Resultado: ${data.match.score ? `${data.match.score.ours}-${data.match.score.theirs}` : "no registrado"}

## EQUIPO
- Formación: ${data.team.formation ?? "no especificada"}
- Edad media: ${data.team.averageAge ?? "?"}
- Estilo declarado: ${data.team.style ?? "no especificado"}
- Posesión del equipo en este partido: ${data.possessionPct}%

## DURACIÓN POR FASE
${durationLines}

## ZONAS CALIENTES DEL EQUIPO POR FASE (coords 0-100)
${zonesLines}

## COVERAGE GAPS DETECTADOS
${gapsLines}

## INSTRUCCIONES

1. **Lee los heatmaps con perspectiva táctica**: no describas dónde están los puntos calientes; interpreta QUÉ significan tácticamente.
2. **Compara con lo esperado**: si en "Ataque organizado" no hay zona caliente en tercio rival, eso es una bandera roja.
3. **Sé concreto con coords**: "perdéis el balón en la zona (35, 70) — banda derecha del medio campo" mejor que "perdéis en el medio".
4. **Identifica riesgos**: zonas donde el equipo NO está pero el rival puede explotar.
5. **Sugerencias ACCIONABLES**: que el coach pueda traducir a un drill o instrucción concreta.
6. **3-6 observaciones por fase** (\`byPhase\` array) — una por fase relevante. Skip fases con <5% del tiempo.
7. **Tono profesional pero directo**: español, sin anglicismos forzados.

## FORMATO DE RESPUESTA (JSON estricto)

\`\`\`json
{
  "headline": "1 frase impactante que resume el match táctico (max 200 chars)",
  "summary": "2-3 oraciones de resumen ejecutivo",
  "byPhase": [
    {
      "phase": "build_up" | "attacking" | "defending" | "defensive_transition" | "offensive_transition" | "set_piece",
      "observation": "Qué se ve en el heatmap de esta fase (≥10 chars, con coords si aplica)",
      "risk": "low" | "moderate" | "high",
      "suggestion": "Qué hacer al respecto (drill, ajuste posicional, instrucción)"
    }
  ],
  "strengths": ["3-4 puntos fuertes detectados"],
  "weaknesses": ["3-4 debilidades detectadas"],
  "coachingTips": ["3-4 tips para el próximo entrenamiento"]
}
\`\`\`

Responde ÚNICAMENTE con el JSON. Sin texto adicional ni markdown wrapper.`;
}
