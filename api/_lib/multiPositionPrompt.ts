/**
 * VITAS · Helper compartido para prompts multi-posición.
 *
 * Inyecta en cada prompt de agente las reglas de polivalencia de forma
 * coherente. Cualquier agente que reciba player.position +
 * player.secondaryPositions + videoContext.playedPosition debe usar
 * este bloque para que el output sea consistente entre agentes.
 */

export const MULTI_POSITION_BLOCK = `
POLIVALENCIA · si los datos de entrada incluyen estos campos, debes considerarlos:
  - player.position           → posición principal declarada por el coach
  - player.secondaryPositions → array de posiciones secundarias declaradas (jugador polivalente)
  - videoContext.playedPosition → posición que jugó EN ESTE video específico

REGLAS:
  1. Si playedPosition está presente, el análisis se centra en el rendimiento desde esa posición.
  2. Si secondaryPositions tiene elementos, el jugador es polivalente · considéralo en proyecciones, drills y plan.
  3. Las sugerencias de cambio de posición NUNCA deben recomendar una posición ya declarada (redundante).
  4. Si detectas una posición no declarada con encaje >75, márcala como DESCUBRIMIENTO ofreciendo añadirla al perfil.
  5. Evidencia siempre debe citar el video específico (videoContext.videoId si está disponible).
`;

/**
 * Schema fragment para inyectar en cualquier output que pueda devolver
 * alternativas de posición.
 */
export const POSITION_ALTERNATIVES_SCHEMA = `
positionAlternatives: opcional · si tiene sentido para el agente
  Array<{
    code: string                  // código de posición (LB, RB, DM, CAM, etc.)
    fit: number                   // 0-100, encaje en esa posición según las observaciones
    alreadyDeclared: boolean      // true si está en player.position o player.secondaryPositions
    reason: string                // 1-2 frases explicando por qué encajaría
    confidence: number            // 0-1
  }>
`;
