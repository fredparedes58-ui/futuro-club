/**
 * BottomNav — Tests
 * Renderizado de items, visibilidad por ruta, menú de usuario, sign out
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockLocation = { pathname: "/pulse", state: {} };

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
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
  toast: { success: vi.fn(), warning: vi.fn() },
}));

const mockSignOut = vi.fn().mockResolvedValue(undefined);
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { email: "test@vitas.com", user_metadata: { display_name: "Test" } },
    signOut: mockSignOut,
    configured: true,
  }),
  getUserInitials: () => "TE",
}));

const mockUsePlan = vi.fn();
vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => mockUsePlan(),
}));

vi.mock("@/hooks/useSupabaseSync", () => ({
  useSupabaseSync: () => ({ online: true, syncing: false, pending: 0 }),
}));

import BottomNav from "@/components/BottomNav";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("BottomNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.pathname = "/pulse";
    mockUsePlan.mockReturnValue({ isClub: false, plan: "free", isAdmin: false });
  });

  it("renderiza 5 nav items base", () => {
    render(<BottomNav />);
    expect(screen.getByText("nav.pulse")).toBeDefined();
    expect(screen.getByText("nav.videos")).toBeDefined();
    expect(screen.getByText("nav.scout")).toBeDefined();
    expect(screen.getByText("nav.lab")).toBeDefined();
    expect(screen.getByText("nav.rankings")).toBeDefined();
  });

  it("renderiza 6 items cuando isClub es true (incluye Team)", () => {
    mockUsePlan.mockReturnValue({ isClub: true, plan: "club", isAdmin: false });
    render(<BottomNav />);
    expect(screen.getByText("nav.team")).toBeDefined();
  });

  it("se oculta en ruta /login", () => {
    mockLocation.pathname = "/login";
    const { container } = render(<BottomNav />);
    expect(container.innerHTML).toBe("");
  });

  it("se oculta en ruta /register", () => {
    mockLocation.pathname = "/register";
    const { container } = render(<BottomNav />);
    expect(container.innerHTML).toBe("");
  });

  it("muestra menu de usuario al hacer click en avatar", () => {
    render(<BottomNav />);
    // El avatar muestra "TE" (initials)
    const avatarBtn = screen.getByText("TE").closest("button")!;
    fireEvent.click(avatarBtn);
    // User menu should now show email
    expect(screen.getByText("test@vitas.com")).toBeDefined();
  });

  it("ejecuta sign out desde el menu", async () => {
    render(<BottomNav />);
    const avatarBtn = screen.getByText("TE").closest("button")!;
    fireEvent.click(avatarBtn);
    const signOutBtn = screen.getByText("settings.signOut");
    fireEvent.click(signOutBtn);
    expect(mockSignOut).toHaveBeenCalled();
  });
});
