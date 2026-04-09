/**
 * SettingsPage — Tests
 * Secciones, cuenta, idioma, tema, sign out
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

const mockChangeLanguage = vi.fn();
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "es", changeLanguage: mockChangeLanguage },
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
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const mockSignOut = vi.fn().mockResolvedValue(undefined);
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { email: "scout@vitas.com" },
    signOut: mockSignOut,
  }),
}));

const mockSetTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: mockSetTheme }),
}));

vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({
    plan: "pro",
    playerCount: 15,
    analysesUsed: 8,
    limits: { players: 50, analyses: 100 },
    isAdmin: false,
  }),
}));

vi.mock("@/services/real/subscriptionService", () => ({
  PLAN_LABELS: { free: "Free", pro: "Pro", club: "Club" },
}));

vi.mock("@/services/real/storageService", () => ({
  StorageService: {
    get: (_key: string, defaults: any) => defaults,
    set: vi.fn(),
  },
}));

vi.mock("@/services/real/pushNotificationService", () => ({
  PushNotificationService: {
    getPermission: () => Promise.resolve("default"),
    requestPermission: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}));

vi.mock("@/services/real/backupService", () => ({
  BackupService: {
    downloadBackup: vi.fn(),
    readFile: vi.fn(),
    import: vi.fn(),
  },
}));

import SettingsPage from "@/pages/SettingsPage";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza secciones principales", () => {
    render(<SettingsPage />);
    expect(screen.getByText("settings.account")).toBeDefined();
    expect(screen.getByText("settings.plan")).toBeDefined();
    expect(screen.getByText("settings.general")).toBeDefined();
    expect(screen.getByText("settings.security")).toBeDefined();
    expect(screen.getByText("settings.data")).toBeDefined();
    expect(screen.getByText("settings.backup")).toBeDefined();
  });

  it("muestra email del usuario en seccion cuenta", () => {
    render(<SettingsPage />);
    expect(screen.getByText("scout@vitas.com")).toBeDefined();
  });

  it("toggle de idioma llama changeLanguage", () => {
    render(<SettingsPage />);
    const langBtn = screen.getByText("settings.language").closest("button")!;
    fireEvent.click(langBtn);
    expect(mockChangeLanguage).toHaveBeenCalledWith("en");
  });

  it("toggle de tema llama setTheme", () => {
    render(<SettingsPage />);
    const themeBtn = screen.getByText("settings.theme").closest("button")!;
    fireEvent.click(themeBtn);
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  it("boton sign out ejecuta signOut", () => {
    render(<SettingsPage />);
    const signOutBtn = screen.getByText("settings.signOut");
    fireEvent.click(signOutBtn);
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("muestra plan actual", () => {
    render(<SettingsPage />);
    expect(screen.getByText("Pro")).toBeDefined();
  });
});
