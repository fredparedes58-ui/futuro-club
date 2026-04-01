/**
 * VITAS RAG — Knowledge Base Seeding
 * POST /api/rag/seed
 *
 * Indexes the DRILLS_LIBRARY into the knowledge_base table.
 * Protected: requires SUPABASE_SERVICE_ROLE_KEY to be present.
 *
 * Process drills in batches of 10 to avoid timeouts.
 */
export const config = { runtime: "edge" };

// Inline minimal drill types to avoid importing the src bundle in Edge runtime
interface DrillDocument {
  id: string;
  name: string;
  category: string;
  description: string;
  objectives: string[];
  ageRange: [number, number];
  durationMin: number;
  playerCount: string;
  metricsImproved: string[];
  positions: string[];
  difficulty: string;
  spaceMeters: string;
  sets: number;
  repsOrDuration: string;
  source: string;
  coachingPoints: string[];
  progressions: string[];
}

function drillToSearchText(drill: DrillDocument): string {
  return `[DRILL] ${drill.name}
Categoría: ${drill.category} | Edad: ${drill.ageRange[0]}-${drill.ageRange[1]} años | Dificultad: ${drill.difficulty}
Posiciones beneficiadas: ${drill.positions.join(", ")}
Métricas que mejora: ${drill.metricsImproved.join(", ")}
Descripción: ${drill.description}
Objetivos: ${drill.objectives.join(". ")}
Puntos clave del entrenador: ${drill.coachingPoints.join(". ")}
Espacio: ${drill.spaceMeters} | Jugadores: ${drill.playerCount} | Duración: ${drill.durationMin} min
Fuente metodológica: ${drill.source}`;
}

