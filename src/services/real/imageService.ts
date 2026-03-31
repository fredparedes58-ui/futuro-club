/**
 * VITAS Phase 2 — Image Upload Service
 * DETERMINISTA — no IA.
 *
 * Uploads images to Bunny Storage via /api/upload/image.
 * Used for player avatars, team logos, etc.
 */

export interface ImageUploadResult {
  url: string;
  path: string;
  size: number;
  contentType: string;
}

export const ImageService = {
  /**
   * Upload a File/Blob to Bunny Storage.
   * @param file   - the image file
   * @param path   - storage path (e.g. "players/abc123/avatar.jpg")
   * @returns public CDN URL
   */
  async upload(
    file: File | Blob,
    path?: string
  ): Promise<{ success: true; data: ImageUploadResult } | { success: false; error: string; phase2Pending?: boolean }> {
    try {
      const qs = path ? `?path=${encodeURIComponent(path)}` : "";
      const res = await fetch(`/api/upload/image${qs}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });

      const data = await res.json() as {
        success: boolean;
        data?: ImageUploadResult;
        error?: string;
        phase2Pending?: boolean;
      };

      if (!data.success) {
        return {
          success: false,
          error: data.error ?? "Upload failed",
          phase2Pending: data.phase2Pending,
        };
      }

      return { success: true, data: data.data! };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  },

  /**
   * Upload a player avatar.
   * Path convention: players/{playerId}/avatar.{ext}
   */
  async uploadPlayerAvatar(
    playerId: string,
    file: File
  ): Promise<{ success: true; url: string } | { success: false; error: string }> {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `players/${playerId}/avatar.${ext}`;
    const result = await this.upload(file, path);
    if (!result.success) return result;
    return { success: true, url: result.data.url };
  },

  /**
   * Validate image before upload.
   */
  validate(file: File): { valid: true } | { valid: false; error: string } {
    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

    if (!ALLOWED.includes(file.type)) {
      return { valid: false, error: `Tipo no permitido: ${file.type}. Usa JPG, PNG, WebP o GIF.` };
    }
    if (file.size > MAX_SIZE) {
      return { valid: false, error: `Archivo muy grande (max 10 MB). Tamaño actual: ${(file.size / 1024 / 1024).toFixed(1)} MB.` };
    }
    return { valid: true };
  },

  /**
   * Create a local preview URL (blob URL) for instant preview before upload.
   */
  createPreview(file: File): string {
    return URL.createObjectURL(file);
  },

  revokePreview(url: string): void {
    URL.revokeObjectURL(url);
  },
};
