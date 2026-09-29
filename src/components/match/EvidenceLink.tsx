/**
 * VITAS · EvidenceLink — "mm:ss" chip that opens the Bunny embed at that video time.
 *
 * An evidence item is an AI POINTER to a moment, not a verified fact
 * (docs/diseno-partido-completo.md §8): the chip says so and opens the player so
 * a human can check. URL = server-built `playback.embedUrl` + Bunny's `t` start
 * parameter (src/lib/match/evidenceEmbed.ts). Without a playable embed the chip is
 * disabled and says why — never a dead link.
 */

import { useTranslation } from "react-i18next";
import { ExternalLink, PlayCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildEvidenceEmbedUrl } from "@/lib/match/evidenceEmbed";
import type { EvidenceItem } from "@/lib/shared/matchJob/contract";
import { formatVideoTime } from "@/lib/match/videoTime";

/** The two fields of a contract EvidenceItem the chip needs (same inferred shape as the schema). */
export type EvidenceTarget = Pick<EvidenceItem, "id" | "t_start">;

export interface OpenEvidence {
  url: string;
  seconds: number;
  evidenceId: string;
}

interface EvidenceLinkProps {
  item: EvidenceTarget;
  /** status.playback.embedUrl (null ⇒ no playable video: chip disabled). */
  embedUrl: string | null;
  /** Opens the in-app player; without it the embed opens in a new tab. */
  onOpen?: (target: OpenEvidence) => void;
}

export default function EvidenceLink({ item, embedUrl, onOpen }: EvidenceLinkProps) {
  const { t } = useTranslation();
  const time = formatVideoTime(item.t_start);
  const url = buildEvidenceEmbedUrl(embedUrl, item.t_start);
  const title = url ? t("matchJob.evidence.chipTitle", { time }) : t("matchJob.evidence.unavailable");

  return (
    <button
      type="button"
      data-evidence-id={item.id}
      disabled={!url}
      title={title}
      aria-label={title}
      onClick={() => {
        if (!url) return;
        if (onOpen) onOpen({ url, seconds: Math.floor(item.t_start), evidenceId: item.id });
        else window.open(url, "_blank", "noopener,noreferrer");
      }}
      className="inline-flex items-center gap-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-600 dark:text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <PlayCircle size={10} />
      {time}
    </button>
  );
}

/** In-app Bunny player opened by an evidence chip (one per report view). */
export function EvidencePlayerDialog({ target, onClose }: { target: OpenEvidence | null; onClose: () => void }) {
  const { t } = useTranslation();
  const time = target ? formatVideoTime(target.seconds) : "";
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("matchJob.evidence.dialogTitle", { time })}</DialogTitle>
          <DialogDescription>{t("matchJob.evidence.dialogNote")}</DialogDescription>
        </DialogHeader>
        {target && (
          <div className="space-y-2">
            <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ paddingTop: "56.25%" }}>
              <iframe
                key={target.url}
                src={target.url}
                title={t("matchJob.evidence.dialogTitle", { time })}
                loading="lazy"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            </div>
            <a
              href={target.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <ExternalLink size={11} /> {t("matchJob.evidence.openNewTab")}
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
