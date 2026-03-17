export interface Player {
  id: string;
  name: string;
  age: number;
  position: string;
  positionShort: string;
  academy: string;
  vsi: number; // Vitas Score Index 0-99
  phvOffset: number; // maturity offset
  phvCategory: "early" | "on-time" | "late";
  trending: "up" | "down" | "stable";
  avatar: string;
  stats: {
    speed: number;
    technique: number;
    vision: number;
    stamina: number;
    shooting: number;
    defending: number;
  };
  recentDrills: number;
  lastActive: string;
}

export interface LiveMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  score: [number, number];
  minute: number;
  status: "live" | "upcoming" | "finished";
  playersTracked: number;
  topPerformer: string;
  topVsi: number;
}

export interface DrillCategory {
  id: string;
  name: string;
  icon: string;
  drillCount: number;
  color: string;
}

export interface ScoutInsight {
  id: string;
  player: Player;
  insightType: "breakout" | "comparison" | "phv-alert" | "drill-record";
  title: string;
  description: string;
  metric: string;
  metricValue: string;
  timestamp: string;
}

export const mockPlayers: Player[] = [
  {
    id: "p1",
    name: "Lucas Moreno",
    age: 14,
    position: "Centrocampista",
    positionShort: "MC",
    academy: "Academia Betis",
    vsi: 87,
    phvOffset: -0.8,
    phvCategory: "late",
    trending: "up",
    avatar: "LM",
    stats: { speed: 72, technique: 91, vision: 88, stamina: 76, shooting: 65, defending: 54 },
    recentDrills: 12,
    lastActive: "Hace 2h",
  },
  {
    id: "p2",
    name: "Alejandro Ruiz",
    age: 15,
    position: "Delantero Centro",
    positionShort: "DC",
    academy: "Cantera Sevilla",
    vsi: 92,
    phvOffset: 0.3,
    phvCategory: "on-time",
    trending: "up",
    avatar: "AR",
    stats: { speed: 89, technique: 84, vision: 71, stamina: 82, shooting: 93, defending: 38 },
    recentDrills: 8,
    lastActive: "Hace 30min",
  },
  {
    id: "p3",
    name: "Daniel Torres",
    age: 13,
    position: "Lateral Derecho",
    positionShort: "LD",
    academy: "Academia Valencia",
    vsi: 78,
    phvOffset: -1.2,
    phvCategory: "late",
    trending: "up",
    avatar: "DT",
    stats: { speed: 85, technique: 70, vision: 66, stamina: 88, shooting: 45, defending: 79 },
    recentDrills: 15,
    lastActive: "Hace 1h",
  },
  {
    id: "p4",
    name: "Pablo García",
    age: 16,
    position: "Mediocentro Defensivo",
    positionShort: "MCD",
    academy: "Cantera Athletic",
    vsi: 81,
    phvOffset: 0.9,
    phvCategory: "early",
    trending: "stable",
    avatar: "PG",
    stats: { speed: 68, technique: 75, vision: 82, stamina: 90, shooting: 55, defending: 88 },
    recentDrills: 6,
    lastActive: "Hace 4h",
  },
  {
    id: "p5",
    name: "Mateo Fernández",
    age: 14,
    position: "Extremo Izquierdo",
    positionShort: "EI",
    academy: "Academia Betis",
    vsi: 85,
    phvOffset: -0.3,
    phvCategory: "on-time",
    trending: "up",
    avatar: "MF",
    stats: { speed: 92, technique: 86, vision: 74, stamina: 78, shooting: 77, defending: 35 },
    recentDrills: 20,
    lastActive: "Hace 15min",
  },
  {
    id: "p6",
    name: "Iker Navarro",
    age: 15,
    position: "Portero",
    positionShort: "PO",
    academy: "Cantera Real Sociedad",
    vsi: 74,
    phvOffset: 1.1,
    phvCategory: "early",
    trending: "down",
    avatar: "IN",
    stats: { speed: 58, technique: 65, vision: 72, stamina: 80, shooting: 30, defending: 90 },
    recentDrills: 4,
    lastActive: "Ayer",
  },
];