// Inline DRILLS_LIBRARY so the Edge function is self-contained
const DRILLS_LIBRARY: DrillDocument[] = [
  { id: "TEC-001", name: "Rondo 4v2", category: "tecnica", description: "4 jugadores en posesión contra 2 defensores en cuadrícula 10x10m. Máximo 2 toques.", objectives: ["Primer toque orientado", "Visión periférica bajo presión", "Velocidad de decisión"], ageRange: [10, 21], durationMin: 10, playerCount: "6", metricsImproved: ["technique", "vision"], positions: ["CM", "CAM", "CDM"], difficulty: "intermedio", spaceMeters: "10x10", sets: 4, repsOrDuration: "3 min por serie", source: "FC Barcelona metodología base", coachingPoints: ["Mantener amplitud máxima en los 4 vértices", "El receptor debe mostrar el cuerpo antes de recibir"], progressions: ["1 toque fijo", "Ampliar a 5v3"] },
  { id: "TEC-002", name: "Control y Conducción en Circuito", category: "tecnica", description: "Circuito de conos con control orientado, conducción en velocidad, cambio de dirección y pase final.", objectives: ["Control orientado con ambos perfiles", "Conducción en velocidad máxima", "Cambio de dirección a alta velocidad"], ageRange: [8, 16], durationMin: 12, playerCount: "8-12", metricsImproved: ["technique", "speed"], positions: ["todas"], difficulty: "basico", spaceMeters: "20x15", sets: 3, repsOrDuration: "2 repeticiones por jugador", source: "UEFA Grassroots Coaching Manual", coachingPoints: ["El control debe ser suave y orientado al siguiente movimiento", "Mantener la cabeza levantada"], progressions: ["Añadir defensor pasivo", "Reducir tiempo de referencia 10%"] },
  { id: "TEC-003", name: "Pared 1-2 en Espacio Reducido", category: "tecnica", description: "Parejas realizan paredes consecutivas (1-2) avanzando por el campo.", objectives: ["Asociación entre líneas", "Timing de desmarque", "Precisión del pase al primer toque"], ageRange: [10, 21], durationMin: 8, playerCount: "4-10", metricsImproved: ["technique", "vision"], positions: ["ST", "CAM", "CM", "W"], difficulty: "intermedio", spaceMeters: "30x20", sets: 3, repsOrDuration: "5 min por serie", source: "Ajax Total Football Academy", coachingPoints: ["El pase debe ir al pie adelantado", "El movimiento de desmarcaje empieza ANTES de dar el pase"], progressions: ["Añadir un defensor activo", "Finalizar en portería"] },
  { id: "TEC-004", name: "Malabarismos y Control Aéreo", category: "tecnica", description: "Trabajo de malabarismos individuales con ambos pies, rodilla, pecho y cabeza.", objectives: ["Coordinación ojo-pie", "Dominio técnico con ambas superficies"], ageRange: [8, 14], durationMin: 10, playerCount: "individual o parejas", metricsImproved: ["technique"], positions: ["todas"], difficulty: "basico", spaceMeters: "individual", sets: 4, repsOrDuration: "2 min por serie", source: "Coerver Coaching Foundation", coachingPoints: ["Golpear siempre con el empeine pleno", "Mantener el cuerpo erguido y relajado"], progressions: ["Alternar pie derecho-izquierdo", "Controlar de cabeza y continuar con pie"] },
  { id: "TEC-005", name: "Recepción y Giro bajo Presión", category: "tecnica", description: "Jugador recibe el balón de espaldas al gol con un defensor a su espalda.", objectives: ["Control de espaldas con presión", "Giro y protección del balón", "Decisión rápida"], ageRange: [12, 21], durationMin: 10, playerCount: "3 (atacante, defensor, servidor)", metricsImproved: ["technique", "vision"], positions: ["ST", "CF", "CAM"], difficulty: "avanzado", spaceMeters: "15x10", sets: 4, repsOrDuration: "6 repeticiones por jugador", source: "Metodología Pressing Moderno (Klopp/Liverpool)", coachingPoints: ["Usar el cuerpo como escudo", "El giro debe ser rápido con visión del siguiente pase"], progressions: ["Defensor activo desde el inicio", "Finalización al arco"] },
  { id: "TEC-006", name: "Conducción 1v1 con Cambio de Ritmo", category: "tecnica", description: "Duelo 1v1 en pasillo de 5m de ancho y 20m de largo usando cambio de ritmo, finta o arrancada explosiva.", objectives: ["Regate y superación 1v1", "Cambio de ritmo y aceleración", "Finta y engaño corporal"], ageRange: [10, 18], durationMin: 12, playerCount: "2 por pasillo", metricsImproved: ["technique", "speed"], positions: ["W", "LW", "RW", "ST"], difficulty: "intermedio", spaceMeters: "5x20", sets: 5, repsOrDuration: "3 intentos por jugador", source: "Coerver Coaching 1v1 System", coachingPoints: ["La finta debe comprometer el peso del defensor", "La arrancada debe ser explosiva"], progressions: ["Pasillo más estrecho (3m)", "Finalización en portería"] },
  { id: "TEC-007", name: "Pase en Movimiento Triángulos", category: "tecnica", description: "3 jugadores forman triángulos en movimiento constante intercambiando posiciones.", objectives: ["Pase en movimiento", "Ocupación de espacios libres", "Sincronización de movimientos"], ageRange: [11, 21], durationMin: 10, playerCount: "6-9 (múltiples triángulos)", metricsImproved: ["technique", "vision"], positions: ["CM", "CAM", "CDM"], difficulty: "intermedio", spaceMeters: "20x20", sets: 3, repsOrDuration: "4 min por serie", source: "Cruyff Football Methodology", coachingPoints: ["El triángulo siempre debe tener amplitud máxima", "Quien pasa siempre se mueve"], progressions: ["Añadir cuarto jugador como comodín", "Competición entre triángulos"] },
  { id: "TEC-008", name: "Control con Acción Siguiente Definida", category: "tecnica", description: "Recepciones donde el entrenador indica la acción siguiente al primer toque mediante señales.", objectives: ["Primer toque de calidad con decisión previa", "Adaptabilidad táctica", "Velocidad de procesamiento visual"], ageRange: [12, 21], durationMin: 8, playerCount: "4-8", metricsImproved: ["technique", "vision"], positions: ["todas"], difficulty: "avanzado", spaceMeters: "15x15", sets: 3, repsOrDuration: "10 repeticiones", source: "Método Prozone Cognitivo", coachingPoints: ["La señal se lee ANTES del control", "Velocidad de ejecución > perfección del gesto"], progressions: ["Señales más complejas", "Defensor añadido"] },
  { id: "TAC-001", name: "Pressing Coordinado 4-4-2", category: "pressing", description: "Bloque de 8 jugadores practica el pressing organizado con señal del primer presionador.", objectives: ["Coordinación del bloque defensivo", "Trigger del pressing", "Coberturas y permutas"], ageRange: [13, 21], durationMin: 15, playerCount: "10-14", metricsImproved: ["defending", "stamina", "vision"], positions: ["CB", "CDM", "CM", "ST", "W"], difficulty: "avanzado", spaceMeters: "campo completo mitad", sets: 4, repsOrDuration: "5 min activo + 2 pausa", source: "Metodología Gegenpressing (Klopp) adaptada para academias", coachingPoints: ["El primer presionador marca la dirección", "Las líneas deben subir JUNTAS"], progressions: ["Partido real con pressing como consigna"] },
  { id: "TAC-002", name: "Construcción desde Atrás 3-2", category: "tactica", description: "3 centrales y 2 pivotes practican la salida de balón desde el portero con patrones de juego de posición.", objectives: ["Salida limpia desde portería", "Uso del tercer hombre", "Ocupación de carriles"], ageRange: [13, 21], durationMin: 15, playerCount: "6-8 + portero", metricsImproved: ["vision", "technique"], positions: ["CB", "CDM", "GK"], difficulty: "avanzado", spaceMeters: "campo completo tercio defensivo", sets: 5, repsOrDuration: "4 repeticiones de 2 min", source: "Pep Guardiola Build-Up System (Manchester City Academy)", coachingPoints: ["El portero siempre da la opción más alejada del pressing", "Si el pressing llega, el balón va al portero y se reinicia"], progressions: ["Partido 9v9 con posesión libre"] },
  { id: "TAC-003", name: "Partido 5v5 Posesional con Comodines", category: "tactica", description: "Partido 5v5 con 2 comodines siempre con el equipo en posesión. Objetivo: mantener posesión más de 8 pases.", objectives: ["Mantenimiento de posesión bajo presión", "Uso de superioridad numérica", "Transición rápida"], ageRange: [12, 21], durationMin: 20, playerCount: "12 + 2 comodines", metricsImproved: ["vision", "technique", "stamina"], positions: ["todas"], difficulty: "intermedio", spaceMeters: "30x20", sets: 3, repsOrDuration: "7 min partido", source: "Metodología Positional Play", coachingPoints: ["Los comodines juegan siempre a 1 toque", "Al perder, pressing inmediato en 3 segundos"], progressions: ["Sin comodines (5v5 puro)"] },
  { id: "TAC-004", name: "Transición Defensa-Ataque 4v3", category: "transicion", description: "4 defensores recuperan y atacan inmediatamente contra 3 defensores del equipo contrario.", objectives: ["Velocidad en transición ofensiva", "Contragolpe coordinado", "Toma de decisión tras recuperación"], ageRange: [12, 21], durationMin: 15, playerCount: "10-12", metricsImproved: ["speed", "vision", "stamina"], positions: ["W", "ST", "CM"], difficulty: "avanzado", spaceMeters: "campo completo", sets: 4, repsOrDuration: "3 min intenso", source: "RB Leipzig Counter-Pressing Academy", coachingPoints: ["La transición debe ser INMEDIATA: máximo 2 segundos", "El primer pase debe avanzar el balón"], progressions: ["Paridad 4v4", "Desde saque de portero"] },
  { id: "TAC-005", name: "Juego entre Líneas — Mediapunta", category: "tactica", description: "Recibir entre líneas, girar y crear ocasión. Defensor a la espalda activo.", objectives: ["Recibir entre líneas", "Giro para enfrentar portería", "Crear espacios para compañeros"], ageRange: [13, 21], durationMin: 12, playerCount: "6-8", metricsImproved: ["vision", "technique"], positions: ["CAM", "SS", "CM"], difficulty: "avanzado", spaceMeters: "25x20", sets: 4, repsOrDuration: "8 repeticiones", source: "Real Madrid Academy", coachingPoints: ["El movimiento de desmarcaje debe ser en forma de L", "Al recibir: evaluar giro, pared o protección en un segundo"], progressions: ["Dos defensores", "Añadir finalización directa"] },
  { id: "TAC-006", name: "Bloque Defensivo Bajo 4-4-2", category: "tactica", description: "Mantener líneas compactas, denegar espacios entre líneas, forzar juego a bandas y hacer pressing en banda.", objectives: ["Compactación del bloque", "Denegar espacios verticales", "Pressing zonal en banda"], ageRange: [13, 21], durationMin: 15, playerCount: "10 + atacantes", metricsImproved: ["defending", "stamina"], positions: ["CB", "FB", "CDM", "CM"], difficulty: "avanzado", spaceMeters: "campo completo mitad defensiva", sets: 3, repsOrDuration: "8 min defensivo", source: "Diego Simeone Defensive System Atlético de Madrid", coachingPoints: ["Las cuatro líneas nunca más de 10m entre ellas", "Al balón en banda, el bloque se cierra hacia ese lado"], progressions: ["Con portero real y condición de tiro"] },
  { id: "TAC-007", name: "Corners y Estrategia a Balón Parado", category: "tactica", description: "Práctica sistemática de corners en ataque y defensa con múltiples variantes.", objectives: ["Sincronización en corners ofensivos", "Variedades de esquemas", "Marcaje en corners defensivos"], ageRange: [13, 21], durationMin: 20, playerCount: "18-22", metricsImproved: ["vision", "technique"], positions: ["CB", "ST", "W"], difficulty: "intermedio", spaceMeters: "campo real", sets: 2, repsOrDuration: "10 repeticiones cada variante", source: "UEFA Pro License Set Pieces Manual", coachingPoints: ["Cada jugador memoriza su movimiento ANTES del córner", "En defensa: comunicación verbal continua"], progressions: ["Partido con puntuación extra por gol de balón parado"] },
  { id: "FIS-001", name: "Sprints con Cambio de Dirección (COD)", category: "fisico", description: "Series de sprints de 10-20m con cambios de dirección obligatorios marcados por conos.", objectives: ["Velocidad de aceleración (0-10m)", "Potencia en cambio de dirección", "Resistencia a la velocidad"], ageRange: [12, 21], durationMin: 15, playerCount: "cualquier número", metricsImproved: ["speed", "stamina"], positions: ["todas"], difficulty: "intermedio", spaceMeters: "20x15", sets: 5, repsOrDuration: "6-8 sprints con pausa 45s", source: "NSCA Sprint Protocol", coachingPoints: ["La aceleración inicial en posición de ataque (45°)", "Plantar el pie exterior en el cambio de dirección"], progressions: ["Añadir balón al final del sprint"] },
  { id: "FIS-002", name: "Circuito Anaeróbico Fútbol", category: "fisico", description: "Circuito de 5 estaciones de alta intensidad: sprint corto, salto vertical, agilidad, aceleración lateral.", objectives: ["Resistencia anaeróbica", "Explosividad en arranques cortos", "Agilidad lateral"], ageRange: [14, 21], durationMin: 20, playerCount: "10-15", metricsImproved: ["speed", "stamina"], positions: ["todas"], difficulty: "avanzado", spaceMeters: "campo completo", sets: 3, repsOrDuration: "Circuito completo x3 con 3 min pausa", source: "Julio Callejo Sports Science — La Liga Academias", coachingPoints: ["La intensidad debe ser máxima en cada estación", "3 minutos de pausa activa entre circuitos"], progressions: ["Reducir pausa a 2 minutos", "Añadir ejercicio técnico al final"] },
  { id: "FIS-003", name: "Interval Training Fútbol (HIIT)", category: "fisico", description: "Intervalos de alta intensidad con balón: 15 segundos de presión máxima + 45 segundos de mantenimiento.", objectives: ["VO2 máximo específico de fútbol", "Resistencia a la intensidad repetida", "Mantener calidad técnica en fatiga"], ageRange: [14, 21], durationMin: 20, playerCount: "10-16", metricsImproved: ["stamina", "speed"], positions: ["todas"], difficulty: "avanzado", spaceMeters: "40x30", sets: 6, repsOrDuration: "4 min bloque + 2 min pausa", source: "Verheijen Football Periodization", coachingPoints: ["Monitorear frecuencia cardíaca: objetivo 85-95% FC máx", "Hidratación entre series obligatoria"], progressions: ["Aumentar ratio alta intensidad a 20 seg"] },
  { id: "FIS-004", name: "Trabajo de Fuerza Preventiva Sub-16", category: "fisico", description: "Circuito de fortalecimiento muscular para prevención de lesiones: nórdicos, sentadilla monopodal, planchas. Especialmente importante durante PHV.", objectives: ["Fortalecimiento isquiotibiales", "Estabilidad de rodilla y tobillo", "Prevención de lesiones musculares"], ageRange: [12, 16], durationMin: 20, playerCount: "cualquier número", metricsImproved: ["stamina"], positions: ["todas"], difficulty: "basico", spaceMeters: "gimnasio o campo", sets: 3, repsOrDuration: "10-12 reps por ejercicio", source: "FIFA 11+ Prevention Program", coachingPoints: ["Especialmente importante para jugadores en fase PHV", "La técnica es más importante que el número de repeticiones"], progressions: ["Añadir carga progresiva (bandas elásticas)"] },
  { id: "FIS-005", name: "Velocidad de Reacción con Balón", category: "fisico", description: "Parejas compiten por el balón soltado lateralmente por el entrenador. Trabaja velocidad de reacción y sprint inicial.", objectives: ["Velocidad de reacción ante estímulo", "Sprint inicial (0-5m)", "Control de balón en velocidad"], ageRange: [10, 21], durationMin: 12, playerCount: "parejas + entrenador", metricsImproved: ["speed", "technique"], positions: ["ST", "W", "CM"], difficulty: "intermedio", spaceMeters: "20x15", sets: 4, repsOrDuration: "8 disputas por pareja", source: "Sprint Intelligence Academy (SIA) Protocol", coachingPoints: ["El tiempo de reacción mejora con práctica sistemática", "No anticipar el balón antes de que lo suelte el entrenador"], progressions: ["Señal auditiva en lugar de visual"] },
  { id: "DIS-001", name: "Definición tras Control Orientado", category: "disparo", description: "Jugador recibe pase desde banda, controla orientando hacia portería y dispara en un movimiento.", objectives: ["Definición precisa a los postes", "Control orientado hacia portería", "Potencia de disparo"], ageRange: [12, 21], durationMin: 15, playerCount: "6-10 + portero", metricsImproved: ["shooting", "technique"], positions: ["ST", "CF", "W", "CAM"], difficulty: "intermedio", spaceMeters: "área de penalti", sets: 4, repsOrDuration: "8 disparos por jugador", source: "Juanma Lillo Finishing Methodology", coachingPoints: ["Mirar la portería ANTES de recibir para saber el lado del portero", "Disparar al palo más lejano del portero"], progressions: ["Con defensor que sale a tapar", "Desde posición más lejana (16m)"] },
  { id: "DIS-002", name: "Disparo de Primera Intención", category: "disparo", description: "Disparos de primera intención desde diferentes ángulos sin controlar en menos de 0.5 segundos.", objectives: ["Disparo de primera intención", "Coordinación y timing en el golpeo", "Velocidad de disparo"], ageRange: [13, 21], durationMin: 12, playerCount: "4-8 + portero", metricsImproved: ["shooting"], positions: ["ST", "CF", "CAM", "CM"], difficulty: "avanzado", spaceMeters: "área de penalti ampliada", sets: 3, repsOrDuration: "10 disparos por jugador", source: "Ronald Koeman Finishing Drills", coachingPoints: ["El pie de apoyo marca la dirección", "El tiro cruzado al segundo palo es el más difícil para el portero"], progressions: ["Balón en movimiento lateral antes del disparo"] },
  { id: "DIS-003", name: "Llegada al Área y Definición en 2v1", category: "disparo", description: "Dos atacantes contra un defensor y portero coordinando quién dispara y quién distrae.", objectives: ["Definición en superioridad numérica", "Comunicación en el área", "Leer al defensor para decidir quién tira"], ageRange: [13, 21], durationMin: 15, playerCount: "4-8 + portero", metricsImproved: ["shooting", "vision"], positions: ["ST", "CF", "W", "CAM"], difficulty: "intermedio", spaceMeters: "área de penalti + 10m", sets: 5, repsOrDuration: "6 repeticiones por pareja", source: "Holanda Academias Atacantes", coachingPoints: ["El segundo atacante siempre busca el segundo palo", "La pared final solo si el portero sale"], progressions: ["Añadir segundo defensor (2v2)"] },
  { id: "DIS-004", name: "Disparos de Media Distancia con Bote", category: "disparo", description: "Disparos desde 20-25m con bote previo (semivólley). Eficaz y difícil para el portero.", objectives: ["Técnica de semivólley", "Potencia desde media distancia", "Precisión en disparos a la escuadra"], ageRange: [14, 21], durationMin: 12, playerCount: "4-8 + portero", metricsImproved: ["shooting"], positions: ["CM", "CDM", "CAM", "CB"], difficulty: "avanzado", spaceMeters: "25m de portería", sets: 3, repsOrDuration: "8 disparos por jugador", source: "Roberto Carlos Shooting Technique", coachingPoints: ["Golpear justo cuando el balón alcanza la altura de la cadera", "El wrapping (efecto) hace el disparo más difícil para el portero"], progressions: ["En competición (máximo goles en 10 intentos)"] },
  { id: "DIS-005", name: "Cabeceo Atacante: Centros Laterales", category: "disparo", description: "Centros desde ambas bandas con llegadas de uno o dos atacantes. Mecánica del cabeceo: salto, giro, dirección.", objectives: ["Mecánica del cabeceo a portería", "Timing del salto", "Llegada al primer y segundo palo"], ageRange: [12, 21], durationMin: 15, playerCount: "6-10 + portero", metricsImproved: ["shooting", "speed"], positions: ["ST", "CF", "CB"], difficulty: "intermedio", spaceMeters: "área de penalti + bandas", sets: 4, repsOrDuration: "8 cabeceos por jugador", source: "Emilio Butragueño Heading Academy", coachingPoints: ["El salto debe ser de plataforma: un pie impulsa, cuerpo recto", "Atacar siempre el espacio donde viene el centro, no esperar"], progressions: ["Con defensor marcando"] },
  { id: "PRE-001", name: "Contrapressing Inmediato (Gegenpressing)", category: "pressing", description: "Tras perder el balón, 3-4 jugadores presionan inmediatamente cortando salidas. Si no recuperan en 5 segundos, repliegue.", objectives: ["Recuperación inmediata tras pérdida", "Organización del gegenpressing", "Criterio: cuándo activar y cuándo replegarse"], ageRange: [14, 21], durationMin: 20, playerCount: "12-16", metricsImproved: ["stamina", "defending", "vision"], positions: ["W", "ST", "CM", "CAM"], difficulty: "avanzado", spaceMeters: "mitad del campo", sets: 4, repsOrDuration: "5 min intenso", source: "Jürgen Klopp Gegenpressing System", coachingPoints: ["La señal de contrapressing es automática", "5 segundos es el límite", "Siempre quedar 2-3 jugadores detrás para evitar contragolpe"], progressions: ["Reducir tiempo límite a 4 segundos"] },
  { id: "PRE-002", name: "Pressing en Banda 3v2", category: "pressing", description: "3 defensores coordinados atrapan al poseedor en banda: uno presiona, uno corta pase interior, uno cubre atrás.", objectives: ["Pressing coordinado en banda", "Roles: presionador/canalizador/cobertura", "Recuperación del balón en banda"], ageRange: [13, 21], durationMin: 12, playerCount: "6-8", metricsImproved: ["defending", "stamina"], positions: ["W", "FB", "CM", "CDM"], difficulty: "intermedio", spaceMeters: "20x15 en banda", sets: 5, repsOrDuration: "3 min por rol", source: "Thomas Tuchel Defensive Organisation", coachingPoints: ["El presionador NUNCA corre solo sin cobertura", "La trampa de banda solo funciona si hay coordinación perfecta"], progressions: ["Ampliar a 4v3"] },
  { id: "TRN-001", name: "Transición Ataque-Defensa Organizada", category: "transicion", description: "El equipo pierde el balón y debe reorganizarse defensivamente en menos de 3 segundos en 4-4-2.", objectives: ["Velocidad de transición defensiva", "Reorganización inmediata", "Compactación del bloque"], ageRange: [13, 21], durationMin: 15, playerCount: "12-16", metricsImproved: ["stamina", "defending", "vision"], positions: ["todas"], difficulty: "avanzado", spaceMeters: "campo completo", sets: 3, repsOrDuration: "8 min partido transiciones", source: "Mauricio Pochettino Transition System", coachingPoints: ["El último atacante se convierte inmediatamente en primer defensor", "Prioridad: cortar el contragolpe antes de reorganizar"], progressions: ["Partido donde se puntúa el contragolpe"] },
  { id: "POS-CB-001", name: "Duelo Aéreo y Anticipación para Centrales", category: "tactica", description: "Centrales practican anticipación en balones aéreos y decisión de cuándo salir o quedarse.", objectives: ["Anticipación en el salto", "Posicionamiento antes del balón", "Comunicación entre centrales"], ageRange: [13, 21], durationMin: 15, playerCount: "4-6 + delantero", metricsImproved: ["defending", "vision"], positions: ["CB", "CDM"], difficulty: "intermedio", spaceMeters: "área de penalti", sets: 4, repsOrDuration: "10 repeticiones", source: "Carles Puyol Defending Principles", coachingPoints: ["El salto es de la cadera, no solo de las piernas", "Comunicación verbal con el compañero central antes de cada balón"], progressions: ["Partido con consigna de juego directo"] },
  { id: "POS-GK-001", name: "Portero: Salidas y Organización Defensiva", category: "tactica", description: "El portero practica salidas al cruce, comunicación con la defensa y posicionamiento en córners.", objectives: ["Timing de salida al cruce", "Liderazgo verbal de la defensa", "Reflejos en distancias cortas"], ageRange: [10, 21], durationMin: 20, playerCount: "portero + 4 defensores + atacantes", metricsImproved: ["defending", "vision"], positions: ["GK"], difficulty: "avanzado", spaceMeters: "área de penalti", sets: 3, repsOrDuration: "10 repeticiones por variante", source: "Manuel Neuer Sweeper-Keeper System", coachingPoints: ["La decisión de salir debe tomarse en 1 segundo", "Si hay duda, el portero no sale"], progressions: ["Portero como libero: sale hasta la línea de área"] },
  { id: "POS-ST-001", name: "Delantero: Movimientos de Desmarque sin Balón", category: "tactica", description: "Movimientos de desmarque específicos: de apoyo, de ruptura, en diagonal y timing correcto.", objectives: ["Movimiento de desmarque de ruptura", "Timing del movimiento antes del pase", "Crear espacios para compañeros"], ageRange: [12, 21], durationMin: 15, playerCount: "4-6 + defensor", metricsImproved: ["vision", "speed"], positions: ["ST", "CF", "W"], difficulty: "avanzado", spaceMeters: "mitad campo ofensiva", sets: 4, repsOrDuration: "8 repeticiones", source: "Ronaldo (R9) Movement Analysis", coachingPoints: ["El desmarque de ruptura empieza yendo HACIA el defensor y luego girando", "La aceleración en los últimos 3 metros es la más importante"], progressions: ["En 2v2 coordinado con otro delantero"] },
  { id: "POS-WG-001", name: "Extremo: Centros y Definición en Banda", category: "tactica", description: "Extremos practican conducción por banda, 1v1 y decisión: centrar, cortar al interior o pared.", objectives: ["Superación 1v1 en banda", "Tipos de centro: raso, al primer palo, atrás", "Combinación con lateral propio"], ageRange: [12, 21], durationMin: 15, playerCount: "8-10", metricsImproved: ["technique", "speed", "shooting"], positions: ["LW", "RW", "LB", "RB"], difficulty: "intermedio", spaceMeters: "banda completa + área", sets: 4, repsOrDuration: "6 repeticiones por extremo", source: "Arjen Robben Winger Methodology", coachingPoints: ["El extremo mira el área antes de centrar", "Si el lateral rival cierra la conducción, el corte al interior es automático"], progressions: ["Partido condicionado: solo se puede marcar con cabeza"] },
];

