/**
 * VITAS · Smart Content Chunker
 *
 * Equivalente adaptado de AST-based chunking.
 * En vez de parsear código con Tree-sitter, parseamos CONTENIDO por su
 * estructura semántica natural:
 *
 * - Markdown: corta por secciones H2/H3 completas con su contexto
 * - Drills: ya son chunks completos (no tocar)
 * - Reportes: corta por sección temática (estado actual, proyección, etc.)
 * - Texto libre: corta por párrafo con overlap para no perder contexto
 *
 * Cada chunk incluye metadata enriquecida:
 * - Sección padre (para jerarquía)
 * - Posición en el documento (para orden)
 * - Estimación de tokens
 * - Hash de contenido (para detectar cambios y re-indexar)
 *
 * IMPORTANTE: Este servicio es complementario al ingesta actual.
 * NO reemplaza el flujo existente — se usa como pre-procesador opcional.
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ContentChunk {
  /** Contenido del chunk */
  content: string;
  /** Metadata enriquecida */
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  /** Tipo de chunk */
  type: "markdown_section" | "drill" | "report_section" | "paragraph" | "full_document";
  /** Título de la sección (si aplica) */
  sectionTitle?: string;
  /** Sección padre (H1 para chunks H2, H2 para H3) */
  parentSection?: string;
  /** Nivel de heading (1, 2, 3, etc.) */
  headingLevel?: number;
  /** Posición en el documento (0-based) */
  position: number;
  /** Total de chunks del documento */
  totalChunks: number;
  /** Tokens estimados (~3.5 chars/token para español) */
  estimatedTokens: number;
  /** Hash del contenido (para detectar cambios) */
  contentHash: string;
  /** Fuente original */
  source?: string;
  /** Fecha de última modificación */
  lastModified?: string;
}

export interface ChunkerOptions {
  /** Máximo de tokens por chunk (default: 1000) */
  maxTokensPerChunk?: number;
  /** Mínimo de tokens por chunk — no crear chunks tiny (default: 50) */
  minTokensPerChunk?: number;
  /** Overlap en tokens entre chunks consecutivos (default: 50) */
  overlapTokens?: number;
  /** Nivel de heading mínimo para split (default: 2 = H2) */
  minSplitLevel?: number;
  /** Metadata adicional para todos los chunks */
  baseMetadata?: Record<string, unknown>;
}

// ── Funciones principales ─────────────────────────────────────────────────────

/**
 * Chunka contenido Markdown por secciones semánticas.
 *
 * Estrategia:
 * 1. Parsear headings → construir árbol de secciones
 * 2. Cada sección H2 (o minSplitLevel) = 1 chunk
 * 3. Si una sección es muy larga → sub-dividir por H3
 * 4. Si aún es muy larga → dividir por párrafos con overlap
 * 5. Chunks muy pequeños → merge con el anterior
 */
export function chunkMarkdown(
  markdown: string,
  options: ChunkerOptions = {}
): ContentChunk[] {
  const {
    maxTokensPerChunk = 1000,
    minTokensPerChunk = 50,
    overlapTokens = 50,
    minSplitLevel = 2,
  } = options;

  if (!markdown.trim()) return [];

  // 1. Parsear secciones
  const sections = parseMarkdownSections(markdown, minSplitLevel);

  // 2. Si el documento es pequeño, retornar como un solo chunk
  const totalTokens = estimateTokens(markdown);
  if (totalTokens <= maxTokensPerChunk) {
    const title = sections[0]?.title ?? "Documento";
    return [{
      content: markdown.trim(),
      metadata: {
        type: "full_document",
        sectionTitle: title,
        position: 0,
        totalChunks: 1,
        estimatedTokens: totalTokens,
        contentHash: simpleHash(markdown),
      },
    }];
  }

  // 3. Crear chunks por sección
  const rawChunks: ContentChunk[] = [];

  for (const section of sections) {
    const sectionTokens = estimateTokens(section.content);

    if (sectionTokens <= maxTokensPerChunk) {
      // Sección cabe en un chunk
      rawChunks.push({
        content: section.content.trim(),
        metadata: {
          type: "markdown_section",
          sectionTitle: section.title,
          parentSection: section.parent,
          headingLevel: section.level,
          position: rawChunks.length,
          totalChunks: 0, // se actualiza después
          estimatedTokens: sectionTokens,
          contentHash: simpleHash(section.content),
        },
      });
    } else {
      // Sección muy larga → dividir por párrafos con overlap
      const subChunks = splitByParagraphs(
        section.content,
        maxTokensPerChunk,
        overlapTokens,
        section.title,
        section.parent
      );
      rawChunks.push(...subChunks.map((c, i) => ({
        ...c,
        metadata: { ...c.metadata, position: rawChunks.length + i },
      })));
    }
  }

  // 4. Merge chunks tiny
  const merged = mergeSmallChunks(rawChunks, minTokensPerChunk, maxTokensPerChunk);

  // 5. Actualizar totalChunks y positions
  return merged.map((chunk, i) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      position: i,
      totalChunks: merged.length,
    },
  }));
}

