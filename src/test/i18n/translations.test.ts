/**
 * VITAS · Tests — i18n translations
 * Verifica: estructura, claves, interpolaciones, cambio de idioma, fallback
 */
import { describe, it, expect, beforeEach } from "vitest";
import es from "@/i18n/es.json";
import en from "@/i18n/en.json";
import itJson from "@/i18n/it.json";
import deJson from "@/i18n/de.json";
import frJson from "@/i18n/fr.json";
import nlJson from "@/i18n/nl.json";
import es419Json from "@/i18n/es-419.json";
import i18n from "@/i18n/index";

// Valor conocido por idioma para verificar que cada recurso carga (common.save).
const SAVE_BY_LOCALE: Record<string, string> = {
  es: es.common.save,
  en: en.common.save,
  it: itJson.common.save,
  de: deJson.common.save,
  fr: frJson.common.save,
  nl: nlJson.common.save,
  "es-419": es419Json.common.save,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Obtiene todas las claves de un objeto JSON recursivamente */
function getAllKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...getAllKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

/** Extrae variables de interpolación tipo {variable} de un string */
function extractInterpolationVars(text: string): string[] {
  const matches = text.match(/\{\{?\w+\}?\}/g) ?? [];
  return matches.map(m => m.replace(/[{}]/g, "")).sort();
}

/** Obtiene todos los valores string de un objeto recursivamente */
function getAllStringValues(obj: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const value of Object.values(obj)) {
    if (typeof value === "string") {
      values.push(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      values.push(...getAllStringValues(value as Record<string, unknown>));
    }
  }
  return values;
}

/** Obtiene pares clave-valor de un objeto recursivamente */
function getAllKeyValuePairs(obj: Record<string, unknown>, prefix = ""): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (typeof value === "string") {
      pairs.push([fullKey, value]);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      pairs.push(...getAllKeyValuePairs(value as Record<string, unknown>, fullKey));
    }
  }
  return pairs;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("i18n translations", () => {
  describe("estructura de claves", () => {
    it("ambos archivos tienen las mismas claves top-level", () => {
      const esKeys = Object.keys(es).sort();
      const enKeys = Object.keys(en).sort();
      expect(esKeys).toEqual(enKeys);
    });

    it("ambos archivos tienen la misma estructura anidada", () => {
      const esAllKeys = getAllKeys(es as Record<string, unknown>);
      const enAllKeys = getAllKeys(en as Record<string, unknown>);
      expect(esAllKeys).toEqual(enAllKeys);
    });

    it("cantidad de claves coincide entre idiomas", () => {
      const esCount = getAllKeys(es as Record<string, unknown>).length;
      const enCount = getAllKeys(en as Record<string, unknown>).length;
      expect(esCount).toBe(enCount);
      expect(esCount).toBeGreaterThan(0);
    });
  });

  describe("valores", () => {
    it("no hay strings vacíos en español", () => {
      const values = getAllStringValues(es as Record<string, unknown>);
      const empty = values.filter(v => v.trim() === "");
      expect(empty).toEqual([]);
    });

    it("no hay strings vacíos en inglés", () => {
      const values = getAllStringValues(en as Record<string, unknown>);
      const empty = values.filter(v => v.trim() === "");
      expect(empty).toEqual([]);
    });

    it("variables de interpolación coinciden entre idiomas", () => {
      const esPairs = getAllKeyValuePairs(es as Record<string, unknown>);
      const enMap = new Map(getAllKeyValuePairs(en as Record<string, unknown>));

      const mismatches: string[] = [];
      for (const [key, esValue] of esPairs) {
        const enValue = enMap.get(key);
        if (!enValue) continue;
        const esVars = extractInterpolationVars(esValue);
        const enVars = extractInterpolationVars(enValue);
        if (esVars.length > 0 || enVars.length > 0) {
          if (JSON.stringify(esVars) !== JSON.stringify(enVars)) {
            mismatches.push(`${key}: es=${JSON.stringify(esVars)}, en=${JSON.stringify(enVars)}`);
          }
        }
      }

      expect(mismatches).toEqual([]);
    });
  });

  describe("inicialización de i18n", () => {
    beforeEach(async () => {
      await i18n.changeLanguage("es");
    });

    it("inicializa correctamente con idioma por defecto (es)", () => {
      expect(i18n.isInitialized).toBe(true);
      expect(i18n.language).toBe("es");
    });

    it("cambiar a inglés retorna strings en inglés", async () => {
      await i18n.changeLanguage("en");
      expect(i18n.t("common.save")).toBe("Save");
      expect(i18n.t("common.cancel")).toBe("Cancel");
    });

    it("cambiar a español retorna strings en español", async () => {
      await i18n.changeLanguage("es");
      expect(i18n.t("common.save")).toBe("Guardar");
      expect(i18n.t("common.cancel")).toBe("Cancelar");
    });

    it("fallback a español cuando se solicita idioma desconocido", async () => {
      // Código inexistente (no en el registro) → fallback a "es".
      await i18n.changeLanguage("zz");
      expect(i18n.t("common.save")).toBe("Guardar");
    });

    it("cada idioma soportado carga su propio recurso", async () => {
      for (const [code, expected] of Object.entries(SAVE_BY_LOCALE)) {
        await i18n.changeLanguage(code);
        expect(i18n.t("common.save"), `common.save en ${code}`).toBe(expected);
      }
    });
  });
});
