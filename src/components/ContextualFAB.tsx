/**
 * VITAS · Contextual FAB (Sprint UX · día 2)
 *
 * Botón flotante "+" en bottom-right que muestra acciones rápidas
 * según la ruta actual. Reduce navegación a 1 tap para tareas comunes.
 *
 * Comportamiento:
 *   - Cerrado: botón redondo "+" primary
 *   - Abierto: 2-4 acciones contextuales arriba del botón
 *   - Backdrop click cierra · Esc cierra
 *
 * Reglas (no se renderiza en):
 *   - rutas auth (login, register, etc.)
 *   - /live/:matchId (durante partido en directo · no estorbar)
 *   - /share/* (vista pública)
 *   - print mode
 */

import { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Activity, Swords, Grid3x3, Zap, Sparkles, FileText,
  TrendingUp, Share2, BarChart3, Target, Heart,
} from "lucide-react";
import { toast } from "sonner";

/** Comparte la URL actual (Web Share API con fallback a portapapeles).
 *  Antes emitía un CustomEvent sin ningún listener → botón muerto. */
async function shareCurrentUrl() {
  const url = window.location.href;
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  try {
    if (nav && "share" in nav) {
      await nav.share({ title: "VITAS", url });
    } else if (nav?.clipboard) {
      await nav.clipboard.writeText(url);
      toast.success("Enlace copiado al portapapeles");
    }
  } catch {
    /* el usuario canceló el diálogo de compartir — sin acción */
  }
}

interface FabAction {
  id: string;
  label: string;
  Icon: React.ElementType;
  color: string;
  to?: string;
  onClick?: () => void;
}

const HIDDEN_PATTERNS = [
  /^\/$/, /^\/pricing/,        // landing/precios públicos (visitante sin sesión)
  /^\/login/, /^\/register/, /^\/forgot/, /^\/reset/,
  /^\/share/, /^\/onboarding/, /^\/terms/, /^\/privacy/,
  /^\/live\/[^/]+$/,           // durante el partido NO molestar
];

