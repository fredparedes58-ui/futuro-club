/**
 * VITAS — Demo Data Service (club de ejemplo del DEMO público)
 *
 * Academia de ejemplo completa para el piso piloto: 8 jugadores de varias
 * categorías (Sub-12 a Sub-17), ambos sexos y arquetipos de maduración
 * variados (madurador precoz «ventaja física temporal», madurador tardío
 * «joya oculta», en-plazo). TODOS con antropometría MEDIDA completa
 * (altura-sentado, longitud de pierna, alturas de los padres) → PHV (Mirwald,
 * alta confianza, no estimado), %PAH (Khamis-Roche) y VSI se calculan DE VERDAD
 * a partir de estos datos de ejemplo. Ningún número está hardcodeado: son
 * derivados honestos sobre medidas de ejemplo, y la UI los rotula como
 * «Datos de ejemplo». (No confundir con datos de menores reales — todo sintético.)
 */

import { PlayerService, type CreatePlayerInput } from "./playerService";

// ── Datos demo ──────────────────────────────────────────────────────────────
// Convención antropométrica realista: altura-sentado ≈ 0,52·altura,
// longitud de pierna ≈ 0,48·altura (medidas, no estimadas → confianza alta).

const DEMO_PLAYERS: CreatePlayerInput[] = [
  {
    isDemo: true,
    name: "Lucas Herrera",
    age: 15,
    position: "Mediapunta",
    secondaryPositions: ["Interior"],
    gender: "M",
    foot: "left",
    height: 172, weight: 62, sittingHeight: 89, legLength: 83,
    motherHeightCm: 165, fatherHeightCm: 178,
    competitiveLevel: "Nacional",
    minutesPlayed: 1200,
    metrics: { speed: 72, technique: 85, vision: 80, stamina: 65, shooting: 70, defending: 35 },
  },
  {
    isDemo: true,
    name: "Valentina Rojas",
    age: 13,
    position: "Pivote",
    gender: "F",
    foot: "right",
    height: 158, weight: 50, sittingHeight: 82, legLength: 76,
    motherHeightCm: 160, fatherHeightCm: 170,
    competitiveLevel: "Regional",
    minutesPlayed: 800,
    metrics: { speed: 68, technique: 65, vision: 70, stamina: 75, shooting: 45, defending: 72 },
  },
  {
    isDemo: true,
    name: "Diego Morales",
    age: 16,
    position: "Extremo Derecho",
    secondaryPositions: ["Delantero"],
    gender: "M",
    foot: "right",
    height: 176, weight: 66, sittingHeight: 91, legLength: 85,
    motherHeightCm: 168, fatherHeightCm: 182,
    competitiveLevel: "Regional",
    minutesPlayed: 500,
    metrics: { speed: 82, technique: 55, vision: 50, stamina: 70, shooting: 60, defending: 30 },
  },
  {
    // Arquetipo JOYA OCULTA: pequeño para su edad, padres altos (%PAH alto) →
    // madurador tardío, talento técnico infravalorado por tamaño.
    isDemo: true,
    name: "Hugo Nazario",
    age: 13,
    position: "Interior",
    gender: "M",
    foot: "left",
    height: 143, weight: 35, sittingHeight: 72, legLength: 68,
    motherHeightCm: 172, fatherHeightCm: 186,
    competitiveLevel: "Regional",
    minutesPlayed: 950,
    metrics: { speed: 70, technique: 82, vision: 78, stamina: 68, shooting: 58, defending: 40 },
  },
  {
    // Arquetipo MADURADOR PRECOZ: grande para su edad → ventaja física temporal.
    isDemo: true,
    name: "Bruno Castells",
    age: 14,
    position: "Central",
    gender: "M",
    foot: "right",
    height: 182, weight: 74, sittingHeight: 95, legLength: 87,
    motherHeightCm: 162, fatherHeightCm: 176,
    competitiveLevel: "Nacional",
    minutesPlayed: 1100,
    metrics: { speed: 64, technique: 52, vision: 58, stamina: 80, shooting: 48, defending: 84 },
  },
  {
    isDemo: true,
    name: "Marta Giralt",
    age: 15,
    position: "Extremo Izquierdo",
    secondaryPositions: ["Mediapunta"],
    gender: "F",
    foot: "left",
    height: 165, weight: 56, sittingHeight: 86, legLength: 79,
    motherHeightCm: 163, fatherHeightCm: 172,
    competitiveLevel: "Nacional",
    minutesPlayed: 1000,
    metrics: { speed: 78, technique: 72, vision: 68, stamina: 74, shooting: 66, defending: 45 },
  },
  {
    isDemo: true,
    name: "Iker Ferrán",
    age: 17,
    position: "Delantero",
    gender: "M",
    foot: "right",
    height: 181, weight: 73, sittingHeight: 94, legLength: 87,
    motherHeightCm: 170, fatherHeightCm: 184,
    competitiveLevel: "Nacional",
    minutesPlayed: 1400,
    metrics: { speed: 76, technique: 68, vision: 62, stamina: 72, shooting: 84, defending: 40 },
  },
  {
    isDemo: true,
    name: "Aitor Ríos",
    age: 12,
    position: "Lateral Derecho",
    gender: "M",
    foot: "right",
    height: 146, weight: 39, sittingHeight: 76, legLength: 70,
    motherHeightCm: 166, fatherHeightCm: 179,
    competitiveLevel: "Regional",
    minutesPlayed: 600,
    metrics: { speed: 74, technique: 58, vision: 60, stamina: 66, shooting: 42, defending: 64 },
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

  /**
   * Carga demo bajo petición explícita del usuario (botón "cargar datos de
   * ejemplo"). A diferencia de seed(), ignora el flag isSeeded para que
   * funcione aunque el usuario ya haya visto/borrado datos antes. Solo carga
   * si NO hay jugadores reales.
   */
  reseed(): number {
    if (PlayerService.getAll().length > 0) return 0;
    try {
      localStorage.removeItem(DEMO_SEEDED_KEY);
    } catch {
      // Silent
    }
    return this.seed();
  },

  /**
   * Reinicio DURO para el modo DEMO (piso piloto). A diferencia de seed()/reseed(),
   * NO respeta las guardas (no comprueba isSeeded ni jugadores existentes): borra
   * los jugadores de ejemplo previos y vuelve a crear el club canónico SIEMPRE.
   * Se llama en cada carga del demo → el estado vuelve al base y se resetea solo.
   */
  forceReseed(): number {
    this.purge();
    try {
      localStorage.removeItem(DEMO_SEEDED_KEY);
    } catch {
      // Silent
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
