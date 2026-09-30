/**
 * VITAS · Declared kit colours — perceptual distance between two teams' shirts.
 *
 * Team identity on the match-video path comes ONLY from the kit colours the coach
 * declares (.claude/rules/identidad.md: kit colour, never face). When the two
 * declared shirts are perceptually close, Gemini is more likely to abstain
 * ("teams_ambiguous"), so the picker warns BEFORE the job starts. The warning is
 * advisory: it never blocks the start and never changes what is sent.
 *
 * Distance = CIEDE2000 (Sharma, Wu & Dalal 2005) between the declared hex colours
 * converted sRGB (D65) → CIELAB. This is a different concept from the pixel-crop
 * histogram distance of src/lib/yolo colour re-id (tracking), which compares
 * observed torso pixels, not two declared colours.
 *
 * The warning threshold lives in config/matchVideoUi.json (kitDeltaEWarn,
 * "pendiente de validar"). Nothing here is a product metric and no ΔE number is
 * rendered to the user.
 */

import { HEX_COLOUR_RE } from "@/lib/shared/matchJob/contract";
import { MATCH_UI_CONFIG } from "@/lib/match/matchUiConfig";

export interface Lab {
  L: number;
  a: number;
  b: number;
}

/** Colour as declared in the picker (hex required, human label optional). */
export interface DeclaredColour {
  hex: string;
  label?: string;
}

/** A team's kit while the coach is filling the form (shirt still missing ⇒ null). */
export interface KitDraft {
  shirt: DeclaredColour | null;
  shorts: DeclaredColour | null;
  gk: DeclaredColour | null;
}

export const EMPTY_KIT_DRAFT: KitDraft = { shirt: null, shorts: null, gk: null };

// sRGB companding and D65 matrices (IEC 61966-2-1) — formula constants, not tunables.
const SRGB_LINEAR_THRESHOLD = 0.04045;
const D65_WHITE = { x: 0.95047, y: 1.0, z: 1.08883 };
const LAB_EPSILON = (6 / 29) ** 3;

function srgbChannelToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= SRGB_LINEAR_THRESHOLD ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function labF(t: number): number {
  return t > LAB_EPSILON ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29;
}

/** "#RRGGBB" → CIELAB (D65). Throws on anything that is not a 6-digit hex colour. */
export function hexToLab(hex: string): Lab {
  if (!HEX_COLOUR_RE.test(hex)) throw new Error(`invalid hex colour: ${hex}`);
  const r = srgbChannelToLinear(parseInt(hex.slice(1, 3), 16));
  const g = srgbChannelToLinear(parseInt(hex.slice(3, 5), 16));
  const b = srgbChannelToLinear(parseInt(hex.slice(5, 7), 16));
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;
  const fx = labF(x / D65_WHITE.x);
  const fy = labF(y / D65_WHITE.y);
  const fz = labF(z / D65_WHITE.z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
const POW25_7 = 25 ** 7;

/** CIEDE2000 colour difference (kL = kC = kH = 1). */
export function deltaE2000(p: Lab, q: Lab): number {
  const c1 = Math.hypot(p.a, p.b);
  const c2 = Math.hypot(q.a, q.b);
  const cBar7 = ((c1 + c2) / 2) ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + POW25_7)));
  const a1 = (1 + g) * p.a;
  const a2 = (1 + g) * q.a;
  const c1p = Math.hypot(a1, p.b);
  const c2p = Math.hypot(a2, q.b);
  const hue = (bb: number, aa: number) => {
    if (bb === 0 && aa === 0) return 0;
    const h = deg(Math.atan2(bb, aa));
    return h < 0 ? h + 360 : h;
  };
  const h1 = hue(p.b, a1);
  const h2 = hue(q.b, a2);

  const dL = q.L - p.L;
  const dC = c2p - c1p;
  let dh = 0;
  if (c1p * c2p !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dh / 2));

  const lBar = (p.L + q.L) / 2;
  const cBarP = (c1p + c2p) / 2;
  let hBar = h1 + h2;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1 - h2) <= 180) hBar = (h1 + h2) / 2;
    else hBar = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos(rad(hBar - 30)) +
    0.24 * Math.cos(rad(2 * hBar)) +
    0.32 * Math.cos(rad(3 * hBar + 6)) -
    0.2 * Math.cos(rad(4 * hBar - 63));
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const cBarP7 = cBarP ** 7;
  const rc = 2 * Math.sqrt(cBarP7 / (cBarP7 + POW25_7));
  const lMinus50Sq = (lBar - 50) ** 2;
  const sl = 1 + (0.015 * lMinus50Sq) / Math.sqrt(20 + lMinus50Sq);
  const sc = 1 + 0.045 * cBarP;
  const sh = 1 + 0.015 * cBarP * t;
  const rt = -Math.sin(rad(2 * dTheta)) * rc;
  const termL = dL / sl;
  const termC = dC / sc;
  const termH = dH / sh;
  return Math.sqrt(termL * termL + termC * termC + termH * termH + rt * termC * termH);
}

/** ΔE00 between two declared colours. */
export function declaredColourDistance(x: DeclaredColour, y: DeclaredColour): number {
  return deltaE2000(hexToLab(x.hex), hexToLab(y.hex));
}

export interface KitSimilarity {
  /** true ⇒ show the warning (shirts too close and the shorts do not separate the teams). */
  tooSimilar: boolean;
  /** Shirts closer than the configured threshold. */
  shirtsClose: boolean;
  /** Both shorts declared and far enough apart to help tell the teams apart. */
  shortsSeparate: boolean;
}

/**
 * Advisory similarity check between the two declared kits. Returns null while a
 * shirt is missing (nothing to compare — never a guessed default colour).
 */
export function assessKitSimilarity(
  home: KitDraft,
  away: KitDraft,
  threshold: number = MATCH_UI_CONFIG.kitDeltaEWarn,
): KitSimilarity | null {
  if (!home.shirt || !away.shirt) return null;
  const shirtsClose = declaredColourDistance(home.shirt, away.shirt) < threshold;
  const shortsSeparate =
    !!home.shorts && !!away.shorts && declaredColourDistance(home.shorts, away.shorts) >= threshold;
  return { shirtsClose, shortsSeparate, tooSimilar: shirtsClose && !shortsSeparate };
}

/** Draft → contract TeamKit (undefined while the shirt is missing). Labels are trimmed; empty ⇒ omitted. */
export function kitDraftToTeamKit(
  draft: KitDraft,
): { shirt: DeclaredColour; shorts?: DeclaredColour; gk?: DeclaredColour } | undefined {
  if (!draft.shirt) return undefined;
  const clean = (c: DeclaredColour): DeclaredColour => {
    const label = c.label?.trim();
    return label ? { hex: c.hex.toUpperCase(), label } : { hex: c.hex.toUpperCase() };
  };
  return {
    shirt: clean(draft.shirt),
    ...(draft.shorts ? { shorts: clean(draft.shorts) } : {}),
    ...(draft.gk ? { gk: clean(draft.gk) } : {}),
  };
}
