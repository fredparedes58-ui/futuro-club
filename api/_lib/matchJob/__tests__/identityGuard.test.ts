/**
 * Guarda de identidad (identidad.md / CLAUDE.md inv #6): claves individuales + TEXTO.
 * Casos del spike del 2026-09-29: Gemini añadió "#10"/"#11" a las evidencias pese al
 * prompt (incluso a un equipo sin números) → se descarta el ítem entero.
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_NAME_GUARD,
  buildNameGuard,
  extractNamesFromNotes,
  stripIndividualKeys,
  textMentionsIndividual,
} from "../identityGuard";
import { normalizeSegmentOutput, visualBasisFromUsage } from "../segmentResult";
import { segObs } from "./fixtures";

describe("stripIndividualKeys", () => {
  it("removes individual-level keys at any depth, counts them and does not mutate the input", () => {
    const input = {
      teams: { home: { formation: "4-4-2", dorsal: 10, players: [{ name: "x" }] } },
      evidence: [{ t_start: 1, jersey_number: 7, text: "ok" }, { t_start: 2, text: "ok" }],
      Jugador: "Pablo",
    };
    const copy = JSON.parse(JSON.stringify(input));
    const r = stripIndividualKeys(input);
    expect(r.stripped).toBe(4);
    expect(r.strippedPaths).toEqual(expect.arrayContaining(["$.teams.home.dorsal", "$.teams.home.players", "$.evidence[0].jersey_number", "$.Jugador"]));
    expect(r.value).toEqual({ teams: { home: { formation: "4-4-2" } }, evidence: [{ t_start: 1, text: "ok" }, { t_start: 2, text: "ok" }] });
    expect(input).toEqual(copy);
  });
  it("matches keys case- and accent-insensitively (número, NUMERO)", () => {
    expect(stripIndividualKeys({ número: 1, NUMERO: 2, Face: "x" }).stripped).toBe(3);
  });
});

describe("textMentionsIndividual (contract patterns)", () => {
  const dropped = [
    "El #11 del visitante recupera y conduce",
    "#10 presiona la salida",
    "the home #7 keeps the ball",
    "El número 9 remata",
    "Presión del dorsal 4",
    "El 10 del local filtra un pase",
    "the 7 of the away team shoots",
    "La camiseta 7 del visitante",
    "El blanco (10) conduce por banda",
    "El jugador de blanco presiona solo",
    "A player in red wins the duel",
    "Der Spieler in Rot läuft",
    "El portero sale con el balón en largo",
    "The goalkeeper plays it long",
    "Their captain organises the line",
    "Il portiere rinvia lungo",
    "Le gardien relance court",
  ];
  const kept = [
    "Los jugadores del local presionan alto tras pérdida",
    "La línea defensiva visitante se hunde",
    "The home back line steps up together",
    "The away front three press the centre-backs",
    "Salida corta desde la defensa en el minuto de vídeo 12:30",
    "Transición rápida del local por la banda derecha",
    "Los porteros apenas intervienen",
    "Presión en bloque medio (4-4-2)",
  ];
  for (const t of dropped) it(`drops: ${t}`, () => expect(textMentionsIndividual(t)).toBe(true));
  for (const t of kept) it(`keeps team-level text: ${t}`, () => expect(textMentionsIndividual(t)).toBe(false));
});

describe("names from coach notes and roster", () => {
  it("extracts mid-sentence capitalised names and full names at sentence start, never colours or football words", () => {
    const names = extractNamesFromNotes("Pablo Ruiz juega de lateral. Dile a Hugo que presione. El Blanco sale en largo. Presión alta en la Segunda parte.");
    expect(names).toEqual(expect.arrayContaining(["Pablo Ruiz", "Pablo", "Ruiz", "Hugo"]));
    expect(names).not.toContain("Blanco");
    expect(names).not.toContain("Segunda");
    expect(names).not.toContain("El");
    expect(names).not.toContain("Presión");
  });
  it("a name guard drops texts with a roster or notes name (capitalised) and excludes declared team names / kit labels", () => {
    const guard = buildNameGuard({
      notes: "Ojo con Hugo en las transiciones.",
      rosterNames: ["Lucía Martín", null, "Mario"],
      exclude: ["Club Martín", "rojo"],
    });
    expect(textMentionsIndividual("Hugo recupera tras pérdida", guard)).toBe(true);
    expect(textMentionsIndividual("Gran presión de Lucía Martín", guard)).toBe(true);
    expect(textMentionsIndividual("gran presion de lucia martin", guard)).toBe(true); // frase completa: sin distinguir mayúsculas
    expect(textMentionsIndividual("Mario conduce", guard)).toBe(true);
    // "Martín" es también el nombre del equipo declarado → no se trata como nombre suelto.
    expect(textMentionsIndividual("El Martín presiona alto en bloque", guard)).toBe(false);
    expect(textMentionsIndividual("el local presiona alto", guard)).toBe(false);
  });
  it("the empty guard only applies the contract patterns", () => {
    expect(textMentionsIndividual("Hugo recupera", EMPTY_NAME_GUARD)).toBe(false);
    expect(textMentionsIndividual("#5 recupera", EMPTY_NAME_GUARD)).toBe(true);
  });
});

describe("normalizeSegmentOutput (identity guard + zod + time base)", () => {
  const seg = { start_sec: 900, end_sec: 1800 };
  const names = buildNameGuard({ notes: "Cuidado con Hugo." });
  const ev = (t: number, text: string, extra: Record<string, unknown> = {}) => ({
    t_start: t,
    t_end: t + 5,
    team: "home",
    category: "build_up",
    text,
    ...extra,
  });

  it("drops evidence carrying an individual key or mentioning a number/name; keeps the rest", () => {
    const raw = {
      ...segObs(),
      evidence: [
        ev(1000, "Salida corta desde atrás"),
        ev(1010, "El #11 conduce"),
        ev(1020, "Presión coordinada", { dorsal: 8 }),
        ev(1030, "Hugo recupera"),
        ev(1040, "Presión alta del bloque"),
      ],
    };
    const r = normalizeSegmentOutput(raw, seg, names);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.observation.evidence.map((e) => e.text)).toEqual(["Salida corta desde atrás", "Presión alta del bloque"]);
    expect(r.value.guard).toEqual({ keys_stripped: 1, items_dropped: 3 });
  });
  it("a team note that names an individual becomes null (never kept)", () => {
    const raw = segObs({ teams: { home: { ...segObs().teams.home, note: "El portero juega en largo" }, away: segObs().teams.away } });
    const r = normalizeSegmentOutput({ ...raw, evidence: [ev(1000, "ok")] }, seg, names);
    expect(r.ok && r.value.observation.teams.home.note).toBeNull();
  });
  it("clip-relative times are shifted once to absolute video time; out-of-range evidence is dropped", () => {
    const raw = { ...segObs(), evidence: [ev(10, "Salida corta"), ev(600, "Presión alta")] };
    const r = normalizeSegmentOutput(raw, seg, EMPTY_NAME_GUARD);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.time_base_applied).toBe("clip_relative");
    expect(r.value.observation.evidence.map((e) => e.t_start)).toEqual([910, 1500]);

    const abs = normalizeSegmentOutput({ ...segObs(), evidence: [ev(1000, "ok"), ev(2000, "fuera del tramo")] }, seg, EMPTY_NAME_GUARD);
    expect(abs.ok).toBe(true);
    if (!abs.ok) return;
    expect(abs.value.time_base_applied).toBe("absolute");
    expect(abs.value.observation.evidence).toHaveLength(1);
    expect(abs.value.out_of_range_dropped).toBe(1);
  });
  it("an object that breaks the contract is an invalid segment (never a partial parse)", () => {
    const r = normalizeSegmentOutput({ ...segObs(), team_identification: "maybe" }, seg, EMPTY_NAME_GUARD);
    expect(r.ok).toBe(false);
    expect(normalizeSegmentOutput("texto", seg, EMPTY_NAME_GUARD).ok).toBe(false);
  });
  it("malformed evidence items are dropped and counted, the segment survives", () => {
    const r = normalizeSegmentOutput({ ...segObs(), evidence: [ev(1000, "ok"), { t_start: "x" }] }, seg, EMPTY_NAME_GUARD);
    expect(r.ok && r.value.malformed_dropped).toBe(1);
  });
});

describe("visualBasisFromUsage", () => {
  it("confirmed with VIDEO/IMAGE tokens, absent when the breakdown has none, unverified without breakdown", () => {
    expect(visualBasisFromUsage({ promptTokensDetails: [{ modality: "VIDEO", tokenCount: 59000 }] })).toBe("confirmed");
    expect(visualBasisFromUsage({ promptTokensDetails: [{ modality: "IMAGE", tokenCount: 10 }] })).toBe("confirmed");
    expect(visualBasisFromUsage({ promptTokensDetails: [{ modality: "TEXT", tokenCount: 3000 }] })).toBe("absent");
    expect(visualBasisFromUsage({ promptTokensDetails: [{ modality: "VIDEO", tokenCount: 0 }] })).toBe("absent");
    expect(visualBasisFromUsage({ promptTokenCount: 3000 })).toBe("unverified");
    expect(visualBasisFromUsage(null)).toBe("unverified");
  });
});
