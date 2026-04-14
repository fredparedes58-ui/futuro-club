/**
 * VITAS · Tests — StorageService
 * Verifica: set, get, remove, clear, keys, error handling
 */
import { describe, it, expect, beforeEach } from "vitest";
import { StorageService } from "@/services/real/storageService";

describe("StorageService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("set & get", () => {
    it("guarda y recupera un string", () => {
      StorageService.set("test_key", "hello");
      expect(StorageService.get("test_key", "")).toBe("hello");
    });

    it("guarda y recupera un object", () => {
      const obj = { name: "Lucas", age: 15 };
      StorageService.set("player", obj);
      expect(StorageService.get("player", null)).toEqual(obj);
    });

    it("guarda y recupera un array", () => {
      StorageService.set("list", [1, 2, 3]);
      expect(StorageService.get("list", [])).toEqual([1, 2, 3]);
    });

    it("retorna fallback si key no existe", () => {
      expect(StorageService.get("nonexistent", "default")).toBe("default");
    });

    it("usa prefijo vitas_ internamente", () => {
      StorageService.set("mykey", "value");
      expect(localStorage.getItem("vitas_mykey")).toBe('"value"');
    });

    it("retorna fallback si JSON corrupto", () => {
      localStorage.setItem("vitas_broken", "not{json");
      expect(StorageService.get("broken", "fallback")).toBe("fallback");
    });
  });

  describe("remove", () => {
    it("elimina una key existente", () => {
      StorageService.set("toremove", "data");
      StorageService.remove("toremove");
      expect(StorageService.get("toremove", null)).toBeNull();
    });

    it("no falla al eliminar key inexistente", () => {
      expect(() => StorageService.remove("ghost")).not.toThrow();
    });
  });

  describe("clear", () => {
    it("does not throw", () => {
      StorageService.set("a", 1);
      StorageService.set("b", 2);
      expect(() => StorageService.clear()).not.toThrow();
    });
  });

  describe("keys", () => {
    it("returns an array", () => {
      const keys = StorageService.keys();
      expect(Array.isArray(keys)).toBe(true);
    });

    it("does not throw", () => {
      StorageService.set("alpha", 1);
      expect(() => StorageService.keys()).not.toThrow();
    });
  });

  describe("keys & roundtrip", () => {
    it("set/get roundtrip funciona para multiples keys", () => {
      StorageService.set("players", [{ id: "1" }]);
      StorageService.set("videos", []);
      StorageService.set("settings", { theme: "dark" });

      expect(StorageService.get("players", [])).toEqual([{ id: "1" }]);
      expect(StorageService.get("videos", [])).toEqual([]);
      expect(StorageService.get("settings", null)).toEqual({ theme: "dark" });
    });

    it("remove no afecta otras keys", () => {
      StorageService.set("keep", "yes");
      StorageService.set("remove_me", "bye");
      StorageService.remove("remove_me");

      expect(StorageService.get("keep", null)).toBe("yes");
      expect(StorageService.get("remove_me", null)).toBeNull();
    });

    it("guarda y recupera boolean", () => {
      StorageService.set("flag", true);
      expect(StorageService.get("flag", false)).toBe(true);
    });

    it("guarda y recupera number", () => {
      StorageService.set("count", 42);
      expect(StorageService.get("count", 0)).toBe(42);
    });
  });
});
