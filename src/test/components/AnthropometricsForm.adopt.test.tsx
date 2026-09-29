/**
 * VITAS · AnthropometricsForm — la ficha adopta las medidas SIN tragarse fallos
 *
 * Tras guardar una medición nueva, la ficha local (blob que lee el gate único de
 * PHV del Hub) adopta las 4 medidas y se sube a la nube. Antes:
 * `pushOne(...).catch(() => {})` descartaba el error (con #298 pushOne lanza) y
 * `PlayerService.update` → null (jugador no cargado en el dispositivo) saltaba la
 * sincronización en silencio: el Hub volvía a «PHV no disponible · Falta: talla
 * sentado, longitud de pierna» mientras el histórico mostraba una fila fiable.
 * Ahora: fallo de nube ⇒ SyncQueue + aviso «pendiente de sincronizar»;
 * not_found ⇒ aviso de que la ficha no cambió.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));
vi.mock("framer-motion", () => {
  // Un componente ESTABLE por etiqueta: si cambiara en cada render, React
  // remontaría el formulario y los inputs perderían el estado.
  const cache = new Map<string, (p: Record<string, unknown> & { children?: ReactNode }) => JSX.Element>();
  const motion = new Proxy({}, {
    get: (_t, prop: string) => {
      if (!cache.has(prop)) {
        cache.set(prop, ({ children, initial: _i, animate: _a, exit: _e, transition: _tr, ...props }) => {
          const Tag = prop as keyof JSX.IntrinsicElements;
          return <Tag {...(props as object)}>{children}</Tag>;
        });
      }
      return cache.get(prop);
    },
  });
  return { motion, AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</> };
});

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

vi.mock("@/lib/apiAuth", () => ({ getAuthHeaders: async () => ({ Authorization: "Bearer t" }) }));
vi.mock("@/lib/supabase", () => ({ SUPABASE_CONFIGURED: true }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "coach-1" } }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn().mockResolvedValue(undefined) }),
}));
// La medición llega al servidor (sent): lo que se prueba es la adopción en la ficha.
vi.mock("@/hooks/useOfflineMutation", () => ({
  useOfflineMutation: () => ({
    run: vi.fn().mockResolvedValue({ sent: true, queued: false }),
    queueSize: 0, online: true, syncing: false,
  }),
}));

const svc = vi.hoisted(() => ({
  update: vi.fn(),
  pushOne: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("@/services/real/playerService", () => ({ PlayerService: { update: svc.update } }));
vi.mock("@/services/real/supabasePlayerService", () => ({ SupabasePlayerService: { pushOne: svc.pushOne } }));
vi.mock("@/services/real/syncQueueService", () => ({ SyncQueueService: { enqueue: svc.enqueue } }));

import { AnthropometricsForm } from "@/components/player/AnthropometricsForm";

const UPDATED = { id: "p1", name: "Samu", height: 158, weight: 46, sittingHeight: 80, legLength: 78 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: { history: [] } })),
  );
});

async function submitMeasurement() {
  render(<AnthropometricsForm playerId="p1" chronologicalAge={13} birthDate="2013-06-01" gender="M" />);
  fireEvent.click(await screen.findByText("anthroForm.newButton"));
  const inputs = document.querySelectorAll<HTMLInputElement>("input[type=number]");
  ["158", "46", "80", "78"].forEach((v, i) => fireEvent.change(inputs[i], { target: { value: v } }));
  fireEvent.click(screen.getByText("anthroForm.saveAndCalcBtn"));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("anthroForm.toastSaved"));
}

describe("AnthropometricsForm · adopción de medidas en la ficha", () => {
  it("la nube falla ⇒ se encola en SyncQueue y se avisa «pendiente de sincronizar»", async () => {
    svc.update.mockResolvedValue(UPDATED);
    svc.pushOne.mockRejectedValue(new Error("players upsert failed"));
    await submitMeasurement();
    await waitFor(() => expect(svc.enqueue).toHaveBeenCalledWith("update", "player", "p1", UPDATED));
    expect(toast.info).toHaveBeenCalledWith("anthroForm.toastProfilePendingSync", expect.anything());
  });

  it("jugador no cargado en el dispositivo ⇒ sin push, se avisa de que la ficha no cambió", async () => {
    svc.update.mockResolvedValue(null);
    await submitMeasurement();
    await waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith("anthroForm.toastProfileNotOnDevice", expect.anything()),
    );
    expect(svc.pushOne).not.toHaveBeenCalled();
    expect(svc.enqueue).not.toHaveBeenCalled();
  });

  it("sincronizada ⇒ ni cola ni avisos extra", async () => {
    svc.update.mockResolvedValue(UPDATED);
    svc.pushOne.mockResolvedValue(undefined);
    await submitMeasurement();
    await waitFor(() => expect(svc.pushOne).toHaveBeenCalledWith("coach-1", UPDATED));
    expect(svc.enqueue).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
