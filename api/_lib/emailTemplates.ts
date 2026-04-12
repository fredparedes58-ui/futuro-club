/**
 * VITAS · Branded Email Templates
 *
 * Todas las plantillas retornan HTML strings listos para enviar via Resend.
 * Texto en español. Diseño responsive con max-width 520px.
 */

const BASE_URL = "https://futuro-club.vercel.app";

// ─── Base Layout ───────────────────────────────────────────────────────────────

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VITAS</title>
</head>
<body style="margin:0;padding:0;background:#0f0f14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f14;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#1a1a24;border-radius:16px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#818cf8);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;font-size:28px;font-weight:900;color:#ffffff;letter-spacing:3px;">VITAS</h1>
              <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.7);letter-spacing:2px;text-transform:uppercase;">Football Intelligence</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;color:rgba(255,255,255,0.3);">&copy; 2026 VITAS &middot; Football Intelligence</p>
              <p style="margin:0;font-size:11px;">
                <a href="${BASE_URL}/settings" style="color:rgba(255,255,255,0.25);text-decoration:underline;">Administrar preferencias de correo</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── CTA Button ────────────────────────────────────────────────────────────────

function ctaButton(text: string, href: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
  <tr>
    <td align="center">
      <a href="${href}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#6366f1,#818cf8);color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:1px;">
        ${text}
      </a>
    </td>
  </tr>
</table>`;
}

// ─── Templates ─────────────────────────────────────────────────────────────────

/**
 * Email de bienvenida tras registro.
 */
export function welcomeEmail(name: string): string {
  const greeting = name ? name : "futuro crack";
  return layout(`
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#ffffff;">&iexcl;Bienvenido a VITAS!</h2>
    <p style="margin:0 0 12px;font-size:14px;color:rgba(255,255,255,0.65);line-height:1.7;">
      Hola <strong style="color:#ffffff;">${greeting}</strong>, tu cuenta ha sido creada con &eacute;xito.
    </p>
    <p style="margin:0 0 12px;font-size:14px;color:rgba(255,255,255,0.65);line-height:1.7;">
      VITAS es tu plataforma de inteligencia futbol&iacute;stica: an&aacute;lisis de rendimiento,
      scouting avanzado, seguimiento de talento y mucho m&aacute;s.
    </p>
    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.65);line-height:1.7;">
      Explora el dashboard y descubre todo lo que puedes hacer.
    </p>
    ${ctaButton("Explorar VITAS", `${BASE_URL}/pulse`)}
  `);
}

/**
 * Confirmación de pago exitoso.
 */
export function paymentConfirmEmail(planName: string, amount: string): string {
  return layout(`
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#ffffff;">Pago confirmado</h2>
    <p style="margin:0 0 12px;font-size:14px;color:rgba(255,255,255,0.65);line-height:1.7;">
      Tu pago ha sido procesado correctamente. Aqu&iacute; tienes el resumen:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:rgba(255,255,255,0.04);border-radius:10px;overflow:hidden;">
      <tr>
        <td style="padding:14px 18px;font-size:13px;color:rgba(255,255,255,0.5);">Plan</td>
        <td style="padding:14px 18px;font-size:14px;color:#ffffff;font-weight:700;text-align:right;">${planName}</td>
      </tr>
      <tr>
        <td style="padding:14px 18px;font-size:13px;color:rgba(255,255,255,0.5);border-top:1px solid rgba(255,255,255,0.06);">Monto</td>
        <td style="padding:14px 18px;font-size:14px;color:#818cf8;font-weight:700;text-align:right;border-top:1px solid rgba(255,255,255,0.06);">${amount}</td>
      </tr>
    </table>
    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.65);line-height:1.7;">
      Ya puedes disfrutar de todas las funcionalidades de tu plan.
    </p>
    ${ctaButton("Ver mi plan", `${BASE_URL}/billing`)}
  `);
}

/**
 * Notificación de suscripción cancelada.
 */
export function planCancelledEmail(planName: string): string {
  return layout(`
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#ffffff;">Suscripci&oacute;n cancelada</h2>
    <p style="margin:0 0 12px;font-size:14px;color:rgba(255,255,255,0.65);line-height:1.7;">
      Tu suscripci&oacute;n al plan <strong style="color:#ffffff;">${planName}</strong> ha sido cancelada.
    </p>
    <p style="margin:0 0 12px;font-size:14px;color:rgba(255,255,255,0.65);line-height:1.7;">
      Tu cuenta seguir&aacute; activa con el plan <strong style="color:#818cf8;">Free</strong>,
      que incluye acceso b&aacute;sico a las funcionalidades de VITAS.
    </p>
    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.65);line-height:1.7;">
      Si cambias de opini&oacute;n, puedes reactivar tu plan en cualquier momento.
    </p>
    ${ctaButton("Reactivar plan", `${BASE_URL}/billing`)}
  `);
}

/**
 * Confirmación de eliminación de cuenta.
 */
export function accountDeletedEmail(): string {
  return layout(`
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#ffffff;">Cuenta eliminada</h2>
    <p style="margin:0 0 12px;font-size:14px;color:rgba(255,255,255,0.65);line-height:1.7;">
      Tu cuenta y todos los datos asociados han sido eliminados permanentemente de VITAS.
    </p>
    <p style="margin:0 0 12px;font-size:14px;color:rgba(255,255,255,0.65);line-height:1.7;">
      Este proceso es irreversible. Si necesitas algo, no dudes en contactarnos.
    </p>
    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.5);line-height:1.7;font-style:italic;">
      Te extra&ntilde;aremos. Gracias por haber sido parte de VITAS.
    </p>
  `);
}
