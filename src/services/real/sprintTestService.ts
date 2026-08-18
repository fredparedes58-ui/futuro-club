/**
 * VITAS · Sprint Test Service
 *
 * Persistencia (localStorage tipado) de los tests de velocidad de sprint medidos
 * en /velocidad-sprint. Es la métrica física de mayor procedencia del sistema:
 * distancia MEDIDA (cinta) ÷ tiempo MEDIDO (conteo de frames) ⇒ velocidad DERIVADA.
 *
 * Un test siempre pertenece a un jugador: medir sin guardar en el perfil es
 * trabajo perdido (hallazgo UX: los módulos no conversaban entre sí).
 */
import { StorageService } from "@/services/real/storageService";
import { derived, type MetricResult } from "@/lib/metrics/MetricResult";

const KEY = "sprint_tests";

export interface SprintTest {
  id: string;
  playerId: string;
  /** ISO date (yyyy-mm-dd) del test */
  fecha: string;
  distancia_m: number;
  tiempo_s: number;
  velocidad_ms: number;
  velocidad_kmh: number;
  fps: number;
  /** margen ±1 frame en % del tiempo total */
  error_pct: number;
  notas?: string;
}

function uid(): string {
  return `st_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const SprintTestService = {
  getAll(): SprintTest[] {
    return StorageService.get<SprintTest[]>(KEY, []);
  },

  getByPlayer(playerId: string): SprintTest[] {
    return this.getAll()
      .filter((t) => t.playerId === playerId)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  },

  add(test: Omit<SprintTest, "id">): SprintTest {
    const full: SprintTest = { ...test, id: uid() };
    StorageService.set(KEY, [...this.getAll(), full]);
    return full;
  },

  remove(id: string): void {
    StorageService.set(
      KEY,
      this.getAll().filter((t) => t.id !== id),
    );
  },

  /**
   * Mejor marca del jugador como MetricResult (DERIVADA: distancia real ÷ tiempo
   * real). `confidence` refleja el margen de ±1 frame del cronometraje.
   */
  bestSpeed(playerId: string): MetricResult<number> | null {
    const tests = this.getByPlayer(playerId);
    if (tests.length === 0) return null;
    const best = tests.reduce((a, b) => (b.velocidad_ms > a.velocidad_ms ? b : a));
    return derived(best.velocidad_ms, {
      units: "m/s",
      confidence: Math.max(0, Math.min(1, 1 - best.error_pct / 100)),
      source_ref: `sprint_test:${best.id}`,
    });
  },
};
