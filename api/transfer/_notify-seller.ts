/**
 * VITAS · POST /api/transfer/notify-seller
 *
 * Fire-and-forget notification al vendedor cuando hay una nueva inquiry.
 * Llamado internamente desde create-inquiry.
 *
 * Hoy: log + push notification (cuando esté configurada).
 * Futuro: también email via Resend cuando esté activo.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const NotifyInputSchema = z.object({
  listingId: z.string().uuid(),
  inquiryId: z.string().uuid(),
});

export default withHandler(
  { method: "POST", schema: NotifyInputSchema, requireAuth: false, maxRequests: 200 },
  async ({ body }) => {
    const { listingId, inquiryId } = body as z.infer<typeof NotifyInputSchema>;
    // Stub: log only for now. Push notification wired client-side via
    // wellbeingAlertService pattern in a future iteration.
    console.log(
      `[notify-seller] Listing ${listingId} received new inquiry ${inquiryId}`,
    );
    return successResponse({ notified: false, reason: "Push notification stub" });
  },
);
