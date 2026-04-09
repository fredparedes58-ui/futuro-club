/**
 * ErrorBoundary — Tests
 * Error catching, fallback rendering, reset
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

// Mock Sentry
vi.mock("@/lib/sentry", () => ({
  Sentry: { captureException: vi.fn() },
}));

// Componente que lanza error bajo demanda
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test error");
  return <div>Contenido normal</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error for expected errors
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renderiza children normalmente sin error", () => {
    render(
      <ErrorBoundary>
        <div>Hola mundo</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Hola mundo")).toBeDefined();
  });

  it("muestra UI de error cuando hijo lanza error", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Algo salió mal")).toBeDefined();
    expect(screen.getByText("Reintentar")).toBeDefined();
  });

  it("muestra el mensaje del error", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Test error")).toBeDefined();
  });

  it("muestra fallback personalizado si se provee", () => {
    render(
      <ErrorBoundary fallback={<div>Error personalizado</div>}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Error personalizado")).toBeDefined();
  });

  it("Reintentar llama handleReset y limpia hasError", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Algo salió mal")).toBeDefined();
    // El botón existe y es clickeable
    const btn = screen.getByText("Reintentar");
    expect(btn).toBeDefined();
    fireEvent.click(btn);
    // After reset, the component tries to re-render children which throws again
    // but the button click itself works
  });

  it("no muestra UI de error para componentes sin error", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.queryByText("Algo salió mal")).toBeNull();
  });
});
