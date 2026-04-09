/**
 * VITAS · Tests — ErrorDiagnosticService
 * Verifica: diagnoseError, getErrorMessage, getErrorDetails
 */
import { describe, it, expect } from "vitest";
import {
  diagnoseError,
  getErrorMessage,
  getErrorDetails,
} from "@/services/errorDiagnosticService";

// ── diagnoseError ──────────────────────────────────────────────────────────────

describe("diagnoseError", () => {
  // ── Upload / Bunny ─────────────────────────────────────────────────────────

  it("detecta error de autenticación Bunny (401)", () => {
    const d = diagnoseError(new Error("Upload failed 401"));
    expect(d.code).toBe("BUNNY_AUTH_FAILED");
    expect(d.category).toBe("upload");
    expect(d.retryable).toBe(true);
  });

  it("detecta rate limit Bunny (429)", () => {
    const d = diagnoseError(new Error("Upload failed 429"));
    expect(d.code).toBe("BUNNY_RATE_LIMIT");
    expect(d.category).toBe("upload");
    expect(d.retryable).toBe(true);
  });

  it("detecta error de servidor Bunny (500)", () => {
    const d = diagnoseError(new Error("Upload failed 500"));
    expect(d.code).toBe("BUNNY_SERVER_ERROR");
    expect(d.category).toBe("upload");
    expect(d.retryable).toBe(true);
  });

  it("detecta error de red XHR", () => {
    const d = diagnoseError(new Error("XHR network error"));
    expect(d.code).toBe("NETWORK_ERROR");
    expect(d.category).toBe("upload");
    expect(d.retryable).toBe(true);
  });

  it("detecta upload cancelado con severidad info", () => {
    const d = diagnoseError(new Error("Upload cancelled"));
    expect(d.code).toBe("UPLOAD_CANCELLED");
    expect(d.category).toBe("upload");
    expect(d.severity).toBe("info");
  });

  // ── Video / Reproducción ───────────────────────────────────────────────────

  it("detecta MEDIA_ELEMENT_ERROR code 4 como video expirado", () => {
    const d = diagnoseError(new Error("MEDIA_ELEMENT_ERROR code 4"));
    expect(d.code).toBe("VIDEO_SOURCE_EXPIRED");
    expect(d.category).toBe("video");
    expect(d.retryable).toBe(false);
  });

  it("detecta video demasiado grande", () => {
    const d = diagnoseError(new Error("Video demasiado grande"));
    expect(d.code).toBe("VIDEO_TOO_LARGE");
    expect(d.category).toBe("video");
    expect(d.retryable).toBe(false);
  });

  // ── APIs / Gemini / Claude ─────────────────────────────────────────────────

  it("detecta GEMINI_API_KEY no configurada", () => {
    const d = diagnoseError(new Error("GEMINI_API_KEY no configurada"));
    expect(d.code).toBe("GEMINI_NOT_CONFIGURED");
    expect(d.category).toBe("api");
    expect(d.retryable).toBe(false);
  });

  it("detecta ANTHROPIC_API_KEY no configurada", () => {
    const d = diagnoseError(new Error("ANTHROPIC_API_KEY no configurada"));
    expect(d.code).toBe("CLAUDE_NOT_CONFIGURED");
    expect(d.category).toBe("api");
  });

  it("detecta cuota de Gemini (429)", () => {
    const d = diagnoseError(new Error("Gemini API error 429"));
    expect(d.code).toBe("GEMINI_QUOTA");
    expect(d.category).toBe("api");
    expect(d.retryable).toBe(true);
  });

  it("detecta respuesta vacía de Gemini", () => {
    const d = diagnoseError(new Error("Gemini no retornó respuesta"));
    expect(d.code).toBe("GEMINI_EMPTY_RESPONSE");
    expect(d.retryable).toBe(true);
  });

  it("detecta error de parseo de Gemini", () => {
    const d = diagnoseError(new Error("No se pudo parsear respuesta Gemini"));
    expect(d.code).toBe("GEMINI_PARSE_ERROR");
    expect(d.retryable).toBe(true);
  });

  it("detecta stream de Claude terminado sin resultado", () => {
    const d = diagnoseError(new Error("stream terminó sin resultado"));
    expect(d.code).toBe("CLAUDE_STREAM_FAILED");
    expect(d.retryable).toBe(true);
  });

  // ── Auth ───────────────────────────────────────────────────────────────────

  it("detecta Supabase no configurado", () => {
    const d = diagnoseError(new Error("Supabase no configurado"));
    expect(d.code).toBe("SUPABASE_NOT_CONFIGURED");
    expect(d.category).toBe("auth");
  });

  it("detecta credenciales de login inválidas", () => {
    const d = diagnoseError(new Error("Invalid login credentials"));
    expect(d.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(d.category).toBe("auth");
  });

  it("detecta email no confirmado", () => {
    const d = diagnoseError(new Error("Email not confirmed"));
    expect(d.code).toBe("AUTH_EMAIL_NOT_CONFIRMED");
    expect(d.category).toBe("auth");
  });

  // ── Supabase / RLS ────────────────────────────────────────────────────────

  it("detecta error de row-level security", () => {
    const d = diagnoseError(new Error("row-level security"));
    expect(d.code).toBe("SUPABASE_RLS");
    expect(d.category).toBe("supabase");
  });

  it("detecta tabla inexistente (relation does not exist)", () => {
    const d = diagnoseError(new Error("relation does not exist"));
    expect(d.code).toBe("SUPABASE_TABLE_MISSING");
    expect(d.category).toBe("supabase");
  });

  // ── Billing / Stripe ──────────────────────────────────────────────────────

  it("detecta Stripe no configurado", () => {
    const d = diagnoseError(new Error("Stripe no configurado"));
    expect(d.code).toBe("STRIPE_NOT_CONFIGURED");
    expect(d.category).toBe("billing");
  });

  // ── Resiliencia ────────────────────────────────────────────────────────────

  it("detecta circuit breaker abierto", () => {
    const d = diagnoseError(new Error("Circuit OPEN for agent"));
    expect(d.code).toBe("CIRCUIT_BREAKER_OPEN");
    expect(d.retryable).toBe(true);
  });

  // ── RAG Security ──────────────────────────────────────────────────────────

  it("detecta inyección de prompt bloqueada", () => {
    const d = diagnoseError(new Error("prompt injection detected BLOQUEADO"));
    expect(d.code).toBe("RAG_INJECTION_BLOCKED");
    expect(d.retryable).toBe(false);
  });

  // ── Validación Semántica ──────────────────────────────────────────────────

  it("detecta validación semántica fallida", () => {
    const d = diagnoseError(new Error("VALIDACIÓN SEMÁNTICA FALLIDA"));
    expect(d.code).toBe("REPORT_SEMANTIC_INVALID");
    expect(d.retryable).toBe(true);
  });

  // ── Fallback ──────────────────────────────────────────────────────────────

  it("retorna UNKNOWN_ERROR para errores no reconocidos", () => {
    const d = diagnoseError(new Error("some unknown random error xyz"));
    expect(d.code).toBe("UNKNOWN_ERROR");
    expect(d.category).toBe("unknown");
    expect(d.retryable).toBe(true);
  });

  it("diagnostica strings planos (no solo objetos Error)", () => {
    const d = diagnoseError("some string");
    expect(d.code).toBe("UNKNOWN_ERROR");
    expect(d.category).toBe("unknown");
  });

  it("diagnostica null con fallback", () => {
    const d = diagnoseError(null);
    expect(d.code).toBe("UNKNOWN_ERROR");
    expect(d.category).toBe("unknown");
  });

  it("lanza error al recibir undefined (JSON.stringify retorna undefined)", () => {
    expect(() => diagnoseError(undefined)).toThrow();
  });
});

// ── getErrorMessage ────────────────────────────────────────────────────────────

describe("getErrorMessage", () => {
  it("retorna el título del diagnóstico para un error conocido", () => {
    const msg = getErrorMessage(new Error("Upload failed 401"));
    expect(msg).toBe("Error de autenticación con el servidor de video");
  });

  it("retorna título fallback para un error desconocido", () => {
    const msg = getErrorMessage(new Error("something totally unknown"));
    expect(msg).toBe("Error inesperado");
  });
});

// ── getErrorDetails ────────────────────────────────────────────────────────────

describe("getErrorDetails", () => {
  it("retorna título, descripción y retryable para error conocido", () => {
    const details = getErrorDetails(new Error("Gemini API error 429"));
    expect(details.title).toBe("Límite de análisis de Gemini alcanzado");
    expect(details.retryable).toBe(true);
    expect(details.description).toBeTruthy();
  });

  it("usa diagnosis.action como description", () => {
    const details = getErrorDetails(new Error("Upload failed 429"));
    expect(details.description).toBe("Espera unos segundos y vuelve a intentar.");
  });

  it("retryable coincide con la regla del diagnóstico", () => {
    const retryableDetails = getErrorDetails(new Error("XHR network error"));
    expect(retryableDetails.retryable).toBe(true);

    const nonRetryableDetails = getErrorDetails(new Error("Video demasiado grande"));
    expect(nonRetryableDetails.retryable).toBe(false);
  });
});
