/**
 * VITAS Agent Resilience — Circuit Breakers + Token Budget + Retry w/ Feedback
 *
 * Tres capas de protección:
 *
 * 1. CIRCUIT BREAKER: Si un agente falla N veces consecutivas, se "abre"
 *    el circuito y las llamadas fallan rápido sin tocar la API.
 *    Después de un cooldown, se permite un "half-open" test.
 *
 * 2. TOKEN BUDGET: Monitorea el consumo acumulado de tokens y alerta/bloquea
 *    cuando se acerca al límite del context window o al presupuesto diario.
 *
 * 3. RETRY CON FEEDBACK ESTRUCTURADO: Reintentos con error context enriquecido.
 *    El agente recibe info estructurada del fallo previo, no un stack trace crudo.
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  /** Nombre del agente */
  agentName: string;
  /** Fallos consecutivos para abrir el circuito */
  failureThreshold: number;
  /** Tiempo en ms antes de intentar half-open */
  cooldownMs: number;
  /** Timeout por request en ms */
  timeoutMs: number;
}

export interface CircuitStatus {
  state: CircuitState;
  failureCount: number;
  lastFailureAt?: string;
  lastSuccessAt?: string;
  openedAt?: string;
  halfOpenAttempts: number;
}

export interface TokenBudget {
  /** Contexto máximo del modelo (en tokens) */
  modelContextWindow: number;
  /** Presupuesto diario de tokens */
  dailyBudget: number;
  /** Tokens consumidos hoy */
  dailyUsed: number;
  /** Tokens en el prompt actual (acumulado) */
  currentPromptTokens: number;
  /** Umbral de alerta (% del context window) */
  alertThreshold: number;
}

export interface RetryFeedback {
  /** Número de intento (1-based) */
  attempt: number;
  /** Error del intento previo (estructurado) */
  previousError: {
    type: "parse_error" | "api_error" | "timeout" | "validation_error" | "circuit_open";
    message: string;
    statusCode?: number;
    /** Sugerencia de corrección */
    suggestedFix?: string;
  };
  /** Contexto adicional para el agente */
  hint?: string;
}

export interface ResilientCallOptions<T> {
  /** Función que ejecuta la llamada al agente */
  fn: (feedback?: RetryFeedback) => Promise<T>;
  /** Config del circuit breaker */
  circuit: CircuitBreakerConfig;
  /** Máximo reintentos (default: 3) */
  maxRetries?: number;
  /** Callback en cada retry (para UI progress) */
  onRetry?: (attempt: number, error: string) => void;
  /** Callback si circuit se abre */
  onCircuitOpen?: (agentName: string) => void;
  /** Validador de output (rechaza si no cumple schema) */
  validateOutput?: (output: T) => boolean;
  /** Tokens estimados del request (para budget tracking) */
  estimatedTokens?: number;
}

export interface ResilientResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  circuitState: CircuitState;
  tokenBudgetStatus: "ok" | "warning" | "exceeded";
  durationMs: number;
}

// ── Token Budget Service ──────────────────────────────────────────────────────

const TOKEN_BUDGET_KEY = "vitas_token_budget";

const MODEL_LIMITS: Record<string, { contextWindow: number; dailyBudget: number }> = {
  "claude-haiku-4-5-20250714": { contextWindow: 200000, dailyBudget: 500000 },
  "claude-sonnet-4-20250514":  { contextWindow: 200000, dailyBudget: 200000 },
  "gemini-2.0-flash":          { contextWindow: 1000000, dailyBudget: 400000 },
  default:                     { contextWindow: 200000, dailyBudget: 300000 },
};

class TokenBudgetService {
  private budget: TokenBudget;

  constructor() {
    this.budget = this.load();
    this.resetIfNewDay();
  }