export const mockMatches: LiveMatch[] = [
  { id: "m1", homeTeam: "Betis U15", awayTeam: "Sevilla U15", score: [2, 1], minute: 67, status: "live", playersTracked: 22, topPerformer: "Alejandro Ruiz", topVsi: 94 },
  { id: "m2", homeTeam: "Valencia U14", awayTeam: "Villarreal U14", score: [0, 0], minute: 0, status: "upcoming", playersTracked: 0, topPerformer: "-", topVsi: 0 },
  { id: "m3", homeTeam: "Athletic U16", awayTeam: "Real Sociedad U16", score: [1, 3], minute: 90, status: "finished", playersTracked: 20, topPerformer: "Pablo García", topVsi: 85 },
];

export const mockDrillCategories: DrillCategory[] = [
  { id: "d1", name: "Sprint & Velocidad", icon: "⚡", drillCount: 8, color: "neon" },
  { id: "d2", name: "Control de Balón", icon: "🎯", drillCount: 12, color: "electric" },
  { id: "d3", name: "Regate & Agilidad", icon: "🔥", drillCount: 10, color: "gold" },
  { id: "d4", name: "Pase & Visión", icon: "👁", drillCount: 6, color: "accent" },
  { id: "d5", name: "Disparo", icon: "💥", drillCount: 7, color: "danger" },
  { id: "d6", name: "Biomecánica", icon: "🧬", drillCount: 5, color: "neon" },
];

export const mockScoutInsights: ScoutInsight[] = [
  {
    id: "s1",
    player: mockPlayers[0],
    insightType: "breakout",
    title: "Talento Oculto Detectado",
    description: "Lucas Moreno tiene maduración tardía (PHV -0.8) pero su técnica ajustada supera al percentil 94 de su grupo de maduración. Perfil similar a Pedri a los 14.",
    metric: "VSI Ajustado",
    metricValue: "94",
    timestamp: "Hace 2h",
  },
  {
    id: "s2",
    player: mockPlayers[1],
    insightType: "comparison",
    title: "Comparativa Pro: Lamine Yamal",
    description: "Alejandro Ruiz muestra un perfil de aceleración y finalización idéntico al de Yamal a su edad. VSI de disparo en el top 1% nacional.",
    metric: "Similitud",
    metricValue: "91%",
    timestamp: "Hace 4h",
  },
  {
    id: "s3",
    player: mockPlayers[2],
    insightType: "phv-alert",
    title: "⚠️ Alerta PHV: Revisión Necesaria",
    description: "Daniel Torres lleva 3 meses sin actualizar sus datos antropométricos. Su VSI podría estar infravalorado hasta un 12% si ha tenido un estirón reciente.",
    metric: "Desfase",
    metricValue: "3 meses",
    timestamp: "Hace 6h",
  },
  {
    id: "s4",
    player: mockPlayers[4],
    insightType: "drill-record",
    title: "🏆 Nuevo Récord de Drill",
    description: "Mateo Fernández ha roto el récord de la academia en el drill 'Slalom Sprint 20m'. Tiempo: 3.42s, superando el anterior por 0.18s.",
    metric: "Tiempo",
    metricValue: "3.42s",
    timestamp: "Hace 30min",
  },
  {
    id: "s5",
    player: mockPlayers[3],
    insightType: "breakout",
    title: "Evolución Defensiva Notable",
    description: "Pablo García ha mejorado su interceptación ajustada por PHV un 23% en las últimas 4 semanas. Su perfil defensivo se aproxima al de Rodri a los 16 años.",
    metric: "Mejora",
    metricValue: "+23%",
    timestamp: "Hace 8h",
  },
];
export interface PlayerReport {
  id: string;
  name: string;
  position: string;
  academy: string;
  vsi: number;
  biasAlert: "low" | "med" | "high";
}

export interface AnalysisPipeline {
  id: string;
  title: string;
  source: string;
  pilar: string;
  progress: number;
  status: "processing" | "queued" | "complete";
  eta?: string;
  queuePosition?: number;
}

export interface LiveFeedEvent {
  id: string;
  message: string;
  time: string;
  color: "primary" | "electric" | "gold";
}

export interface Player {
  id: string;
  name: string;
  age: number;
  position: string;
  positionShort: string;
  academy: string;
  vsi: number;
  phvOffset: number;
  phvCategory: "early" | "on-time" | "late";
  trending: "up" | "down" | "stable";
  avatar: string;
  stats: {
    speed: number;
    technique: number;
    vision: number;
    stamina: number;
    shooting: number;
    defending: number;
  };
  recentDrills: number;
  lastActive: string;
}