/**
 * Chunka un reporte de jugador por secciones temáticas.
 * Cada sección del reporte (estadoActual, adnFutbolistico, etc.) = 1 chunk.
 */
export function chunkPlayerReport(
  report: Record<string, unknown>,
  playerName: string
): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  const sectionNames: Record<string, string> = {
    estadoActual: "Estado Actual",
    adnFutbolistico: "ADN Futbolístico",
    jugadorReferencia: "Jugador Referencia",
    proyeccionCarrera: "Proyección de Carrera",
    planDesarrollo: "Plan de Desarrollo",
    metricasCuantitativas: "Métricas Cuantitativas",
  };

  for (const [key, displayName] of Object.entries(sectionNames)) {
    const sectionData = report[key];
    if (!sectionData) continue;

    const content = `## ${displayName} — ${playerName}\n\n${JSON.stringify(sectionData, null, 2)}`;
    chunks.push({
      content,
      metadata: {
        type: "report_section",
        sectionTitle: displayName,
        parentSection: `Reporte: ${playerName}`,
        position: chunks.length,
        totalChunks: 0,
        estimatedTokens: estimateTokens(content),
        contentHash: simpleHash(content),
        source: "video-intelligence",
      },
    });
  }

  return chunks.map((c, i) => ({
    ...c,
    metadata: { ...c.metadata, position: i, totalChunks: chunks.length },
  }));
}

/**
 * Prepara chunks para ingesta en el RAG.
 * Convierte ContentChunk[] al formato que /api/rag/ingest espera.
 */
export function chunksToIngestPayload(
  chunks: ContentChunk[],
  category: "drill" | "pro_player" | "report" | "methodology" | "scouting",
  playerId?: string
): Array<{ content: string; category: string; metadata: Record<string, unknown>; player_id?: string }> {
  return chunks.map(chunk => ({
    content: chunk.content,
    category,
    metadata: {
      ...chunk.metadata,
      chunkedAt: new Date().toISOString(),
    },
    ...(playerId ? { player_id: playerId } : {}),
  }));
}

// ── Parser de secciones Markdown ──────────────────────────────────────────────

interface MarkdownSection {
  title: string;
  level: number;
  parent?: string;
  content: string;
  startLine: number;
}

function parseMarkdownSections(markdown: string, minLevel: number): MarkdownSection[] {
  const lines = markdown.split("\n");
  const sections: MarkdownSection[] = [];
  let currentSection: MarkdownSection | null = null;
  let contentLines: string[] = [];
  let lastParent: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      // Guardar sección anterior
      if (currentSection) {
        currentSection.content = contentLines.join("\n").trim();
        if (currentSection.content) {
          sections.push(currentSection);
        }
      }

      // Track parent
      if (level < minLevel) {
        lastParent = title;
      }

      // Iniciar nueva sección (solo si es >= minLevel)
      if (level >= minLevel) {
        currentSection = {
          title,
          level,
          parent: lastParent,
          content: "",
          startLine: i,
        };
        contentLines = [line]; // incluir el heading en el content
      } else {
        // Es un heading de nivel superior → incluir como parte del intro
        if (!currentSection) {
          currentSection = {
            title,
            level,
            content: "",
            startLine: i,
          };
          contentLines = [line];
        } else {
          contentLines.push(line);
        }
      }
    } else {
      contentLines.push(line);
    }
  }

  // Guardar última sección
  if (currentSection) {
    currentSection.content = contentLines.join("\n").trim();
    if (currentSection.content) {
      sections.push(currentSection);
    }
  }

  // Si no hay secciones (no tiene headings), retornar todo como una sección
  if (sections.length === 0 && markdown.trim()) {
    sections.push({
      title: "Contenido",
      level: 1,
      content: markdown.trim(),
      startLine: 0,
    });
  }

  return sections;
}

