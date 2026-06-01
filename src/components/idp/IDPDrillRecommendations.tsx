/**
 * VITAS · IDPDrillRecommendations
 *
 * Lista los drills asignados a los goals del plan resolviendo los IDs contra
 * DRILLS_LIBRARY. Agrupa por dimensión, muestra detalle del drill al hacer click.
 */

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Users, MapPin, ChevronRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DRILLS_LIBRARY, type DrillDocument } from "@/data/drillsLibrary";
import type { IDPDimension, IDPGoal } from "@/lib/idp/idpTypes";

interface Props {
  goals: IDPGoal[];
}

const DIM_LABEL: Record<IDPDimension, string> = {
  technical: "Técnico",
  tactical: "Táctico",
  physical: "Físico",
  mental: "Mental",
  maturation: "Maduración",
};

const DIM_COLOR: Record<IDPDimension, string> = {
  technical: "border-blue-500/30 bg-blue-500/5",
  tactical: "border-purple-500/30 bg-purple-500/5",
  physical: "border-emerald-500/30 bg-emerald-500/5",
  mental: "border-amber-500/30 bg-amber-500/5",
  maturation: "border-rose-500/30 bg-rose-500/5",
};

function resolveDrillId(id: string): DrillDocument | null {
  return DRILLS_LIBRARY.find((d) => d.id === id) ?? null;
}

export function IDPDrillRecommendations({ goals }: Props) {
  const [openDrill, setOpenDrill] = useState<DrillDocument | null>(null);

  const drillsByDimension = useMemo(() => {
    const groups: Partial<Record<IDPDimension, DrillDocument[]>> = {};
    for (const goal of goals) {
      const drills = goal.drillsAssigned
        .map(resolveDrillId)
        .filter((d): d is DrillDocument => d !== null);
      if (drills.length === 0) continue;
      if (!groups[goal.dimension]) groups[goal.dimension] = [];
      // Dedupe by id
      for (const d of drills) {
        if (!groups[goal.dimension]!.some((x) => x.id === d.id)) {
          groups[goal.dimension]!.push(d);
        }
      }
    }
    return groups;
  }, [goals]);

  const dimensions = Object.keys(drillsByDimension) as IDPDimension[];

  if (dimensions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
        Aún no hay drills asignados a los goals.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dimensions.map((dim) => (
        <div key={dim}>
          <h4 className="text-xs uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
            {DIM_LABEL[dim]}
            <span className="text-slate-600">·</span>
            <span className="text-slate-500">{drillsByDimension[dim]!.length} drills</span>
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {drillsByDimension[dim]!.map((drill) => (
              <motion.button
                key={drill.id}
                onClick={() => setOpenDrill(drill)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border text-left transition-colors hover:border-white/20",
                  DIM_COLOR[dim],
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-slate-500">{drill.id}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {drill.difficulty}
                    </Badge>
                  </div>
                  <div className="text-sm font-medium text-white leading-tight">{drill.name}</div>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="size-2.5" />
                      {drill.durationMin}min
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="size-2.5" />
                      {drill.playerCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="size-2.5" />
                      {drill.spaceMeters}
                    </span>
                  </div>
                </div>
                <ChevronRight className="size-4 text-slate-500 shrink-0 mt-1" />
              </motion.button>
            ))}
          </div>
        </div>
      ))}

      {/* Drill detail panel */}
      <AnimatePresence>
        {openDrill && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setOpenDrill(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl bg-slate-900 rounded-xl border border-white/10 shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-slate-900/95 backdrop-blur p-4 border-b border-white/5 flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono text-slate-500">{openDrill.id}</span>
                  <h3 className="text-base font-semibold text-white">{openDrill.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] capitalize">{openDrill.category}</Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">{openDrill.difficulty}</Badge>
                    <span className="text-[10px] text-slate-400">
                      {openDrill.ageRange[0]}-{openDrill.ageRange[1]} años
                    </span>
                  </div>
                </div>
                <button onClick={() => setOpenDrill(null)} className="text-slate-400 hover:text-white">
                  <X className="size-4" />
                </button>
              </div>
              <div className="p-4 space-y-4 text-sm text-slate-300">
                <p>{openDrill.description}</p>
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Objetivos</h4>
                  <ul className="space-y-1">
                    {openDrill.objectives.map((o, i) => (
                      <li key={i} className="text-xs flex gap-2">
                        <span className="text-slate-600">→</span>
                        <span>{o}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Puntos clave</h4>
                  <ul className="space-y-1">
                    {openDrill.coachingPoints.map((p, i) => (
                      <li key={i} className="text-xs flex gap-2">
                        <span className="text-slate-600">·</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-slate-500">Espacio</div>
                    <div>{openDrill.spaceMeters}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Sets x Reps</div>
                    <div>{openDrill.sets} × {openDrill.repsOrDuration}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Jugadores</div>
                    <div>{openDrill.playerCount}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Duración</div>
                    <div>{openDrill.durationMin} min</div>
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 italic">Fuente: {openDrill.source}</div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