const BATCH_SIZE = 10;

interface SeedResult {
  success: boolean;
  totalDrills: number;
  indexed: number;
  errors: string[];
  batches: number;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Protected: only runs if service role key is present
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured — seed is protected" }, 403);
  }

  const baseUrl = new URL(req.url).origin;
  const errors: string[] = [];
  let totalIndexed = 0;
  let batchCount = 0;

  // Process drills in batches of BATCH_SIZE
  for (let i = 0; i < DRILLS_LIBRARY.length; i += BATCH_SIZE) {
    const batch = DRILLS_LIBRARY.slice(i, i + BATCH_SIZE);
    batchCount++;

    const documents = batch.map(drill => ({
      content: drillToSearchText(drill),
      category: "drill" as const,
      metadata: {
        drillId: drill.id,
        name: drill.name,
        drillCategory: drill.category,
        difficulty: drill.difficulty,
        positions: drill.positions,
        metricsImproved: drill.metricsImproved,
        ageRange: drill.ageRange,
        source: drill.source,
      },
    }));

    try {
      const res = await fetch(`${baseUrl}/api/rag/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents }),
      });

      if (res.ok) {
        const data = await res.json() as { indexed?: number; errors?: string[] };
        totalIndexed += data.indexed ?? 0;
        if (data.errors?.length) {
          errors.push(...data.errors.map(e => `Batch ${batchCount}: ${e}`));
        }
      } else {
        const errText = await res.text();
        errors.push(`Batch ${batchCount} failed (${res.status}): ${errText.slice(0, 200)}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(`Batch ${batchCount} exception: ${msg}`);
    }
  }

  const result: SeedResult = {
    success: errors.length === 0,
    totalDrills: DRILLS_LIBRARY.length,
    indexed: totalIndexed,
    errors,
    batches: batchCount,
  };

  return json(result);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
