/**
 * VITAS Agent Tracer — Observability & Tracing System
 *
 * Traza completa de cada llamada a agente:
 * - Input → RAG chunks usados → tool calls → output
 * - Latencia, token usage, retry count, success rate
 * - Alertas en cascading failures (>2 retries consecutivos)
 *
 * Sin dependencias externas (no Langfuse/LangSmith).
 * Almacena en localStorage para debugging + expone métricas vía API.
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface AgentTrace {
  /** ID único del trace */
  traceId: string;
  /** Nombre del agente */
  agentName: string;
  /** Timestamp de inicio */
  startedAt: string;
  /** Timestamp de fin */
  completedAt?: string;
  /** Duración en ms */
  durationMs?: number;
  /** Estado */
  status: "running" | "success" | "error" | "timeout";
  /** Input enviado al agente (truncado para no guardar datos sensibles) */
  inputSummary: string;
  /** Output recibido (truncado) */
  outputSummary?: string;
  /** Error message si falló */
  error?: string;
  /** Tokens usados */
  tokensUsed?: number;
  /** RAG chunks que se usaron (IDs o resúmenes) */
  ragChunksUsed?: string[];
  /** Si se sanitizó contenido RAG */
  ragSanitized?: boolean;
  /** Chunks bloqueados por sanitización */
  ragChunksBlocked?: number;
  /** Número de retry */
  retryCount: number;
  /** Modelo usado */
  model?: string;
  /** Temperature */
  temperature?: number;
  /** ID de la sesión/request padre (para tracing de pipelines) */
  parentTraceId?: string;
  /** Tags para filtrado */
  tags: string[];
}

export interface AgentMetrics {
  /** Métricas por agente */
  byAgent: Record<string, AgentAggregate>;
  /** Métricas globales */
  global: {
    totalCalls: number;
    successRate: number;
    avgLatencyMs: number;
    totalTokensUsed: number;
    totalErrors: number;
    cascadingFailures: number;
    ragInjectionBlocks: number;
  };
  /** Alertas activas */
  alerts: TracerAlert[];
  /** Timestamp de la última actualización */
  computedAt: string;
}

export interface AgentAggregate {
  totalCalls: number;
  successCount: number;
  errorCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  totalTokensUsed: number;
  avgTokensPerCall: number;
  lastError?: string;
  lastCalledAt?: string;
  consecutiveErrors: number;
}

export interface TracerAlert {
  type: "cascading_failure" | "high_latency" | "token_budget_exceeded" | "rag_injection_detected" | "high_error_rate";
  agentName: string;
  message: string;
  severity: "critical" | "warning" | "info";
  timestamp: string;
  /** Número de veces que se ha disparado */
  count: number;
}

// ── Configuración ─────────────────────────────────────────────────────────────

const CONFIG = {
  /** Máximo de traces en localStorage */
  maxTraces: 200,
  /** Key de localStorage */
  storageKey: "vitas_agent_traces",
  alertsKey: "vitas_tracer_alerts",
  /** Threshold para alerta de cascading failure */
  cascadingFailureThreshold: 2,
  /** Threshold de latencia alta (ms) */
  highLatencyThreshold: 15000,
  /** Threshold de error rate para alerta (%) */
  highErrorRateThreshold: 30,
  /** TTL de traces (7 días) */
  traceTtlMs: 7 * 24 * 60 * 60 * 1000,
};

// ── Servicio ──────────────────────────────────────────────────────────────────

class AgentTracerService {
  private activeTraces = new Map<string, AgentTrace>();
  private consecutiveErrors = new Map<string, number>();

  /**
   * Inicia un trace para una llamada a agente.
   * Retorna un traceId que se usa para completar el trace.
   */
  startTrace(agentName: string, input: unknown, options: {
    parentTraceId?: string;
    model?: string;
    temperature?: number;
    tags?: string[];
  } = {}): string {
    const traceId = this.generateId();

    const trace: AgentTrace = {
      traceId,
      agentName,
      startedAt: new Date().toISOString(),
      status: "running",
      inputSummary: this.summarize(input, 200),
      retryCount: 0,
      model: options.model,
      temperature: options.temperature,
      parentTraceId: options.parentTraceId,
      tags: options.tags ?? [],
    };

    this.activeTraces.set(traceId, trace);
    return traceId;
  }

