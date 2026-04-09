/**
 * VITAS Phase 2 — Bunny Storage Image Upload
 * POST /api/upload/image
 *
 * Accepts multipart/form-data with field "file" (image).
 * Proxies to Bunny Storage and returns the public CDN URL.
 *
 * Env vars needed:
 *   BUNNY_STORAGE_ZONE        — storage zone name (e.g. "vitas-images")
 *   BUNNY_STORAGE_API_KEY     — storage zone API key
 *   BUNNY_STORAGE_CDN_URL     — CDN pull zone URL (e.g. "https://vitas-images.b-cdn.net")
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

const QuerySchema = z.object({
  path: z.string().optional(), // e.g. "players/abc123/avatar.jpg"
});

const BUNNY_STORAGE_BASE = "https://storage.bunnycdn.com";

export default withHandler(
  { method: "POST", requireAuth: true, maxRequests: 30, rawBody: true },
  async ({ req }) => {
    const storageZone = process.env.BUNNY_STORAGE_ZONE;
    const apiKey = process.env.BUNNY_STORAGE_API_KEY;
    const cdnUrl = process.env.BUNNY_STORAGE_CDN_URL;

    if (!storageZone || !apiKey || !cdnUrl) {
      return errorResponse(
        "BUNNY_STORAGE_ZONE / BUNNY_STORAGE_API_KEY / BUNNY_STORAGE_CDN_URL no configuradas",
        503,
        "CONFIG_MISSING",
      );
    }

    const url = new URL(req.url);
    const { path: filePath } = QuerySchema.parse(
      Object.fromEntries(url.searchParams),
    );

    const contentType = req.headers.get("Content-Type") ?? "image/jpeg";
    const fileBuffer = await req.arrayBuffer();

    if (fileBuffer.byteLength === 0) {
      return errorResponse("Empty file body", 400);
    }
    if (fileBuffer.byteLength > 10 * 1024 * 1024) {
      return errorResponse("File too large (max 10 MB)", 413);
    }

    // Build storage path: storageZone/path or storageZone/{timestamp}.jpg
    const uploadPath =
      filePath ?? `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    const uploadUrl = `${BUNNY_STORAGE_BASE}/${storageZone}/${uploadPath}`;

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        AccessKey: apiKey,
        "Content-Type": contentType,
      },
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Bunny Storage upload failed (${uploadRes.status}): ${errText}`);
    }

    const publicUrl = `${cdnUrl}/${uploadPath}`;

    return successResponse({
      url: publicUrl,
      path: uploadPath,
      size: fileBuffer.byteLength,
      contentType,
    });
  },
);

export const config = { runtime: "edge" };
