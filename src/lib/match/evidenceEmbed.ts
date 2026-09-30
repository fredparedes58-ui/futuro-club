/**
 * VITAS · Evidence chip → Bunny embed at a video time.
 *
 * The server hands the UI `playback.embedUrl` (Bunny embed base URL, signed with
 * `token` + `expires` when the library has embed token auth). The UI only appends
 * the start time with Bunny's documented `t` parameter ("Sets the start time.
 * Accepts … a plain number of seconds", https://bunny.net/docs/stream/embedding);
 * `t` is not part of the token, so appending it keeps the signature valid.
 *
 * Defence in depth: only an https Bunny embed host is ever put in an <iframe>
 * (both are allowed by the CSP frame-src in vercel.json). Anything else ⇒ null,
 * and the chip renders as "vídeo no disponible" instead of framing an arbitrary URL.
 */

/** Current player host and the deprecated-but-working iframe host (https://bunny.net/docs/stream/player). */
export const BUNNY_EMBED_HOSTS: readonly string[] = ["player.mediadelivery.net", "iframe.mediadelivery.net"];

/** Name of Bunny's start-time query parameter. */
export const BUNNY_START_TIME_PARAM = "t";

export function buildEvidenceEmbedUrl(embedUrl: string | null | undefined, seconds: number): string | null {
  if (!embedUrl || !Number.isFinite(seconds) || seconds < 0) return null;
  let url: URL;
  try {
    url = new URL(embedUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !BUNNY_EMBED_HOSTS.includes(url.hostname) || !url.pathname.startsWith("/embed/")) {
    return null;
  }
  url.searchParams.set(BUNNY_START_TIME_PARAM, String(Math.floor(seconds)));
  return url.toString();
}
