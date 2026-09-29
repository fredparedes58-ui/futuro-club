/**
 * i18n · rótulos de la fecha de nacimiento del JUGADOR y del guardado honesto
 * (PlayerPhvSection + toasts de PlayerForm) en los 7 idiomas.
 *
 * translations.test.ts solo compara es↔en; aquí se fija la paridad de los
 * namespaces tocados en los 7 locales, que ningún texto quede vacío, que las
 * variables de interpolación coincidan y el copy exacto pedido en español.
 */
import { describe, it, expect } from "vitest";
import es from "@/i18n/es.json";
import es419 from "@/i18n/es-419.json";
import en from "@/i18n/en.json";
import itJson from "@/i18n/it.json";
import fr from "@/i18n/fr.json";
import de from "@/i18n/de.json";
import nl from "@/i18n/nl.json";

type Dict = Record<string, unknown>;
const LOCALES: Record<string, Dict> = { es, "es-419": es419, en, it: itJson, fr, de, nl };

const PHV_KEYS = [
  "parentalTitle",
  "parentalNote",
  "birthDate",
  "motherHeight",
  "fatherHeight",
  "parentalSave",
  "parentalSaved",
  "parentalError",
  "parentalRangeError",
  "birthDateInvalid",
  "notFoundError",
  "pendingSync",
  "pendingSyncToast",
] as const;
const TOAST_KEYS = ["playerSavedPendingSync", "playerAddedPendingSync", "playerNotOnDevice"] as const;

function ns(dict: Dict, name: string): Record<string, string> {
  return dict[name] as Record<string, string>;
}
function vars(s: string): string[] {
  return (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((m) => m.replace(/[{}\s]/g, "")).sort();
}

describe("i18n · fecha de nacimiento del jugador + guardado honesto (7 idiomas)", () => {
  it("playerPhvSection tiene exactamente las mismas claves en los 7 locales", () => {
    const esKeys = Object.keys(ns(es, "playerPhvSection")).sort();
    expect(esKeys).toEqual([...PHV_KEYS].sort());
    for (const [loc, dict] of Object.entries(LOCALES)) {
      expect(Object.keys(ns(dict, "playerPhvSection")).sort(), loc).toEqual(esKeys);
    }
  });

  it("las claves nuevas de toasts existen en los 7 locales, no vacías y con {{name}}", () => {
    for (const [loc, dict] of Object.entries(LOCALES)) {
      for (const k of TOAST_KEYS) {
        const v = ns(dict, "toasts")[k];
        expect(typeof v === "string" && v.trim().length > 0, `${loc} toasts.${k}`).toBe(true);
        expect(vars(v), `${loc} toasts.${k}`).toEqual(["name"]);
      }
    }
  });

  it("ningún texto vacío y mismas variables que es en playerPhvSection", () => {
    for (const [loc, dict] of Object.entries(LOCALES)) {
      for (const k of PHV_KEYS) {
        const v = ns(dict, "playerPhvSection")[k];
        expect(typeof v === "string" && v.trim().length > 0, `${loc} ${k}`).toBe(true);
        expect(vars(v), `${loc} ${k}`).toEqual(vars(ns(es, "playerPhvSection")[k]));
      }
    }
  });

  it("copy en español: la fecha es del JUGADOR; sección y botón renombrados", () => {
    for (const dict of [es, es419]) {
      const s = ns(dict, "playerPhvSection");
      expect(s.birthDate).toBe("Fecha de nacimiento del jugador");
      expect(s.parentalTitle).toBe("Datos de maduración (jugador y padres)");
      expect(s.parentalSave).toBe("Guardar fecha de nacimiento y alturas");
      expect(s.pendingSync).toBe("Pendiente de sincronizar");
      // se mantienen los rótulos de las alturas de los padres
      expect(s.motherHeight).toBe("Altura madre (cm)");
      expect(s.fatherHeight).toBe("Altura padre (cm)");
    }
  });

  it("ningún idioma deja la etiqueta de la fecha sin referirse al jugador", () => {
    const PLAYER_WORD: Record<string, RegExp> = {
      es: /jugador/i, "es-419": /jugador/i, en: /player/i, it: /giocatore/i,
      fr: /joueur/i, de: /spieler/i, nl: /speler/i,
    };
    for (const [loc, dict] of Object.entries(LOCALES)) {
      const s = ns(dict, "playerPhvSection");
      expect(s.birthDate, loc).toMatch(PLAYER_WORD[loc]);
      expect(s.parentalTitle, loc).toMatch(PLAYER_WORD[loc]);
    }
  });
});
