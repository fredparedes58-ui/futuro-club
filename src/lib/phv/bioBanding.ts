/**
 * VITAS · Bio-banding automático (Sprint 2.2)
 *
 * Reagrupa jugadores por EDAD BIOLÓGICA en vez de cronológica, para
 * comparaciones justas. Práctica respaldada por la Premier League (bio-banding
 * programme) pero que ningún producto de scouting comercial automatiza.
 *
 * Un Sub-14 cronológico madurador tardío (bio 12.5) compite injustamente
 * contra Sub-14 precoces (bio 15.5). El bio-banding los reagrupa por bio-edad.
 */

export interface BioBand {
  key: string;
  label: string;
  minBioAge: number;
  maxBioAge: number;
}

/** Bandas biológicas de 1.5 años (estándar del bio-banding PL). */
export const BIO_BANDS: BioBand[] = [
  { key: "bio-u11", label: "Bio Sub-11", minBioAge: 0, maxBioAge: 11 },
  { key: "bio-u13", label: "Bio Sub-13", minBioAge: 11, maxBioAge: 13 },
  { key: "bio-u15", label: "Bio Sub-15", minBioAge: 13, maxBioAge: 15 },
  { key: "bio-u17", label: "Bio Sub-17", minBioAge: 15, maxBioAge: 17 },
  { key: "bio-u19", label: "Bio Sub-19", minBioAge: 17, maxBioAge: 19 },
  { key: "bio-senior", label: "Bio Senior", minBioAge: 19, maxBioAge: 99 },
];

export function bioBandFor(biologicalAge: number): BioBand {
  return (
    BIO_BANDS.find((b) => biologicalAge >= b.minBioAge && biologicalAge < b.maxBioAge) ??
    BIO_BANDS[BIO_BANDS.length - 1]
  );
}

/** Chronological band (para contraste con la bio-band). */
export function chronoBandLabel(age: number): string {
  if (age < 11) return "Sub-11";
  if (age < 13) return "Sub-13";
  if (age < 15) return "Sub-15";
  if (age < 17) return "Sub-17";
  if (age < 19) return "Sub-19";
  return "Senior";
}

export interface BioBandedPlayer<T> {
  player: T;
  biologicalAge: number;
  bioBand: BioBand;
  chronoBand: string;
  /** true si el jugador cambia de banda al usar bio-edad (el caso interesante). */
  reband: boolean;
}

/**
 * Agrupa una lista de jugadores por banda biológica.
 * `getBio` extrae (biologicalAge, chronologicalAge) de cada jugador.
 */
export function groupByBioBand<T>(
  players: T[],
  getBio: (p: T) => { biologicalAge: number; chronologicalAge: number },
): Map<string, BioBandedPlayer<T>[]> {
  const groups = new Map<string, BioBandedPlayer<T>[]>();

  for (const player of players) {
    const { biologicalAge, chronologicalAge } = getBio(player);
    const bioBand = bioBandFor(biologicalAge);
    const chronoBand = chronoBandLabel(chronologicalAge);
    const entry: BioBandedPlayer<T> = {
      player,
      biologicalAge,
      bioBand,
      chronoBand,
      reband: bioBand.label.replace("Bio ", "") !== chronoBand,
    };
    const list = groups.get(bioBand.key) ?? [];
    list.push(entry);
    groups.set(bioBand.key, list);
  }

  return groups;
}
