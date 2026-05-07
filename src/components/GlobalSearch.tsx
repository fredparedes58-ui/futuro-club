/**
 * VITAS · Global Search · ⌘K Command Palette (Sprint UX · día 1)
 *
 * Atajo de teclado: ⌘K (Mac) / Ctrl+K (Win/Linux)
 * Botón visible en topbar / FAB en móvil
 *
 * Indexa:
 *   - Jugadores (nombre, posición, edad)
 *   - Partidos live (rival, fecha)
 *   - Acciones rápidas (generar baseline, plan rival, match-day, etc.)
 *   - Páginas core (rankings, scout, equipo, lab)
 *
 * Diseño:
 *   - Top results agrupados por categoría
 *   - Keyboard-driven · Enter para ir, ↑↓ para navegar
 *   - Sugerencias contextuales si query vacío
 */

import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Command as CommandPrimitive, CommandDialog, CommandEmpty, CommandGroup,
  CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import {
  Users, Activity, Swords, Grid3x3, Zap, BarChart3, Target,
  Sparkles, Trophy, FileText, Search,
} from "lucide-react";
import { useAllPlayers } from "@/hooks/usePlayers";

interface QuickAction {
  id: string;
  label: string;
  hint: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  to: string;
  keywords?: string[];
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: "match-day",  label: "Match-day Live",     hint: "Tagear eventos en directo", Icon: Activity, to: "/live",            keywords: ["partido","live","directo","cronometro"] },
  { id: "rival",      label: "Plan vs Rival",      hint: "Plan de partido + drills",  Icon: Swords,   to: "/equipo/rival",    keywords: ["rival","oponente","compare","plan"] },
  { id: "team-base",  label: "Análisis táctico",   hint: "5 reportes equipo · 9 cuadrantes", Icon: Grid3x3, to: "/equipo/baseline", keywords: ["equipo","tactico","cuadrantes","baseline"] },
  { id: "lab",        label: "VITAS.LAB",          hint: "Subir vídeo y analizar",    Icon: Zap,      to: "/lab",             keywords: ["video","analizar","lab","subir"] },
  { id: "rankings",   label: "Rankings",           hint: "Tus jugadores por VSI",     Icon: BarChart3,to: "/rankings",        keywords: ["jugadores","ranking","vsi","listado"] },
  { id: "scout",      label: "Scout",              hint: "Insights IA tiempo real",   Icon: Target,   to: "/scout",           keywords: ["scout","insights","feed"] },
  { id: "pulse",      label: "Pulse",              hint: "Centro de inteligencia",    Icon: Sparkles, to: "/pulse",           keywords: ["dashboard","home","inicio"] },
  { id: "team-mgmt",  label: "Mi equipo",          hint: "Miembros + invitaciones",   Icon: Users,    to: "/equipo",          keywords: ["miembros","equipo","gestion"] },
];

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { data: players = [] } = useAllPlayers();

  // ⌘K / Ctrl+K listener
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Filtered players
  const filteredPlayers = useMemo(() => {
    if (!query) return players.slice(0, 5);
    const q = query.toLowerCase();
    return players
      .filter((p) =>
        p.name?.toLowerCase().includes(q) ||
        p.position?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [players, query]);

  function go(to: string) {
    setOpen(false);
    setQuery("");
    navigate(to);
  }

  return (
    <>
      {/* Floating search trigger · fixed top-right, evita BottomNav · accesible siempre */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3 right-3 z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-background/85 backdrop-blur-md border border-border shadow-lg hover:border-primary/40 text-muted-foreground hover:text-foreground transition-colors print:hidden"
        aria-label="Búsqueda global · ⌘K"
        title="Buscar (⌘K)"
      >
        <Search size={12} />
        <span className="hidden sm:inline text-[10px] font-display">Buscar</span>
        <kbd className="hidden md:inline-block ml-1 px-1 py-0.5 rounded bg-secondary text-[8px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandPrimitive shouldFilter={false}>
          <CommandInput
            placeholder="Buscar jugadores, acciones, páginas…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>

            {/* Acciones rápidas */}
            <CommandGroup heading="Acciones rápidas">
              {QUICK_ACTIONS.filter((a) => {
                if (!query) return true;
                const q = query.toLowerCase();
                return (
                  a.label.toLowerCase().includes(q) ||
                  a.hint.toLowerCase().includes(q) ||
                  a.keywords?.some((k) => k.includes(q))
                );
              }).map((a) => {
                const Icon = a.Icon;
                return (
                  <CommandItem
                    key={a.id}
                    onSelect={() => go(a.to)}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <Icon size={14} className="text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-display font-bold">{a.label}</div>
                      <div className="text-[10px] text-muted-foreground">{a.hint}</div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>

            {filteredPlayers.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Jugadores · ${filteredPlayers.length}`}>
                  {filteredPlayers.map((p) => (
                    <CommandItem
                      key={p.id}
                      onSelect={() => go(`/player/${p.id}`)}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-display font-bold text-primary shrink-0">
                        {p.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-display font-bold truncate">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.position ?? "?"} · {p.age ?? "?"}a · VSI {Number(p.vsi ?? 0).toFixed(0)}
                        </div>
                      </div>
                      <span className="text-[9px] text-muted-foreground shrink-0">→ Perfil</span>
                    </CommandItem>
                  ))}
                  {/* Atajo: rapido a reports / live */}
                  {filteredPlayers.length === 1 && (
                    <>
                      <CommandItem
                        onSelect={() => go(`/players/${filteredPlayers[0].id}/reports`)}
                        className="flex items-center gap-3 cursor-pointer pl-12"
                      >
                        <FileText size={12} className="text-electric shrink-0" />
                        <span className="text-[11px] text-foreground">
                          Ver reportes de {filteredPlayers[0].name}
                        </span>
                      </CommandItem>
                      <CommandItem
                        onSelect={() => go(`/players/${filteredPlayers[0].id}/evolution`)}
                        className="flex items-center gap-3 cursor-pointer pl-12"
                      >
                        <Trophy size={12} className="text-gold shrink-0" />
                        <span className="text-[11px] text-foreground">
                          Ver evolución de {filteredPlayers[0].name}
                        </span>
                      </CommandItem>
                    </>
                  )}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </CommandPrimitive>
      </CommandDialog>
    </>
  );
}