  /**
   * Completa un trace exitosamente.
   */
  completeTrace(traceId: string, output: unknown, extra: {
    tokensUsed?: number;
    ragChunksUsed?: string[];
    ragSanitized?: boolean;
    ragChunksBlocked?: number;
  } = {}): void {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return;

    const now = new Date();
    trace.completedAt = now.toISOString();
    trace.durationMs = now.getTime() - new Date(trace.startedAt).getTime();
    trace.status = "success";
    trace.outputSummary = this.summarize(output, 300);
    trace.tokensUsed = extra.tokensUsed;
    trace.ragChunksUsed = extra.ragChunksUsed;
    trace.ragSanitized = extra.ragSanitized;
    trace.ragChunksBlocked = extra.ragChunksBlocked;

    // Reset consecutive errors para este agente
    this.consecutiveErrors.set(trace.agentName, 0);

    // Chequear latencia alta
    if (trace.durationMs > CONFIG.highLatencyThreshold) {
      this.addAlert({
        type: "high_latency",
        agentName: trace.agentName,
        message: `${trace.agentName} tardó ${(trace.durationMs / 1000).toFixed(1)}s (umbral: ${CONFIG.highLatencyThreshold / 1000}s)`,
        severity: "warning",
      });
    }

    // Chequear RAG injection blocks
    if (extra.ragChunksBlocked && extra.ragChunksBlocked > 0) {
      this.addAlert({
        type: "rag_injection_detected",
        agentName: trace.agentName,
        message: `Se bloquearon ${extra.ragChunksBlocked} chunk(s) con prompt injection para ${trace.agentName}`,
        severity: "critical",
      });
    }

    this.persistTrace(trace);
    this.activeTraces.delete(traceId);
  }

  /**
   * Marca un trace como fallido.
   */
  failTrace(traceId: string, error: string | Error, retryCount = 0): void {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return;

    const now = new Date();
    trace.completedAt = now.toISOString();
    trace.durationMs = now.getTime() - new Date(trace.startedAt).getTime();
    trace.status = "error";
    trace.error = error instanceof Error ? error.message : error;
    trace.retryCount = retryCount;

    // Incrementar consecutive errors
    const prevConsecutive = this.consecutiveErrors.get(trace.agentName) ?? 0;
    const newConsecutive = prevConsecutive + 1;
    this.consecutiveErrors.set(trace.agentName, newConsecutive);

    // Alerta de cascading failure
    if (newConsecutive >= CONFIG.cascadingFailureThreshold) {
      this.addAlert({
        type: "cascading_failure",
        agentName: trace.agentName,
        message: `${trace.agentName} ha fallado ${newConsecutive} veces consecutivas. Posible cascading failure.`,
        severity: "critical",
      });
    }

    this.persistTrace(trace);
    this.activeTraces.delete(traceId);
  }

