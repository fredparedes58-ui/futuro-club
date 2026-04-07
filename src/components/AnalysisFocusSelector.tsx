/**
 * VITAS · Analysis Focus Selector
 *
 * Permite al usuario elegir en qué tipo de acciones enfocarse durante el análisis.
 * Chips toggleables: ofensivas, defensivas, recuperación, duelos, velocidad, pases.
 */

import { useState } from "react";
import {
  Swords, Shield, RotateCcw, Zap, ArrowUpRight, Target,
} from "lucide-react";

export interface FocusOption {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
}

const FOCUS_OPTIONS: FocusOption[] = [
  { id: "acciones ofensivas (pases clave, centros, disparos, regates, creación de juego)", label: "Ofensivas", icon: ArrowUpRight, color: "text-green-400 border-green-500/40 bg-green-500/10" },
  { id: "acciones defensivas (marcaje, posicionamiento, anticipación, coberturas)", label: "Defensivas", icon: Shield, color: "text-blue-400 border-blue-500/40 bg-blue-500/10" },
  { id: "recuperación de balón (presión, intercepciones, entradas, robo de balón)", label: "Recuperación", icon: RotateCcw, color: "text-amber-400 border-amber-500/40 bg-amber-500/10" },
  { id: "duelos individuales (1v1 ofensivos/defensivos, duelos aéreos, cuerpo a cuerpo)", label: "Duelos", icon: Swords, color: "text-red-400 border-red-500/40 bg-red-500/10" },
  { id: "velocidad y capacidad física (sprints, aceleración, resistencia, desplazamientos)", label: "Velocidad", icon: Zap, color: "text-purple-400 border-purple-500/40 bg-purple-500/10" },
  { id: "precisión de pases (circulación, pases cortos/largos, visión de juego, asistencias)", label: "Pases", icon: Target, color: "text-cyan-400 border-cyan-500/40 bg-cyan-500/10" },
];

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
}

export default function AnalysisFocusSelector({ value, onChange }: Props) {
  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter(v => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
        Enfoque del análisis <span className="text-muted-foreground/50">(opcional)</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {FOCUS_OPTIONS.map(opt => {
          const isActive = value.includes(opt.id);
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              onClick={() => toggle(opt.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all ${
                isActive
                  ? opt.color + " font-bold"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              <Icon size={12} />
              {opt.label}
            </button>
          );
        })}
      </div>
      {value.length > 0 && (
        <p className="text-[9px] text-muted-foreground">
          La IA se concentrará especialmente en {value.length === 1 ? "este aspecto" : "estos aspectos"} del juego
        </p>
      )}
    </div>
  );
}
