/**
 * VITAS · /api/videos/_bunny-status
 *
 * Polls the encoding status of a video on Bunny Stream. Use this after the
 * TUS upload completes to wait for Bunny to finish transcoding before
 * playing back or sending to Modal.
 *
 * Returns one of:
 *   - "uploading"     (status 0)
 *   - "processing"    (status 1, 2, 3)
 *   - "finished"      (status 4)  ← ready to play / analyze
 *   - "failed"        (status 5)
 *   - "unknown"
 */

export const config = {
  runtime: "edge",
};

const STATUS_MAP: Record<number, string> = {
  0: "uploading",
  1: "processing",
  2: "processing",
  3: "processing",
  4: "finished",
  5: "failed",
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const url = new URL(request.url);
  const bunnyVideoId = url.searchParams.get("bunnyVideoId");
  if (!bunnyVideoId) {
    return json({ error: "missing_bunnyVideoId" }, 400);
  }

  const libraryIdStr = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  if (!libraryIdStr || !apiKey) {
    return json({ error: "bunny_not_configured" }, 503);
  }

  let resp: Response;
  try {
    resp = await fetch(
      `https://video.bunnycdn.com/library/${libraryIdStr}/videos/${bunnyVideoId}`,
      { headers: { AccessKey: apiKey, Accept: "application/json" } },
    );
  } catch (err) {
    return json({ error: "bunny_unreachable", detail: (err as Error).message }, 502);
  }

  if (!resp.ok) {
    return json({ error: "bunny_error", status: resp.status }, resp.status);
  }

  const data = (await resp.json()) as {
    guid: string;
    status: number;
    length?: number;
    width?: number;
    height?: number;
    encodeProgress?: number;
  };

  return json({
    bunnyVideoId: data.guid,
    statusCode: data.status,
    status: STATUS_MAP[data.status] ?? "unknown",
    encodeProgress: data.encodeProgress ?? 0,
    duration: data.length ?? 0,
    width: data.width ?? 0,
    height: data.height ?? 0,
  });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
