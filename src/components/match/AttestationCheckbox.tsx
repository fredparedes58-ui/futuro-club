/**
 * VITAS · AttestationCheckbox — coach declaration required to start a match job
 * (owner decision 1, docs/diseno-partido-completo.md §0).
 *
 * The text shown is the i18n translation of EXACTLY the version the server
 * accepts (MATCH_ATTESTATION_VERSION). The key embeds the version, and the map
 * below is typed by that version: bumping the version in the contract without a
 * new i18n key fails the typecheck. The server stores attested_by (JWT user),
 * attested_at (server clock) and attestation_version; nothing is taken from the
 * browser except `accepted: true` + the version.
 */

import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { MATCH_ATTESTATION_VERSION } from "@/lib/shared/matchJob/contract";

/** i18n key of the declaration text, per contract version. */
export const ATTESTATION_TEXT_KEYS: Readonly<Record<typeof MATCH_ATTESTATION_VERSION, string>> = {
  "2026-09-28.v1": "matchJob.attestation.text_2026_09_28_v1",
};

/** Body fragment for POST /api/match/start (null while not ticked ⇒ the start stays disabled). */
export function buildAttestation(checked: boolean): { accepted: true; version: typeof MATCH_ATTESTATION_VERSION } | null {
  return checked ? { accepted: true, version: MATCH_ATTESTATION_VERSION } : null;
}

interface AttestationCheckboxProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function AttestationCheckbox({ id, checked, onChange }: AttestationCheckboxProps) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1">
      <label htmlFor={id} className="flex items-start gap-2 cursor-pointer">
        <input
          id={id}
          type="checkbox"
          required
          aria-required="true"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary shrink-0"
        />
        <span className="text-[11px] text-foreground leading-relaxed">
          {t(ATTESTATION_TEXT_KEYS[MATCH_ATTESTATION_VERSION])}
          <span className="text-destructive"> *</span>
        </span>
      </label>
      <p className="flex items-center gap-1 pl-6 text-[10px] text-muted-foreground">
        <ShieldCheck size={10} />
        {checked ? t("matchJob.attestation.version", { version: MATCH_ATTESTATION_VERSION }) : t("matchJob.attestation.required")}
      </p>
    </div>
  );
}