  /**
   * Calcula métricas agregadas de todos los traces almacenados.
   */
  getMetrics(): AgentMetrics {
    const traces = this.loadTraces();
    const byAgent: Record<string, AgentAggregate> = {};
    let totalTokens = 0;
    let totalErrors = 0;
    let totalLatency = 0;
    let completedCount = 0;
    let ragBlocks = 0;

    for (const trace of traces) {
      // Inicializar agente si no existe
      if (!byAgent[trace.agentName]) {
        byAgent[trace.agentName] = {
          totalCalls: 0,
          successCount: 0,
          errorCount: 0,
          avgLatencyMs: 0,
          p95LatencyMs: 0,
          totalTokensUsed: 0,
          avgTokensPerCall: 0,
          consecutiveErrors: this.consecutiveErrors.get(trace.agentName) ?? 0,
        };
      }

      const agg = byAgent[trace.agentName];
      agg.totalCalls++;

      if (trace.status === "success") {
        agg.successCount++;
      } else if (trace.status === "error") {
        agg.errorCount++;
        totalErrors++;
        agg.lastError = trace.error;
      }

      if (trace.durationMs) {
        totalLatency += trace.durationMs;
        completedCount++;
      }

      if (trace.tokensUsed) {
        agg.totalTokensUsed += trace.tokensUsed;
        totalTokens += trace.tokensUsed;
      }

      if (trace.ragChunksBlocked) {
        ragBlocks += trace.ragChunksBlocked;
      }

      agg.lastCalledAt = trace.startedAt;
    }

    // Calcular promedios por agente
    for (const name of Object.keys(byAgent)) {
      const agg = byAgent[name];
      const agentTraces = traces.filter(t => t.agentName === name);
      const latencies = agentTraces.filter(t => t.durationMs).map(t => t.durationMs!).sort((a, b) => a - b);

      agg.avgLatencyMs = latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0;

      agg.p95LatencyMs = latencies.length > 0
        ? latencies[Math.floor(latencies.length * 0.95)] ?? latencies[latencies.length - 1]
        : 0;

      agg.avgTokensPerCall = agg.totalCalls > 0
        ? Math.round(agg.totalTokensUsed / agg.totalCalls)
        : 0;
    }

    const totalCalls = traces.length;
    const successCount = traces.filter(t => t.status === "success").length;

    return {
      byAgent,
      global: {
        totalCalls,
        successRate: totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 100,
        avgLatencyMs: completedCount > 0 ? Math.round(totalLatency / completedCount) : 0,
        totalTokensUsed: totalTokens,
        totalErrors,
        cascadingFailures: this.loadAlerts().filter(a => a.type === "cascading_failure").length,
        ragInjectionBlocks: ragBlocks,
      },
      alerts: this.loadAlerts(),
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * Obtiene los últimos N traces (para UI de debugging).
   */
  getRecentTraces(limit = 50): AgentTrace[] {
    const traces = this.loadTraces();
    return traces.slice(-limit).reverse();
  }

  /**
   * Obtiene traces de un agente específico.
   */
  getTracesByAgent(agentName: string, limit = 20): AgentTrace[] {
    return this.loadTraces()
      .filter(t => t.agentName === agentName)
      .slice(-limit)
      .reverse();
  }

  /**
   * Obtiene traces de un pipeline completo (por parentTraceId).
   */
  getPipelineTraces(parentTraceId: string): AgentTrace[] {
    return this.loadTraces()
      .filter(t => t.parentTraceId === parentTraceId || t.traceId === parentTraceId);
  }

  /**
   * Obtiene alertas activas.
   */
  getAlerts(): TracerAlert[] {
    return this.loadAlerts();
  }

  /**
   * Limpia alertas.
   */
  clearAlerts(): void {
    try {
      localStorage.removeItem(CONFIG.alertsKey);
    } catch { /* ignore */ }
  }

  /**
   * Limpia traces viejos (mayor a TTL).
   */
  pruneOldTraces(): number {
    const traces = this.loadTraces();
    const cutoff = Date.now() - CONFIG.traceTtlMs;
    const fresh = traces.filter(t => new Date(t.startedAt).getTime() > cutoff);
    const pruned = traces.length - fresh.length;

    if (pruned > 0) {
      this.saveTraces(fresh);
    }

    return pruned;
  }

  // ── Métodos internos ──────────────────────────────────────────────────────

  private generateId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private summarize(data: unknown, maxLen: number): string {
    try {
      const str = typeof data === "string" ? data : JSON.stringify(data);
      return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
    } catch {
      return "[no serializable]";
    }
  }

  private persistTrace(trace: AgentTrace): void {
    try {
      const traces = this.loadTraces();
      traces.push(trace);

      // Mantener dentro del límite
      while (traces.length > CONFIG.maxTraces) {
        traces.shift();
      }

      this.saveTraces(traces);
    } catch {
      // localStorage lleno o no disponible — no bloquear
    }
  }

  private loadTraces(): AgentTrace[] {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      return raw ? JSON.parse(raw) as AgentTrace[] : [];
    } catch {
      return [];
    }
  }

  private saveTraces(traces: AgentTrace[]): void {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(traces));
    } catch {
      // Storage full — prune aggressively
      try {
        const half = traces.slice(Math.floor(traces.length / 2));
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(half));
      } catch { /* give up silently */ }
    }
  }

  private addAlert(alert: Omit<TracerAlert, "timestamp" | "count">): void {
    try {
      const alerts = this.loadAlerts();

      // Check if same alert already exists (dedup)
      const existing = alerts.find(a => a.type === alert.type && a.agentName === alert.agentName);
      if (existing) {
        existing.count++;
        existing.timestamp = new Date().toISOString();
        existing.message = alert.message;
      } else {
        alerts.push({
          ...alert,
          timestamp: new Date().toISOString(),
          count: 1,
        });
      }

      // Keep last 50 alerts
      while (alerts.length > 50) alerts.shift();

      localStorage.setItem(CONFIG.alertsKey, JSON.stringify(alerts));
    } catch { /* ignore */ }
  }

  private loadAlerts(): TracerAlert[] {
    try {
      const raw = localStorage.getItem(CONFIG.alertsKey);
      return raw ? JSON.parse(raw) as TracerAlert[] : [];
    } catch {
      return [];
    }
  }
}

// Singleton
export const agentTracer = new AgentTracerService();
