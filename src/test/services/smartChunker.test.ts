/**
 * VITAS · Tests — Smart Chunker
 * Verifica: markdown chunking, report chunking, hash detection
 */
import { describe, it, expect } from "vitest";
import { chunkMarkdown, chunkPlayerReport, needsReindex } from "@/services/real/smartChunker";

describe("Smart Chunker", () => {
  describe("chunkMarkdown", () => {
    it("retorna array vacio con string vacio", () => {
      expect(chunkMarkdown("")).toEqual([]);
      expect(chunkMarkdown("   ")).toEqual([]);
    });

    it("retorna single chunk si documento es pequeno", () => {
      const md = "# Titulo\n\nContenido breve del documento.";
      const chunks = chunkMarkdown(md, { maxTokensPerChunk: 5000 });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].metadata.type).toBe("full_document");
      expect(chunks[0].metadata.totalChunks).toBe(1);
    });

    it("divide por secciones H2", () => {
      const md = [
        "# Doc Principal",
        "",
        "## Seccion 1",
        "Contenido de la seccion uno con suficiente texto para que no sea un chunk tiny. ".repeat(5),
        "",
        "## Seccion 2",
        "Contenido de la seccion dos con suficiente texto para que no sea un chunk tiny. ".repeat(5),
        "",
        "## Seccion 3",
        "Contenido de la seccion tres con suficiente texto para que no sea un chunk tiny. ".repeat(5),
      ].join("\n");
      const chunks = chunkMarkdown(md, { maxTokensPerChunk: 200 });
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      // Verify positions are sequential
      chunks.forEach((c, i) => {
        expect(c.metadata.position).toBe(i);
        expect(c.metadata.totalChunks).toBe(chunks.length);
      });
    });

    it("cada chunk tiene contentHash unico", () => {
      const md = "## A\nContenido A largo. ".repeat(20) + "\n\n## B\nContenido B largo. ".repeat(20);
      const chunks = chunkMarkdown(md, { maxTokensPerChunk: 100 });
      const hashes = chunks.map(c => c.metadata.contentHash);
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(hashes.length);
    });

    it("estimatedTokens es razonable", () => {
      const md = "## Test\n" + "Palabra ".repeat(100); // ~100 words
      const chunks = chunkMarkdown(md);
      for (const chunk of chunks) {
        expect(chunk.metadata.estimatedTokens).toBeGreaterThan(0);
        // ~3.5 chars per token, rough check
        expect(chunk.metadata.estimatedTokens).toBeLessThan(chunk.content.length);
      }
    });
  });

  describe("chunkPlayerReport", () => {
    it("crea un chunk por seccion de reporte", () => {
      const report = {
        estadoActual: { nivel: "Regional" },
        adnFutbolistico: { rol: "Extremo Creativo" },
        proyeccionCarrera: { techo: 75 },
      };
      const chunks = chunkPlayerReport(report, "Lucas Moreno");
      expect(chunks).toHaveLength(3);
      expect(chunks[0].metadata.type).toBe("report_section");
      expect(chunks[0].metadata.parentSection).toBe("Reporte: Lucas Moreno");
    });

    it("ignora secciones vacias", () => {
      const report = {
        estadoActual: { nivel: "Regional" },
        adnFutbolistico: null,
        jugadorReferencia: undefined,
      };
      const chunks = chunkPlayerReport(report as Record<string, unknown>, "Test");
      expect(chunks).toHaveLength(1); // solo estadoActual
    });

    it("totalChunks es correcto en cada chunk", () => {
      const report = {
        estadoActual: { a: 1 },
        planDesarrollo: { b: 2 },
      };
      const chunks = chunkPlayerReport(report, "Player");
      chunks.forEach(c => {
        expect(c.metadata.totalChunks).toBe(2);
      });
    });
  });

  describe("needsReindex", () => {
    it("detecta chunks nuevos", () => {
      const chunks = [
        { content: "A", metadata: { contentHash: "hash1", type: "paragraph" as const, position: 0, totalChunks: 2, estimatedTokens: 10 } },
        { content: "B", metadata: { contentHash: "hash2", type: "paragraph" as const, position: 1, totalChunks: 2, estimatedTokens: 10 } },
      ];
      const result = needsReindex(chunks, ["hash1"]);
      expect(result.needsUpdate).toBe(true);
      expect(result.newChunks).toHaveLength(1);
      expect(result.newChunks[0].content).toBe("B");
    });

    it("detecta chunks eliminados", () => {
      const chunks = [
        { content: "A", metadata: { contentHash: "hash1", type: "paragraph" as const, position: 0, totalChunks: 1, estimatedTokens: 10 } },
      ];
      const result = needsReindex(chunks, ["hash1", "hash_old"]);
      expect(result.needsUpdate).toBe(true);
      expect(result.removedCount).toBe(1);
    });

    it("no necesita reindex si todo es igual", () => {
      const chunks = [
        { content: "A", metadata: { contentHash: "h1", type: "paragraph" as const, position: 0, totalChunks: 1, estimatedTokens: 10 } },
      ];
      const result = needsReindex(chunks, ["h1"]);
      expect(result.needsUpdate).toBe(false);
      expect(result.newChunks).toHaveLength(0);
      expect(result.removedCount).toBe(0);
    });
  });
});
