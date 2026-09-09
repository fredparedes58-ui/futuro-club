/**
 * VITAS · Datos de equipo de EJEMPLO del DEMO (piso piloto)
 *
 * Los agentes/endpoints de equipo viven en /api (interceptado → null en demo).
 * Aquí se PRE-HORNEAN ejemplos derivados del club sembrado para que /equipo,
 * baseline (9 cuadrantes), rival y partido no queden vacíos. Datos de ejemplo
 * bajo el GlobalDemoBanner; ninguna métrica se presenta como medida. Prosa es/en.
 */

import { PlayerService, type Player } from "@/services/real/playerService";
import { playerMaturity } from "@/lib/phv/playerMaturity";
import { normalizeLocale, pickLocale, type ReportLocale } from "@/lib/shared/locale";
import i18n from "@/i18n";

function avgVsi(players: Player[]): number | null {
  const vs = players.map((p) => p.vsi).filter((v): v is number => typeof v === "number");
  return vs.length ? Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10) / 10 : null;
}

function phvDist(players: Player[]) {
  const d = { early: 0, ontime: 0, late: 0, unknown: 0 };
  for (const p of players) {
    try {
      const timing = playerMaturity(p as unknown as Parameters<typeof playerMaturity>[0]).timing;
      if (timing === "early") d.early++;
      else if (timing === "late") d.late++;
      else if (timing === "on_time") d.ontime++;
      else d.unknown++;
    } catch { d.unknown++; }
  }
  return d;
}

// ── A1 · Miembros del equipo ────────────────────────────────────────────────
export function buildDemoTeamMembers(orgOwnerId: string) {
  const base = orgOwnerId || "demo-director";
  return [
    { id: "demo-tm-1", orgOwnerId: base, memberId: base, role: "director" as const, joinedAt: "2026-01-10T09:00:00.000Z", displayName: "Director (Demo)", email: "director@vitas.demo" },
    { id: "demo-tm-2", orgOwnerId: base, memberId: "demo-scout", role: "scout" as const, joinedAt: "2026-02-02T09:00:00.000Z", displayName: "Marta Ojeda", email: "scout@vitas.demo" },
    { id: "demo-tm-3", orgOwnerId: base, memberId: "demo-coach", role: "coach" as const, joinedAt: "2026-02-20T09:00:00.000Z", displayName: "Iván Costa", email: "coach@vitas.demo" },
  ];
}

// ── A2 · Baseline de equipo (9 cuadrantes) ──────────────────────────────────
export function buildDemoTeamBaseline(locale: ReportLocale = normalizeLocale(i18n.language)) {
  const players = PlayerService.getAll();
  const dist = phvDist(players);
  const zones = ["defensa", "medio", "ataque"].flatMap((row) =>
    ["izq", "cen", "dcha"].map((col, c) => ({
      id: `${row}-${col}`,
      row,
      col,
      offensive: 45 + ((row === "ataque" ? 25 : row === "medio" ? 12 : 0) + c * 6),
      defensive: 45 + ((row === "defensa" ? 25 : row === "medio" ? 10 : 0) + (2 - c) * 5),
      note: row === "medio" && col === "cen" ? pickLocale(locale, { es: "Zona de dominio", en: "Dominant zone" }) : undefined,
    })),
  );
  return {
    teamName: pickLocale(locale, { es: "Club Demo · Sub-14", en: "Demo Club · U14" }),
    teamSize: players.length,
    vsiPromedio: avgVsi(players),
    phvDistribution: dist,
    reportsGenerated: 5,
    reportsFailed: 0,
    reports: [
      {
        type: "team-overview",
        model: "demo",
        content: {
          executive_summary: pickLocale(locale, { es: "Equipo joven con buena circulación por dentro y margen físico por la maduración mixta de la plantilla.", en: "Young side with good inside circulation and physical upside from the squad's mixed maturation." }),
          team_strengths: [{ title: pickLocale(locale, { es: "Juego interior", en: "Interior play" }), evidence: pickLocale(locale, { es: "Superioridades en medio centro.", en: "Overloads in central midfield." }) }],
          team_weaknesses: [{ title: pickLocale(locale, { es: "Duelo aéreo", en: "Aerial duels" }), evidence: pickLocale(locale, { es: "Plantilla en pleno estirón.", en: "Squad mid growth-spurt." }), priority: "media" }],
          next_focus: pickLocale(locale, { es: "Transiciones y balón parado.", en: "Transitions and set pieces." }),
        },
      },
      {
        type: "tactical-profile",
        model: "demo",
        content: {
          formation_suggested: "4-3-3",
          playing_style: pickLocale(locale, { es: "Posesión con salida limpia", en: "Possession with clean build-up" }),
          offensive_phase: pickLocale(locale, { es: "Amplitud con extremos y llegada de interiores.", en: "Width from wingers with late interior runs." }),
          defensive_phase: pickLocale(locale, { es: "Presión media orientada al interior.", en: "Mid-block press steering play inside." }),
          transition_focus: pickLocale(locale, { es: "Salida rápida tras recuperación.", en: "Fast exit after regaining the ball." }),
        },
      },
      {
        type: "tactical-zones",
        model: "demo",
        content: {
          zones,
          summary: pickLocale(locale, { es: "Dominio por el centro del campo; menor presencia en bandas defensivas.", en: "Dominance through central midfield; less presence on the defensive flanks." }),
          dominant_zone: pickLocale(locale, { es: "Medio centro", en: "Central midfield" }),
          weakest_zone: pickLocale(locale, { es: "Banda defensiva derecha", en: "Right defensive flank" }),
        },
      },
      {
        type: "phv-stratification",
        model: "demo",
        content: {
          mix_summary: pickLocale(locale, { es: `Reparto de maduración: ${dist.early} precoces, ${dist.ontime} en fase, ${dist.late} tardíos.`, en: `Maturation mix: ${dist.early} early, ${dist.ontime} on-time, ${dist.late} late.` }),
          early_group_plan: pickLocale(locale, { es: "Priorizar técnica-táctica sobre físico.", en: "Prioritise technical-tactical over physical." }),
          ontime_group_plan: pickLocale(locale, { es: "Progresión estándar de carga.", en: "Standard load progression." }),
          late_group_plan: pickLocale(locale, { es: "Proteger y no descartar por tamaño.", en: "Protect and don't rule out by size." }),
          risk_warning: pickLocale(locale, { es: "Vigilar carga en la ventana de estirón.", en: "Watch load during the growth window." }),
        },
      },
      {
        type: "opponent-readiness",
        model: "demo",
        content: {
          vulnerabilities: [pickLocale(locale, { es: "Balón parado defensivo.", en: "Defensive set pieces." })],
          exploitable_strengths: [pickLocale(locale, { es: "Superioridad interior.", en: "Interior overloads." })],
          recommended_drills: [pickLocale(locale, { es: "Rondo posicional 4v2+2.", en: "Positional rondo 4v2+2." })],
        },
      },
    ],
  };
}