export interface LiveMatch {
  id: string;
  homeTeam: string;
  awayTeam: string;
  score: [number, number];
  minute: number;
  status: "live" | "upcoming" | "finished";
  playersTracked: number;
  topPerformer: string;
  topVsi: number;
}

export interface DrillCategory {
  id: string;
  name: string;
  icon: string;
  drillCount: number;
  color: string;
}

export interface ScoutInsight {
  id: string;
  player: Player;
  insightType: "breakout" | "comparison" | "phv-alert" | "drill-record";
  title: string;
  description: string;
  metric: string;
  metricValue: string;
  timestamp: string;
}

export const mockPlayers: Player[] = [
  {
    id: "p1",
    name: "Lucas Moreno",
    age: 14,
    position: "Centrocampista",
    positionShort: "MC",
    academy: "Academia Betis",
    vsi: 87,
    phvOffset: -0.8,
    phvCategory: "late",
    trending: "up",
    avatar: "LM",
    stats: { speed: 72, technique: 91, vision: 88, stamina: 76, shooting: 65, defending: 54 },
    recentDrills: 12,
    lastActive: "Hace 2h",
  },
  {
    id: "p2",
    name: "Alejandro Ruiz",
    age: 15,
    position: "Delantero Centro",
    positionShort: "DC",
    academy: "Cantera Sevilla",
    vsi: 92,
    phvOffset: 0.3,
    phvCategory: "on-time",
    trending: "up",
    avatar: "AR",
    stats: { speed: 89, technique: 84, vision: 71, stamina: 82, shooting: 93, defending: 38 },
    recentDrills: 8,
    lastActive: "Hace 30min",
  },
  {
    id: "p3",
    name: "Daniel Torres",
    age: 13,
    position: "Lateral Derecho",
    positionShort: "LD",
    academy: "Academia Valencia",
    vsi: 78,
    phvOffset: -1.2,
    phvCategory: "late",
    trending: "up",
    avatar: "DT",
    stats: { speed: 85, technique: 70, vision: 66, stamina: 88, shooting: 45, defending: 79 },
    recentDrills: 15,
    lastActive: "Hace 1h",
  },
  {
    id: "p4",
    name: "Pablo García",
    age: 16,
    position: "Mediocentro Defensivo",
    positionShort: "MCD",
    academy: "Cantera Athletic",
    vsi: 81,
    phvOffset: 0.9,
    phvCategory: "early",
    trending: "stable",
    avatar: "PG",
    stats: { speed: 68, technique: 75, vision: 82, stamina: 90, shooting: 55, defending: 88 },
    recentDrills: 6,
    lastActive: "Hace 4h",
  },
  {
    id: "p5",
    name: "Mateo Fernández",
    age: 14,
    position: "Extremo Izquierdo",
    positionShort: "EI",
    academy: "Academia Betis",
    vsi: 85,
    phvOffset: -0.3,
    phvCategory: "on-time",
    trending: "up",
    avatar: "MF",
    stats: { speed: 92, technique: 86, vision: 74, stamina: 78, shooting: 77, defending: 35 },
    recentDrills: 20,
    lastActive: "Hace 15min",
  },
  {
    id: "p6",
    name: "Iker Navarro",
    age: 15,
    position: "Portero",
    positionShort: "PO",
    academy: "Cantera Real Sociedad",
    vsi: 74,
    phvOffset: 1.1,
    phvCategory: "early",
    trending: "down",
    avatar: "IN",
    stats: { speed: 58, technique: 65, vision: 72, stamina: 80, shooting: 30, defending: 90 },
    recentDrills: 4,
    lastActive: "Ayer",
  },
];

export const mockMatches: LiveMatch[] = [
  { id: "m1", homeTeam: "Betis U15", awayTeam: "Sevilla U15", score: [2, 1], minute: 67, status: "live", playersTracked: 22, topPerformer: "Alejandro Ruiz", topVsi: 94 },
  { id: "m2", homeTeam: "Valencia U14", awayTeam: "Villarreal U14", score: [0, 0], minute: 0, status: "upcoming", playersTracked: 0, topPerformer: "-", topVsi: 0 },
  { id: "m3", homeTeam: "Athletic U16", awayTeam: "Real Sociedad U16", score: [1, 3], minute: 90, status: "finished", playersTracked: 20, topPerformer: "Pablo García", topVsi: 85 },
];

