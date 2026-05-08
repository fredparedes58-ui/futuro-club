/**
 * VITAS · SVG Illustrations para empty states.
 *
 * Estilo: line-art moderno · stroke 1.5 · color primario con acento electric.
 * Cada ilustración 200x140 viewBox, escalable.
 *
 * Uso:
 *   <EmptyVideo className="w-32 mx-auto" />
 */
import type { SVGProps } from "react";

const baseProps = (props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({
  viewBox: "0 0 200 140",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  className: "w-32 h-auto",
  ...props,
});

/** Sin video subido · pantalla con play + balón */
export function EmptyVideo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      {/* Pantalla */}
      <rect x="40" y="30" width="120" height="80" rx="8"
        stroke="hsl(var(--primary))" strokeWidth="1.5" fill="hsl(var(--primary) / 0.04)" />
      {/* Play triangle */}
      <path d="M88 56 L88 84 L114 70 Z"
        fill="hsl(var(--primary))" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Stand */}
      <line x1="100" y1="110" x2="100" y2="124" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="80" y1="124" x2="120" y2="124" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" />
      {/* Balones decorativos */}
      <circle cx="32" cy="96" r="6" stroke="hsl(var(--electric))" strokeWidth="1.2" opacity="0.7" />
      <circle cx="170" cy="42" r="4" stroke="hsl(var(--electric))" strokeWidth="1.2" opacity="0.5" />
      {/* Sparkle */}
      <path d="M156 90 L156 100 M151 95 L161 95" stroke="hsl(var(--gold))" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

/** Sin jugadores · silueta + campo */
export function EmptyPlayers(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      {/* Campo */}
      <rect x="20" y="80" width="160" height="50" rx="4"
        stroke="hsl(var(--primary) / 0.5)" strokeWidth="1.2" fill="hsl(var(--primary) / 0.03)" />
      <line x1="100" y1="80" x2="100" y2="130" stroke="hsl(var(--primary) / 0.5)" strokeWidth="1.2" />
      <circle cx="100" cy="105" r="8" stroke="hsl(var(--primary) / 0.5)" strokeWidth="1.2" />
      {/* Silueta jugador grande */}
      <circle cx="100" cy="40" r="14" stroke="hsl(var(--primary))" strokeWidth="1.8" fill="hsl(var(--background))" />
      <path d="M82 78 Q82 60 100 60 Q118 60 118 78" stroke="hsl(var(--primary))" strokeWidth="1.8" fill="hsl(var(--background))" strokeLinecap="round" />
      {/* "+" decorativo */}
      <circle cx="138" cy="35" r="11" fill="hsl(var(--electric) / 0.15)" stroke="hsl(var(--electric))" strokeWidth="1.4" />
      <line x1="133" y1="35" x2="143" y2="35" stroke="hsl(var(--electric))" strokeWidth="2" strokeLinecap="round" />
      <line x1="138" y1="30" x2="138" y2="40" stroke="hsl(var(--electric))" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Sin partidos · cronómetro */
export function EmptyMatches(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      {/* Cronómetro */}
      <circle cx="100" cy="76" r="32" stroke="hsl(var(--primary))" strokeWidth="1.8" fill="hsl(var(--primary) / 0.04)" />
      <rect x="92" y="34" width="16" height="6" rx="2" stroke="hsl(var(--primary))" strokeWidth="1.5" fill="hsl(var(--background))" />
      <line x1="100" y1="76" x2="100" y2="56" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" />
      <line x1="100" y1="76" x2="116" y2="84" stroke="hsl(var(--electric))" strokeWidth="2" strokeLinecap="round" />
      <circle cx="100" cy="76" r="2" fill="hsl(var(--primary))" />
      {/* Ticks */}
      <line x1="100" y1="48" x2="100" y2="52" stroke="hsl(var(--primary) / 0.6)" strokeWidth="1.2" />
      <line x1="100" y1="100" x2="100" y2="104" stroke="hsl(var(--primary) / 0.6)" strokeWidth="1.2" />
      <line x1="72" y1="76" x2="76" y2="76" stroke="hsl(var(--primary) / 0.6)" strokeWidth="1.2" />
      <line x1="124" y1="76" x2="128" y2="76" stroke="hsl(var(--primary) / 0.6)" strokeWidth="1.2" />
    </svg>
  );
}

/** Sin búsqueda / sin resultados · lupa */
export function EmptySearch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="86" cy="62" r="28" stroke="hsl(var(--primary))" strokeWidth="1.8" fill="hsl(var(--primary) / 0.04)" />
      <line x1="106" y1="82" x2="130" y2="106" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="76" cy="54" r="3" fill="hsl(var(--primary) / 0.4)" />
      <circle cx="92" cy="68" r="2" fill="hsl(var(--primary) / 0.3)" />
      <path d="M70 62 L80 58 L90 64 L100 60" stroke="hsl(var(--electric))" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.6" />
    </svg>
  );
}

