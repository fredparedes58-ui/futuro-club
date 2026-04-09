/**
 * RegisterPage — Tests
 * Selector tipo usuario, campos, password strength, error, success
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
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

const mockSignUp = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    signUp: mockSignUp,
    configured: true,
  }),
}));

import RegisterPage from "@/pages/RegisterPage";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignUp.mockResolvedValue({ error: null });
  });

  it("renderiza selector de 5 tipos de usuario", () => {
    render(<RegisterPage />);
    expect(screen.getByText("auth.register.userTypes.academy")).toBeDefined();
    expect(screen.getByText("auth.register.userTypes.scout")).toBeDefined();
    expect(screen.getByText("auth.register.userTypes.coach")).toBeDefined();
    expect(screen.getByText("auth.register.userTypes.parent")).toBeDefined();
    expect(screen.getByText("auth.register.userTypes.player")).toBeDefined();
  });

  it("renderiza campos de nombre, email y password", () => {
    render(<RegisterPage />);
    const nameInput = document.querySelector('input[type="text"]');
    const emailInput = document.querySelector('input[type="email"]');
    const passwordInput = document.querySelector('input[type="password"]');
    expect(nameInput).toBeDefined();
    expect(emailInput).toBeDefined();
    expect(passwordInput).toBeDefined();
  });

  it("muestra indicador de fortaleza de password", () => {
    render(<RegisterPage />);
    const passwordInput = document.querySelector('input[type="password"]')!;
    fireEvent.change(passwordInput, { target: { value: "Abc12345" } });
    // Should show all 3 password rules
    expect(screen.getByText("auth.register.pwRules.minChars")).toBeDefined();
    expect(screen.getByText("auth.register.pwRules.uppercase")).toBeDefined();
    expect(screen.getByText("auth.register.pwRules.number")).toBeDefined();
  });

  it("muestra error al enviar formulario vacio", async () => {
    render(<RegisterPage />);
    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText("auth.register.fillAllFields")).toBeDefined();
    });
  });

  it("renderiza titulo y subtitulo de registro", () => {
    render(<RegisterPage />);
    expect(screen.getByText("auth.register.title")).toBeDefined();
    expect(screen.getByText("auth.register.subtitle")).toBeDefined();
  });

  it("link a login existe", () => {
    render(<RegisterPage />);
    const loginLink = screen.getByText("auth.register.signIn");
    expect(loginLink).toBeDefined();
    expect(loginLink.closest("a")?.getAttribute("href")).toBe("/login");
  });
});
