/**
 * VITAS · KitColourPicker — the ONLY way a team is identified on the match-video path.
 *
 * Shirt colour required (no default: the slot stays empty until the coach picks),
 * shorts and goalkeeper optional. Team identity is by declared kit colour only —
 * never face, never shirt number (.claude/rules/identidad.md).
 *
 * KitSimilarityWarning warns (never blocks) when the two declared shirts are closer
 * than kitDeltaEWarn (CIEDE2000, config/matchVideoUi.json, "pendiente de validar")
 * and the shorts do not separate the teams: the AI will abstain more often.
 */

import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, X } from "lucide-react";
import type { DeclaredColour, KitDraft } from "@/lib/match/kitColour";
import { assessKitSimilarity } from "@/lib/match/kitColour";

/** Common kit colours (picker shortcuts; the custom input accepts any colour). */
export const KIT_SWATCHES: readonly { key: string; hex: string }[] = [
  { key: "white", hex: "#FFFFFF" },
  { key: "black", hex: "#000000" },
  { key: "red", hex: "#D32F2F" },
  { key: "maroon", hex: "#7B1F2B" },
  { key: "orange", hex: "#EF6C00" },
  { key: "yellow", hex: "#FBC02D" },
  { key: "green", hex: "#2E7D32" },
  { key: "skyBlue", hex: "#4FC3F7" },
  { key: "blue", hex: "#1565C0" },
  { key: "navy", hex: "#0D1B4C" },
  { key: "purple", hex: "#6A1B9A" },
  { key: "pink", hex: "#EC407A" },
  { key: "grey", hex: "#9E9E9E" },
];

type Slot = "shirt" | "shorts" | "gk";
const SLOTS: readonly Slot[] = ["shirt", "shorts", "gk"];

interface KitColourPickerProps {
  /** Stable id prefix for inputs (e.g. "home"). */
  idPrefix: string;
  /** Team label shown in the heading (team name or "Local"). */
  title: string;
  value: KitDraft;
  onChange: (next: KitDraft) => void;
  /** Shirt is mandatory for this team (both teams in match_ab; own team in team_baseline). */
  required?: boolean;
}

export default function KitColourPicker({ idPrefix, title, value, onChange, required = true }: KitColourPickerProps) {
  const { t } = useTranslation();

  const setSlot = (slot: Slot, colour: DeclaredColour | null) => onChange({ ...value, [slot]: colour });

  return (
    <fieldset className="space-y-3" data-testid={`kit-picker-${idPrefix}`}>
      <legend className="text-[10px] font-display text-muted-foreground uppercase tracking-wider mb-1">
        {t("matchJob.kit.title", { team: title })}
      </legend>
      {SLOTS.map((slot) => {
        const colour = value[slot];
        const slotLabel = t(`matchJob.kit.${slot}`);
        const optional = slot !== "shirt" || !required;
        return (
          <div key={slot} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-foreground">
                {slotLabel}
                {!optional && <span className="text-destructive"> *</span>}
              </span>
              {colour && optional && (
                <button
                  type="button"
                  onClick={() => setSlot(slot, null)}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  <X size={10} /> {t("matchJob.kit.clear")}
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {KIT_SWATCHES.map((s) => {
                const name = t(`matchJob.kit.colour.${s.key}`);
                const selected = colour?.hex.toUpperCase() === s.hex;
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${slotLabel}: ${name}`}
                    title={name}
                    onClick={() => setSlot(slot, { hex: s.hex, label: name })}
                    className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                      selected ? "ring-2 ring-primary ring-offset-1 ring-offset-background border-primary" : "border-border"
                    }`}
                    style={{ backgroundColor: s.hex }}
                  >
                    {selected && <Check size={11} className="text-white mix-blend-difference" />}
                  </button>
                );
              })}
              <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                <input
                  type="color"
                  aria-label={`${slotLabel}: ${t("matchJob.kit.custom")}`}
                  value={colour?.hex ?? "#808080"}
                  onChange={(e) => setSlot(slot, { hex: e.target.value.toUpperCase(), label: colour?.label })}
                  className="w-6 h-6 p-0 border border-border rounded bg-transparent"
                />
                {t("matchJob.kit.custom")}
              </label>
            </div>
            {colour ? (
              <input
                type="text"
                id={`${idPrefix}-${slot}-label`}
                maxLength={40}
                value={colour.label ?? ""}
                onChange={(e) => setSlot(slot, { hex: colour.hex, label: e.target.value })}
                placeholder={t("matchJob.kit.labelPlaceholder")}
                aria-label={`${slotLabel}: ${t("matchJob.kit.label")}`}
                className="w-full px-2 py-1 rounded-md bg-background border border-border text-[11px] text-foreground focus:border-primary focus:outline-none"
              />
            ) : (
              !optional && <p className="text-[10px] text-destructive">{t("matchJob.kit.shirtRequired")}</p>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

/** Advisory warning when the two declared kits are hard to tell apart. Renders nothing otherwise. */
export function KitSimilarityWarning({ home, away }: { home: KitDraft; away: KitDraft }) {
  const { t } = useTranslation();
  const s = assessKitSimilarity(home, away);
  if (!s?.tooSimilar) return null;
  return (
    <div
      role="status"
      data-testid="kit-similarity-warning"
      className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5"
    >
      <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
      <p className="text-[11px] text-foreground leading-relaxed">{t("matchJob.kit.similarWarning")}</p>
    </div>
  );
}

/** One-line reminder of the identity rule (kit colour only). */
export function KitIdentityNote() {
  const { t } = useTranslation();
  return <p className="text-[10px] text-muted-foreground leading-relaxed">{t("matchJob.kit.identityNote")}</p>;
}
