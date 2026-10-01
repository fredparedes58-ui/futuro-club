/**
 * VITAS · Legacy team analysis identity guard (identidad.md, P0 minors).
 *
 * `withholdIndividualData` removes the per-player collections of the legacy team
 * contract (LLM-guessed dorsal + per-player figures) and drops free text that
 * names an individual, counting both, so /team-analysis never shows "#7" next to
 * a child's figures — also for reports saved before the fix.
 */
import { describe, it, expect } from "vitest";
import { withholdIndividualData, LEGACY_PER_PLAYER_KEYS } from "@/lib/shared/teamReportIdentity";

const LEGACY_REPORT = {
  videoId: "v-old",
  generatedAt: "2026-07-01T10:00:00.000Z",
  equipoAnalizado: { colorUniforme: "rojo", jugadoresDetectados: 11 },
  resumenEjecutivo: "Buen bloque. El #7 desborda constantemente por la derecha.",
  formacion: { sistema: "4-3-3", variantes: ["En ataque los laterales suben", "El jugador 10 baja a recibir"], rigidez: 6 },
  posesion: { porcentaje: 55, estiloCirculacion: "circulación corta", zonasDominadas: ["banda derecha"] },
  fasesJuego: {
    pressing: { tipo: "alto", alturaLinea: "alta", intensidad: 7, descripcion: "Los tres delanteros presionan juntos." },
    transiciones: {
      ofensiva: { velocidad: "rápida", patron: "directo", descripcion: "Balón al dorsal 9 tras recuperar." },
      defensiva: { velocidad: "media", patron: "repliegue", descripcion: "Repliegue ordenado." },
    },
  },
  metricasColectivas: { compacidad: 7, alturaLineaDefensiva: "media", amplitud: 6, sincronizacion: 6, descripcion: "Bloque junto." },
  jugadores: [
    {
      dorsalEstimado: "7", posicion: "extremo derecho", rol: "desborde", rendimiento: "destacado",
      velocidadMaxKmh: 27.5, distanciaM: 5400, pases: { completados: 8, fallados: 2 },
      duelos: { ganados: 2, perdidos: 1 }, recuperaciones: 1, resumen: "Desborda",
      heatmapPositions: [{ fx: 80, fy: 20 }],
    },
    {
      dorsalEstimado: null, posicion: "pivote", rol: "equilibrio", rendimiento: "bueno",
      velocidadMaxKmh: null, distanciaM: null, pases: { completados: 20, fallados: 3 },
      duelos: { ganados: 4, perdidos: 2 }, recuperaciones: 5, resumen: "Ordena",
    },
  ],
  evaluacionGeneral: {
    fortalezasEquipo: ["Pressing tras pérdida"],
    areasTrabajar: ["Repliegue de los laterales"],
    recomendaciones: ["Trabajar 6v6+2", "Que el #7 no se quede arriba"],
  },
  confianza: 0.7,
};

