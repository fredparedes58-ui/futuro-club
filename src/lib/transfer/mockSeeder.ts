/**
 * VITAS · Transfer Market Mock Seeder
 *
 * Genera 8-12 listings demo para ver el marketplace funcional sin necesidad
 * de Supabase ni datos reales. Variedad: distintas posiciones, edades, tipos
 * (sale/loan/trial), precios, tags.
 */

import { TransferMarketService } from "@/services/real/transferMarketService";
import { DEFAULTS } from "./transferConfig";
import type { TransferListing } from "./transferTypes";

const uuid = (): string => crypto.randomUUID();

interface PlayerSeed {
  name: string;
  age: number;
  position: string;
  foot: "left" | "right" | "both";
  vsi: number;
  vsiBreakdown: { technical: number; tactical: number; physical: number; mental: number };
  phvOffset?: number;
  phvCategory?: "early" | "on-time" | "late";
  tags: string[];
}

const SEED_PLAYERS: Array<{ player: PlayerSeed; listing: Partial<TransferListing> }> = [
  {
    player: {
      name: "Marco Vélez",
      age: 19,
      position: "DC",
      foot: "right",
      vsi: 78,
      vsiBreakdown: { technical: 75, tactical: 82, physical: 80, mental: 76 },
      phvOffset: 1.2,
      phvCategory: "on-time",
      tags: ["goleador", "remate de cabeza", "presión alta"],
    },
    listing: {
      listingType: "sale",
      askingPriceEur: 850_000,
      description: "Delantero centro con perfil moderno: rematador y presionante. 18 goles en 24 partidos esta temporada en División de Honor Juvenil.",
      acceptsOffers: true,
    },
  },
  {
    player: {
      name: "Diego Ruiz",
      age: 17,
      position: "MC",
      foot: "left",
      vsi: 72,
      vsiBreakdown: { technical: 78, tactical: 71, physical: 65, mental: 74 },
      phvOffset: -0.3,
      phvCategory: "late",
      tags: ["creativo", "zurdo", "PHV tardío"],
    },
    listing: {
      listingType: "loan",
      askingPriceEur: 0,
      description: "Mediocentro zurdo creativo. PHV late significa que aún tiene margen físico por desarrollar — ideal para club paciente.",
      acceptsOffers: true,
    },
  },
  {
    player: {
      name: "Iván Castro",
      age: 21,
      position: "LD",
      foot: "right",
      vsi: 70,
      vsiBreakdown: { technical: 68, tactical: 72, physical: 78, mental: 65 },
      phvOffset: 4,
      phvCategory: "on-time",
      tags: ["lateral profundo", "centros", "resistencia"],
    },
    listing: {
      listingType: "sale",
      askingPriceEur: 350_000,
      description: "Lateral derecho con gran motor físico. Especialista en proyecciones y centros. Listo para Segunda B.",
      acceptsOffers: true,
    },
  },
  {
    player: {
      name: "Adrián Romero",
      age: 16,
      position: "MCO",
      foot: "right",
      vsi: 82,
      vsiBreakdown: { technical: 86, tactical: 80, physical: 70, mental: 88 },
      phvOffset: -1.1,
      phvCategory: "late",
      tags: ["talento", "líder", "creativo", "PHV tardío"],
    },
    listing: {
      listingType: "trial",
      askingPriceEur: null,
      description: "Talento generacional. PHV tardío con composite mental 88. Buscamos club top que ofrezca proyecto largo.",
      acceptsOffers: false,
    },
  },
  {
    player: {
      name: "Luca Bianchi",
      age: 23,
      position: "DFC",
      foot: "right",
      vsi: 68,
      vsiBreakdown: { technical: 60, tactical: 75, physical: 82, mental: 70 },
      phvOffset: 6,
      phvCategory: "on-time",
      tags: ["central", "duelos aéreos", "líder defensivo"],
    },
    listing: {
      listingType: "sale",
      askingPriceEur: 280_000,
      description: "Central de área, fuerte en juego aéreo. Capitán del equipo actual.",
      acceptsOffers: true,
    },
  },
  {
    player: {
      name: "Pol Esteve",
      age: 18,
      position: "EXI",
      foot: "right",
      vsi: 74,
      vsiBreakdown: { technical: 80, tactical: 68, physical: 75, mental: 73 },
      phvOffset: 0.5,
      phvCategory: "on-time",
      tags: ["regate", "rápido", "verticalidad"],
    },
    listing: {
      listingType: "loan",
      askingPriceEur: 0,
      description: "Extremo izquierdo desequilibrante con regate y velocidad. Cesión 1 año a club Tercera.",
      acceptsOffers: true,
    },
  },
  {
    player: {
      name: "Hugo Sanz",
      age: 15,
      position: "POR",
      foot: "right",
      vsi: 76,
      vsiBreakdown: { technical: 72, tactical: 78, physical: 80, mental: 75 },
      phvOffset: -2,
      phvCategory: "late",
      tags: ["portero", "juego con pies", "comunicación"],
    },
    listing: {
      listingType: "trial",
      askingPriceEur: null,
      description: "Portero juvenil con perfil moderno: juego con pies, comunicación, reflejos. PHV tardío.",
      acceptsOffers: true,
    },
  },
  {
    player: {
      name: "Mateo Galíndez",
      age: 20,
      position: "MCD",
      foot: "right",
      vsi: 71,
      vsiBreakdown: { technical: 70, tactical: 80, physical: 72, mental: 68 },
      phvOffset: 3,
      phvCategory: "on-time",
      tags: ["pivote", "recuperador", "primer pase"],
    },
    listing: {
      listingType: "sale",
      askingPriceEur: 200_000,
      description: "Pivote defensivo con muy buen primer pase. Promedio 12 recuperaciones/partido.",
      acceptsOffers: true,
    },
  },
];

