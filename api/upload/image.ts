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

const QuerySchema = z.object({
  path: z.string().optional(), // e.g. "players/abc123/avatar.jpg"
});

const BUNNY_STORAGE_BASE = "https://storage.bunnycdn.com";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const storageZone = process.env.BUNNY_STORAGE_ZONE;
  const apiKey = process.env.BUNNY_STORAGE_API_KEY;
  const cdnUrl = process.env.BUNNY_STORAGE_CDN_URL;

  if (!storageZone || !apiKey || !cdnUrl) {
    return json(
      {
        success: false,
        error: "BUNNY_STORAGE_ZONE / BUNNY_STORAGE_API_KEY / BUNNY_STORAGE_CDN_URL no configuradas",
        phase2Pending: true,
      },
      503
    );
  }

  try {
    const url = new URL(req.url);
    const { path: filePath } = QuerySchema.parse(
      Object.fromEntries(url.searchParams)
    );

    const contentType = req.headers.get("Content-Type") ?? "image/jpeg";
    const fileBuffer = await req.arrayBuffer();

    if (fileBuffer.byteLength === 0) {
      return json({ success: false, error: "Empty file body" }, 400);
    }
    if (fileBuffer.byteLength > 10 * 1024 * 1024) {
      return json({ success: false, error: "File too large (max 10 MB)" }, 413);
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

    return json({
      success: true,
      data: {
        url: publicUrl,
        path: uploadPath,
        size: fileBuffer.byteLength,
        contentType,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ success: false, error: message }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = { runtime: "edge" };
