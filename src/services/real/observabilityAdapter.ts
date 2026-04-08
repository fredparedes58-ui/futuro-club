/**
 * VITAS · Observability Adapter (Langfuse-Ready)
 *
 * Capa de abstracción entre el agentTracer actual (localStorage) y
 * proveedores de observabilidad externos (Langfuse, LangSmith, Helicone).
 *
 * Patrón Adapter/Strategy:
 * - Hoy: todo va a localStorage vía agentTracer (provider: "local")
 * - Mañana: si VITE_LANGFUSE_PUBLIC_KEY existe, se activa dual-write
 *   (localStorage + Langfuse simultáneamente)
 * - El resto del código NO cambia — solo esta capa
 *
 * ¿Por qué no instalar Langfuse hoy?
 * - 0 usuarios → no justifica dependencia npm extra
 * - El adapter permite activarlo con 1 env var cuando haya volumen
 * - Mientras tanto, localStorage + agentTracer dan suficiente visibilidad
 *
 * Para activar Langfuse en el futuro:
 * 1. npm install langfuse
 * 2. Agregar VITE_LANGFUSE_PUBLIC_KEY y VITE_LANGFUSE_SECRET_KEY en .env
 * 3. Descomentar el LangfuseProvider abajo
 * 4. Listo — dual-write automático
 */

import type { AgentTrace, AgentMetrics, TracerAlert } from "./agentTracer";
import { agentTracer } from "./agentTracer";

// ── Provider Interface ────────────────────────────────────────────────────────

/**
 * Interfaz que cualquier proveedor de observabilidad debe implementar.
 * Esto permite cambiar de proveedor sin tocar el código que consume.
 */
export interface ObservabilityProvider {
  /** Nombre del provider */
  name: string;
  /** Si está habilitado */
  enabled: boolean;

  /** Inicia un trace (retorna trace ID del provider) */
  startTrace(agentName: string, input: unknown, meta?: Record<string, unknown>): string | null;
  /** Completa un trace exitosamente */
  completeTrace(traceId: string, output: unknown, meta?: Record<string, unknown>): void;
  /** Marca un trace como fallido */
  failTrace(traceId: string, error: string, retryCount?: number): void;

  /** Obtiene métricas (puede retornar null si no aplica) */
  getMetrics?(): AgentMetrics | null;
  /** Obtiene traces recientes */
  getRecentTraces?(limit?: number): AgentTrace[];
  /** Obtiene alertas */
  getAlerts?(): TracerAlert[];

  /** Registra feedback del usuario (coach) sobre un reporte */
  recordFeedback?(traceId: string, score: number, comment?: string): void;
}

// ── Local Provider (actual — agentTracer) ─────────────────────────────────────

class LocalProvider implements ObservabilityProvider {
  name = "local";
  enabled = true;

  startTrace(agentName: string, input: unknown, meta?: Record<string, unknown>): string {
    return agentTracer.startTrace(agentName, input, {
      parentTraceId: meta?.parentTraceId as string | undefined,
      model: meta?.model as string | undefined,
      temperature: meta?.temperature as number | undefined,
      tags: meta?.tags as string[] | undefined,
    });
  }

  completeTrace(traceId: string, output: unknown, meta?: Record<string, unknown>): void {
    agentTracer.completeTrace(traceId, output, {
      tokensUsed: meta?.tokensUsed as number | undefined,
      ragChunksUsed: meta?.ragChunksUsed as string[] | undefined,
      ragSanitized: meta?.ragSanitized as boolean | undefined,
      ragChunksBlocked: meta?.ragChunksBlocked as number | undefined,
    });
  }

  failTrace(traceId: string, error: string, retryCount?: number): void {
    agentTracer.failTrace(traceId, error, retryCount);
  }

  getMetrics(): AgentMetrics {
    return agentTracer.getMetrics();
  }

  getRecentTraces(limit?: number): AgentTrace[] {
    return agentTracer.getRecentTraces(limit);
  }

