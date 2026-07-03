/**
 * VITAS · Helpers de compartir viral (Sprint 4.7)
 *
 * Loop de adquisición orgánica: el usuario exporta/compartе una card →
 * la manda por WhatsApp con un enlace de registro con ?ref → el receptor
 * aterriza en la landing y se registra. El enlace lleva UTM para atribución.
 */

export const SHARE_BASE_URL = "https://futuro-club.vercel.app";

/** Construye la URL de aterrizaje con atribución (ref + UTM). */
export function buildShareUrl(ref: string): string {
  const params = new URLSearchParams({
    ref,
    utm_source: "card",
    utm_medium: "share",
    utm_campaign: ref,
  });
  return `${SHARE_BASE_URL}/?${params.toString()}`;
}

/** Abre WhatsApp (app o web) con el texto + enlace de registro prellenados. */
export function shareToWhatsApp(text: string, ref: string): void {
  const url = `https://wa.me/?text=${encodeURIComponent(`${text}\n\n${buildShareUrl(ref)}`)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Compartir nativo (móvil) con fallback a copiar al portapapeles. */
export async function shareNative(opts: { title?: string; text: string; ref: string }): Promise<"shared" | "copied" | "failed"> {
  const url = buildShareUrl(opts.ref);
  const full = `${opts.text}\n${url}`;
  const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> };
  if (typeof nav.share === "function") {
    try {
      await nav.share({ title: opts.title, text: opts.text, url });
      return "shared";
    } catch {
      /* usuario canceló o falló → intenta copiar */
    }
  }
  try {
    await navigator.clipboard.writeText(full);
    return "copied";
  } catch {
    return "failed";
  }
}
