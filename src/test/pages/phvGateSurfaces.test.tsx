/**
 * VITAS · Gate único de PHV en las superficies (regla del owner 28-sep)
 *
 * «Si no están todas las métricas para PHV no se puede calcular»: la impresión
 * del Hub, la lista del equipo y el comparador NO rotulan Pre/En/Post-PHV ni
 * precoz/tardío sin TODAS las entradas introducidas (talla, peso, talla sentado,
 * pierna, fecha de nacimiento → edad decimal, sexo). Nombran qué falta. El
 * phvCategory PERSISTIDO (caso Samu: «early», −1.2) no cuenta.
 *
 * Antes (origin/main): PlayerHubPrint.tsx:67-68 imprimía el estado de
 * playerMaturity con edad entera y pierna/sentado estimados; TeamPage.tsx:331
 * pintaba el phvCategory persistido; PlayerComparison.tsx:258-263/277-281 sumaba
 * +5 fijo por phvCategory "early".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// ── i18n: devuelve la clave (+ la lista interpolada del gate) ────────────────
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && typeof opts.list === "string" ? `${key}[${opts.list}]` : key,
    i18n: { language: "es", changeLanguage: vi.fn() },
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: "samu" }),
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock("framer-motion", () => {
  const motion = new Proxy({}, {
    get: (_t, prop: string) => {
      const C =({ children, variants: _v, initial: _i, animate: _a, whileHover: _h, whileTap: _w, transition: _tr, ...props }: any) => {
        const Tag = prop as keyof JSX.IntrinsicElements;
        return <Tag {...props}>{children}</Tag>;
      };
      return C;
    },
  });
  return { motion, AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</> };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// ── Datos: Samu (sin medidas PHV, categoría persistida naive) + completo ─────
const SAMU = {
  id: "samu", name: "Samu", age: 9, position: "Delantero", foot: "right",
  height: 135, weight: 30, gender: "M", competitiveLevel: "Regional", minutesPlayed: 300,
  vsi: 67.4, vsiHistory: [57.5, 67.4],
  metrics: { speed: 70, technique: 70, vision: 65, stamina: 65, shooting: 60, defending: 55 },
  phvCategory: "early", phvOffset: -1.2,
  createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z",
};
const COMPLETE = {
  id: "full", name: "Completo", age: 14, position: "Mediocentro", foot: "right",
  height: 165, weight: 55, sittingHeight: 85, legLength: 80, birthDate: "2012-03-15", gender: "M",
  competitiveLevel: "Regional", minutesPlayed: 600, vsi: 60, vsiHistory: [60],
  metrics: { speed: 60, technique: 60, vision: 60, stamina: 60, shooting: 60, defending: 60 },
  createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z",
};
let PLAYERS: Array<Record<string, unknown>> = [];

// getAll/sort devuelven los jugadores CRUDOS (con el phvCategory persistido): así
// se prueba que cada PÁGINA gatea por sí misma, no solo el saneado del servicio.
vi.mock("@/services/real/playerService", () => ({
  PlayerService: {
    getAll: () => PLAYERS,
    getById: (id: string) => PLAYERS.find((p) => p.id === id) ?? null,
    sort: (ps: unknown[]) => ps,
  },
}));

// ── Página de equipo: guards y hooks de equipo neutros ───────────────────────
vi.mock("@/components/RoleGuard", () => ({ RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/components/PlanGuard", () => ({ PlanGuard: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "coach-1" } }) }));
vi.mock("@/hooks/useUserProfile", () => ({ useUserProfile: () => ({ profile: null, isDirector: false }) }));
vi.mock("@/hooks/useTeam", () => {
  const q = () => ({ data: [], isLoading: false });
  const m = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    useTeamMembers: q, useTeamInvitations: q,
    useInviteMember: m, useRemoveMember: m, useCancelInvitation: m,
  };
});
vi.mock("@/components/illustrations/EmptyIllustrations", () => ({ EmptyPlayers: () => null }));

// ── Comparador: dependencias pesadas neutras ─────────────────────────────────
let ALL_ADAPTED: Array<Record<string, unknown>> = [];
vi.mock("@/hooks/usePlayers", () => ({
  useAllPlayers: () => ({ data: ALL_ADAPTED, isLoading: false }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null }) }));
vi.mock("@/services/real/similarityService", () => ({
  findSimilarPlayers: vi.fn(), scoreToBadge: () => "—",
}));
vi.mock("@/hooks/useMatchEvents", () => ({ useMatchEvents: () => ({ data: [] }) }));
vi.mock("@/hooks/usePlayerAnalysisV2", () => ({ useSavedAnalysesV2: () => ({ data: [] }) }));
vi.mock("@/components/RadarChart", () => ({ default: () => null }));
vi.mock("@/components/VsiGauge", () => ({ default: ({ value }: { value: number }) => <span>{value}</span> }));
vi.mock("@/components/VitasCard", () => ({ default: () => null }));
vi.mock("@/components/DemoDataBanner", () => ({ default: () => null }));
vi.mock("@/components/shared/Skeletons", () => ({ PlayerListSkeleton: () => null }));
vi.mock("recharts", () => {
  const N = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return { ResponsiveContainer: N, RadarChart: N, PolarGrid: N, PolarAngleAxis: N, Radar: N, Legend: N };
});

import { adaptPlayerForUI } from "@/services/real/adapters";
import { phvGate } from "@/lib/phv/phvGate";
import PlayerHubPrint from "@/pages/PlayerHubPrint";
import TeamPage from "@/pages/TeamPage";
import PlayerComparison from "@/pages/PlayerComparison";

const GATE_UNAVAILABLE = "maturity.gate.unavailable";

beforeEach(() => {
  PLAYERS = [];
  ALL_ADAPTED = [];
});

describe("PlayerHubPrint · maduración solo con el gate abierto", () => {
  it("Samu (sin talla sentado, pierna ni fecha de nacimiento) → imprime qué falta, no «Pre-PHV»", () => {
    PLAYERS = [SAMU];
    render(<PlayerHubPrint />);
    const body = document.body.textContent ?? "";
    expect(body).toContain(GATE_UNAVAILABLE);
    expect(body).toContain("maturity.gate.missing[maturity.gate.input.sittingHeight, maturity.gate.input.legLength, maturity.gate.input.birthDate]");
    expect(body).not.toContain("maturity.status.pre_phv");
    expect(body).not.toContain("playerHubPrint.phvBodyPre");
  });

  it("con todas las entradas introducidas → imprime el estado del motor (sin aviso)", () => {
    PLAYERS = [{ ...COMPLETE, id: "samu" }];
    render(<PlayerHubPrint />);
    const g = phvGate(COMPLETE);
    expect(g.ok).toBe(true);
    const body = document.body.textContent ?? "";
    expect(body).not.toContain(GATE_UNAVAILABLE);
    expect(body).toMatch(/maturity\.status\.(pre_phv|circa_phv|post_phv)/);
  });
});

describe("TeamPage · lista de jugadores", () => {
  it("el phvCategory persistido «early» de Samu NO se rotula Pre-PHV: se nombra el gate", () => {
    PLAYERS = [SAMU];
    render(<TeamPage />);
    const notice = screen.getByTestId("phv-gate-notice");
    expect(notice.textContent).toContain(GATE_UNAVAILABLE);
    expect(notice.textContent).toContain("maturity.gate.input.birthDate");
    expect(screen.queryByText(/teamPage\.prePhv/)).toBeNull();
    expect(screen.queryByText("🟢", { exact: false })).toBeNull();
  });

  it("jugador completo → etapa por el gate (sin aviso)", () => {
    PLAYERS = [COMPLETE];
    render(<TeamPage />);
    expect(screen.queryByTestId("phv-gate-notice")).toBeNull();
    const g = phvGate(COMPLETE);
    if (!g.ok) throw new Error("gate cerrado");
    const key = g.category === "early" ? "teamPage.prePhv" : g.category === "late" ? "teamPage.postPhv" : "teamPage.inPhv";
    expect(document.body.textContent).toContain(key);
  });
});

describe("PlayerComparison · sin bonus PHV fijo y con el motivo del gate", () => {
  it("Samu vs completo: la etiqueta de Samu es el gate y la probabilidad NO suma +5", () => {
    PLAYERS = [SAMU, COMPLETE];
    // Aunque al comparador le llegara un phvCategory "early" persistido (p.ej. una
    // caché antigua), la página NO lo usa: ni etiqueta ni bonus.
    ALL_ADAPTED = [
      { ...adaptPlayerForUI(SAMU as never), phvCategory: "early" },
      adaptPlayerForUI(COMPLETE as never),
    ];
    render(<PlayerComparison />);
    const body = document.body.textContent ?? "";
    // Etiqueta PHV de Samu = motivo del gate (no «compare.phvLate» por su "early").
    expect(body).toContain(`${GATE_UNAVAILABLE} · maturity.gate.missing[`);
    expect(body).not.toContain("compare.phvLate");
    expect(body).not.toContain("playerComparison.maturationLate");
    // Ganador = Samu (VSI 67.4 > 60): 67.4 × 0.95 = 64.0 (antes 69.0 con el +5).
    expect(body).toContain("64.0%");
    expect(body).not.toContain("69.0%");
  });
});