// ── A3 · Plan vs rival ──────────────────────────────────────────────────────
export function buildDemoRivalPlan(rivalName: string, locale: ReportLocale = normalizeLocale(i18n.language)) {
  const players = PlayerService.getAll();
  return {
    rivalName: rivalName || "CD Ejemplo",
    ourTeamSize: players.length,
    plan: {
      tldr: pickLocale(locale, { es: `Plan de ejemplo frente a ${rivalName || "el rival"}: dominar el centro y castigar sus transiciones.`, en: `Example plan against ${rivalName || "the rival"}: control the centre and punish their transitions.` }),
      tactical_approach: {
        formation_recommended: "4-3-3",
        high_press: true,
        compactness: pickLocale(locale, { es: "Media-alta", en: "Medium-high" }),
        tempo: pickLocale(locale, { es: "Alto en transición", en: "High in transition" }),
        key_principle: pickLocale(locale, { es: "Superioridad interior", en: "Interior superiority" }),
      },
      key_matchups: [{ ours: pickLocale(locale, { es: "Interior", en: "Interior" }), theirs: pickLocale(locale, { es: "Pivote", en: "Holding mid" }), approach: pickLocale(locale, { es: "Fijar y girar", en: "Pin and turn" }) }],
      exploit_their_weaknesses: [{ weakness: pickLocale(locale, { es: "Balón parado", en: "Set pieces" }), how_to_exploit: pickLocale(locale, { es: "Córners al primer palo", en: "Near-post corners" }) }],
      guard_our_vulnerabilities: [{ our_vulnerability: pickLocale(locale, { es: "Espaldas de laterales", en: "Space behind full-backs" }), mitigation: pickLocale(locale, { es: "Coberturas del pivote", en: "Holding-mid cover" }) }],
      match_phases: {
        first_15min: pickLocale(locale, { es: "Presión alta para marcar territorio.", en: "High press to set the tone." }),
        mid_match: pickLocale(locale, { es: "Gestionar posesión y ritmo.", en: "Manage possession and tempo." }),
        last_15min: pickLocale(locale, { es: "Cerrar con bloque medio.", en: "Close out with a mid-block." }),
      },
      training_week: {
        monday: pickLocale(locale, { es: "Recuperación + técnica.", en: "Recovery + technique." }),
        wednesday: pickLocale(locale, { es: "Transiciones.", en: "Transitions." }),
        friday: pickLocale(locale, { es: "Balón parado + activación.", en: "Set pieces + activation." }),
      },
      recommended_drills: [{ drill: pickLocale(locale, { es: "Transición 4v3", en: "4v3 transition" }), purpose: pickLocale(locale, { es: "Salida rápida", en: "Fast exit" }), duration_min: 15 }],
      wildcards: [{ scenario: pickLocale(locale, { es: "Si van 0-1 abajo", en: "If trailing 0-1" }), response: pickLocale(locale, { es: "Extremo a pie cambiado", en: "Inverted winger" }) }],
    },
  };
}

// ── A4 · Informe de partido (A vs B) ────────────────────────────────────────
export function buildDemoMatchReport(homeName: string, awayName: string, locale: ReportLocale = normalizeLocale(i18n.language)) {
  const s = (es: string, en: string) => pickLocale(locale, { es, en });
  return {
    executive_summary: s(`Informe de ejemplo: ${homeName || "Local"} vs ${awayName || "Visitante"}. Partido igualado decidido en transiciones.`, `Example report: ${homeName || "Home"} vs ${awayName || "Away"}. A tight game decided in transition.`),
    tactical_overview: {
      home: { style: s("Posesión", "Possession"), strengths: [s("Circulación interior", "Interior circulation")], weaknesses: [s("Balón parado", "Set pieces")] },
      away: { style: s("Contraataque", "Counter-attack"), strengths: [s("Velocidad en banda", "Wide pace")], weaknesses: [s("Repliegue", "Recovery runs")] },
    },
    key_battles: [s("Interiores vs pivote", "Interiors vs holding mid")],
    momentum_shifts: [s("Min 60': entrada del extremo cambió el ritmo.", "60': the winger's introduction changed the tempo.")],
    recommendations: {
      home: [s("Insistir en superioridades interiores.", "Keep seeking interior overloads.")],
      away: [s("Mejorar el repliegue tras pérdida.", "Improve recovery after losing the ball.")],
    },
    overall_rating: { home: 7.4, away: 6.8 },
  };
}
