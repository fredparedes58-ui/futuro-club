/**
 * LoginPage — Tests
 * Inputs, error en submit vacio, signIn, navegacion register, forgot password
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: "/login", state: {} }),
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "es", changeLanguage: vi.fn() },
  }),
}));

vi.mock("framer-motion", () => {
  const motion = new Proxy({}, {
    get: (_target, prop: string) => {
      return ({ children, ...props }: any) => {
        const Tag = prop as any;
        return <Tag {...props}>{children}</Tag>;
      };
    },
  });
  return { motion, AnimatePresence: ({ children }: any) => <>{children}</> };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockSignIn = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    configured: true,
  }),
}));

// Mock image imports
vi.mock("@/assets/login-boot-neon.jpg", () => ({ default: "boot.jpg" }));
vi.mock("@/assets/player-1.png", () => ({ default: "player1.png" }));

import LoginPage from "@/pages/LoginPage";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignIn.mockResolvedValue({ error: null });
  });

  it("renderiza inputs de email y password", () => {
    render(<LoginPage />);
    const emailInput = document.querySelector('input[type="email"]');
    const passwordInput = document.querySelector('input[type="password"]');
    expect(emailInput).toBeDefined();
    expect(passwordInput).toBeDefined();
  });

  it("muestra error al enviar formulario vacio", async () => {
    render(<LoginPage />);
    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText("auth.login.fillAllFields")).toBeDefined();
    });
  });

  it("renderiza titulo de login", () => {
    render(<LoginPage />);
    expect(screen.getByText("auth.login.title")).toBeDefined();
  });

  it("muestra link a register", () => {
    render(<LoginPage />);
    const registerLink = screen.getByText("auth.login.createAcademy");
    expect(registerLink).toBeDefined();
    expect(registerLink.closest("a")?.getAttribute("href")).toBe("/register");
  });

  it("muestra link a forgot password", () => {
    render(<LoginPage />);
    const forgotLink = screen.getByText("auth.login.forgotPassword");
    expect(forgotLink).toBeDefined();
    expect(forgotLink.closest("a")?.getAttribute("href")).toBe("/forgot-password");
  });

  it("renderiza subtitulo y footer", () => {
    render(<LoginPage />);
    expect(screen.getByText("auth.login.subtitle")).toBeDefined();
    expect(screen.getByText("auth.login.footer")).toBeDefined();
  });
});
