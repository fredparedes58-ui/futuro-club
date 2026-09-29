/**
 * VITAS · MatchVideoPicker — the video step of a full-match job.
 *
 * Either upload with the existing VideoUpload (resumable TUS, PR #292) or pick a
 * video already in the account. The job only needs the Bunny video id: it starts
 * as soon as the file is entirely in Bunny (`onUploaded`), without waiting for the
 * encode (which can take hours; the server waits for it). A browser-only video
 * (no cloud upload, id "local-…") cannot be analysed server-side and says so.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Film, Upload } from "lucide-react";
import VideoUpload from "@/components/VideoUpload";
import { useVideos } from "@/hooks/useVideos";
import type { VideoRecord } from "@/services/real/videoService";

export interface PickedVideo {
  videoId: string;
  title: string | null;
  /** "upload" = the TUS upload just finished in this tab; "existing" = picked from the account. */
  source: "upload" | "existing";
}

interface MatchVideoPickerProps {
  value: PickedVideo | null;
  onChange: (v: PickedVideo | null) => void;
}

/** Videos the server can analyse: uploaded to Bunny, not failed. */
export function isJobEligibleVideo(v: VideoRecord): boolean {
  return !v.id.startsWith("local-") && v.status !== "error" && v.status !== "upload-failed";
}

export default function MatchVideoPicker({ value, onChange }: MatchVideoPickerProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"upload" | "existing">("upload");
  const [notice, setNotice] = useState<string | null>(null);
  const { data: videos = [] } = useVideos();
  const eligible = videos.filter(isJobEligibleVideo);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3" data-testid="match-video-selected">
        <CheckCircle2 size={14} className="text-green-500 shrink-0" />
        <p className="flex-1 min-w-0 text-[11px] text-foreground truncate">
          {t("matchJob.video.selected", { title: value.title || value.videoId })}
        </p>
        <button type="button" onClick={() => onChange(null)} className="text-[10px] font-bold text-primary hover:underline">
          {t("matchJob.video.change")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "upload"}
          onClick={() => setMode("upload")}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-bold ${
            mode === "upload" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
          }`}
        >
          <Upload size={12} /> {t("matchJob.video.upload")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "existing"}
          onClick={() => setMode("existing")}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-bold ${
            mode === "existing" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
          }`}
        >
          <Film size={12} /> {t("matchJob.video.pickExisting")}
        </button>
      </div>

      {mode === "upload" ? (
        <VideoUpload
          onUploaded={(videoId) => {
            setNotice(null);
            onChange({ videoId, title: null, source: "upload" });
          }}
          onDone={(videoId) => {
            // Local-only fallback (no Bunny): never startable server-side.
            if (videoId.startsWith("local-")) setNotice(t("matchJob.video.localOnly"));
          }}
        />
      ) : eligible.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{t("matchJob.video.noExisting")}</p>
      ) : (
        <select
          aria-label={t("matchJob.video.pickExisting")}
          defaultValue=""
          onChange={(e) => {
            const v = eligible.find((x) => x.id === e.target.value);
            if (v) onChange({ videoId: v.id, title: v.title || null, source: "existing" });
          }}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none"
        >
          <option value="" disabled>
            {t("matchJob.video.pickPlaceholder")}
          </option>
          {eligible.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title || v.id}
            </option>
          ))}
        </select>
      )}

      {notice && (
        <p role="status" className="text-[11px] text-amber-600 dark:text-amber-400">
          {notice}
        </p>
      )}
    </div>
  );
}