  getAlerts(): TracerAlert[] {
    return agentTracer.getAlerts();
  }

  recordFeedback(_traceId: string, score: number, comment?: string): void {
    // En local, guardar en localStorage
    try {
      const feedbacks = JSON.parse(localStorage.getItem("vitas_feedback") ?? "[]") as unknown[];
      feedbacks.push({
        traceId: _traceId,
        score,
        comment,
        timestamp: new Date().toISOString(),
      });
      // Keep last 100
      while (feedbacks.length > 100) feedbacks.shift();
      localStorage.setItem("vitas_feedback", JSON.stringify(feedbacks));
    } catch { /* ignore */ }
  }
}

// ── Langfuse Provider (futuro — descomentar cuando se instale) ────────────────

/*
// Para activar:
// 1. npm install langfuse
// 2. Descomentar este bloque
// 3. Agregar env vars VITE_LANGFUSE_PUBLIC_KEY + VITE_LANGFUSE_SECRET_KEY

import { Langfuse } from "langfuse";

class LangfuseProvider implements ObservabilityProvider {
  name = "langfuse";
  enabled: boolean;
  private client: Langfuse | null = null;
  private traces = new Map<string, unknown>();

  constructor() {
    const publicKey = import.meta.env.VITE_LANGFUSE_PUBLIC_KEY;
    const secretKey = import.meta.env.VITE_LANGFUSE_SECRET_KEY;
    const host = import.meta.env.VITE_LANGFUSE_HOST ?? "https://cloud.langfuse.com";

    this.enabled = !!(publicKey && secretKey);

    if (this.enabled) {
      this.client = new Langfuse({
        publicKey,
        secretKey,
        baseUrl: host,
      });
    }
  }

  startTrace(agentName: string, input: unknown, meta?: Record<string, unknown>): string | null {
    if (!this.client) return null;

    const trace = this.client.trace({
      name: `vitas-${agentName}`,
      input: typeof input === "string" ? input : JSON.stringify(input).slice(0, 1000),
      metadata: {
        ...meta,
        platform: "vitas",
        version: "2.1.0",
      },
    });

    const id = trace.id;
    this.traces.set(id, trace);
    return id;
  }

  completeTrace(traceId: string, output: unknown, meta?: Record<string, unknown>): void {
    const trace = this.traces.get(traceId);
    if (!trace || !this.client) return;

    // Langfuse update trace
    this.client.trace({
      id: traceId,
      output: typeof output === "string" ? output : JSON.stringify(output).slice(0, 2000),
      metadata: meta,
    });

    this.traces.delete(traceId);
  }

  failTrace(traceId: string, error: string, retryCount?: number): void {
    if (!this.client) return;

    this.client.trace({
      id: traceId,
      output: JSON.stringify({ error, retryCount }),
      level: "ERROR",
    });

    this.traces.delete(traceId);
  }

  recordFeedback(traceId: string, score: number, comment?: string): void {
    if (!this.client) return;

    this.client.score({
      traceId,
      name: "coach-feedback",
      value: score,
      comment,
    });
  }
}
*/

// ── Orchestrator (dual-write a todos los providers activos) ───────────────────

class ObservabilityOrchestrator {
  private providers: ObservabilityProvider[] = [];
  private traceMapping = new Map<string, Map<string, string | null>>();

  constructor() {
    // Provider local siempre activo
    this.providers.push(new LocalProvider());

    // Langfuse: descomentar cuando se instale
    // const langfuse = new LangfuseProvider();
    // if (langfuse.enabled) this.providers.push(langfuse);
  }

  /**
   * Registra un provider adicional en runtime.
   * Útil para testing o providers custom.
   */
  registerProvider(provider: ObservabilityProvider): void {
    if (provider.enabled) {
      this.providers.push(provider);
    }
  }

  /**
   * Lista providers activos.
   */
  getActiveProviders(): string[] {
    return this.providers.filter(p => p.enabled).map(p => p.name);
  }

