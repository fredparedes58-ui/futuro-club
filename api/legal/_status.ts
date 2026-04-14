/**
 * VITAS · GET /api/legal/status
 * Devuelve el estado de aceptación de documentos legales del usuario.
 * Compara con las versiones vigentes para detectar si necesita re-aceptar.
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

/** Current document versions — update when legal docs change. */
const CURRENT_VERSIONS: Record<string, string> = {
  terms: "2026-04-12",
  privacy: "2026-04-12",
};

export default withHandler(
  { method: ["GET", "POST"], requireAuth: true, maxRequests: 60 },
  async ({ userId }) => {
    const sbUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!sbUrl || !sbKey) {
      // No Supabase → assume accepted (dev mode)
      return successResponse({
        termsAccepted: true,
        privacyAccepted: true,
        currentVersions: CURRENT_VERSIONS,
        acceptances: [],
      });
    }

    const headers = {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
    };

    try {
      // Get all non-revoked acceptances for user, ordered by most recent
      const res = await fetch(
        `${sbUrl}/rest/v1/legal_acceptances?user_id=eq.${userId}&revoked_at=is.null&order=accepted_at.desc`,
        { headers },
      );

      if (!res.ok) {
        console.warn("[legal/status] Supabase error:", res.status);
        // Graceful fallback — don't block the user
        return successResponse({
          termsAccepted: true,
          privacyAccepted: true,
          currentVersions: CURRENT_VERSIONS,
          acceptances: [],
          _fallback: true,
        });
      }

      const rows = await res.json() as Array<{
        document: string;
        version: string;
        accepted_at: string;
      }>;

      // Find latest acceptance for each document
      const latest: Record<string, { version: string; acceptedAt: string }> = {};
      for (const row of rows) {
        if (!latest[row.document]) {
          latest[row.document] = { version: row.version, acceptedAt: row.accepted_at };
        }
      }

      const termsAccepted = latest.terms?.version === CURRENT_VERSIONS.terms;
      const privacyAccepted = latest.privacy?.version === CURRENT_VERSIONS.privacy;

      return successResponse({
        termsAccepted,
        privacyAccepted,
        needsAcceptance: !termsAccepted || !privacyAccepted,
        currentVersions: CURRENT_VERSIONS,
        acceptances: Object.entries(latest).map(([doc, info]) => ({
          document: doc,
          version: info.version,
          acceptedAt: info.acceptedAt,
          isCurrent: info.version === CURRENT_VERSIONS[doc],
        })),
      });
    } catch (err) {
      console.error("[legal/status] Error:", err);
      // Don't block user on error
      return successResponse({
        termsAccepted: true,
        privacyAccepted: true,
        currentVersions: CURRENT_VERSIONS,
        acceptances: [],
        _fallback: true,
      });
    }
  },
);
