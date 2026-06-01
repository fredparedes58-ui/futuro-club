/**
 * VITAS · IDPIndexPage
 * /idp  (sin playerId)
 *
 * Entry point cuando el usuario llega al módulo IDP sin un jugador específico.
 * Comportamiento:
 *   - 0 jugadores → CTA "Crear primer jugador" → /players/new
 *   - 1 jugador  → redirect automático a /idp/<id>
 *   - 2+         → grid selector (foto + nombre + posición)
 *
 * Esto permite tener una entrada limpia en BottomNav sin acoplar a un
 * playerId fijo. Funciona igual con Samu como único jugador (auto-redirect)
 * o con 20 jugadores del club (picker).
 */

import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Target, UserPlus, ChevronRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { PlayerService } from "@/services/real/playerService";
import { usePlan } from "@/hooks/usePlan";

export default function IDPIndexPage() {
  const navigate = useNavigate();
  const { canUseIDP } = usePlan();

  const players = useMemo(() => PlayerService.getAll(), []);

  // Auto-redirect if only one player
  useEffect(() => {
    if (canUseIDP && players.length === 1) {
      navigate(`/idp/${players[0].id}`, { replace: true });
    }
  }, [canUseIDP, players, navigate]);

  // Feature gate
  if (!canUseIDP) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-30 glass-strong border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft size={18} />
            </Button>
            <div className="flex items-center gap-2">
              <Target size={18} className="text-cyan-400" />
              <h1 className="text-lg font-display font-bold">Plan de Desarrollo</h1>
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-16 text-center">
          <Sparkles className="size-8 text-amber-400 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Función Pro+</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Los Planes de Desarrollo Individual con IA están disponibles en el plan
            Pro y Club.
          </p>
          <Button onClick={() => navigate("/billing")}>Ver planes</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} />
          </Button>
          <div className="flex items-center gap-2">
            <Target size={18} className="text-cyan-400" />
            <h1 className="text-lg font-display font-bold">Plan de Desarrollo</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {players.length === 0 ? (
          // ── 0 players ──
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
            <UserPlus className="size-10 text-cyan-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Aún no tienes jugadores
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
              Crea un jugador para empezar a generar planes de desarrollo individuales
              con IA.
            </p>
            <Button onClick={() => navigate("/players/new")}>
              Crear primer jugador
            </Button>
          </div>
        ) : (
          // ── 2+ players: picker ──
          <div>
            <div className="mb-5">
              <h2 className="text-base font-semibold text-foreground">
                Selecciona un jugador
              </h2>
              <p className="text-sm text-muted-foreground">
                Cada jugador tiene un plan de desarrollo mensual con IA.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {players.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Link
                    to={`/idp/${p.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.02] hover:border-cyan-400/30 hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="size-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {(p.name ?? "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {p.name}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] capitalize px-1.5 py-0">
                          {p.position}
                        </Badge>
                        {p.age && <span>{p.age} años</span>}
                        {typeof p.vsi === "number" && (
                          <span>· VSI {Math.round(p.vsi)}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