// ── División por párrafos con overlap ─────────────────────────────────────────

function splitByParagraphs(
  content: string,
  maxTokens: number,
  overlapTokens: number,
  sectionTitle: string,
  parentSection?: string
): ContentChunk[] {
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
  const chunks: ContentChunk[] = [];
  let currentContent = "";
  let currentTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    if (currentTokens + paraTokens > maxTokens && currentContent) {
      // Guardar chunk actual
      chunks.push({
        content: currentContent.trim(),
        metadata: {
          type: "paragraph",
          sectionTitle,
          parentSection,
          position: chunks.length,
          totalChunks: 0,
          estimatedTokens: currentTokens,
          contentHash: simpleHash(currentContent),
        },
      });

      // Overlap: mantener el último párrafo del chunk anterior
      const overlapContent = getOverlapContent(currentContent, overlapTokens);
      currentContent = overlapContent + "\n\n" + para;
      currentTokens = estimateTokens(currentContent);
    } else {
      currentContent += (currentContent ? "\n\n" : "") + para;
      currentTokens += paraTokens;
    }
  }

  // Guardar último chunk
  if (currentContent.trim()) {
    chunks.push({
      content: currentContent.trim(),
      metadata: {
        type: "paragraph",
        sectionTitle,
        parentSection,
        position: chunks.length,
        totalChunks: 0,
        estimatedTokens: currentTokens,
        contentHash: simpleHash(currentContent),
      },
    });
  }

  return chunks;
}

function getOverlapContent(content: string, overlapTokens: number): string {
  const targetChars = overlapTokens * 3.5;
  if (content.length <= targetChars) return content;

  // Tomar los últimos N caracteres, cortando en un límite de párrafo
  const tail = content.slice(-targetChars);
  const paraStart = tail.indexOf("\n\n");
  return paraStart >= 0 ? tail.slice(paraStart + 2) : tail;
}

// ── Merge de chunks pequeños ──────────────────────────────────────────────────

function mergeSmallChunks(
  chunks: ContentChunk[],
  minTokens: number,
  maxTokens: number
): ContentChunk[] {
  if (chunks.length <= 1) return chunks;

  const merged: ContentChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (chunk.metadata.estimatedTokens < minTokens && merged.length > 0) {
      // Merge con el anterior si cabe
      const prev = merged[merged.length - 1];
      const combinedTokens = prev.metadata.estimatedTokens + chunk.metadata.estimatedTokens;

      if (combinedTokens <= maxTokens) {
        prev.content += "\n\n" + chunk.content;
        prev.metadata.estimatedTokens = combinedTokens;
        prev.metadata.contentHash = simpleHash(prev.content);
        continue;
      }
    }

    merged.push({ ...chunk });
  }

  return merged;
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Hash simple para detectar cambios en contenido.
 * No es criptográfico — solo para comparación rápida.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Detecta si un documento necesita re-indexarse comparando hashes.
 */
export function needsReindex(
  newChunks: ContentChunk[],
  existingHashes: string[]
): { needsUpdate: boolean; newChunks: ContentChunk[]; removedCount: number } {
  const newHashes = new Set(newChunks.map(c => c.metadata.contentHash));
  const existingSet = new Set(existingHashes);

  const chunksToIndex = newChunks.filter(c => !existingSet.has(c.metadata.contentHash));
  const removedCount = existingHashes.filter(h => !newHashes.has(h)).length;

  return {
    needsUpdate: chunksToIndex.length > 0 || removedCount > 0,
    newChunks: chunksToIndex,
    removedCount,
  };
}
