/**
 * DSAR en /admin/consent: el mensaje de «sin permiso» (SQLSTATE 42501, migración 072)
 * y el genérico de siempre (antes de 072 las funciones de 036 fallan con otros
 * códigos), en los 7 idiomas.
 */
import { describe, it, expect } from "vitest";
import { dsarErrorToastKey, DSAR_NOT_ALLOWED_CODE } from "@/lib/consent/dsarError";
import pageSrc from "@/pages/ParentalConsentPage.tsx?raw";
import de from "@/i18n/de.json";
import en from "@/i18n/en.json";
import es from "@/i18n/es.json";
import es419 from "@/i18n/es-419.json";
import fr from "@/i18n/fr.json";
import it_ from "@/i18n/it.json";
import nl from "@/i18n/nl.json";

describe("dsarErrorToastKey", () => {
  it("42501 (072: no es tu jugador / no existe) → mensaje específico de permiso", () => {
    expect(dsarErrorToastKey({ code: DSAR_NOT_ALLOWED_CODE, message: "dsar: jugador no encontrado o sin permiso" }, "export")).toBe(
      "parentalConsentPage.toast.dsarNotAllowed",
    );
    expect(dsarErrorToastKey({ code: "42501" }, "deletion")).toBe("parentalConsentPage.toast.dsarNotAllowed");
  });

  it("errores de las funciones de 036 (antes de aplicar 072) → mensaje genérico de siempre", () => {
    for (const code of ["22P02", "42883", "PGRST202", "PGRST203", undefined]) {
      expect(dsarErrorToastKey({ code }, "export")).toBe("parentalConsentPage.toast.exportError");
      expect(dsarErrorToastKey({ code }, "deletion")).toBe("parentalConsentPage.toast.deletionError");
    }
    expect(dsarErrorToastKey(new Error("network"), "export")).toBe("parentalConsentPage.toast.exportError");
    expect(dsarErrorToastKey(null, "deletion")).toBe("parentalConsentPage.toast.deletionError");
  });

  it("la clave existe, no vacía, en los 7 idiomas", () => {
    for (const [lang, dict] of Object.entries({ de, en, es, "es-419": es419, fr, it: it_, nl })) {
      const toastBlock = (dict as { parentalConsentPage: { toast: Record<string, string> } }).parentalConsentPage.toast;
      expect(typeof toastBlock.dsarNotAllowed, lang).toBe("string");
      expect(toastBlock.dsarNotAllowed.length, lang).toBeGreaterThan(10);
    }
  });

  it("la página ya no envía p_requested_by: el solicitante sale del JWT (072)", () => {
    expect(pageSrc).toMatch(/rpc\("dsar_request_deletion",\s*\{\s*p_player_id: player\.id,\s*\}\)/);
    expect(pageSrc).not.toMatch(/p_requested_by/);
    expect(pageSrc).toMatch(/dsarErrorToastKey\(err, "export"\)/);
    expect(pageSrc).toMatch(/dsarErrorToastKey\(err, "deletion"\)/);
  });
});
