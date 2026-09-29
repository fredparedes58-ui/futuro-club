/**
 * /admin/consent · DSAR (exportar / pedir borrado) con las RPC de la migración 072.
 *
 * - Antes de aplicar 072 las funciones de 036 fallan siempre (firma UUID contra
 *   players.id TEXT → 22P02; o PGRST202 si falta p_requested_by): la página muestra
 *   el mensaje genérico de siempre, sin romperse.
 * - Después de 072, «no es tu jugador» llega como SQLSTATE 42501: mensaje específico.
 * - Éxito: descarga el JSON y refresca la auditoría (072 registra la acción).
 * Supabase está simulado (mock), no es la base de datos real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import esJson from "@/i18n/es.json";

vi.mock("react-i18next", async () => {
  const es = (await import("@/i18n/es.json")).default as Record<string, unknown>;
  const lookup = (k: string) => k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown> | undefined)?.[p], es);
  return {
    useTranslation: () => ({
      t: (k: string) => (typeof lookup(k) === "string" ? (lookup(k) as string) : k),
      i18n: { language: "es" },
    }),
  };
});

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const sb = vi.hoisted(() => ({
  rpc: vi.fn(),
  auditReads: 0,
}));

vi.mock("@/lib/supabase", () => ({
  SUPABASE_CONFIGURED: true,
  supabase: {
    rpc: sb.rpc,
    from: (table: string) => {
      if (table === "players") {
        return {
          select: () => ({
            not: () => ({
              order: async () => ({
                data: [
                  {
                    id: "p-minor-1",
                    name: "Lucas Menor",
                    birth_date: "2015-03-01",
                    parental_consent_status: "pending",
                    parental_consent_granted_at: null,
                    parental_consent_guardian_name: null,
                    parental_consent_guardian_email: null,
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      // consent_audit_log
      return {
        select: () => ({
          order: () => ({
            limit: async () => {
              sb.auditReads++;
              return { data: [], error: null };
            },
          }),
        }),
      };
    },
  },
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1", email: "coach@test" } }) }));

import ParentalConsentPage from "@/pages/ParentalConsentPage";

const T = (esJson as unknown as { parentalConsentPage: { toast: Record<string, string>; dsar: Record<string, string> } }).parentalConsentPage;

async function openDsar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ParentalConsentPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Lucas Menor")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /DSAR$/ }));
  expect(await screen.findByText(T.dsar.exportTitle)).toBeInTheDocument();
}

beforeEach(() => {
  sb.rpc.mockReset();
  sb.auditReads = 0;
  Object.values(toastMock).forEach((f) => f.mockReset());
});

describe("ParentalConsentPage · DSAR", () => {
  it("072: 42501 (no es tu jugador) → mensaje de permiso específico", async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "dsar: jugador no encontrado o sin permiso" } });
    await openDsar();
    fireEvent.click(screen.getByText(T.dsar.exportTitle));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(T.toast.dsarNotAllowed));
    expect(sb.rpc).toHaveBeenCalledWith("dsar_export_player_data", { p_player_id: "p-minor-1" });
  });

  it("antes de 072 (funciones de 036): el error sigue siendo el genérico de siempre", async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { code: "22P02", message: 'invalid input syntax for type uuid: "p-minor-1"' } });
    await openDsar();
    fireEvent.click(screen.getByText(T.dsar.exportTitle));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(T.toast.exportError));
  });

  it("borrado: solo envía p_player_id (el solicitante sale del JWT) y trata PGRST202 como error genérico", async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    await openDsar();
    fireEvent.click(screen.getByText(T.dsar.deletionTitle));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(T.toast.deletionError));
    expect(sb.rpc).toHaveBeenCalledWith("dsar_request_deletion", { p_player_id: "p-minor-1" });
  });

  it("exportación con éxito: descarga y vuelve a leer la auditoría", async () => {
    const createUrl = vi.fn(() => "blob:dsar");
    const revokeUrl = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    sb.rpc.mockResolvedValue({ data: { export_type: "DSAR_access_request", player: { id: "p-minor-1" } }, error: null });
    await openDsar();
    const readsBefore = sb.auditReads;
    fireEvent.click(screen.getByText(T.dsar.exportTitle));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith(T.toast.exportSuccess));
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(sb.auditReads).toBeGreaterThan(readsBefore));
    clickSpy.mockRestore();
  });
});