export const mockDrillCategories: DrillCategory[] = [
  { id: "d1", name: "Sprint & Velocidad", icon: "⚡", drillCount: 8, color: "neon" },
  { id: "d2", name: "Control de Balón", icon: "🎯", drillCount: 12, color: "electric" },
  { id: "d3", name: "Regate & Agilidad", icon: "🔥", drillCount: 10, color: "gold" },
  { id: "d4", name: "Pase & Visión", icon: "👁", drillCount: 6, color: "accent" },
  { id: "d5", name: "Disparo", icon: "💥", drillCount: 7, color: "danger" },
  { id: "d6", name: "Biomecánica", icon: "🧬", drillCount: 5, color: "neon" },
];

export const mockScoutInsights: ScoutInsight[] = [
  {
    id: "s1",
    player: mockPlayers[0],
    insightType: "breakout",
    title: "Talento Oculto Detectado",
    description: "Lucas Moreno tiene maduración tardía (PHV -0.8) pero su técnica ajustada supera al percentil 94 de su grupo de maduración. Perfil similar a Pedri a los 14.",
    metric: "VSI Ajustado",
    metricValue: "94",
    timestamp: "Hace 2h",
  },
  {
    id: "s2",
    player: mockPlayers[1],
    insightType: "comparison",
    title: "Comparativa Pro: Lamine Yamal",
    description: "Alejandro Ruiz muestra un perfil de aceleración y finalización idéntico al de Yamal a su edad. VSI de disparo en el top 1% nacional.",
    metric: "Similitud",
    metricValue: "91%",
    timestamp: "Hace 4h",
  },
  {
    id: "s3",
    player: mockPlayers[2],
    insightType: "phv-alert",
    title: "⚠️ Alerta PHV: Revisión Necesaria",
    description: "Daniel Torres lleva 3 meses sin actualizar sus datos antropométricos. Su VSI podría estar infravalorado hasta un 12% si ha tenido un estirón reciente.",
    metric: "Desfase",
    metricValue: "3 meses",
    timestamp: "Hace 6h",
  },
  {
    id: "s4",
    player: mockPlayers[4],
    insightType: "drill-record",
    title: "🏆 Nuevo Récord de Drill",
    description: "Mateo Fernández ha roto el récord de la academia en el drill 'Slalom Sprint 20m'. Tiempo: 3.42s, superando el anterior por 0.18s.",
    metric: "Tiempo",
    metricValue: "3.42s",
    timestamp: "Hace 30min",
  },
  {
    id: "s5",
    player: mockPlayers[3],
    insightType: "breakout",
    title: "Evolución Defensiva Notable",
    description: "Pablo García ha mejorado su interceptación ajustada por PHV un 23% en las últimas 4 semanas. Su perfil defensivo se aproxima al de Rodri a los 16 años.",
    metric: "Mejora",
    metricValue: "+23%",
    timestamp: "Hace 8h",
  },
];

// New data for Master Dashboard
export const mockPlayerReports: PlayerReport[] = [
  { id: "rp1", name: "David Alaba Jr.", position: "CB", academy: "U15 Academy", vsi: 88.4, biasAlert: "low" },
  { id: "rp2", name: "Marcus Rashford III", position: "LW", academy: "U16 Academy", vsi: 92.1, biasAlert: "high" },
  { id: "rp3", name: "Luka Modric II", position: "CM", academy: "U14 Academy", vsi: 81.5, biasAlert: "med" },
  { id: "rp4", name: "Erling Haaland Jr.", position: "ST", academy: "U17 Academy", vsi: 95.0, biasAlert: "low" },
];

export const mockPipelines: AnalysisPipeline[] = [
  {
    id: "pipe1",
    title: "Match Analysis: U16 Derby",
    source: "Video Stream #8293",
    pilar: "Pilar III: SPADL Engine",
    progress: 68,
    status: "processing",
    eta: "04m 22s",
  },
  {
    id: "pipe2",
    title: "Solo Drill: Sprint & Control",
    source: "Mateo Fernandez (U14)",
    pilar: "Pilar I: Player Selector",
    progress: 5,
    status: "queued",
    queuePosition: 2,
  },
];

export const mockLiveFeed: LiveFeedEvent[] = [
  { id: "lf1", message: "Report confirmed for Leo M.", time: "2 mins ago", color: "primary" },
  { id: "lf2", message: "New video upload detected: Match_day_14.mp4", time: "15 mins ago", color: "electric" },
  { id: "lf3", message: "Prophet Horizon update available", time: "1 hour ago", color: "gold" },
];
