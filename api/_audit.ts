/**
 * VITAS Audit Endpoint — Backend
 * GET /api/audit
 * Verifica el estado de todos los agentes y la configuración de Vercel.
 * No expone la API key — solo confirma que existe.
 */

import { withHandler } from "./_lib/withHandler";
import { successResponse } from "./_lib/apiResponse";

export const config = { runtime: "edge" };

interface BackendCheck {
  name: string;
  status: "ok" | "warning" | "error";
  message: string;
  detail?: string | number | boolean | null;
}

interface BackendAuditReport {
  timestamp: string;
  environment: string;
  overall: "ok" | "warning" | "error";
  checks: BackendCheck[];
  agentEndpoints: {
    path: string;
    registered: boolean;
  }[];
}

export default withHandler(
  { method: "GET", serviceOnly: true },
  async () => {
    const checks: BackendCheck[] = [];

    // ── Check 1: ANTHROPIC_API_KEY ────────────────────────────────────────────
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
    const keyLength = process.env.ANTHROPIC_API_KEY?.length ?? 0;
    const keyPrefix = process.env.ANTHROPIC_API_KEY?.slice(0, 7) ?? "";

    checks.push({
      name: "ANTHROPIC_API_KEY",
      status: hasApiKey ? "ok" : "error",
      message: hasApiKey
        ? `API key configurada correctamente (${keyLength} chars, prefix: ${keyPrefix}...)`
        : "ANTHROPIC_API_KEY no encontrada — agentes no funcionarán",
      detail: hasApiKey ? `${keyPrefix}... (${keyLength} chars)` : null,
    });

    // ── Check 2: Modelo Claude disponible ────────────────────────────────────
    let modelStatus: BackendCheck;
    if (hasApiKey) {
      try {
        const testRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": process.env.ANTHROPIC_API_KEY!,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5",
            max_tokens: 10,
            messages: [{ role: "user", content: "ping" }],
          }),
        });

        const data = await testRes.json() as { type?: string; error?: { message?: string } };

        modelStatus = {
          name: "Claude Haiku (ping)",
          status: testRes.ok ? "ok" : "warning",
          message: testRes.ok
            ? "Claude Haiku respondió correctamente"
            : `Claude retornó status ${testRes.status}: ${data?.error?.message ?? "error desconocido"}`,
          detail: testRes.status,
        };
      } catch (err) {
        modelStatus = {
          name: "Claude Haiku (ping)",
          status: "error",
          message: `No se pudo conectar con Anthropic API: ${err instanceof Error ? err.message : String(err)}`,
          detail: null,
        };
      }
    } else {
      modelStatus = {
        name: "Claude Haiku (ping)",
        status: "error",
        message: "Skipped — ANTHROPIC_API_KEY no configurada",
        detail: null,
      };
    }
    checks.push(modelStatus);

    // ── Check 3: Runtime Edge ─────────────────────────────────────────────────
    checks.push({
      name: "Runtime Edge",
      status: "ok",
      message: "Edge Function activa y respondiendo",
      detail: "vercel-edge",
    });

    // ── Check 4: Variables de entorno requeridas en Fase 2/3 ─────────────────
    const optionalVars = [
      { key: "ROBOFLOW_API_KEY", phase: "Fase 2 — Video Pipeline" },
      { key: "YOLO_ENDPOINT_URL", phase: "Fase 3 — YOLOv11M" },
      { key: "YOLO_API_KEY", phase: "Fase 3 — YOLOv11M" },
      { key: "VITE_SUPABASE_URL", phase: "Fase 3 — Supabase" },
      { key: "VITE_SUPABASE_PUBLISHABLE_KEY", phase: "Fase 3 — Supabase" },
    ];

    for (const v of optionalVars) {
      const exists = !!process.env[v.key];
      checks.push({
        name: `${v.key} (${v.phase})`,
        status: exists ? "ok" : "warning",
        message: exists
          ? `Configurada — ${v.phase} lista`
          : `No configurada — necesaria para ${v.phase}`,
        detail: exists ? "configurada" : "pendiente",
      });
    }

    // ── Agentes registrados ───────────────────────────────────────────────────
    const agentEndpoints = [
      "/api/agents/phv-calculator",
      "/api/agents/scout-insight",
      "/api/agents/role-profile",
      "/api/agents/tactical-label",
    ].map((path) => ({ path, registered: true }));

    // ── Overall status ────────────────────────────────────────────────────────
    const hasErrors = checks.some((c) => c.status === "error");
    const hasWarnings = checks.some((c) => c.status === "warning");
    const overall: "ok" | "warning" | "error" = hasErrors
      ? "error"
      : hasWarnings
      ? "warning"
      : "ok";

    const report: BackendAuditReport = {
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV ?? "local",
      overall,
      checks,
      agentEndpoints,
    };

    return successResponse(report);
  },
);
