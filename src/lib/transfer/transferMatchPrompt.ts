/**
 * VITAS · Transfer Match Prompt builder (shared between agent endpoint
 * and orchestrator-style direct calls).
 *
 * Versionado independiente del agente — bumpear `TRANSFER_PROMPT_VERSION`
 * cuando se cambie el prompt.
 */

import type { TransferMatchInput } from "../../agents/contracts";

export const TRANSFER_PROMPT_VERSION = "v1.0.0";

export function buildTransferMatchPrompt(data: TransferMatchInput): string {
  const candidatesBlock = data.candidates
    .slice(0, 30)
    .map((c, i) => {
      const p = c.player;
      const vsi = p.vsiBreakdown
        ? `VSI ${p.vsi ?? "?"} (Tec ${p.vsiBreakdown.technical} / Tac ${p.vsiBreakdown.tactical} / Fis ${p.vsiBreakdown.physical} / Men ${p.vsiBreakdown.mental})`
        : `VSI ${p.vsi ?? "?"}`;
      const tags = p.tags?.length ? ` · tags: ${p.tags.join(", ")}` : "";
      const phv = p.phvOffset != null ? ` · PHV ${p.phvOffset.toFixed(1)} (${p.phvCategory ?? "?"})` : "";
      return `${i + 1}. [${c.listingId}] ${p.name ?? "Jugador"} · ${p.age ?? "?"}a · ${p.position ?? "?"} · pie ${p.foot ?? "?"} · ${vsi}${phv}${tags}
   Listing: ${c.listingType} · ${c.askingPriceEur != null ? `${c.askingPriceEur}€` : "negociable"}
   ${p.description ? `Notas: ${p.description.slice(0, 200)}` : ""}`;
    })
    .join("\n\n");

  const queryBlock = data.buyerNeed.query
    ? `Filtros estructurados:
- Posiciones: ${data.buyerNeed.query.positions?.join("/") ?? "cualquiera"}
- Edad: [${data.buyerNeed.query.minAge ?? "-"}, ${data.buyerNeed.query.maxAge ?? "-"}]
- Pie: ${data.buyerNeed.query.foot ?? "indistinto"}
- VSI mínimo: ${data.buyerNeed.query.minVSI ?? "no especificado"}
- Tipos de operación: ${data.buyerNeed.query.listingTypes?.join("/") ?? "cualquiera"}
- Presupuesto máximo: ${data.buyerNeed.query.maxPriceEur ? `${data.buyerNeed.query.maxPriceEur}€` : "abierto"}
- PHV: ${data.buyerNeed.query.phvCategory?.join("/") ?? "indistinto"}`
    : "Sin filtros estructurados — solo búsqueda libre.";

  const buyerContext = data.buyerNeed.buyerContext
    ? `Contexto del club comprador:
- Nivel del equipo: ${data.buyerNeed.buyerContext.teamLevel ?? "no especificado"}
- Formación: ${data.buyerNeed.buyerContext.formation ?? "no especificada"}
- Plantilla actual: ${data.buyerNeed.buyerContext.currentRoster?.slice(0, 8).join(", ") ?? "no especificada"}`
    : "Sin contexto del club comprador.";

  return `Eres un ojeador profesional especializado en fútbol formativo y mercado de fichajes. Tu trabajo: rankear candidatos de un marketplace contra la necesidad concreta del club comprador.

## NECESIDAD DEL COMPRADOR
"${data.buyerNeed.description}"

${queryBlock}

${buyerContext}

## CANDIDATOS DISPONIBLES (max 30)
${candidatesBlock}

## INSTRUCCIONES

1. **Rankea por fit real**: combina filtros estructurados (edad, posición, pie, VSI, presupuesto) con interpretación cualitativa (descripción del comprador, contexto del club).
2. **No fuerces matches malos**: si un candidato no encaja en algo crítico (posición distinta, presupuesto fuera), score bajo. Sé honesto.
3. **Devuelve hasta 10 top matches**. Si solo hay 3 buenos, devuelve 3.
4. **Para cada match incluye**:
   - \`score\` 0-100
   - \`reasoning\` (1-2 oraciones explicando POR QUÉ encaja)
   - \`matchedCriteria\` (lista de criterios que SÍ cumple)
   - \`missingCriteria\` (lista de criterios que NO cumple — honestidad)
5. **Considera el contexto del club**: un crack en equipo elite vale más en equipo en construcción. Un veterano puede ir mejor a un equipo joven, etc.
6. **Summary final**: 2-3 oraciones evaluando la calidad del pool y el top pick.

## FORMATO DE RESPUESTA (JSON estricto)

\`\`\`json
{
  "topMatches": [
    {
      "listingId": "<id del candidato>",
      "score": 85,
      "reasoning": "Encaja en posición, edad y presupuesto. PHV en zona ideal para club en formación.",
      "matchedCriteria": ["Posición central", "23 años", "VSI 72 ≥ 65", "Precio dentro presupuesto"],
      "missingCriteria": ["Pie diestro vs zurdo pedido"]
    }
  ],
  "summary": "..."
}
\`\`\`

Responde ÚNICAMENTE con el JSON. Sin texto extra ni markdown wrapper.`;
}
