/**
 * VITAS · Player CRUD Endpoint
 * GET    /api/players/crud          — list all players for the user
 * GET    /api/players/crud?id=X     — get single player
 * POST   /api/players/crud          — create player
 * PATCH  /api/players/crud          — update player (metrics, PHV, etc.)
 * DELETE /api/players/crud          — delete player
 */
import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

// ── Schemas ─────────────────────────────────────────────────────────────────

const MetricsSchema = z.object({
  speed: z.number().min(0).max(100),
  technique: z.number().min(0).max(100),
  vision: z.number().min(0).max(100),
  stamina: z.number().min(0).max(100),
  shooting: z.number().min(0).max(100),
  defending: z.number().min(0).max(100),
});

const CreatePlayerSchema = z.object({
  id: z.string().optional(), // client can provide or server generates
  name: z.string().min(2).max(80),
  age: z.number().min(8).max(21),
  position: z.enum([
    "GK", "CB", "RB", "LB", "RCB", "LCB", "RWB", "LWB",
    "CDM", "CM", "CAM", "DM", "LCM", "RCM", "RM", "LM",
    "RW", "LW", "ST", "CF",
    "Portero", "Defensa Central", "Lateral Derecho", "Lateral Izquierdo",
    "Pivote", "Mediocentro", "Mediapunta", "Extremo Derecho",
    "Extremo Izquierdo", "Delantero Centro", "Segundo Delantero",
  ]),
  foot: z.enum(["right", "left", "both"]),
  height: z.number().min(100).max(220),
  weight: z.number().min(20).max(120),
  sittingHeight: z.number().min(30).max(130).optional(),
  legLength: z.number().min(30).max(130).optional(),
  competitiveLevel: z.string().default("Regional"),
  minutesPlayed: z.number().default(0),
  metrics: MetricsSchema,
  gender: z.enum(["M", "F"]).default("M"),
  phvCategory: z.enum(["early", "ontme", "late"]).optional(),
  phvOffset: z.number().optional(),
});

const UpdatePlayerSchema = z.object({
  id: z.string(),
  metrics: MetricsSchema.optional(),
  phvCategory: z.enum(["early", "ontme", "late"]).optional(),
  phvOffset: z.number().optional(),
  name: z.string().min(2).max(80).optional(),
  age: z.number().min(8).max(21).optional(),
  position: z.enum([
    "GK", "CB", "RB", "LB", "RCB", "LCB", "RWB", "LWB",
    "CDM", "CM", "CAM", "DM", "LCM", "RCM", "RM", "LM",
    "RW", "LW", "ST", "CF",
    "Portero", "Defensa Central", "Lateral Derecho", "Lateral Izquierdo",
    "Pivote", "Mediocentro", "Mediapunta", "Extremo Derecho",
    "Extremo Izquierdo", "Delantero Centro", "Segundo Delantero",
  ]).optional(),
  foot: z.enum(["right", "left", "both"]).optional(),
  height: z.number().min(100).max(220).optional(),
  weight: z.number().min(20).max(120).optional(),
  sittingHeight: z.number().min(30).max(130).optional(),
  legLength: z.number().min(30).max(130).optional(),
  competitiveLevel: z.string().optional(),
  minutesPlayed: z.number().optional(),
});

const DeletePlayerSchema = z.object({
  id: z.string(),
});

// ── VSI Weights (same as MetricsService) ─────────────────────────────────

const VSI_WEIGHTS: Record<string, number> = {
  speed: 0.18,
  technique: 0.22,
  vision: 0.20,
  stamina: 0.15,
  shooting: 0.13,
  defending: 0.12,
};

