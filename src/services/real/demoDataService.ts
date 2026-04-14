/**
 * VITAS — Demo Data Service
 * Genera 3 jugadores demo para que usuarios nuevos exploren la app
 * sin necesidad de ingresar datos reales primero.
 *
 * Los jugadores tienen perfiles variados para mostrar distintas features:
 *   - Jugador con VSI alto (talento visible)
 *   - Jugador equilibrado (promedio sólido)
 *   - Jugador con potencial oculto (scores bajos pero con margen de mejora)
 */

import { PlayerService, type CreatePlayerInput } from "./playerService";

// ── Datos demo ──────────────────────────────────────────────────────────────

const DEMO_PLAYERS: CreatePlayerInput[] = [
  {
    name: "Lucas Herrera",
    age: 15,
    position: "Mediapunta",
    gender: "M",
    foot: "left",
    height: 172,
    weight: 62,
    competitiveLevel: "Nacional",
    minutesPlayed: 1200,
    metrics: {
      speed: 72, technique: 85, vision: 80,
      stamina: 65, shooting: 70, defending: 35,
    },
  },
  {
    name: "Valentina Rojas",
    age: 13,
    position: "Pivote",
    gender: "F",
    foot: "right",
    height: 158,
    weight: 50,
    competitiveLevel: "Regional",
    minutesPlayed: 800,
    metrics: {
      speed: 68, technique: 65, vision: 70,
      stamina: 75, shooting: 45, defending: 72,
    },
  },
  {
    name: "Diego Morales",
    age: 16,
    position: "Extremo Derecho",
    gender: "M",
    foot: "right",
    height: 176,
    weight: 66,
    competitiveLevel: "Regional",
    minutesPlayed: 500,
    metrics: {
      speed: 82, technique: 55, vision: 50,
      stamina: 70, shooting: 60, defending: 30,
    },
  },
];

// ── Constantes ──────────────────────────────────────────────────────────────

const DEMO_SEEDED_KEY = "demo_data_seeded";

// ── Service ─────────────────────────────────────────────────────────────────

export const DemoDataService = {
  /**
   * Verifica si los datos demo ya fueron cargados.
   */
  isSeeded(): boolean {
    try {
      return localStorage.getItem(DEMO_SEEDED_KEY) === "true";
    } catch {
      return false;
    }
  },

  /**
   * Carga los 3 jugadores demo en localStorage.
   * No-op si ya fueron cargados o si ya hay jugadores existentes.
   * Retorna la cantidad de jugadores creados.
   */
  seed(): number {
    if (this.isSeeded()) return 0;

    // No sobreescribir si el usuario ya tiene jugadores reales
    const existing = PlayerService.getAll();
    if (existing.length > 0) {
      this.markSeeded();
      return 0;
    }

    let created = 0;
    for (const input of DEMO_PLAYERS) {
      try {
        PlayerService.create(input);
        created++;
      } catch {
        // Continuar con los demás si uno falla
      }
    }

    this.markSeeded();
    return created;
  },

  /**
   * Elimina los jugadores demo (solo si fueron creados por este service).
   * Útil cuando el usuario quiere empezar con datos limpios.
   */
  purge(): number {
    const all = PlayerService.getAll();
    const demoNames = new Set(DEMO_PLAYERS.map((p) => p.name));

    // Recopilar IDs a eliminar primero para evitar mutar durante iteración
    const toDelete = all.filter((p) => demoNames.has(p.name)).map((p) => p.id);

    for (const id of toDelete) {
      PlayerService.delete(id);
    }

    return toDelete.length;
  },

  /** Marca como seeded sin crear datos (útil si el usuario ya tiene jugadores). */
  markSeeded(): void {
    try {
      localStorage.setItem(DEMO_SEEDED_KEY, "true");
    } catch {
      // Silent fail
    }
  },

  /** Retorna los nombres de los jugadores demo para UI. */
  getDemoPlayerNames(): string[] {
    return DEMO_PLAYERS.map((p) => p.name);
  },

  /** Retorna la cantidad de jugadores demo disponibles. */
  get count(): number {
    return DEMO_PLAYERS.length;
  },
};
