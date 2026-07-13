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

// PricingPage now calls useAuth() to route paid CTAs (logged-out → /register,
// logged-in → /billing). Mock it as a logged-out visitor (the public-page
// scenario) so we don't need the full AuthProvider/Supabase stack.
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

import PricingPage from "@/pages/PricingPage";

// ── i18n ─────────────────────────────────────────────────────────────────────
// PricingPage migrated to react-i18next; its t() returns raw keys unless an
// i18next instance is provided. Build a dedicated instance pinned to "es"
// (no LanguageDetector → deterministic) loaded with the real translations, so
// assertions can target the actual Spanish copy the user sees.
import { I18nextProvider, initReactI18next } from "react-i18next";
import { createInstance } from "i18next";
import esTranslations from "@/i18n/es.json";

const testI18n = createInstance();
testI18n.use(initReactI18next).init({
  resources: { es: { translation: esTranslations } },
  lng: "es",
  fallbackLng: "es",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <I18nextProvider i18n={testI18n}>
      <MemoryRouter initialEntries={["/pricing"]}>
        <PricingPage />
      </MemoryRouter>
    </I18nextProvider>
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
    // La página ahora filtra testimonios con plantillas "[…]" y solo renderiza
    // la sección si hay testimonios reales (PricingPage.tsx:189-191,329). Con
    // todos los testimonios en placeholder, la sección NO debe aparecer para no
    // mostrar reseñas falsas a visitantes de la página pública.
    it("oculta la sección de testimonios mientras solo hay plantillas", () => {
      renderPage();
      expect(screen.queryByText(/lo que dicen clubes/i)).not.toBeInTheDocument();
    });

    it("no muestra placeholders de testimonio al visitante", () => {
      renderPage();
      // Guard contra datos inventados: los placeholders "[Pendiente…]" nunca
      // deben renderizarse en la página pública.
      expect(screen.queryAllByText(/\[pendiente de testimonio real\]/i)).toHaveLength(0);
    });
  });

  describe("case studies", () => {
    // Igual que testimonios: la sección de casos se filtra por plantillas y solo
    // se renderiza con casos reales (PricingPage.tsx:192-194,370).
    it("oculta la sección de casos mientras solo hay plantillas", () => {
      renderPage();
      expect(screen.queryByText(/casos de uso reales/i)).not.toBeInTheDocument();
    });

    it("no muestra placeholders de cliente pendiente al visitante", () => {
      renderPage();
      expect(screen.queryAllByText(/\[cliente pendiente\]/i)).toHaveLength(0);
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