/** Sin tracking del Lab · keypoints + escaneo */
export function EmptyTracking(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      {/* Silueta keypoints */}
      <circle cx="100" cy="34" r="6" stroke="hsl(var(--primary))" strokeWidth="1.5" fill="hsl(var(--background))" />
      <line x1="100" y1="40" x2="100" y2="76" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      <line x1="100" y1="48" x2="80" y2="62" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      <line x1="100" y1="48" x2="120" y2="62" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      <line x1="100" y1="76" x2="86" y2="100" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      <line x1="100" y1="76" x2="114" y2="100" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      {/* Joints */}
      <circle cx="100" cy="48" r="2" fill="hsl(var(--electric))" />
      <circle cx="80" cy="62" r="2" fill="hsl(var(--electric))" />
      <circle cx="120" cy="62" r="2" fill="hsl(var(--electric))" />
      <circle cx="100" cy="76" r="2" fill="hsl(var(--electric))" />
      <circle cx="86" cy="100" r="2" fill="hsl(var(--electric))" />
      <circle cx="114" cy="100" r="2" fill="hsl(var(--electric))" />
      {/* Scan arc */}
      <path d="M70 30 Q100 22 130 30" stroke="hsl(var(--gold))" strokeWidth="1.4" strokeDasharray="3 3" fill="none" />
      <path d="M76 26 L70 30 L74 36" stroke="hsl(var(--gold))" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M124 26 L130 30 L126 36" stroke="hsl(var(--gold))" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** Sin equipo · escudo */
export function EmptyTeam(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      {/* Escudo */}
      <path d="M100 28 L130 38 L130 80 Q130 104 100 116 Q70 104 70 80 L70 38 Z"
        stroke="hsl(var(--primary))" strokeWidth="1.8" fill="hsl(var(--primary) / 0.04)" />
      {/* "V" */}
      <path d="M85 60 L100 90 L115 60"
        stroke="hsl(var(--primary))" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Stars decorativas */}
      <path d="M48 50 L50 55 L55 55 L51 58 L53 63 L48 60 L43 63 L45 58 L41 55 L46 55 Z"
        fill="hsl(var(--gold) / 0.6)" stroke="hsl(var(--gold))" strokeWidth="0.8" />
      <path d="M152 80 L153.5 84 L157 84 L154 86 L155.5 90 L152 87 L148.5 90 L150 86 L147 84 L150.5 84 Z"
        fill="hsl(var(--electric) / 0.6)" stroke="hsl(var(--electric))" strokeWidth="0.8" />
    </svg>
  );
}

/** Sin análisis IA · cerebro digital */
export function EmptyInsights(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      {/* Cerebro circuito */}
      <circle cx="100" cy="70" r="28" stroke="hsl(var(--primary))" strokeWidth="1.8" fill="hsl(var(--primary) / 0.04)" />
      {/* Conexiones */}
      <line x1="80" y1="60" x2="92" y2="68" stroke="hsl(var(--primary))" strokeWidth="1.2" />
      <line x1="92" y1="68" x2="100" y2="64" stroke="hsl(var(--primary))" strokeWidth="1.2" />
      <line x1="100" y1="64" x2="108" y2="72" stroke="hsl(var(--primary))" strokeWidth="1.2" />
      <line x1="108" y1="72" x2="120" y2="78" stroke="hsl(var(--primary))" strokeWidth="1.2" />
      <line x1="86" y1="80" x2="100" y2="84" stroke="hsl(var(--primary))" strokeWidth="1.2" />
      <line x1="100" y1="84" x2="116" y2="84" stroke="hsl(var(--primary))" strokeWidth="1.2" />
      {/* Nodos */}
      <circle cx="80" cy="60" r="2.5" fill="hsl(var(--electric))" />
      <circle cx="92" cy="68" r="2.5" fill="hsl(var(--electric))" />
      <circle cx="100" cy="64" r="2.5" fill="hsl(var(--electric))" />
      <circle cx="108" cy="72" r="2.5" fill="hsl(var(--electric))" />
      <circle cx="120" cy="78" r="2.5" fill="hsl(var(--electric))" />
      <circle cx="86" cy="80" r="2.5" fill="hsl(var(--electric))" />
      <circle cx="100" cy="84" r="2.5" fill="hsl(var(--electric))" />
      <circle cx="116" cy="84" r="2.5" fill="hsl(var(--electric))" />
      {/* Sparks */}
      <path d="M40 66 L40 72 M37 69 L43 69" stroke="hsl(var(--gold))" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M156 56 L156 62 M153 59 L159 59" stroke="hsl(var(--gold))" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Sin drills · cono entrenamiento */
export function EmptyDrill(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps(props)}>
      {/* Cono */}
      <path d="M88 100 L100 36 L112 100 Z"
        stroke="hsl(var(--primary))" strokeWidth="1.8" fill="hsl(var(--gold) / 0.2)" />
      <line x1="91" y1="65" x2="109" y2="65" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      <line x1="89" y1="80" x2="111" y2="80" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      {/* Base */}
      <ellipse cx="100" cy="100" rx="14" ry="3" fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" strokeWidth="1.5" />
      {/* Conos pequeños */}
      <path d="M44 96 L50 76 L56 96 Z" stroke="hsl(var(--primary) / 0.7)" strokeWidth="1.4" fill="hsl(var(--gold) / 0.15)" />
      <ellipse cx="50" cy="96" rx="6" ry="1.5" fill="hsl(var(--primary) / 0.15)" />
      <path d="M144 96 L150 76 L156 96 Z" stroke="hsl(var(--primary) / 0.7)" strokeWidth="1.4" fill="hsl(var(--gold) / 0.15)" />
      <ellipse cx="150" cy="96" rx="6" ry="1.5" fill="hsl(var(--primary) / 0.15)" />
    </svg>
  );
}