function actionsForRoute(pathname: string, params: Record<string, string | undefined>, navigate: (to: string) => void, t: (key: string) => string): FabAction[] {
  // Ficha del jugador (Hub /players/:id, o el legacy /player/:id ya redirigido).
  // Bare page, sin sub-ruta ni "new".
  const playerMatch = pathname.match(/^\/players?\/([^/]+)$/);
  if (playerMatch && playerMatch[1] !== "new") {
    const id = playerMatch[1];
    return [
      { id: "family",    label: t("contextualFAB.familyView"),  Icon: Heart,    color: "#EC4899", onClick: () => navigate(`/family/${id}`) },
      { id: "reports",   label: t("contextualFAB.reports"),       Icon: FileText, color: "#0066CC", onClick: () => navigate(`/players/${id}/reports`) },
      { id: "evolution", label: t("contextualFAB.evolution"),      Icon: TrendingUp, color: "#10b981", onClick: () => navigate(`/players/${id}/evolution`) },
      { id: "lab",       label: t("contextualFAB.uploadVideo"),    Icon: Zap,      color: "#B82BD9", onClick: () => navigate(`/lab?playerId=${id}`) },
    ];
  }

  // Reports / dashboard de un análisis
  if (/^\/players\/[^/]+\/(reports|intelligence|evolution)$/.test(pathname) ||
      /^\/player\/[^/]+\/analysis\/[^/]+$/.test(pathname)) {
    const idMatch = pathname.match(/\/(player|players)\/([^/]+)/);
    const id = idMatch?.[2];
    return [
      { id: "share",  label: t("contextualFAB.share"),  Icon: Share2,  color: "#1A8FFF", onClick: () => { void shareCurrentUrl(); } },
      { id: "live",   label: t("contextualFAB.matchDay"),  Icon: Activity, color: "#22e88c", onClick: () => navigate("/live") },
      ...(id ? [{ id: "back-player", label: t("contextualFAB.profile"), Icon: BarChart3, color: "#10b981", onClick: () => navigate(`/players/${id}`) }] : []),
    ];
  }

  // Equipo / Team analysis
  if (pathname.startsWith("/equipo")) {
    return [
      { id: "live",   label: t("contextualFAB.matchDayLive"), Icon: Activity, color: "#22e88c", onClick: () => navigate("/live") },
      { id: "rival",  label: t("contextualFAB.planVsRival"),  Icon: Swords,   color: "#F59E0B", onClick: () => navigate("/equipo/rival") },
      { id: "team",   label: t("contextualFAB.teamAnalysis"), Icon: Grid3x3,  color: "#1A8FFF", onClick: () => navigate("/equipo/baseline") },
    ];
  }

  // Live hub
  if (pathname === "/live") {
    return [
      { id: "rankings",label: t("contextualFAB.myPlayers"), Icon: BarChart3, color: "#10b981", onClick: () => navigate("/rankings") },
    ];
  }

  // Rankings
  if (pathname === "/rankings") {
    return [
      { id: "new-player",label: t("contextualFAB.newPlayer"), Icon: Plus,    color: "#22e88c", onClick: () => navigate("/players/new") },
      { id: "live",      label: t("contextualFAB.matchDay"),     Icon: Activity, color: "#1A8FFF", onClick: () => navigate("/live") },
      { id: "team",      label: t("contextualFAB.teamAnalysis"),Icon: Grid3x3, color: "#B82BD9", onClick: () => navigate("/equipo/baseline") },
    ];
  }

  // Scout
  if (pathname === "/scout") {
    return [
      { id: "rankings", label: t("contextualFAB.myPlayers"), Icon: BarChart3, color: "#10b981", onClick: () => navigate("/rankings") },
      { id: "lab",      label: "VITAS.LAB",     Icon: Zap,       color: "#B82BD9", onClick: () => navigate("/lab") },
    ];
  }

  // VitasLab
  if (pathname === "/lab") {
    return [
      { id: "rankings", label: t("contextualFAB.myPlayers"), Icon: BarChart3, color: "#10b981", onClick: () => navigate("/rankings") },
      { id: "live",     label: t("contextualFAB.matchDay"),     Icon: Activity,  color: "#22e88c", onClick: () => navigate("/live") },
    ];
  }

  // Pulse / Home → ya tiene tiles, FAB con shortcuts secundarios
  if (pathname === "/" || pathname === "/pulse") {
    return [
      { id: "live",  label: t("contextualFAB.matchDayLive"), Icon: Activity, color: "#22e88c", onClick: () => navigate("/live") },
      { id: "rival", label: t("contextualFAB.planVsRival"),  Icon: Swords,   color: "#F59E0B", onClick: () => navigate("/equipo/rival") },
      { id: "lab",   label: "VITAS.LAB",      Icon: Zap,      color: "#B82BD9", onClick: () => navigate("/lab") },
    ];
  }

  // Default · página sin acciones específicas
  return [];
}

export default function ContextualFAB() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { t } = useTranslation();

  // Cerrar al cambiar de ruta
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Esc cierra
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Hidden routes
  if (HIDDEN_PATTERNS.some((re) => re.test(location.pathname))) return null;

  const actions = actionsForRoute(location.pathname, params, navigate, t);
  if (actions.length === 0) return null;

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40 print:hidden"
          />
        )}
      </AnimatePresence>

      <div className="fixed bottom-20 right-4 z-50 print:hidden flex flex-col items-end gap-2">
        {/* Action items */}
        <AnimatePresence>
          {open && actions.map((a, i) => {
            const Icon = a.Icon;
            return (
              <motion.button
                key={a.id}
                initial={{ opacity: 0, y: 10, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.8 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => {
                  setOpen(false);
                  if (a.onClick) a.onClick();
                  else if (a.to) navigate(a.to);
                }}
                className="flex items-center gap-2 pr-1.5 pl-3 py-1.5 rounded-full bg-background/95 backdrop-blur-md border border-border shadow-lg hover:border-foreground/30 transition-colors"
              >
                <span className="text-xs font-display font-bold text-foreground">{a.label}</span>
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${a.color}20`, border: `1px solid ${a.color}40` }}
                >
                  <Icon size={13} style={{ color: a.color }} />
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>

        {/* Main FAB */}
        <motion.button
          onClick={() => setOpen(!open)}
          whileTap={{ scale: 0.9 }}
          className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-xl hover:bg-primary/90 transition-colors flex items-center justify-center relative"
          aria-label={open ? t("contextualFAB.closeActions") : t("contextualFAB.quickActions")}
        >
          <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.18 }}>
            {open ? <X size={20} /> : <Plus size={20} />}
          </motion.div>
          {!open && actions.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-electric text-[8px] font-bold flex items-center justify-center text-background">
              {actions.length}
            </span>
          )}
        </motion.button>
      </div>
    </>
  );
}
