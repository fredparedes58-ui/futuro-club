/**
 * VITAS · Telegram Connect (Sprint B5 · día 4)
 *
 * Card que vive en Settings · gestiona el vínculo del coach con el bot Telegram.
 * Estados: not connected → loading → linked  /  reconnect on error.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Loader2, ExternalLink, CheckCircle2, X, Copy, Sparkles, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { getAuthHeaders } from "@/lib/apiAuth";

interface ConnectResponse {
  token: string;
  deepLink: string;
  botUsername: string;
  expiresAt: string;
  ttlSeconds: number;
  instructions: string;
}

interface StatusResponse {
  connected: boolean;
  botUsername: string;
  mapping: {
    telegram_username: string | null;
    telegram_first_name: string | null;
    linked_at: string;
    last_active_at: string | null;
    conversation_count: number;
  } | null;
}

export default function TelegramConnect() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [pendingLink, setPendingLink] = useState<ConnectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);

  async function loadStatus() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/telegram/connect", { headers });
      const data = await res.json();
      if (res.ok && data.success) setStatus(data.data as StatusResponse);
    } catch { /* silencioso */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStatus(); }, []);

  // Countdown del token activo · refresca cada segundo
  useEffect(() => {
    if (!pendingLink) return;
    const update = () => {
      const remaining = Math.max(0, Math.floor((new Date(pendingLink.expiresAt).getTime() - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) setPendingLink(null);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [pendingLink]);

  // Auto-refresh status mientras hay un token pendiente · checa si el coach
  // ya completó el vínculo en Telegram (cada 3s)
  useEffect(() => {
    if (!pendingLink) return;
    const id = setInterval(async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/telegram/connect", { headers });
        const data = await res.json();
        if (res.ok && data.success && data.data.connected) {
          setStatus(data.data);
          setPendingLink(null);
          toast.success("✅ Telegram vinculado · ya puedes chatear con el bot");
        }
      } catch { /* silencioso */ }
    }, 3000);
    return () => clearInterval(id);
  }, [pendingLink]);

  async function handleConnect() {
    if (generating) return;
    setGenerating(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/telegram/connect", {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message ?? "Error");
      setPendingLink(data.data as ConnectResponse);
      // Abrir deep-link automáticamente en nueva pestaña/app
      window.open(data.data.deepLink, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error generando link");
    } finally {
      setGenerating(false);
    }
  }

  async function handleUnlink() {
    if (unlinking) return;
    if (!confirm("¿Desvincular Telegram? Tendrás que volver a conectar para usar el bot.")) return;
    setUnlinking(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/telegram/connect", { method: "DELETE", headers });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data?.error?.message ?? "Error");
      setStatus(null);
      await loadStatus();
      toast.success("🔓 Desvinculado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setUnlinking(false);
    }
  }

  function copyLink() {
    if (!pendingLink) return;
    navigator.clipboard.writeText(pendingLink.deepLink).catch(() => null);
    toast.success("Link copiado");
  }

  if (loading) {
    return (
      <div className="glass rounded-xl p-3 flex items-center gap-2">
        <Loader2 size={12} className="animate-spin text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">Cargando estado…</span>
      </div>
    );
  }

  // ── ESTADO: VINCULADO ─────────────────────────────────────────
  if (status?.connected && status.mapping) {
    const m = status.mapping;
    return (
      <div className="glass rounded-xl p-4 border border-green-400/30 bg-green-400/5 space-y-2">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-400/20 border border-green-400/40 flex items-center justify-center shrink-0">
            <CheckCircle2 size={16} className="text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Send size={11} className="text-green-400" />
              <span className="text-[10px] uppercase tracking-wider text-green-400 font-bold">
                Telegram vinculado
              </span>
            </div>
            <div className="text-sm font-display font-bold text-foreground truncate">
              {m.telegram_first_name ?? "Coach"}
              {m.telegram_username && <span className="text-muted-foreground font-normal"> · @{m.telegram_username}</span>}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {m.conversation_count ?? 0} conversaciones
              {m.last_active_at && ` · activo ${timeAgo(m.last_active_at)}`}
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <a
            href={`https://t.me/${status.botUsername}`}
            target="_blank"
            rel="noopener"
            className="flex-1 py-2 rounded-lg bg-secondary/50 border border-border text-center text-[11px] font-display font-bold text-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-1.5"
          >
            <ExternalLink size={11} /> Abrir bot
          </a>
          <button
            onClick={handleUnlink}
            disabled={unlinking}
            className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-[11px] font-display font-bold text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
          >
            {unlinking ? <Loader2 size={11} className="animate-spin" /> : "Desvincular"}
          </button>
        </div>
      </div>
    );
  }

  // ── ESTADO: TOKEN PENDIENTE (esperando que el coach pulse Iniciar) ──
  if (pendingLink) {
    const mins = Math.floor(countdown / 60);
    const secs = countdown % 60;
    return (
      <div className="glass rounded-xl p-4 border border-electric/40 bg-electric/5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-electric/20 border border-electric/40 flex items-center justify-center shrink-0">
            <Loader2 size={16} className="text-electric animate-spin" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wider text-electric font-bold">
              Esperando confirmación…
            </div>
            <div className="text-sm font-display font-bold text-foreground">
              Abre Telegram y pulsa <span className="text-electric">Iniciar</span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              Token expira en {mins.toString().padStart(2, "0")}:{secs.toString().padStart(2, "0")}
            </div>
          </div>
          <button
            onClick={() => setPendingLink(null)}
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label="Cancelar"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex gap-2">
          <a
            href={pendingLink.deepLink}
            target="_blank"
            rel="noopener"
            className="flex-1 py-2 rounded-lg bg-electric text-background text-center text-[11px] font-display font-bold hover:bg-electric/90 transition-colors flex items-center justify-center gap-1.5"
          >
            <Send size={11} /> Abrir en Telegram
          </a>
          <button
            onClick={copyLink}
            className="px-3 py-2 rounded-lg bg-secondary/50 border border-border text-[11px] font-display font-bold text-foreground hover:bg-secondary transition-colors flex items-center gap-1"
          >
            <Copy size={11} /> Link
          </button>
        </div>

        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {pendingLink.instructions}
        </p>
      </div>
    );
  }

  // ── ESTADO: NO CONECTADO ──────────────────────────────────────
  return (
    <div className="glass rounded-xl p-4 border border-primary/30 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
          <Send size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-display font-bold text-foreground">VITAS Copilot · Telegram</span>
            <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
              <Sparkles size={9} className="inline -mt-0.5 mr-0.5" />Beta
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Habla con el bot en tu Telegram · pregúntale por jugadores, equipos, drills.
            Respuesta en 5s · sin abrir la app.
          </p>
        </div>
      </div>

      <button
        onClick={handleConnect}
        disabled={generating}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
      >
        {generating ? (
          <><Loader2 size={12} className="animate-spin" /> Generando link…</>
        ) : (
          <><Send size={12} /> Conectar Telegram</>
        )}
      </button>

      <div className="flex items-start gap-2 text-[10px] text-muted-foreground border-t border-border/40 pt-2">
        <AlertCircle size={10} className="shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          El link te llevará al bot · pulsa <strong>Iniciar</strong> y listo · expira en 10 min.
          Solo lo usas tú · puedes desvincular cuando quieras.
        </p>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
