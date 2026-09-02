/**
 * ClubAccessPanel — Rama B (clubes)
 *
 * Director: muestra el código para compartir + las solicitudes pendientes con
 * aprobar/rechazar.
 * Resto de usuarios: formulario para solicitar unirse a un club por su código.
 *
 * Toda la autorización real vive en la API (/api/team/*). Este panel solo
 * orquesta las llamadas.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Copy, RefreshCw, Check, X, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useUserProfile } from "@/hooks/useUserProfile";
import {
  useJoinCode,
  useRegenJoinCode,
  useAccessRequests,
  useDecideRequest,
  useRequestAccess,
} from "@/hooks/useTeam";

function DirectorView() {
  const { t } = useTranslation();
  const joinCode = useJoinCode(true);
  const regen = useRegenJoinCode();
  const requests = useAccessRequests(true);
  const decide = useDecideRequest();
  const [deciding, setDeciding] = useState<string | null>(null);

  const code = joinCode.data ?? "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t("clubAccess.codeCopied"));
    } catch {
      toast.error(t("clubAccess.copyFailed"));
    }
  };

  const onDecide = async (requestId: string, decision: "approve" | "reject") => {
    setDeciding(requestId);
    try {
      await decide.mutateAsync({ requestId, decision });
      toast.success(decision === "approve" ? t("clubAccess.approved") : t("clubAccess.rejected"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("clubAccess.decideError"));
    } finally {
      setDeciding(null);
    }
  };

  const list = requests.data ?? [];

  return (
    <div className="space-y-4">
      {/* Código para compartir */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("clubAccess.shareCodeHint")}</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 rounded-lg bg-muted font-mono text-sm text-foreground tracking-wider text-center">
            {joinCode.isLoading ? "…" : code || "—"}
          </code>
          <button
            onClick={copy}
            disabled={!code}
            className="p-2 rounded-lg bg-secondary hover:bg-muted transition-colors disabled:opacity-40"
            aria-label={t("clubAccess.copy")}
          >
            <Copy size={16} className="text-foreground" />
          </button>
          <button
            onClick={() => regen.mutate()}
            disabled={regen.isPending}
            className="p-2 rounded-lg bg-secondary hover:bg-muted transition-colors disabled:opacity-40"
            aria-label={t("clubAccess.regenerate")}
          >
            <RefreshCw size={16} className={`text-foreground ${regen.isPending ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Solicitudes pendientes */}
      <div className="space-y-2">
        <p className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider">
          {t("clubAccess.pendingRequests")} ({list.length})
        </p>
        {requests.isLoading ? (
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        ) : list.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("clubAccess.noRequests")}</p>
        ) : (
          <div className="space-y-2">
            {list.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display text-foreground truncate">
                    {r.requesterEmail ?? r.requesterId}
                  </p>
                  {r.message && <p className="text-[11px] text-muted-foreground truncate">{r.message}</p>}
                </div>
                <button
                  onClick={() => onDecide(r.id, "approve")}
                  disabled={deciding === r.id}
                  className="p-1.5 rounded-lg bg-green-500/15 hover:bg-green-500/25 text-green-600 transition-colors disabled:opacity-40"
                  aria-label={t("clubAccess.approve")}
                >
                  {deciding === r.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                </button>
                <button
                  onClick={() => onDecide(r.id, "reject")}
                  disabled={deciding === r.id}
                  className="p-1.5 rounded-lg bg-destructive/15 hover:bg-destructive/25 text-destructive transition-colors disabled:opacity-40"
                  aria-label={t("clubAccess.reject")}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MemberView() {
  const { t } = useTranslation();
  const requestAccess = useRequestAccess();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const submit = async () => {
    if (!code.trim()) return;
    try {
      const { orgName } = await requestAccess.mutateAsync({ code: code.trim(), message: message.trim() || undefined });
      setSent(orgName);
      setCode("");
      setMessage("");
      toast.success(t("clubAccess.requestSent", { org: orgName }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("clubAccess.requestError"));
    }
  };

  if (sent) {
    return (
      <div className="text-center space-y-2 py-2">
        <Check size={28} className="text-green-500 mx-auto" />
        <p className="text-sm text-foreground">{t("clubAccess.requestSent", { org: sent })}</p>
        <p className="text-xs text-muted-foreground">{t("clubAccess.awaitApproval")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("clubAccess.joinHint")}</p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t("clubAccess.codePlaceholder")}
        className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground font-mono tracking-wider outline-none focus:border-primary"
      />
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t("clubAccess.messagePlaceholder")}
        maxLength={500}
        className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground outline-none focus:border-primary"
      />
      <button
        onClick={submit}
        disabled={!code.trim() || requestAccess.isPending}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40"
      >
        {requestAccess.isPending ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
        {t("clubAccess.requestButton")}
      </button>
    </div>
  );
}

export default function ClubAccessPanel() {
  const { t } = useTranslation();
  const { isDirector } = useUserProfile();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4 space-y-3"
    >
      <h2 className="font-display font-semibold text-sm text-foreground flex items-center gap-2">
        <Users size={14} className="text-primary" />
        {isDirector ? t("clubAccess.directorTitle") : t("clubAccess.memberTitle")}
      </h2>
      {isDirector ? <DirectorView /> : <MemberView />}
    </motion.div>
  );
}
