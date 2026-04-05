/**
 * VITAS Phase 2 — List Videos from Bunny Stream
 * GET /api/videos/list?page=1&perPage=20&playerId=xxx
 *
 * Env vars: BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY, BUNNY_CDN_HOSTNAME
 */

import { z } from "zod";

const QuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  playerId: z.string().optional(),
  search: z.string().optional(),
});

const BUNNY_BASE = "https://video.bunnycdn.com/library";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  const cdnHostname = process.env.BUNNY_CDN_HOSTNAME;

  if (!libraryId || !apiKey) {
    return json(
      {
        success: false,
        error: "BUNNY_STREAM_LIBRARY_ID / BUNNY_STREAM_API_KEY no configuradas",
        phase2Pending: true,
        data: { items: [], totalItems: 0, currentPage: 1, totalPages: 0 },
      },
      200 // Return 200 so UI can render empty state gracefully
    );
  }

  try {
    const url = new URL(req.url);
    const params = QuerySchema.parse(Object.fromEntries(url.searchParams));

    const qs = new URLSearchParams({
      page: String(params.page),
      itemsPerPage: String(params.perPage),
      orderBy: "date",
    });
    if (params.search) qs.set("search", params.search);

    const listRes = await fetch(`${BUNNY_BASE}/${libraryId}/videos?${qs}`, {
      headers: { AccessKey: apiKey },
    });

    if (!listRes.ok) {
      throw new Error(`Bunny list failed (${listRes.status})`);
    }

    const raw = (await listRes.json()) as {
      totalItems: number;
      currentPage: number;
      itemsPerPage: number;
      items: Array<{
        guid: string;
        title: string;
        status: number;
        length: number;
        views: number;
        encodeProgress: number;
        storageSize: number;
        framesPerSecond: number;
        width: number;
        height: number;
        dateUploaded: string;
        thumbnailFileName: string;
      }>;
    };

    // Map to VITAS video format
    const cdn = cdnHostname ?? "";
    const items = raw.items.map((v) => ({
      id: v.guid,
      title: v.title,
      status: mapBunnyStatus(v.status),
      statusCode: v.status,
      duration: v.length,
      views: v.views,
      encodeProgress: v.encodeProgress,
      storageSize: v.storageSize,
      fps: v.framesPerSecond,
      width: v.width,
      height: v.height,
      dateUploaded: v.dateUploaded,
      thumbnailUrl: cdn
        ? `https://${cdn}/${v.guid}/${v.thumbnailFileName}`
        : null,
      streamUrl: cdn ? `https://${cdn}/${v.guid}/playlist.m3u8` : null,
      embedUrl: `https://iframe.mediadelivery.net/embed/${libraryId}/${v.guid}`,
    }));

    // Filter by playerId — check multiple conventions:
    // 1. "[playerId] title" prefix format
    // 2. playerId appears anywhere in title (case-insensitive)
    // 3. Exact match on title segment after splitting by common delimiters
    const filtered = params.playerId
      ? items.filter((v) => {
          const pid = params.playerId!;
          const title = v.title ?? "";
          return (
            title.startsWith(`[${pid}]`) ||
            title.toLowerCase().includes(pid.toLowerCase()) ||
            title.split(/[\s_\-|]+/).includes(pid)
          );
        })
      : items;

    return json({
      success: true,
      data: {
        items: filtered,
        totalItems: params.playerId ? filtered.length : raw.totalItems,
        currentPage: raw.currentPage,
        totalPages: Math.ceil(raw.totalItems / params.perPage),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ success: false, error: message }, 500);
  }
}

function mapBunnyStatus(code: number): string {
  switch (code) {
    case 0: return "created";
    case 1: return "uploaded";
    case 2: return "processing";
    case 3: return "transcoding";
    case 4: return "finished";
    case 5: return "error";
    case 6: return "upload-failed";
    default: return "unknown";
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = { runtime: "edge" };
