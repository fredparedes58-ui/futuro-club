/**
 * fileHash — Tests
 *
 * Verifica:
 *  - calculateFileHash devuelve SHA-256 determinista
 *  - Archivo vacío → null
 *  - Best-effort: nunca lanza
 *  - isValidSha256Hex validador correcto
 */
import { describe, it, expect, beforeAll } from "vitest";
import { webcrypto } from "node:crypto";
import { calculateFileHash, isValidSha256Hex } from "@/lib/fileHash";

// jsdom no expone crypto.subtle ni Blob.arrayBuffer()/stream() por defecto.
// En lugar de polyfillar Blob (el polyfill de jsdom es buggy), usamos
// directamente la clase Blob de Node's buffer module en los tests.
import { Blob as NodeBlob } from "node:buffer";

beforeAll(() => {
  if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.subtle) {
    Object.defineProperty(globalThis, "crypto", {
      value: webcrypto,
      configurable: true,
      writable: true,
    });
  }
});

// Usa el Blob nativo de Node (tiene arrayBuffer() y stream() correctos)
function makeBlob(content: string, type = "text/plain"): Blob {
  return new NodeBlob([content], { type }) as unknown as Blob;
}

describe("fileHash", () => {
  describe("isValidSha256Hex", () => {
    it("acepta hash hex válido (64 chars minúsculas)", () => {
      expect(isValidSha256Hex("a".repeat(64))).toBe(true);
      expect(isValidSha256Hex("0123456789abcdef".repeat(4))).toBe(true);
    });

    it("acepta mayúsculas (case-insensitive)", () => {
      expect(isValidSha256Hex("A".repeat(64))).toBe(true);
      expect(isValidSha256Hex("0123456789ABCDEF".repeat(4))).toBe(true);
    });

    it("rechaza longitud incorrecta", () => {
      expect(isValidSha256Hex("abc")).toBe(false);
      expect(isValidSha256Hex("a".repeat(63))).toBe(false);
      expect(isValidSha256Hex("a".repeat(65))).toBe(false);
    });

    it("rechaza caracteres no-hex", () => {
      expect(isValidSha256Hex("g".repeat(64))).toBe(false);
      expect(isValidSha256Hex("z".repeat(64))).toBe(false);
    });

    it("rechaza valores no-string", () => {
      expect(isValidSha256Hex(null)).toBe(false);
      expect(isValidSha256Hex(undefined)).toBe(false);
      expect(isValidSha256Hex(123)).toBe(false);
      expect(isValidSha256Hex({})).toBe(false);
    });
  });

  describe("calculateFileHash", () => {
    it("devuelve null para blob vacío", async () => {
      const blob = makeBlob("");
      const hash = await calculateFileHash(blob);
      expect(hash).toBeNull();
    });

    it("devuelve hash hex de 64 chars para contenido válido", async () => {
      const blob = makeBlob("hello world");
      const hash = await calculateFileHash(blob);
      expect(hash).not.toBeNull();
      expect(hash!.length).toBe(64);
      expect(isValidSha256Hex(hash)).toBe(true);
    });

    it("hash de 'hello world' coincide con SHA-256 conocido", async () => {
      // SHA-256 de "hello world" = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
      const blob = makeBlob("hello world");
      const hash = await calculateFileHash(blob);
      expect(hash).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    });

    it("hash determinista: mismo contenido → mismo hash", async () => {
      const blob1 = makeBlob("VITAS test content 12345");
      const blob2 = makeBlob("VITAS test content 12345");
      const hash1 = await calculateFileHash(blob1);
      const hash2 = await calculateFileHash(blob2);
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBeNull();
    });

    it("contenido distinto → hash distinto", async () => {
      const blob1 = makeBlob("content A");
      const blob2 = makeBlob("content B");
      const hash1 = await calculateFileHash(blob1);
      const hash2 = await calculateFileHash(blob2);
      expect(hash1).not.toBe(hash2);
    });

    it("callback onProgress se llama al menos una vez", async () => {
      const blob = makeBlob("progress test");
      const calls: number[] = [];
      await calculateFileHash(blob, (pct) => calls.push(pct));
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[calls.length - 1]).toBe(100); // último siempre 100
    });

    it("no lanza nunca (best-effort)", async () => {
      // @ts-expect-error — probando input inválido
      const res = await calculateFileHash(null);
      expect(res).toBeNull();
    });

    it("no lanza con input sin size", async () => {
      // @ts-expect-error — probando fake object
      const res = await calculateFileHash({});
      expect(res).toBeNull();
    });

    it("rechaza archivos >2GB devolviendo null", async () => {
      // No podemos crear un blob real de 2GB+ en test; simulamos con objeto
      const fake = { size: 3 * 1024 * 1024 * 1024 } as Blob; // 3 GB
      const res = await calculateFileHash(fake);
      expect(res).toBeNull();
    });
  });
});
