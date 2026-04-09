/**
 * VITAS · Tests — PDFService
 * Verifica: exportPlayerReport, exportAsImage, printCurrentPage
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PDFService } from "@/services/real/pdfService";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PDFService", () => {
  let windowOpenSpy: ReturnType<typeof vi.spyOn>;
  let windowPrintSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    windowOpenSpy = vi.spyOn(window, "open").mockReturnValue(window);
    windowPrintSpy = vi.fn();
    window.print = windowPrintSpy;
  });

  describe("exportPlayerReport", () => {
    it("abre ruta /report/:id en nueva pestaña", () => {
      PDFService.exportPlayerReport("p123");
      expect(windowOpenSpy).toHaveBeenCalledWith("/report/p123", "_blank");
    });

    it("incluye ID del jugador en la URL", () => {
      PDFService.exportPlayerReport("player-abc");
      expect(windowOpenSpy).toHaveBeenCalledWith(
        expect.stringContaining("player-abc"),
        "_blank",
      );
    });

    it("usa fallback a location.href si window.open retorna null", () => {
      windowOpenSpy.mockReturnValueOnce(null);
      // No debe lanzar error
      expect(() => PDFService.exportPlayerReport("p1")).not.toThrow();
    });

    it("construye URL correcta con prefijo /report/", () => {
      PDFService.exportPlayerReport("xyz");
      const url = windowOpenSpy.mock.calls[0][0];
      expect(url).toBe("/report/xyz");
    });
  });

  describe("exportAsImage", () => {
    it("abre ruta con format=image query param", () => {
      PDFService.exportAsImage("p456");
      expect(windowOpenSpy).toHaveBeenCalledWith("/report/p456?format=image", "_blank");
    });

    it("maneja datos faltantes (ID vacío) sin error", () => {
      expect(() => PDFService.exportAsImage("")).not.toThrow();
      expect(windowOpenSpy).toHaveBeenCalledWith("/report/?format=image", "_blank");
    });
  });

  describe("printCurrentPage", () => {
    it("llama a window.print()", () => {
      PDFService.printCurrentPage();
      expect(windowPrintSpy).toHaveBeenCalledOnce();
    });
  });
});
