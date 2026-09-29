/**
 * PlayerPhvSection — guardado HONESTO de la fecha de nacimiento del jugador y
 * las alturas de los padres + rótulos claros.
 *
 * Antes: toast «guardado» aunque PlayerService.update devolviera null (jugador
 * fuera de la caché local) y aunque la nube fallara (pushOne fire-and-forget que
 * además se tragaba el error). La fecha estaba en la rejilla de «Altura
 * madre/padre» bajo «Datos parentales», sin decir que es la del JUGADOR.
 *
 * Contrato:
 *  - éxito SOLO si está persistido (local + nube); nube caída ⇒ aviso
 *    «pendiente de sincronizar» visible, nunca «guardado»;
 *  - jugador ausente en local ⇒ error, nada guardado;
 *  - fecha no válida ⇒ error, nada guardado;
 *  - la fecha va en su propia fila: «Fecha de nacimiento del jugador».
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// t() resuelve contra es.json real: las aserciones fijan el copy en español.
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

const { toastMock } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: toastMock }));

const db = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  upserts: 0,
  failUpsert: false,
}));
vi.mock("@/lib/supabase", () => ({
  SUPABASE_CONFIGURED: true,
  supabase: {
    from: () => ({
      upsert: async (payload: Record<string, unknown>) => {
        db.upserts++;
        if (db.failUpsert) return { error: { message: "network down" } };
        db.rows.set(payload.id as string, payload);
        return { error: null };
      },
    }),
  },
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/services/real/organizationService", () => ({ OrganizationService: { getOrgId: () => null } }));
vi.mock("@/services/real/agentService", () => ({ AgentService: { invalidateCacheForPlayer: vi.fn() } }));
// Hijos pesados (queries propias) fuera del alcance de este test.
vi.mock("@/components/player/AnthropometricsForm", () => ({ AnthropometricsForm: () => null }));
vi.mock("@/components/player/GrowthVelocityChart", () => ({ default: () => null }));
vi.mock("@/components/player/PhvWindowPlan", () => ({ PhvWindowPlan: () => null }));

import PlayerPhvSection from "@/components/player/PlayerPhvSection";
import { PlayerService, type Player } from "@/services/real/playerService";
import { SyncQueueService } from "@/services/real/syncQueueService";
import { BIRTH_DATE_MIN_ISO, latestBirthDateIso, localIsoDate, toIsoBirthDate } from "@/lib/shared/birthDate";

const BASE = {
  name: "Samu Prueba",
  age: 11,
  position: "ST",
  foot: "right" as const,
  height: 142,
  weight: 36,
  competitiveLevel: "Regional",
  minutesPlayed: 0,
  gender: "M" as const,
};

function renderSection(player: Player) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PlayerPhvSection player={player} hasPhv={false} />
    </QueryClientProvider>,
  );
}

function enterBirthDateAndSave(value: string) {
  fireEvent.change(screen.getByLabelText("Fecha de nacimiento del jugador"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: /Guardar fecha de nacimiento y alturas/ }));
}

beforeEach(() => {
  localStorage.clear();
  db.rows.clear();
  db.upserts = 0;
  db.failUpsert = false;
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  toastMock.warning.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("PlayerPhvSection · rótulos", () => {
  it("la fecha es del JUGADOR y tiene su propia fila, fuera de la rejilla de alturas parentales", () => {
    renderSection(PlayerService.create(BASE));
    expect(screen.getByText("Datos de maduración (jugador y padres)")).toBeInTheDocument();
    expect(screen.queryByText("Datos parentales")).toBeNull();
    const birth = screen.getByLabelText("Fecha de nacimiento del jugador");
    const mother = screen.getByLabelText("Altura madre (cm)");
    const father = screen.getByLabelText("Altura padre (cm)");
    expect(mother.closest(".grid")).not.toBeNull();
    expect(mother.closest(".grid")).toBe(father.closest(".grid"));
    expect(birth.closest(".grid")).toBeNull();
    expect(screen.getByRole("button", { name: /Guardar fecha de nacimiento y alturas/ })).toBeInTheDocument();
  });

  it("el selector no ofrece fechas que la validación rechaza: max = ayer, min = 1900-01-01", () => {
    renderSection(PlayerService.create(BASE));
    const birth = screen.getByLabelText("Fecha de nacimiento del jugador");
    const max = birth.getAttribute("max");
    expect(max).toBe(latestBirthDateIso());
    expect(toIsoBirthDate(max)).toBe(max); // el último día elegible es válido
    expect(toIsoBirthDate(localIsoDate())).toBeNull(); // hoy no lo es
    expect(birth.getAttribute("min")).toBe(BIRTH_DATE_MIN_ISO);
  });

  it("el aviso «pendiente» es de ESTA cuenta: la op de otra cuenta del dispositivo no se muestra", () => {
    const p = PlayerService.create(BASE);
    SyncQueueService.enqueue("update", "player", p.id, p, "otra-cuenta");
    renderSection(p);
    expect(screen.queryByText("Pendiente de sincronizar")).toBeNull();
  });
});

describe("PlayerPhvSection · guardado honesto", () => {
  it("éxito solo tras persistir: local + nube (con birth_date en la fila)", async () => {
    const p = PlayerService.create(BASE);
    renderSection(p);
    enterBirthDateAndSave("2015-05-10");
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledTimes(1));
    expect(toastMock.warning).not.toHaveBeenCalled();
    expect(db.rows.get(p.id)?.birth_date).toBe("2015-05-10");
    expect(PlayerService.getById(p.id)?.birthDate).toBe("2015-05-10");
    expect(screen.queryByText("Pendiente de sincronizar")).toBeNull();
  });

  it("nube caída ⇒ NO dice «guardado»: aviso + estado visible «pendiente de sincronizar» + en cola", async () => {
    const p = PlayerService.create(BASE);
    db.failUpsert = true;
    renderSection(p);
    enterBirthDateAndSave("2015-05-10");
    await waitFor(() => expect(toastMock.warning).toHaveBeenCalledTimes(1));
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(await screen.findByText("Pendiente de sincronizar")).toBeInTheDocument();
    expect(SyncQueueService.hasPendingFor("player", p.id, "user-1")).toBe(true);
  });

  it("jugador que no está en la caché local ⇒ error y nada guardado (antes: «guardado»)", async () => {
    const ghost = { ...PlayerService.create(BASE) };
    localStorage.clear(); // el Hub lo tenía del API, pero no está en localStorage
    renderSection(ghost);
    enterBirthDateAndSave("2015-05-10");
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(toastMock.error.mock.calls[0][0]).toMatch(/No se ha guardado nada/);
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(db.upserts).toBe(0);
  });

  it("fecha no válida (futura) ⇒ error y nada guardado", async () => {
    const p = PlayerService.create(BASE);
    renderSection(p);
    enterBirthDateAndSave("2999-01-01");
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(toastMock.error.mock.calls[0][0]).toMatch(/Fecha de nacimiento no válida/);
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(PlayerService.getById(p.id)?.birthDate).toBeUndefined();
    expect(db.upserts).toBe(0);
  });

  it("al montar con cambios pendientes ya encolados, el estado se ve sin guardar de nuevo", () => {
    const p = PlayerService.create(BASE);
    SyncQueueService.enqueue("update", "player", p.id, p, "user-1");
    renderSection(p);
    expect(screen.getByText("Pendiente de sincronizar")).toBeInTheDocument();
  });
});
