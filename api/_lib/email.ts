/**
 * VITAS · Shared Email Sending via Resend
 *
 * Envía correos transaccionales usando la API de Resend.
 * Nunca lanza excepciones — retorna true/false para no bloquear flujos principales.
 *
 * Uso:
 *   import { sendEmail } from "../_lib/email";
 *   await sendEmail({ to: "user@example.com", subject: "Hola", html: "<p>Hola</p>" });
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "VITAS <noreply@vitas.app>";

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not configured — skipping email");
    return false;
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend API error ${res.status}: ${body}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[email] Failed to send email:", err instanceof Error ? err.message : err);
    return false;
  }
}