export async function seedDemoListings(): Promise<string[]> {
  const now = new Date().toISOString();
  const ids: string[] = [];

  for (const { player, listing } of SEED_PLAYERS) {
    const listingId = uuid();
    const playerId = `mock-player-${player.name.toLowerCase().replace(/\s+/g, "-")}`;
    const expires = new Date(Date.now() + DEFAULTS.listingTtlDays * 24 * 60 * 60 * 1000).toISOString();

    const full: TransferListing = {
      id: listingId,
      playerId,
      sellerUserId: undefined,
      sellerName: "Club Demo VITAS",
      tenantId: undefined,
      publisherRole: "club",
      listingType: listing.listingType ?? "sale",
      status: "active",
      askingPriceEur: listing.askingPriceEur ?? null,
      currency: "EUR",
      valuationEurAi: listing.askingPriceEur ? Math.round(listing.askingPriceEur * 1.1) : null,
      acceptsOffers: listing.acceptsOffers ?? true,
      visibility: "public",
      description: listing.description ?? null,
      highlightVideoId: null,
      tags: player.tags,
      playerSnapshot: {
        name: player.name,
        age: player.age,
        position: player.position,
        foot: player.foot,
        vsi: player.vsi,
        phvOffset: player.phvOffset,
        phvCategory: player.phvCategory,
      },
      expiresAt: expires,
      createdAt: now,
      updatedAt: now,
    };
    // Also attach vsiBreakdown for matchScorer (in snapshot as extension)
    (full.playerSnapshot as Record<string, unknown>).vsiBreakdown = player.vsiBreakdown;

    await TransferMarketService.saveListing(full);
    ids.push(listingId);
  }

  return ids;
}

export async function clearMockListings(): Promise<void> {
  const all = await TransferMarketService.listListings();
  for (const l of all) {
    if (l.sellerName === "Club Demo VITAS") {
      await TransferMarketService.deleteListing(l.id);
    }
  }
}
