/**
 * RGPD · un menor cuya fecha de nacimiento se introduce en el Hub
 * (PlayerPhvSection) aparece en /admin/consent.
 *
 * Antes la fecha solo iba a players.data->>'birthDate'; ParentalConsentPage lee
 * la COLUMNA players.birth_date (`.not("birth_date","is",null)`) y el trigger de
 * 036 también ⇒ el menor nunca aparecía. Aquí el mismo Supabase en memoria recibe
 * el upsert del Hub y sirve la consulta de la página de consentimiento.
 * (El DEFAULT 'pending' de parental_consent_status es el de 036:11.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", async () => {
  const es = (await import("@/i18n/es.json")).default as Record<string, unknown>;
  const lookup = (k: string) =>
    k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown> | undefined)?.[p], es);
  return {
    useTranslation: () => ({
      t: (k: string) => (typeof lookup(k) === "string" ? (lookup(k) as string) : k),
      i18n: { language: "es" },
    }),
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ players: new Map<string, Record<string, unknown>>() }));

vi.mock("@/lib/supabase", () => ({
  SUPABASE_CONFIGURED: true,
  supabase: {
    from: (table: string) => {
      if (table === "players") {
        return {
          upsert: async (payload: Row) => {
            const prev = db.players.get(payload.id as string);
            // DEFAULT de 036:11 en el INSERT; el UPDATE conserva el estado previo.
            db.players.set(payload.id as string, {
              parental_consent_status: "pending",
              ...(prev ?? {}),
              ...payload,
            });
            return { error: null };
          },
          select: () => ({
            not: (col: string, op: string, val: null) => ({
              order: async (orderCol: string) => {
                expect([col, op, val]).toEqual(["birth_date", "is", null]);
                const data = [...db.players.values()]
                  .filter((r) => r[col] !== null && r[col] !== undefined)
                  .sort((a, b) => String(a[orderCol]).localeCompare(String(b[orderCol])));
                return { data, error: null };
              },
            }),
          }),
        };
      }
      // consent_audit_log
      return { select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    },
  },
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1", email: "coach@test" } }) }));
vi.mock("@/services/real/organizationService", () => ({ OrganizationService: { getOrgId: () => null } }));
vi.mock("@/services/real/agentService", () => ({ AgentService: { invalidateCacheForPlayer: vi.fn() } }));
vi.mock("@/components/player/AnthropometricsForm", () => ({ AnthropometricsForm: () => null }));
vi.mock("@/components/player/GrowthVelocityChart", () => ({ default: () => null }));
vi.mock("@/components/player/PhvWindowPlan", () => ({ PhvWindowPlan: () => null }));

import PlayerPhvSection from "@/components/player/PlayerPhvSection";
import ParentalConsentPage from "@/pages/ParentalConsentPage";
import { PlayerService } from "@/services/real/playerService";
import { SupabasePlayerService } from "@/services/real/supabasePlayerService";

const BASE = {
  age: 11,
  position: "ST",
  foot: "right" as const,
  height: 142,
  weight: 36,
  competitiveLevel: "Regional",
  minutesPlayed: 0,
  gender: "M" as const,
};

function isoYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  localStorage.clear();
  db.players.clear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("RGPD · fecha del Hub → control de consentimiento", () => {
  it("el menor cuya fecha se guardó en el Hub aparece en /admin/consent; sin fecha o ≥14 no", async () => {
    const minor = PlayerService.create({ ...BASE, name: "Samu Menor" });
    const noDate = PlayerService.create({ ...BASE, name: "Sin Fecha" });
    const older = PlayerService.create({ ...BASE, name: "Mayor Quince", birthDate: isoYearsAgo(15) });
    await SupabasePlayerService.pushOne("user-1", noDate);
    await SupabasePlayerService.pushOne("user-1", older);

    // 1) El entrenador introduce la fecha del jugador en el Hub.
    const qc1 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const hub = render(
      <QueryClientProvider client={qc1}>
        <PlayerPhvSection player={minor} hasPhv={false} />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText("Fecha de nacimiento del jugador"), {
      target: { value: isoYearsAgo(11) },
    });
    fireEvent.click(screen.getByRole("button", { name: /Guardar fecha de nacimiento y alturas/ }));
    await waitFor(() => expect(db.players.get(minor.id)?.birth_date).toBe(isoYearsAgo(11)));
    hub.unmount();

    // 2) La página de consentimiento (lee la COLUMNA birth_date) lista al menor.
    const qc2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc2}>
        <MemoryRouter>
          <ParentalConsentPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Samu Menor")).toBeInTheDocument();
    expect(screen.queryByText("Sin Fecha")).toBeNull();
    expect(screen.queryByText("Mayor Quince")).toBeNull();
  });
});