describe("withholdIndividualData · legacy team report", () => {
  it("removes the per-player rows (dorsal + per-player figures) and counts them", () => {
    const { value, withheld } = withholdIndividualData(LEGACY_REPORT);
    const out = value as Record<string, unknown>;

    expect(out.jugadores).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("dorsalEstimado");
    expect(JSON.stringify(out)).not.toContain("heatmapPositions");
    expect(withheld.perPlayerRows).toBe(2);
  });

  it("drops every text that names an individual (same predicate as the match job) and counts them", () => {
    const { value, withheld } = withholdIndividualData(LEGACY_REPORT);
    const out = value as typeof LEGACY_REPORT;

    expect(out.resumenEjecutivo).toBe("");
    expect(out.formacion.variantes).toEqual(["En ataque los laterales suben"]);
    expect(out.fasesJuego.transiciones.ofensiva.descripcion).toBe("");
    expect(out.evaluacionGeneral.recomendaciones).toEqual(["Trabajar 6v6+2"]);
    expect(JSON.stringify(out)).not.toMatch(/#7\b|jugador 10|dorsal 9/);
    expect(withheld.texts).toBe(4);
  });

  it("keeps the team-level content untouched", () => {
    const out = withholdIndividualData(LEGACY_REPORT).value as typeof LEGACY_REPORT;

    expect(out.videoId).toBe("v-old");
    expect(out.generatedAt).toBe(LEGACY_REPORT.generatedAt);
    expect(out.equipoAnalizado).toEqual(LEGACY_REPORT.equipoAnalizado);
    expect(out.formacion.sistema).toBe("4-3-3");
    expect(out.posesion).toEqual(LEGACY_REPORT.posesion);
    expect(out.metricasColectivas).toEqual(LEGACY_REPORT.metricasColectivas);
    expect(out.fasesJuego.pressing).toEqual(LEGACY_REPORT.fasesJuego.pressing);
    expect(out.evaluacionGeneral.fortalezasEquipo).toEqual(["Pressing tras pérdida"]);
    expect(out.confianza).toBe(0.7);
  });

  it("records the total on the report so the UI can say what was withheld", () => {
    const out = withholdIndividualData(LEGACY_REPORT).value as Record<string, unknown>;
    expect(out.identityWithheld).toEqual({ perPlayerRows: 2, texts: 4 });
  });

  it("is idempotent: a second pass (client after server) keeps the counts, adds nothing", () => {
    const first = withholdIndividualData(LEGACY_REPORT).value;
    const second = withholdIndividualData(first);
    expect(second.value).toEqual(first);
    expect(second.withheld).toEqual({ perPlayerRows: 2, texts: 4 });
  });

  it("does not mutate the stored object", () => {
    const copy = JSON.parse(JSON.stringify(LEGACY_REPORT));
    withholdIndividualData(copy);
    expect(copy).toEqual(LEGACY_REPORT);
  });

  it("a clean team-level report comes back equal, with no identityWithheld", () => {
    const clean: Omit<typeof LEGACY_REPORT, "jugadores"> & { jugadores?: unknown } = { ...LEGACY_REPORT };
    delete clean.jugadores;
    const cleanTexts = {
      ...clean,
      resumenEjecutivo: "Buen bloque medio.",
      formacion: { ...clean.formacion, variantes: ["En ataque los laterales suben"] },
      fasesJuego: {
        ...clean.fasesJuego,
        transiciones: { ...clean.fasesJuego.transiciones, ofensiva: { ...clean.fasesJuego.transiciones.ofensiva, descripcion: "Juego directo." } },
      },
      evaluacionGeneral: { ...clean.evaluacionGeneral, recomendaciones: ["Trabajar 6v6+2"] },
    };
    const { value, withheld } = withholdIndividualData(cleanTexts);
    expect(value).toEqual(cleanTexts);
    expect(withheld).toEqual({ perPlayerRows: 0, texts: 0 });
    expect((value as Record<string, unknown>).identityWithheld).toBeUndefined();
  });

  it("ignores a forged/garbage identityWithheld instead of trusting it", () => {
    const { withheld } = withholdIndividualData({ confianza: 0.5, identityWithheld: { perPlayerRows: -3, texts: "9" } });
    expect(withheld).toEqual({ perPlayerRows: 0, texts: 0 });
  });

  it("non-objects pass through unchanged", () => {
    expect(withholdIndividualData(null).value).toBeNull();
    expect(withholdIndividualData(undefined).value).toBeUndefined();
    expect(withholdIndividualData("x").value).toBe("x");
  });
});

describe("withholdIndividualData · legacy Gemini team observation", () => {
  it("removes jugadoresObservados (guessed dorsal + per-player counts)", () => {
    const { value, withheld } = withholdIndividualData({
      formacionDetectada: "4-3-3",
      posesionEstimada: { equipo: 55, rival: 45 },
      jugadoresObservados: [
        { dorsalEstimado: "7", posicionEstimada: "extremo derecho", eventosContados: { pasesCompletados: 8 } },
        { dorsalEstimado: "4", posicionEstimada: "central", eventosContados: { pasesCompletados: 12 } },
        { dorsalEstimado: null, posicionEstimada: "pivote", eventosContados: { pasesCompletados: 20 } },
      ],
      momentosColectivos: [{ timestamp: "3:20", tipo: "positivo", descripcion: "Combinación de 8 pases" }],
      resumenGeneral: "Equipo posicional.",
    });
    const out = value as Record<string, unknown>;
    expect(out.jugadoresObservados).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("dorsalEstimado");
    expect(withheld).toEqual({ perPlayerRows: 3, texts: 0 });
    expect(out.momentosColectivos).toEqual([{ timestamp: "3:20", tipo: "positivo", descripcion: "Combinación de 8 pases" }]);
  });

  it("covers exactly the two legacy per-player collections", () => {
    expect([...LEGACY_PER_PLAYER_KEYS]).toEqual(["jugadores", "jugadoresObservados"]);
  });
});
