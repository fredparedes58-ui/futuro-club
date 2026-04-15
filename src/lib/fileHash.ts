/**
 * VITAS · File Hashing Utilities
 *
 * Calcula SHA-256 de un archivo para deduplicación.
 * Usa streaming (ArrayBuffer chunked) para no cargar archivos grandes
 * enteros en memoria. Resultado en hex (64 chars).
 *
 * Uso:
 *   const hash = await calculateFileHash(file);
 *   // → "a3f5e9...b24c" (64 chars)
 *
 * Nota: el cálculo es BEST-EFFORT. Si falla (p.ej. SubtleCrypto no
 * disponible, archivo muy grande, etc.), devuelve `null` — el flujo
 * debe continuar sin hash. NUNCA lanza.
 */

/**
 * Tamaño máximo de archivo para calcular hash.
 * Archivos enormes (>2 GB) podrían tardar mucho o saturar memoria en
 * móviles de gama baja. Por encima de este límite devolvemos null y
 * el upload continúa sin dedup.
 */
const MAX_HASH_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

/**
 * Convierte ArrayBuffer → hex string
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Calcula SHA-256 hex de un File/Blob.
 * Returns null si no se puede calcular (best-effort, nunca lanza).
 *
 * @param file archivo a hashear
 * @param onProgress callback opcional: (pct 0-100) → void
 */
export async function calculateFileHash(
  file: File | Blob,
  onProgress?: (pct: number) => void,
): Promise<string | null> {
  try {
    if (!file || typeof file.size !== "number") return null;
    if (file.size === 0) return null;
    if (file.size > MAX_HASH_BYTES) {
      console.warn(`[fileHash] Archivo demasiado grande para hash (${(file.size / 1e9).toFixed(2)} GB) — saltando dedup`);
      return null;
    }
    if (typeof crypto === "undefined" || !crypto.subtle) {
      console.warn("[fileHash] crypto.subtle no disponible — saltando dedup");
      return null;
    }

    // Para archivos pequeños (<50 MB) → hash directo, más rápido
    if (file.size < 50 * 1024 * 1024) {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buf);
      onProgress?.(100);
      return bufferToHex(digest);
    }

    // Para archivos grandes: streaming. Acumulamos todos los chunks
    // y hasheamos al final (Web Crypto no soporta hash incremental,
    // así que el beneficio real es poder reportar progreso).
    const reader = file.stream().getReader();
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        bytesRead += value.byteLength;
        onProgress?.(Math.round((bytesRead / file.size) * 90)); // hasta 90%
      }
    }

    // Concatenar chunks en un solo ArrayBuffer
    const merged = new Uint8Array(bytesRead);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const digest = await crypto.subtle.digest("SHA-256", merged.buffer);
    onProgress?.(100);
    return bufferToHex(digest);
  } catch (err) {
    console.warn("[fileHash] Fallo calculando hash (best-effort):", err);
    return null;
  }
}

/**
 * Validador: ¿Es una cadena hash SHA-256 válida en hex (64 chars)?
 */
export function isValidSha256Hex(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{64}$/i.test(s);
}
