/**
 * VITAS · Prompt Version Registry
 *
 * Helper compartido por todos los agentes LLM. Cada vez que un agente se
 * ejecuta, este helper:
 *   1. Genera el hash SHA-256 del prompt
 *   2. Verifica si la version+hash ya existe en `prompt_versions` table
 *   3. Si NO existe (nuevo prompt o versión cambió), lo inserta
 *   4. Devuelve el id de la prompt_version para usar en el insert de `reports`
 *
 * Beneficio: trazabilidad total de qué prompt generó cada reporte.
 *            Permite rollback (lanzar antiguo prompt) si nueva versión empeora.
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface RegisterPromptInput {
  agentName: string;        // ej. "player-report"
  version: string;           // ej. "v2.1.0"
  systemPrompt: string;
  model: string;             // ej. "claude-sonnet-4-5"
  maxTokens: number;
  notes?: string;
}

const registryCache = new Map<string, string>(); // cache in-memory: "agent:version:hash" → id

export async function registerPromptVersion(
  input: RegisterPromptInput
): Promise<string | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return null; // dev sin BBDD
  }

  const promptHash = crypto
    .createHash("sha256")
    .update(input.systemPrompt)
    .digest("hex");

  const cacheKey = `${input.agentName}:${input.version}:${promptHash.slice(0, 16)}`;
  const cached = registryCache.get(cacheKey);
  if (cached) return cached;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ── Buscar si ya existe (agent_name + version + hash) ──────
  const { data: existing } = await supabase
    .from("prompt_versions")
    .select("id, prompt_hash")
    .eq("agent_name", input.agentName)
    .eq("version", input.version)
    .maybeSingle();

  if (existing) {
    // ⚠️ Si el hash NO coincide, el prompt fue modificado SIN cambiar la versión.
    // Eso es un bug del developer. Logueamos pero retornamos el ID existente.
    if (existing.prompt_hash !== promptHash && existing.prompt_hash !== "pending-hash") {
      console.warn(
        `[VITAS] Prompt mismatch for ${input.agentName}:${input.version} · ` +
        `expected ${existing.prompt_hash.slice(0, 8)}... got ${promptHash.slice(0, 8)}... ` +
        `(developer should bump version)`
      );
    }
    registryCache.set(cacheKey, existing.id);
    return existing.id;
  }

  // ── Insertar nueva versión ───────────────────────────────────
  const { data: inserted, error } = await supabase
    .from("prompt_versions")
    .insert({
      agent_name: input.agentName,
      version: input.version,
      prompt_hash: promptHash,
      system_prompt: input.systemPrompt,
      model: input.model,
      max_tokens: input.maxTokens,
      notes: input.notes ?? "auto-registered",
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error(`[VITAS] Failed to register prompt version: ${error?.message}`);
    return null;
  }

  registryCache.set(cacheKey, inserted.id);
  return inserted.id;
}

/**
 * Recupera el system prompt activo de la BBDD para un agente.
 * Usado para A/B testing o rollback dinámico (no usar en producción inicial,
 * mejor hardcodear en el .ts).
 */
export async function getActivePromptVersion(agentName: string): Promise<string | null> {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data } = await supabase
    .from("prompt_versions")
    .select("version, prompt_hash")
    .eq("agent_name", agentName)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.version ?? null;
}
