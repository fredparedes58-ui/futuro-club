/**
 * VITAS · Lead-gate del demo — /api/demo/decide?id=<id>&action=<a>&sig=<hmac>
 *
 * Lo abre el OPERADOR desde su email. `action` ∈ approve | reject | revoke. `sig` es
 * la firma HMAC de (id:action) con DEMO_APPROVE_SECRET → solo quien recibió el email
 * (con enlaces firmados) puede decidir.
 *
 * SEGURIDAD (CWE-650): GET es SOLO LECTURA — muestra una página de confirmación con un
 * botón que hace POST. La mutación (setStatus) ocurre ÚNICAMENTE en POST. Así los
 * escáneres/prefetchers de correo (Safe Links, Mimecast…) que hacen GET a los enlaces
 * NO pueden aprobar/rechazar/revocar por accidente; hace falta un clic humano.
 * Fail-closed: sin secreto o firma inválida, no hace nada.
 */

import { verifyDecision, setStatus, getById, signDecision, esc, type DemoStatus } from "../_lib/demoAccess";
import { sendEmail } from "../_lib/email";

export const config = { runtime: "edge" };

const ACTIONS: Record<string, DemoStatus> = { approve: "approved", reject: "rejected", revoke: "revoked" };
const VERB: Record<string, string> = { approve: "APROBAR", reject: "RECHAZAR", revoke: "REVOCAR" };
const ACCENT: Record<string, string> = { approve: "#12B886", reject: "#E5484D", revoke: "#6c7794" };

function shell(title: string, inner: string, accent = "#0059B3"): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · VITAS</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f8ff;color:#0b1226;
    display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
  .card{max-width:460px;width:100%;background:#fff;border:1px solid #dbe6ff;border-radius:18px;padding:28px 26px;
    box-shadow:0 10px 40px rgba(0,89,179,.08);text-align:center}
  .kick{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${accent}}
  h1{font-size:1.35rem;margin:8px 0 4px}
  p{color:#37425f;line-height:1.5;margin:8px 0}
  .who{background:#f4f8ff;border-radius:10px;padding:10px 12px;margin:14px 0;font-size:.9rem}
  button.go,a.btn{display:inline-block;margin-top:12px;padding:11px 20px;border:0;border-radius:10px;color:#fff;
    text-decoration:none;font-weight:700;font-size:.9rem;cursor:pointer}
  .mut{color:#6c7794;font-size:12px;margin-top:16px}
</style></head><body><div class="card">
  <div class="kick">VITAS · Acceso al demo</div>${inner}
</div></body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const action = url.searchParams.get("action") ?? "";
  const sig = url.searchParams.get("sig") ?? "";

  const target = ACTIONS[action];
  if (!id || !target) return shell("Enlace inválido", "<h1>Enlace inválido</h1><p>La acción no es válida.</p>", "#E5484D");

  const valid = await verifyDecision(id, action, sig);
  if (!valid) {
    return shell("No autorizado", "<h1>No autorizado</h1><p>El enlace no es válido o falta configurar la firma en el servidor.</p>", "#E5484D");
  }

  const row = await getById(id);
  if (!row) return shell("No encontrada", "<h1>Solicitud no encontrada</h1><p>Puede que se haya eliminado.</p>", "#E5484D");

  const who = `<div class="who"><b>${esc(row.name)}</b>${row.club ? " · " + esc(row.club) : ""}<br><span style="color:#6c7794">${esc(row.email)}</span></div>`;

  // GET → SOLO LECTURA: página de confirmación con un botón que hace POST.
  if (req.method !== "POST") {
    const postUrl = `/api/demo/decide?id=${encodeURIComponent(id)}&action=${encodeURIComponent(action)}&sig=${encodeURIComponent(sig)}`;
    const form = `<form method="POST" action="${postUrl}" style="margin:0">
      <button class="go" type="submit" style="background:${ACCENT[action]}">Confirmar: ${VERB[action]}</button>
    </form>`;
    return shell(
      `Confirmar ${VERB[action]}`,
      `<h1>¿${VERB[action]} el acceso?</h1>${who}<p>Pulsa el botón para confirmar. (Este paso evita que los escáneres de correo decidan por ti.)</p>${form}<p class="mut">Estado actual: ${esc(row.status)}</p>`,
      ACCENT[action],
    );
  }

  // POST → aplica la decisión.
  const ok = await setStatus(id, target);
  if (!ok) return shell("Error", "<h1>No se pudo aplicar</h1><p>Inténtalo de nuevo en un momento.</p>", "#E5484D");

  if (target === "approved") {
    // Email al SOLICITANTE con enlace mágico (entra desde cualquier dispositivo). Solo en una
    // aprobación NUEVA (evita duplicados si el operador re-aprueba) y si hay token. En inglés
    // por defecto: no conocemos el idioma del solicitante.
    if (row.status !== "approved" && row.access_token) {
      const appBase = process.env.DEMO_APP_BASE ?? "https://vitas-demo.krujens.eu";
      const magic = `${appBase}/?demo_token=${encodeURIComponent(row.access_token)}`;
      const clientHtml = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0b1226">
        <div style="font-size:12px;font-weight:700;letter-spacing:.12em;color:#0059B3;text-transform:uppercase">VITAS · Football Intelligence</div>
        <h2 style="margin:8px 0 6px;font-size:20px">&#10003; Your demo access is ready</h2>
        <p style="margin:8px 0;color:#37425f;line-height:1.5">Hi ${esc(row.name)}, your access to the VITAS demo has been approved. Click below to start exploring &mdash; the link works on any device.</p>
        <div style="margin:18px 0"><a href="${magic}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#0059B3;color:#fff;text-decoration:none;font-weight:700;font-family:system-ui,sans-serif">Open the VITAS demo &rarr;</a></div>
        <p style="margin:8px 0;color:#6c7794;font-size:12px">Or paste this link into your browser:<br><span style="color:#0059B3;word-break:break-all">${esc(magic)}</span></p>
        <p style="margin:16px 0 0;color:#6c7794;font-size:12px">Access is personal and can be revoked at any time.</p>
      </div>`;
      await sendEmail({ to: row.email, subject: "Your VITAS demo access is ready", html: clientHtml });
    }
    const revokeUrl = `${url.origin}/api/demo/decide?id=${encodeURIComponent(id)}&action=revoke&sig=${await signDecision(id, "revoke")}`;
    return shell("Acceso aprobado", `<h1>✓ Acceso aprobado</h1>${who}<p>El solicitante entrará al demo en cuanto su navegador actualice el estado.</p><a class="btn" style="background:#6c7794" href="${revokeUrl}">Revocar acceso</a><p class="mut">Guarda este correo: puedes revocar el acceso cuando quieras.</p>`, "#12B886");
  }
  if (target === "revoked") {
    return shell("Acceso revocado", `<h1>Acceso revocado</h1>${who}<p>El demo dejará de mostrarse a esta persona en su próxima carga.</p>`, "#6c7794");
  }
  return shell("Solicitud rechazada", `<h1>Solicitud rechazada</h1>${who}<p>No se ha concedido acceso.</p>`, "#E5484D");
}