function calculateVSI(metrics: z.infer<typeof MetricsSchema>): number {
  const raw = Object.entries(VSI_WEIGHTS).reduce((acc, [key, weight]) => {
    return acc + (metrics[key as keyof typeof metrics] ?? 0) * weight;
  }, 0);
  return Math.round(raw * 10) / 10;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default withHandler(
  { method: ["GET", "POST", "PATCH", "DELETE"], requireAuth: true, maxRequests: 60 },
  async ({ req, body, userId }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 503, "CONFIG_ERROR");
    }

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    };

    // ── GET: List or single player ──────────────────────────────────────────
    if (req.method === "GET") {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      const sortBy = url.searchParams.get("sort") ?? "updated_at";
      const sortDir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 200);
      const offset = parseInt(url.searchParams.get("offset") ?? "0");

      let queryUrl = `${supabaseUrl}/rest/v1/players?user_id=eq.${userId}`;
      if (id) queryUrl += `&id=eq.${id}`;

      // Sort: data->>'name' for name, data->'vsi' for vsi, updated_at for default
      const sortMap: Record<string, string> = {
        name: "data->>name",
        vsi: "data->>vsi",
        age: "data->>age",
        updated_at: "updated_at",
      };
      const sortCol = sortMap[sortBy] ?? "updated_at";
      queryUrl += `&order=${sortCol}.${sortDir}`;
      queryUrl += `&limit=${limit}&offset=${offset}`;

      const res = await fetch(queryUrl, {
        headers: { ...headers, Prefer: "count=exact" },
      });

      if (!res.ok) {
        const errText = await res.text();
        return errorResponse(`Failed to fetch players: ${errText.slice(0, 200)}`, 500);
      }

      const rows = await res.json() as Array<{ id: string; data: Record<string, unknown>; updated_at: string }>;
      const total = parseInt(res.headers.get("content-range")?.split("/")[1] ?? "0");

      // Extract player data from JSONB
      const players = rows.map((row) => ({
        ...(row.data as Record<string, unknown>),
        id: row.id,
        updatedAt: row.updated_at,
      }));

      if (id && players.length === 1) {
        return successResponse(players[0]);
      }

      return successResponse({ players, total, limit, offset });
    }

    // ── POST: Create player ──────────────────────────────────────────────────
    if (req.method === "POST") {
      const parsed = CreatePlayerSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse(
          "Invalid player data: " + parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", "),
          400, "VALIDATION_ERROR",
        );
      }

      const input = parsed.data;
      const vsi = calculateVSI(input.metrics);
      const now = new Date().toISOString();
      const playerId = input.id ?? `p${Date.now()}`;

      const playerData = {
        ...input,
        id: playerId,
        vsi,
        vsiHistory: [vsi],
        createdAt: now,
        updatedAt: now,
      };

      const row = {
        id: playerId,
        user_id: userId,
        data: playerData,
        updated_at: now,
      };

      const res = await fetch(`${supabaseUrl}/rest/v1/players`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify(row),
      });

      if (!res.ok) {
        const errText = await res.text();
        return errorResponse(`Failed to create player: ${errText.slice(0, 200)}`, 500);
      }

      const [saved] = await res.json() as Array<{ id: string; data: Record<string, unknown> }>;
      return successResponse({ ...saved.data, id: saved.id }, 201);
    }

    // ── PATCH: Update player ─────────────────────────────────────────────────
    if (req.method === "PATCH") {
      let patchBody = body;
      if (!patchBody || typeof patchBody !== "object" || !("id" in (patchBody as Record<string, unknown>))) {
        try { patchBody = await req.json(); } catch { /* empty */ }
      }

      const parsed = UpdatePlayerSchema.safeParse(patchBody);
      if (!parsed.success) {
        return errorResponse(
          "Invalid update data: " + parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", "),
          400, "VALIDATION_ERROR",
        );
      }

      const { id, ...updates } = parsed.data;

      // Fetch current player data
      const getRes = await fetch(
        `${supabaseUrl}/rest/v1/players?id=eq.${id}&user_id=eq.${userId}&select=data,updated_at`,
        { headers },
      );

      if (!getRes.ok) {
        return errorResponse("Failed to fetch player", 500);
      }

      const rows = await getRes.json() as Array<{ data: Record<string, unknown>; updated_at: string }>;
      if (rows.length === 0) {
        return errorResponse("Player not found", 404, "NOT_FOUND");
      }

      const currentData = rows[0].data as Record<string, unknown>;
      const originalUpdatedAt = rows[0].updated_at;
      const now = new Date().toISOString();

      // Build updated data
      const updatedData = { ...currentData };

      // Apply field updates
      if (updates.name !== undefined) updatedData.name = updates.name;
      if (updates.age !== undefined) updatedData.age = updates.age;
      if (updates.position !== undefined) updatedData.position = updates.position;
      if (updates.foot !== undefined) updatedData.foot = updates.foot;
      if (updates.height !== undefined) updatedData.height = updates.height;
      if (updates.weight !== undefined) updatedData.weight = updates.weight;
      if (updates.sittingHeight !== undefined) updatedData.sittingHeight = updates.sittingHeight;
      if (updates.legLength !== undefined) updatedData.legLength = updates.legLength;
      if (updates.competitiveLevel !== undefined) updatedData.competitiveLevel = updates.competitiveLevel;
      if (updates.minutesPlayed !== undefined) updatedData.minutesPlayed = updates.minutesPlayed;
      if (updates.phvCategory !== undefined) updatedData.phvCategory = updates.phvCategory;
      if (updates.phvOffset !== undefined) updatedData.phvOffset = updates.phvOffset;

      // Recalculate VSI if metrics changed
      if (updates.metrics) {
        updatedData.metrics = updates.metrics;
        const newVSI = calculateVSI(updates.metrics);
        updatedData.vsi = newVSI;
        const history = Array.isArray(currentData.vsiHistory) ? [...(currentData.vsiHistory as number[])] : [];
        history.push(newVSI);
        updatedData.vsiHistory = history.slice(-10);
      }

      updatedData.updatedAt = now;

      const patchRes = await fetch(
        `${supabaseUrl}/rest/v1/players?id=eq.${id}&user_id=eq.${userId}&updated_at=eq.${originalUpdatedAt}`,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify({ data: updatedData, updated_at: now }),
        },
      );

      if (!patchRes.ok) {
        const errText = await patchRes.text();
        return errorResponse(`Failed to update player: ${errText.slice(0, 200)}`, 500);
      }

      const patchedRows = await patchRes.json() as Array<{ id: string; data: Record<string, unknown> }>;
      if (patchedRows.length === 0) {
        return errorResponse("Conflicto: el jugador fue modificado por otra sesión. Reintenta.", 409, "CONFLICT");
      }
      return successResponse({ ...patchedRows[0].data, id: patchedRows[0].id });
    }

    // ── DELETE: Remove player ────────────────────────────────────────────────
    if (req.method === "DELETE") {
      let deleteBody = body;
      if (!deleteBody || typeof deleteBody !== "object" || !("id" in (deleteBody as Record<string, unknown>))) {
        try { deleteBody = await req.json(); } catch { /* empty */ }
      }

      const parsed = DeletePlayerSchema.safeParse(deleteBody);
      if (!parsed.success) {
        return errorResponse("Invalid body: need {id}", 400, "VALIDATION_ERROR");
      }

      const res = await fetch(
        `${supabaseUrl}/rest/v1/players?id=eq.${parsed.data.id}&user_id=eq.${userId}`,
        { method: "DELETE", headers },
      );

      if (!res.ok) {
        return errorResponse("Failed to delete player", 500);
      }

      return successResponse({ deleted: true, id: parsed.data.id });
    }

    return errorResponse("Method not allowed", 405);
  },
);
