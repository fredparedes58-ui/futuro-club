/**
 * VITAS · Parental Consent Management — /admin/consent
 *
 * Gestión de consentimiento parental para menores (<14 años RGPD España).
 * Conecta con las tablas creadas en migración 036:
 *   - players (parental_consent_* columns)
 *   - consent_audit_log
 *   - v_players_ai_blocked
 *
 * Funciona con Supabase o con datos mock cuando no está configurado.
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Shield, UserCheck, UserX, Clock, AlertTriangle,
  Send, CheckCircle2, XCircle, Loader2, Info, Search,
  Baby, Mail, FileText, Download, Trash2, Eye,
} from "lucide-react";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

/* ── Types ─────────────────────────────────────────────────────── */

interface ConsentPlayer {
  id: string;
  name: string;
  birth_date: string | null;
  age_years: number | null;
  parental_consent_status: "pending" | "granted" | "denied" | "not_required";
  parental_consent_granted_at: string | null;
  parental_consent_guardian_name: string | null;
  parental_consent_guardian_email: string | null;
  ai_processing_status?: string;
}

interface AuditEntry {
  id: string;
  player_id: string;
  action: string;
  actor_email: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

type ConsentTab = "pending" | "granted" | "denied" | "audit";

/* ── Mock data ─────────────────────────────────────────────────── */

const MOCK_PLAYERS: ConsentPlayer[] = [
  { id: "m1", name: "Lucas Fernández", birth_date: "2014-03-15", age_years: 12, parental_consent_status: "pending", parental_consent_granted_at: null, parental_consent_guardian_name: null, parental_consent_guardian_email: null },
  { id: "m2", name: "Martina López", birth_date: "2013-08-22", age_years: 12, parental_consent_status: "pending", parental_consent_granted_at: null, parental_consent_guardian_name: null, parental_consent_guardian_email: null },
  { id: "m3", name: "Diego Ruiz", birth_date: "2013-11-05", age_years: 12, parental_consent_status: "granted", parental_consent_granted_at: "2026-04-10T10:30:00Z", parental_consent_guardian_name: "Ana Ruiz Martínez", parental_consent_guardian_email: "ana.ruiz@email.com" },
  { id: "m4", name: "Sofía García", birth_date: "2014-06-18", age_years: 11, parental_consent_status: "denied", parental_consent_granted_at: null, parental_consent_guardian_name: "Carlos García", parental_consent_guardian_email: "carlos.garcia@email.com" },
  { id: "m5", name: "Pablo Moreno", birth_date: "2013-01-30", age_years: 13, parental_consent_status: "pending", parental_consent_granted_at: null, parental_consent_guardian_name: null, parental_consent_guardian_email: null },
];

const MOCK_AUDIT: AuditEntry[] = [
  { id: "a1", player_id: "m3", action: "consent_granted", actor_email: "ana.ruiz@email.com", details: { guardian_name: "Ana Ruiz Martínez" }, created_at: "2026-04-10T10:30:00Z" },
  { id: "a2", player_id: "m4", action: "consent_denied", actor_email: "carlos.garcia@email.com", details: { reason: "No autorizo procesamiento IA" }, created_at: "2026-04-08T14:15:00Z" },
  { id: "a3", player_id: "m1", action: "consent_requested", actor_email: "coach@vitas.app", details: {}, created_at: "2026-04-05T09:00:00Z" },
];

/* ── Status helpers ────────────────────────────────────────────── */

const statusConfig = {
  pending: { label: "Pendiente", icon: <Clock size={14} />, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  granted: { label: "Autorizado", icon: <CheckCircle2 size={14} />, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  denied: { label: "Denegado", icon: <XCircle size={14} />, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
  not_required: { label: "No requerido", icon: <CheckCircle2 size={14} />, color: "text-muted-foreground", bg: "bg-muted/50", border: "border-border" },
};

const actionLabels: Record<string, string> = {
  consent_requested: "Consentimiento solicitado",
  consent_granted: "Consentimiento concedido",
  consent_denied: "Consentimiento denegado",
  consent_revoked: "Consentimiento revocado",
  data_exported: "Datos exportados (DSAR)",
  deletion_requested: "Eliminación solicitada",
};

/* ── Fetch helpers ─────────────────────────────────────────────── */

async function fetchMinorPlayers(): Promise<ConsentPlayer[]> {
  if (!SUPABASE_CONFIGURED) return MOCK_PLAYERS;
  const { data, error } = await supabase
    .from("players")
    .select("id, name, birth_date, parental_consent_status, parental_consent_granted_at, parental_consent_guardian_name, parental_consent_guardian_email")
    .not("birth_date", "is", null)
    .order("name");
  if (error) throw error;

  return (data ?? []).map((p: Record<string, unknown>) => {
    const birthDate = p.birth_date as string | null;
    const ageYears = birthDate
      ? Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
      : null;
    return { ...p, age_years: ageYears } as ConsentPlayer;
  }).filter(p => p.age_years !== null && p.age_years < 14);
}

async function fetchAuditLog(): Promise<AuditEntry[]> {
  if (!SUPABASE_CONFIGURED) return MOCK_AUDIT;
  const { data, error } = await supabase
    .from("consent_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}

/* ── Consent Form Modal ────────────────────────────────────────── */

interface ConsentFormProps {
  player: ConsentPlayer;
  onClose: () => void;
  onSubmit: (data: ConsentFormData) => void;
  submitting: boolean;
}

interface ConsentFormData {
  playerId: string;
  guardianName: string;
  guardianEmail: string;
  action: "grant" | "deny";
}

function ConsentFormModal({ player, onClose, onSubmit, submitting }: ConsentFormProps) {
  const [guardianName, setGuardianName] = useState(player.parental_consent_guardian_name ?? "");
  const [guardianEmail, setGuardianEmail] = useState(player.parental_consent_guardian_email ?? "");
  const [action, setAction] = useState<"grant" | "deny">("grant");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ playerId: player.id, guardianName, guardianEmail, action });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 max-w-lg w-full space-y-5 border border-border/40"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield size={16} className="text-primary" />
            <h2 className="text-sm font-display font-bold text-foreground uppercase tracking-wider">
              Consentimiento Parental
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            RGPD Art. 8 · LOPD Art. 7 · Obligatorio para menores de 14 años
          </p>
        </div>

        {/* Player info */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/20">
          <Baby size={18} className="text-primary" />
          <div>
            <p className="text-sm font-display font-bold text-foreground">{player.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {player.age_years} años · Nacimiento: {player.birth_date ? new Date(player.birth_date).toLocaleDateString("es-ES") : "—"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-display font-semibold text-foreground mb-1">
              Nombre completo del tutor legal
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={120}
              value={guardianName}
              onChange={(e) => setGuardianName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-sm font-display text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
              placeholder="María Pérez García"
            />
          </div>

          <div>
            <label className="block text-xs font-display font-semibold text-foreground mb-1">
              Email del tutor legal
            </label>
            <input
              type="email"
              required
              value={guardianEmail}
              onChange={(e) => setGuardianEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-card border border-border text-sm font-display text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
              placeholder="madre@email.com"
            />
            <p className="text-[9px] text-muted-foreground mt-1">
              Se enviará confirmación por email. El enlace caduca en 24h.
            </p>
          </div>

          {/* Action selector */}
          <div className="space-y-2">
            <label className="block text-xs font-display font-semibold text-foreground">Acción</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAction("grant")}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-xs font-display font-semibold transition-all ${
                  action === "grant"
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                    : "border-border bg-card text-muted-foreground hover:border-border/60"
                }`}
              >
                <UserCheck size={14} />
                Autorizar IA
              </button>
              <button
                type="button"
                onClick={() => setAction("deny")}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-xs font-display font-semibold transition-all ${
                  action === "deny"
                    ? "border-red-500/50 bg-red-500/10 text-red-400"
                    : "border-border bg-card text-muted-foreground hover:border-border/60"
                }`}
              >
                <UserX size={14} />
                Denegar IA
              </button>
            </div>
          </div>

          {/* Legal notice */}
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1">
            <p className="text-[10px] text-foreground font-display font-semibold">Lo que incluye el consentimiento:</p>
            <ul className="text-[9px] text-muted-foreground space-y-0.5 list-disc list-inside">
              <li>Análisis biomecánico de video con IA (postura, movimiento)</li>
              <li>Generación de informes tácticos con Claude</li>
              <li>Cálculo de maduración biológica (PHV Mirwald)</li>
              <li>Almacenamiento de métricas de rendimiento</li>
            </ul>
            <p className="text-[9px] text-muted-foreground mt-1">
              El consentimiento puede revocarse en cualquier momento. Los datos se eliminan en 30 días tras la revocación.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-border text-xs font-display font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`flex-1 py-2.5 rounded-lg text-xs font-display font-bold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                action === "grant"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : action === "grant" ? (
                <>
                  <UserCheck size={14} />
                  Registrar autorización
                </>
              ) : (
                <>
                  <UserX size={14} />
                  Registrar denegación
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ── DSAR Actions ──────────────────────────────────────────────── */

interface DSARModalProps {
  player: ConsentPlayer;
  onClose: () => void;
}

function DSARModal({ player, onClose }: DSARModalProps) {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      if (SUPABASE_CONFIGURED) {
        const { data, error } = await supabase.rpc("dsar_export_player_data", { p_player_id: player.id });
        if (error) throw error;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `dsar_export_${player.name.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Datos exportados correctamente");
      } else {
        toast.info("Exportación DSAR no disponible sin Supabase");
      }
    } catch {
      toast.error("Error al exportar datos");
    } finally {
      setExporting(false);
    }
  };

  const handleRequestDeletion = async () => {
    setDeleting(true);
    try {
      if (SUPABASE_CONFIGURED) {
        const { error } = await supabase.rpc("dsar_request_deletion", {
          p_player_id: player.id,
          p_requested_by: "admin",
        });
        if (error) throw error;
        toast.success("Solicitud de eliminación registrada");
      } else {
        toast.info("Solicitud registrada (modo demo)");
      }
      onClose();
    } catch {
      toast.error("Error al solicitar eliminación");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 max-w-md w-full space-y-4 border border-border/40"
      >
        <div>
          <h2 className="text-sm font-display font-bold text-foreground">Derechos ARCO · {player.name}</h2>
          <p className="text-[10px] text-muted-foreground">Acceso, Rectificación, Cancelación, Oposición</p>
        </div>

        <div className="space-y-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
          >
            {exporting ? <Loader2 size={16} className="animate-spin text-primary" /> : <Download size={16} className="text-primary" />}
            <div className="text-left">
              <p className="text-xs font-display font-semibold text-foreground">Exportar datos (DSAR)</p>
              <p className="text-[9px] text-muted-foreground">Descarga JSON con todos los datos del jugador</p>
            </div>
          </button>

          <button
            onClick={handleRequestDeletion}
            disabled={deleting}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 transition-colors"
          >
            {deleting ? <Loader2 size={16} className="animate-spin text-red-400" /> : <Trash2 size={16} className="text-red-400" />}
            <div className="text-left">
              <p className="text-xs font-display font-semibold text-red-400">Solicitar eliminación</p>
              <p className="text-[9px] text-muted-foreground">Marca para revisión por admin · Se borra en 30 días</p>
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 rounded-lg border border-border text-xs font-display text-muted-foreground hover:text-foreground transition-colors"
        >
          Cerrar
        </button>
      </motion.div>
    </motion.div>
  );
}

/* ── Main Component ────────────────────────────────────────────── */

export default function ParentalConsentPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ConsentTab>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<ConsentPlayer | null>(null);
  const [showConsentForm, setShowConsentForm] = useState(false);
  const [showDSAR, setShowDSAR] = useState(false);

  const { data: players, isLoading: loadingPlayers } = useQuery({
    queryKey: ["consent-players"],
    queryFn: fetchMinorPlayers,
    staleTime: 30_000,
  });

  const { data: auditLog, isLoading: loadingAudit } = useQuery({
    queryKey: ["consent-audit"],
    queryFn: fetchAuditLog,
    staleTime: 30_000,
  });

  // Mutation for updating consent
  const consentMutation = useMutation({
    mutationFn: async (data: ConsentFormData) => {
      const newStatus = data.action === "grant" ? "granted" : "denied";

      if (SUPABASE_CONFIGURED) {
        // Update player consent status
        const { error: playerErr } = await supabase
          .from("players")
          .update({
            parental_consent_status: newStatus,
            parental_consent_granted_at: data.action === "grant" ? new Date().toISOString() : null,
            parental_consent_guardian_name: data.guardianName,
            parental_consent_guardian_email: data.guardianEmail,
          })
          .eq("id", data.playerId);
        if (playerErr) throw playerErr;

        // Log to audit
        const { error: auditErr } = await supabase
          .from("consent_audit_log")
          .insert({
            player_id: data.playerId,
            action: data.action === "grant" ? "consent_granted" : "consent_denied",
            actor_email: user?.email ?? "unknown",
            details: { guardian_name: data.guardianName, guardian_email: data.guardianEmail },
          });
        if (auditErr) console.error("Audit log error:", auditErr);
      }

      return { playerId: data.playerId, status: newStatus };
    },
    onSuccess: () => {
      toast.success("Consentimiento registrado correctamente");
      queryClient.invalidateQueries({ queryKey: ["consent-players"] });
      queryClient.invalidateQueries({ queryKey: ["consent-audit"] });
      setShowConsentForm(false);
      setSelectedPlayer(null);
    },
    onError: () => {
      toast.error("Error al registrar consentimiento");
    },
  });

  // Filter players by tab and search
  const filteredPlayers = (players ?? []).filter(p => {
    const matchesTab = activeTab === "audit" || p.parental_consent_status === activeTab;
    const matchesSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const pendingCount = players?.filter(p => p.parental_consent_status === "pending").length ?? 0;
  const grantedCount = players?.filter(p => p.parental_consent_status === "granted").length ?? 0;
  const deniedCount = players?.filter(p => p.parental_consent_status === "denied").length ?? 0;

  const tabs = [
    { id: "pending" as const, label: "Pendientes", count: pendingCount, icon: <Clock size={14} /> },
    { id: "granted" as const, label: "Autorizados", count: grantedCount, icon: <UserCheck size={14} /> },
    { id: "denied" as const, label: "Denegados", count: deniedCount, icon: <UserX size={14} /> },
    { id: "audit" as const, label: "Auditoría", count: auditLog?.length ?? 0, icon: <FileText size={14} /> },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-background pb-24"
    >
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-muted/50 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <Shield size={18} className="text-primary" />
          <h1 className="font-display font-bold text-sm uppercase tracking-wider flex-1">
            Consentimiento Parental
          </h1>
          <span className="text-[9px] font-display font-bold uppercase tracking-wider px-2 py-1 rounded bg-primary/10 text-primary">
            RGPD
          </span>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto scrollbar-hide">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab.icon}
              {tab.label}
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Mock data banner */}
        {!SUPABASE_CONFIGURED && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
            <Info size={14} />
            <span>Datos de ejemplo — conecta Supabase para gestionar consentimientos reales</span>
          </div>
        )}

        {/* Warning banner for pending */}
        {pendingCount > 0 && activeTab === "pending" && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-display font-bold text-amber-400">
                {pendingCount} {pendingCount === 1 ? "menor" : "menores"} sin consentimiento parental
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                El análisis con IA está bloqueado para estos jugadores hasta que su tutor legal autorice el procesamiento de datos.
              </p>
            </div>
          </div>
        )}

        {/* Search */}
        {activeTab !== "audit" && (
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar jugador…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
            />
          </div>
        )}

        {/* Loading */}
        {(loadingPlayers || loadingAudit) && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}

        {/* Player list */}
        {!loadingPlayers && activeTab !== "audit" && (
          <div className="space-y-2">
            {filteredPlayers.length === 0 ? (
              <div className="glass rounded-xl p-8 text-center">
                <p className="text-xs text-muted-foreground">
                  {searchQuery ? "No se encontraron jugadores" : `No hay jugadores con estado "${tabs.find(t => t.id === activeTab)?.label}"`}
                </p>
              </div>
            ) : (
              filteredPlayers.map(player => {
                const cfg = statusConfig[player.parental_consent_status];
                return (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`glass rounded-xl p-4 border ${cfg.border}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${cfg.bg}`}>
                        <Baby size={16} className={cfg.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display font-bold text-foreground">{player.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {player.age_years} años
                          {player.birth_date && ` · ${new Date(player.birth_date).toLocaleDateString("es-ES")}`}
                        </p>
                        {player.parental_consent_guardian_name && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Tutor: {player.parental_consent_guardian_name}
                            {player.parental_consent_guardian_email && ` · ${player.parental_consent_guardian_email}`}
                          </p>
                        )}
                        {player.parental_consent_granted_at && (
                          <p className="text-[9px] text-muted-foreground">
                            Autorizado el {new Date(player.parental_consent_granted_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {/* Status badge */}
                        <span className={`flex items-center gap-1 text-[9px] font-display font-bold uppercase px-2 py-1 rounded ${cfg.bg} ${cfg.color}`}>
                          {cfg.icon}
                          {cfg.label}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-border/20">
                      {player.parental_consent_status === "pending" && (
                        <button
                          onClick={() => { setSelectedPlayer(player); setShowConsentForm(true); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-display font-semibold hover:bg-primary/20 transition-colors"
                        >
                          <Send size={12} />
                          Gestionar consentimiento
                        </button>
                      )}
                      {player.parental_consent_status === "granted" && (
                        <button
                          onClick={() => { setSelectedPlayer(player); setShowConsentForm(true); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-[10px] font-display font-semibold hover:text-foreground transition-colors"
                        >
                          <UserX size={12} />
                          Revocar
                        </button>
                      )}
                      {player.parental_consent_status === "denied" && (
                        <button
                          onClick={() => { setSelectedPlayer(player); setShowConsentForm(true); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-display font-semibold hover:bg-primary/20 transition-colors"
                        >
                          <UserCheck size={12} />
                          Solicitar de nuevo
                        </button>
                      )}
                      <button
                        onClick={() => { setSelectedPlayer(player); setShowDSAR(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-[10px] font-display font-semibold hover:text-foreground transition-colors"
                      >
                        <Eye size={12} />
                        DSAR
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        )}

        {/* Audit log */}
        {!loadingAudit && activeTab === "audit" && (
          <div className="space-y-2">
            {(auditLog ?? []).length === 0 ? (
              <div className="glass rounded-xl p-8 text-center">
                <p className="text-xs text-muted-foreground">No hay registros de auditoría</p>
              </div>
            ) : (
              (auditLog ?? []).map(entry => {
                const playerName = players?.find(p => p.id === entry.player_id)?.name ?? entry.player_id;
                return (
                  <div key={entry.id} className="glass rounded-xl p-4 border border-border/20">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-muted">
                        <FileText size={14} className="text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-display font-semibold text-foreground">
                          {actionLabels[entry.action] ?? entry.action}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {playerName} · {entry.actor_email ?? "Sistema"}
                        </p>
                      </div>
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString("es-ES", {
                          day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                        })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Consent Form Modal */}
      <AnimatePresence>
        {showConsentForm && selectedPlayer && (
          <ConsentFormModal
            player={selectedPlayer}
            onClose={() => { setShowConsentForm(false); setSelectedPlayer(null); }}
            onSubmit={(data) => consentMutation.mutate(data)}
            submitting={consentMutation.isPending}
          />
        )}
      </AnimatePresence>

      {/* DSAR Modal */}
      <AnimatePresence>
        {showDSAR && selectedPlayer && (
          <DSARModal
            player={selectedPlayer}
            onClose={() => { setShowDSAR(false); setSelectedPlayer(null); }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
