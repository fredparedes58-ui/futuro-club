/**
 * VITAS Knowledge Base — Tipos compartidos
 *
 * Documentos de conocimiento futbolístico para el sistema RAG.
 * Categorías: "scouting" (evaluación), "methodology" (desarrollo/táctica), "drill" (ejercicios)
 */

export interface KnowledgeDocument {
  id: string;
  title: string;
  category: "drill" | "scouting" | "methodology";
  content: string;
  metadata: Record<string, unknown>;
}
