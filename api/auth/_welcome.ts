/**
 * POST /api/auth/welcome
 * Envía email de bienvenida a un nuevo usuario.
 *
 * Endpoint protegido con serviceOnly (llamado por Supabase webhook on user.created
 * o manualmente con CRON_SECRET / ADMIN_SECRET).
 *
 * Body: { email: string, name?: string }
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { sendEmail } from "../_lib/email";
import { welcomeEmail } from "../_lib/emailTemplates";

const schema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export default withHandler(
  { schema, serviceOnly: true },
  async ({ body }) => {
    const { email, name } = body;

    const sent = await sendEmail({
      to: email,
      subject: "¡Bienvenido a VITAS!",
      html: welcomeEmail(name ?? ""),
    });

    if (!sent) {
      return errorResponse("No se pudo enviar el email de bienvenida", 500);
    }

    return successResponse({ sent: true });
  },
);
