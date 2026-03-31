/**
 * VITAS Storage Service — DETERMINISTA
 * Wrapper tipado sobre localStorage.
 * No usa IA. Lógica pura de persistencia.
 */

const PREFIX = "vitas_";

export const StorageService = {
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
    } catch {
      console.warn(`[StorageService] No se pudo guardar: ${key}`);
    }
  },

  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`${PREFIX}${key}`);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },

  remove(key: string): void {
    localStorage.removeItem(`${PREFIX}${key}`);
  },

  clear(): void {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  },

  keys(): string[] {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .map((k) => k.replace(PREFIX, ""));
  },
};