  /**
   * Estima tokens de un texto (~4 chars/token para inglés, ~3 para español)
   */
  estimateTokens(text: string): number {
    // Spanish text averages ~3.5 chars per token
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Registra tokens consumidos.
   */
  recordUsage(tokens: number): void {
    this.resetIfNewDay();
    this.budget.dailyUsed += tokens;
    this.save();
  }

  /**
   * Registra tokens del prompt actual (acumulativo por sesión).
   */
  addToCurrentPrompt(tokens: number): void {
    this.budget.currentPromptTokens += tokens;
  }

  /**
   * Resetea el prompt actual (nueva sesión).
   */
  resetCurrentPrompt(): void {
    this.budget.currentPromptTokens = 0;
  }

  /**
   * Verifica si podemos hacer la llamada.
   */
  checkBudget(estimatedTokens: number, model = "default"): {
    allowed: boolean;
    status: "ok" | "warning" | "exceeded";
    message?: string;
    dailyRemaining: number;
    contextUsagePercent: number;
  } {
    this.resetIfNewDay();
    const limits = MODEL_LIMITS[model] ?? MODEL_LIMITS.default;

    const dailyRemaining = limits.dailyBudget - this.budget.dailyUsed;
    const contextUsage = this.budget.currentPromptTokens + estimatedTokens;
    const contextPercent = Math.round((contextUsage / limits.contextWindow) * 100);

    // Context window check (70% = warning, 90% = block)
    if (contextPercent >= 90) {
      return {
        allowed: false,
        status: "exceeded",
        message: `Context window al ${contextPercent}% (${contextUsage.toLocaleString()}/${limits.contextWindow.toLocaleString()} tokens). Reduce el contexto RAG o el historial.`,
        dailyRemaining,
        contextUsagePercent: contextPercent,
      };
    }

    // Daily budget check
    if (dailyRemaining < estimatedTokens) {
      return {
        allowed: false,
        status: "exceeded",
        message: `Presupuesto diario agotado (${this.budget.dailyUsed.toLocaleString()}/${limits.dailyBudget.toLocaleString()} tokens). Resets a medianoche.`,
        dailyRemaining: 0,
        contextUsagePercent: contextPercent,
      };
    }

    if (contextPercent >= 70) {
      return {
        allowed: true,
        status: "warning",
        message: `Context window al ${contextPercent}%. Considera comprimir el contexto RAG.`,
        dailyRemaining,
        contextUsagePercent: contextPercent,
      };
    }

    return {
      allowed: true,
      status: "ok",
      dailyRemaining,
      contextUsagePercent: contextPercent,
    };
  }

  /**
   * Obtiene métricas del budget.
   */
  getStatus(): TokenBudget & { todayDate: string } {
    this.resetIfNewDay();
    return { ...this.budget, todayDate: new Date().toISOString().split("T")[0] };
  }

  private load(): TokenBudget {
    try {
      const raw = localStorage.getItem(TOKEN_BUDGET_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }

    return {
      modelContextWindow: 200000,
      dailyBudget: 300000,
      dailyUsed: 0,
      currentPromptTokens: 0,
      alertThreshold: 70,
    };
  }

  private save(): void {
    try {
      localStorage.setItem(TOKEN_BUDGET_KEY, JSON.stringify({
        ...this.budget,
        _date: new Date().toISOString().split("T")[0],
      }));
    } catch { /* ignore */ }
  }

  private resetIfNewDay(): void {
    try {
      const raw = localStorage.getItem(TOKEN_BUDGET_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const savedDate = data._date;
        const today = new Date().toISOString().split("T")[0];
        if (savedDate && savedDate !== today) {
          this.budget.dailyUsed = 0;
          this.save();
        }
      }
    } catch { /* ignore */ }
  }
}

// ── Circuit Breaker Service ───────────────────────────────────────────────────

const CIRCUIT_KEY = "vitas_circuit_breakers";

class CircuitBreakerManager {
  private circuits = new Map<string, CircuitStatus>();

  constructor() {
    this.loadAll();
  }

  /**
   * Obtiene el estado del circuito de un agente.
   */
  getStatus(agentName: string): CircuitStatus {
    return this.circuits.get(agentName) ?? {
      state: "closed",
      failureCount: 0,
      halfOpenAttempts: 0,
    };
  }

  /**
   * Verifica si el agente puede recibir llamadas.
   */
  canCall(config: CircuitBreakerConfig): { allowed: boolean; reason?: string } {
    const status = this.getStatus(config.agentName);

    switch (status.state) {
      case "closed":
        return { allowed: true };

      case "open": {
        // Check if cooldown has passed → transition to half-open
        if (status.openedAt) {
          const elapsed = Date.now() - new Date(status.openedAt).getTime();
          if (elapsed >= config.cooldownMs) {
            status.state = "half-open";
            status.halfOpenAttempts = 0;
            this.circuits.set(config.agentName, status);
            this.saveAll();
            return { allowed: true };
          }
        }
        const remaining = status.openedAt
          ? Math.ceil((config.cooldownMs - (Date.now() - new Date(status.openedAt).getTime())) / 1000)
          : config.cooldownMs / 1000;
        return {
          allowed: false,
          reason: `Circuit OPEN para ${config.agentName}. Cooldown: ${remaining}s. Fallos: ${status.failureCount}`,
        };
      }

      case "half-open":
        // Allow one test request
        if (status.halfOpenAttempts < 1) {
          return { allowed: true };
        }
        return { allowed: false, reason: `Circuit HALF-OPEN para ${config.agentName}. Esperando resultado del test.` };
    }
  }

  /**
   * Registra una llamada exitosa.
   */
  recordSuccess(agentName: string): void {
    const status = this.getStatus(agentName);
    status.state = "closed";
    status.failureCount = 0;
    status.halfOpenAttempts = 0;
    status.lastSuccessAt = new Date().toISOString();
    this.circuits.set(agentName, status);
    this.saveAll();
  }

  /**
   * Registra una llamada fallida.
   */
  recordFailure(config: CircuitBreakerConfig): CircuitState {
    const status = this.getStatus(config.agentName);
    status.failureCount++;
    status.lastFailureAt = new Date().toISOString();

    if (status.state === "half-open") {
      // Test failed → back to open
      status.state = "open";
      status.openedAt = new Date().toISOString();
      status.halfOpenAttempts++;
    } else if (status.failureCount >= config.failureThreshold) {
      // Threshold reached → open circuit
      status.state = "open";
      status.openedAt = new Date().toISOString();
    }

    this.circuits.set(config.agentName, status);
    this.saveAll();
    return status.state;
  }

  /**
   * Obtiene resumen de todos los circuitos.
   */
  getAllStatuses(): Record<string, CircuitStatus> {
    const result: Record<string, CircuitStatus> = {};
    this.circuits.forEach((v, k) => { result[k] = { ...v }; });
    return result;
  }

  /**
   * Reset manual de un circuito (para debugging).
   */
  reset(agentName: string): void {
    this.circuits.delete(agentName);
    this.saveAll();
  }

  /**
   * Reset todos los circuitos.
   */
  resetAll(): void {
    this.circuits.clear();
    this.saveAll();
  }

  private loadAll(): void {
    try {
      const raw = localStorage.getItem(CIRCUIT_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Record<string, CircuitStatus>;
        for (const [k, v] of Object.entries(data)) {
          this.circuits.set(k, v);
        }
      }
    } catch { /* ignore */ }
  }

  private saveAll(): void {
    try {
      const data: Record<string, CircuitStatus> = {};
      this.circuits.forEach((v, k) => { data[k] = v; });
      localStorage.setItem(CIRCUIT_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
  }
}

// ── Función principal: Llamada resiliente ─────────────────────────────────────

/**
 * Ejecuta una llamada a agente con circuit breaker, token budget y retry.
 *
 * Flujo:
 * 1. Check circuit breaker → si open, fail fast
 * 2. Check token budget → si exceeded, fail fast
 * 3. Ejecutar fn() con timeout
 * 4. Si falla → retry con feedback estructurado (max 3)
 * 5. Si falla 3 veces → abrir circuit breaker
 * 6. Si pasa → validar output con schema → si falla, retry
 */
export async function resilientCall<T>(options: ResilientCallOptions<T>): Promise<ResilientResult<T>> {
  const { fn, circuit, maxRetries = 3, onRetry, onCircuitOpen, validateOutput, estimatedTokens } = options;
  const start = Date.now();

  // 1. Circuit breaker check
  const circuitCheck = circuitBreaker.canCall(circuit);
  if (!circuitCheck.allowed) {
    return {
      success: false,
      error: circuitCheck.reason,
      attempts: 0,
      circuitState: "open",
      tokenBudgetStatus: "ok",
      durationMs: Date.now() - start,
    };
  }

  // 2. Token budget check
  if (estimatedTokens) {
    const budgetCheck = tokenBudget.checkBudget(estimatedTokens);
    if (!budgetCheck.allowed) {
      return {
        success: false,
        error: budgetCheck.message,
        attempts: 0,
        circuitState: circuitBreaker.getStatus(circuit.agentName).state,
        tokenBudgetStatus: budgetCheck.status,
        durationMs: Date.now() - start,
      };
    }
  }

  // 3. Retry loop con feedback estructurado
  let lastError = "";
  let lastFeedback: RetryFeedback | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Ejecutar con timeout
      const result = await Promise.race([
        fn(lastFeedback),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout: ${circuit.agentName} no respondió en ${circuit.timeoutMs}ms`)), circuit.timeoutMs)
        ),
      ]);

      // 4. Validar output
      if (validateOutput && !validateOutput(result)) {
        lastError = "Output validation failed: el agente retornó datos que no cumplen el schema";
        lastFeedback = {
          attempt,
          previousError: {
            type: "validation_error",
            message: lastError,
            suggestedFix: "Asegúrate de devolver JSON válido que cumpla exactamente con el schema especificado.",
          },
        };

        if (attempt < maxRetries) {
          onRetry?.(attempt, lastError);
          continue;
        }
        break;
      }

      // Éxito
      circuitBreaker.recordSuccess(circuit.agentName);

      // Registrar tokens si disponible
      if (estimatedTokens) {
        tokenBudget.recordUsage(estimatedTokens);
      }

      return {
        success: true,
        data: result,
        attempts: attempt,
        circuitState: "closed",
        tokenBudgetStatus: tokenBudget.checkBudget(0).status,
        durationMs: Date.now() - start,
      };

    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);

      // Construir feedback estructurado para el siguiente intento
      const isTimeout = lastError.includes("Timeout");
      const isParseError = lastError.includes("JSON") || lastError.includes("parse");
      const statusMatch = lastError.match(/(\d{3})/);

      lastFeedback = {
        attempt,
        previousError: {
          type: isTimeout ? "timeout" : isParseError ? "parse_error" : "api_error",
          message: lastError.slice(0, 300),
          statusCode: statusMatch ? parseInt(statusMatch[1]) : undefined,
          suggestedFix: isTimeout
            ? "Reduce la complejidad del input o el tamaño del contexto."
            : isParseError
              ? "Responde SOLO con JSON válido, sin texto adicional."
              : "Revisa la configuración de la API key y los parámetros.",
        },
        hint: attempt >= 2
          ? `Este es el intento ${attempt} de ${maxRetries}. Si falla de nuevo, se escala al Orchestrator.`
          : undefined,
      };

      if (attempt < maxRetries) {
        onRetry?.(attempt, lastError);
      }
    }
  }

  // Todos los intentos fallaron → registrar fallo en circuit breaker
  const newState = circuitBreaker.recordFailure(circuit);
  if (newState === "open") {
    onCircuitOpen?.(circuit.agentName);
  }

  return {
    success: false,
    error: `${circuit.agentName} falló después de ${maxRetries} intentos. Último error: ${lastError}`,
    attempts: maxRetries,
    circuitState: newState,
    tokenBudgetStatus: tokenBudget.checkBudget(0).status,
    durationMs: Date.now() - start,
  };
}

// ── Configuraciones predefinidas por agente ──────────────────────────────────

export const AGENT_CIRCUITS: Record<string, CircuitBreakerConfig> = {
  "phv-calculator": {
    agentName: "phv-calculator",
    failureThreshold: 5,
    cooldownMs: 30_000,     // 30s — agente rápido
    timeoutMs: 10_000,      // 10s
  },
  "scout-insight": {
    agentName: "scout-insight",
    failureThreshold: 5,
    cooldownMs: 30_000,
    timeoutMs: 10_000,
  },
  "role-profile": {
    agentName: "role-profile",
    failureThreshold: 4,
    cooldownMs: 60_000,     // 60s
    timeoutMs: 15_000,
  },
  "tactical-label": {
    agentName: "tactical-label",
    failureThreshold: 5,
    cooldownMs: 30_000,
    timeoutMs: 10_000,
  },
  "video-intelligence": {
    agentName: "video-intelligence",
    failureThreshold: 3,     // Menos tolerante — es costoso
    cooldownMs: 120_000,     // 2min
    timeoutMs: 90_000,       // 90s — streaming largo
  },
  "video-observation": {
    agentName: "video-observation",
    failureThreshold: 3,
    cooldownMs: 120_000,
    timeoutMs: 120_000,      // 2min — video grande
  },
  "team-intelligence": {
    agentName: "team-intelligence",
    failureThreshold: 3,
    cooldownMs: 120_000,
    timeoutMs: 90_000,
  },
  "team-observation": {
    agentName: "team-observation",
    failureThreshold: 3,
    cooldownMs: 120_000,
    timeoutMs: 120_000,
  },
};

// ── Singletons ────────────────────────────────────────────────────────────────

export const circuitBreaker = new CircuitBreakerManager();
export const tokenBudget = new TokenBudgetService();