  /**
   * Inicia un trace en todos los providers.
   * Retorna el trace ID del provider primario (local).
   */
  startTrace(agentName: string, input: unknown, meta?: Record<string, unknown>): string {
    const mapping = new Map<string, string | null>();
    let primaryId = "";

    for (const provider of this.providers) {
      if (!provider.enabled) continue;
      try {
        const id = provider.startTrace(agentName, input, meta);
        mapping.set(provider.name, id);
        if (provider.name === "local" && id) {
          primaryId = id;
        }
      } catch (err) {
        console.warn(`[Observability] ${provider.name}.startTrace failed:`, err);
      }
    }

    if (primaryId) {
      this.traceMapping.set(primaryId, mapping);
    }

    return primaryId;
  }

  /**
   * Completa un trace en todos los providers.
   */
  completeTrace(primaryTraceId: string, output: unknown, meta?: Record<string, unknown>): void {
    const mapping = this.traceMapping.get(primaryTraceId);

    for (const provider of this.providers) {
      if (!provider.enabled) continue;
      try {
        const providerTraceId = mapping?.get(provider.name) ?? primaryTraceId;
        if (providerTraceId) {
          provider.completeTrace(providerTraceId, output, meta);
        }
      } catch (err) {
        console.warn(`[Observability] ${provider.name}.completeTrace failed:`, err);
      }
    }

    this.traceMapping.delete(primaryTraceId);
  }

  /**
   * Marca un trace como fallido en todos los providers.
   */
  failTrace(primaryTraceId: string, error: string, retryCount?: number): void {
    const mapping = this.traceMapping.get(primaryTraceId);

    for (const provider of this.providers) {
      if (!provider.enabled) continue;
      try {
        const providerTraceId = mapping?.get(provider.name) ?? primaryTraceId;
        if (providerTraceId) {
          provider.failTrace(providerTraceId, error, retryCount);
        }
      } catch (err) {
        console.warn(`[Observability] ${provider.name}.failTrace failed:`, err);
      }
    }

    this.traceMapping.delete(primaryTraceId);
  }

  /**
   * Registra feedback del coach sobre un reporte.
   * Se envía a todos los providers que soporten feedback.
   */
  recordFeedback(primaryTraceId: string, score: number, comment?: string): void {
    const mapping = this.traceMapping.get(primaryTraceId);

    for (const provider of this.providers) {
      if (!provider.enabled || !provider.recordFeedback) continue;
      try {
        const providerTraceId = mapping?.get(provider.name) ?? primaryTraceId;
        if (providerTraceId) {
          provider.recordFeedback(providerTraceId, score, comment);
        }
      } catch (err) {
        console.warn(`[Observability] ${provider.name}.recordFeedback failed:`, err);
      }
    }
  }

  /**
   * Obtiene métricas del provider primario (local).
   */
  getMetrics(): AgentMetrics {
    const local = this.providers.find(p => p.name === "local");
    return local?.getMetrics?.() ?? {
      byAgent: {},
      global: {
        totalCalls: 0, successRate: 100, avgLatencyMs: 0,
        totalTokensUsed: 0, totalErrors: 0, cascadingFailures: 0,
        ragInjectionBlocks: 0,
      },
      alerts: [],
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Obtiene traces recientes del provider primario.
   */
  getRecentTraces(limit?: number): AgentTrace[] {
    const local = this.providers.find(p => p.name === "local");
    return local?.getRecentTraces?.(limit) ?? [];
  }

  /**
   * Obtiene alertas del provider primario.
   */
  getAlerts(): TracerAlert[] {
    const local = this.providers.find(p => p.name === "local");
    return local?.getAlerts?.() ?? [];
  }

  /**
   * Obtiene feedback registrado (solo local).
   */
  getFeedback(): Array<{ traceId: string; score: number; comment?: string; timestamp: string }> {
    try {
      return JSON.parse(localStorage.getItem("vitas_feedback") ?? "[]");
    } catch {
      return [];
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const observability = new ObservabilityOrchestrator();

// Re-export types for consumers
export type { ObservabilityProvider };
