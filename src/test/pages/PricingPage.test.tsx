/**
 * PricingPage — Tests
 * Verifica renderizado de planes, comparativa competidores, testimonios,
 * navegación de CTAs y FAQ.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("framer-motion", () => {
  const motion = new Proxy({}, {
    get: (_target, prop: string) => {
      return ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => {
        const Tag = prop as keyof JSX.IntrinsicElements;
        return <Tag {...props}>{children}</Tag>;
      };
    },
  });
  return { motion, AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
});

import PricingPage from "@/pages/PricingPage";

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <PricingPage />
    </MemoryRouter>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PricingPage", () => {
  describe("hero", () => {
    it("muestra título principal", () => {
      renderPage();
      expect(screen.getByText(/scouting de élite/i)).toBeInTheDocument();
    });

    it("incluye propuesta de valor sin hardware", () => {
      renderPage();
      expect(screen.getAllByText(/sin hardware/i).length).toBeGreaterThan(0);
    });
  });

  describe("planes", () => {
    it("renderiza los tres planes (Free, Pro, Club)", () => {
      renderPage();
      expect(screen.getByText("Free")).toBeInTheDocument();
      expect(screen.getByText("Pro")).toBeInTheDocument();
      expect(screen.getByText("Club")).toBeInTheDocument();
    });

    it("muestra precios reales de subscriptionService", () => {
      renderPage();
      // free=0, pro=19, club=79
      expect(screen.getByText("€0")).toBeInTheDocument();
      expect(screen.getByText("€19")).toBeInTheDocument();
      expect(screen.getByText("€79")).toBeInTheDocument();
    });

    it("marca Pro como plan destacado", () => {
      renderPage();
      expect(screen.getByText(/más elegido/i)).toBeInTheDocument();
    });

    it("muestra límites de jugadores por plan", () => {
      renderPage();
      // Al menos debe aparecer "Jugadores registrables" en cada plan
      expect(screen.getAllByText(/jugadores registrables/i).length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("competidores", () => {
    it("muestra tabla comparativa con VITAS, Wyscout, Hudl, InStat", () => {
      renderPage();
      expect(screen.getAllByText(/vitas/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/wyscout/i)).toBeInTheDocument();
      expect(screen.getByText(/hudl/i)).toBeInTheDocument();
      expect(screen.getByText(/instat/i)).toBeInTheDocument();
    });

    it("incluye feature ajuste PHV como diferencial", () => {
      renderPage();
      expect(screen.getAllByText(/ajuste biológico phv/i).length).toBeGreaterThan(0);
    });

    it("incluye nota de datos orientativos", () => {
      renderPage();
      expect(screen.getByText(/datos basados en planes públicos/i)).toBeInTheDocument();
    });
  });

  describe("testimonios", () => {
    it("renderiza sección de testimonios", () => {
      renderPage();
      expect(screen.getByText(/lo que dicen clubes/i)).toBeInTheDocument();
    });

    it("usa placeholders no inventa nombres reales", () => {
      renderPage();
      // Todos los testimonios tienen "[Pendiente..." como guard contra datos inventados
      const placeholders = screen.getAllByText(/\[pendiente de testimonio real\]/i);
      expect(placeholders.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("case studies", () => {
    it("renderiza sección de casos de uso", () => {
      renderPage();
      expect(screen.getByText(/casos de uso reales/i)).toBeInTheDocument();
    });

    it("usa placeholders para clientes pendientes", () => {
      renderPage();
      const pendings = screen.getAllByText(/\[cliente pendiente\]/i);
      expect(pendings.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("FAQ", () => {
    it("incluye pregunta sobre hardware", () => {
      renderPage();
      expect(screen.getByText(/necesito gps o cámaras/i)).toBeInTheDocument();
    });

    it("incluye pregunta sobre PHV", () => {
      renderPage();
      expect(screen.getByText(/qué es el ajuste phv/i)).toBeInTheDocument();
    });

    it("incluye pregunta sobre permanencia", () => {
      renderPage();
      expect(screen.getByText(/hay permanencia/i)).toBeInTheDocument();
    });
  });

  describe("navegación", () => {
    it("botón 'Empezar gratis' del header navega a /register", () => {
      renderPage();
      const btns = screen.getAllByRole("button", { name: /empezar gratis/i });
      fireEvent.click(btns[0]);
      expect(mockNavigate).toHaveBeenCalledWith("/register");
    });

    it("botón 'Iniciar sesión' navega a /login", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /iniciar sesión/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });

    it("enlaces a términos y privacidad funcionan", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /^términos$/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/terms");
      fireEvent.click(screen.getByRole("button", { name: /^privacidad$/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/privacy");
    });
  });
});
