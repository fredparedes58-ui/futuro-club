/**
 * VITAS Knowledge Base — Metodología de Scouting
 *
 * Documentos de evaluación por posición, indicadores de talento,
 * señales de alerta y evaluación de inteligencia de juego.
 * Basado en metodologías de scouting profesional (La Masia, Ajax, Clairefontaine).
 */

import type { KnowledgeDocument } from "./types";

export const SCOUTING_METHODOLOGY_DOCS: KnowledgeDocument[] = [
  {
    id: "scout-gk-eval",
    title: "Evaluación de porteros juveniles",
    category: "scouting",
    content: `[SCOUTING] Evaluación de Porteros Juveniles — Criterios por Edad

SUB-12: Priorizar valentía y disposición. A esta edad la estatura es irrelevante para predecir rendimiento futuro. Observar: ¿se lanza a por el balón? ¿tiene miedo al contacto? ¿se comunica con la defensa? La coordinación óculo-manual es el mejor indicador temprano. NO evaluar envergadura ni potencia de saque.

SUB-14: Comienza a importar el posicionamiento básico (reducir ángulos). Evaluar: juego con los pies (¿puede recibir pase atrás y distribuir bajo presión?), timing de salida en 1v1, inicio de comunicación táctica con centrales. La estatura empieza a ser factor pero no determinante.

SUB-16: Evaluación más completa. Distribución larga y corta, posicionamiento en el arco, lectura de centros (¿sale o se queda?), reflejos, 1v1 a diferentes ángulos, juego aéreo en el área. El portero moderno DEBE saber jugar con los pies — si a los 16 no puede dar un pase de 30m preciso, es limitante.

SUB-18+: Evaluación profesional completa. Consistencia en todas las áreas, capacidad de liderazgo (dirige la defensa), mentalidad (cómo reacciona tras encajar gol), manejo de presión, distribución como primer pase de ataque. El portero élite a esta edad ya muestra personalidad competitiva clara.

INDICADORES CLAVE TRANSVERSALES: Valentía > Envergadura en juveniles. Juego con pies > Reflejos puros (el portero moderno es un constructor). Comunicación > Paradas espectaculares. Posicionamiento > Athleticismo.

SEÑALES DE ALERTA: Miedo al contacto persistente, incapacidad de jugar con pies bajo presión a los 16+, falta de comunicación con la defensa, reacción negativa tras errores.`,
    metadata: { position: "GK", ageRange: "8-21", tags: ["portero", "evaluacion", "juvenil"] },
  },
  {
    id: "scout-cb-eval",
    title: "Evaluación de centrales juveniles",
    category: "scouting",
    content: `[SCOUTING] Evaluación de Centrales Juveniles — Criterios por Edad

SUB-12: Lo más importante es la LECTURA DE JUEGO, no la fuerza. Observar: ¿anticipa la jugada? ¿intercepta antes del contacto? ¿se posiciona entre el balón y la portería instintivamente? Un central inteligente de 12 años que es pequeño tiene más potencial que uno grande que solo despeja.

SUB-14: Evaluar capacidad de salida con balón. El central moderno DEBE progresar con pase — no solo despejar. Observar: primer toque bajo presión, pase vertical a mediocampistas, conducción para atraer pressing y liberar compañeros. La anticipación (visión en métricas VITAS) es el predictor más fuerte de éxito futuro en centrales.

SUB-16: Añadir evaluación de duelo aéreo, duelo 1v1 con delanteros rápidos, coberturas al compañero, comunicación de línea defensiva. La capacidad de defender el espacio a la espalda (contra desmarques de ruptura) es crítica. Evaluar también: ¿puede jugar con ambos perfiles? ¿es central derecho o izquierdo? ¿domina la pierna no hábil para la salida?

SUB-18+: Evaluación profesional: consistencia bajo presión, liderazgo defensivo, distribución larga diagonal, velocidad de reacción en transiciones defensivas, capacidad de defender en campo abierto (no solo en bloque bajo). El central élite lee el juego 2-3 segundos antes que el promedio.

PERFILES DE CENTRAL MODERNO: Constructor (Stones, Araujo) — técnica y distribución. Interceptor (Van Dijk, Koulibaly) — lectura anticipativa. Stopper (Ramos, Skriniar) — agresividad y duelo. El perfil constructor es el más escaso y valioso.

SEÑALES DE ALERTA: Dependencia del físico sin lectura de juego, incapacidad de salir con balón a los 16+, posicionamiento reactivo (siempre llega tarde), pánico bajo presión en zona de construcción.`,
    metadata: { position: "CB", ageRange: "8-21", tags: ["central", "defensa", "evaluacion"] },
  },
  {
    id: "scout-fb-eval",
    title: "Evaluación de laterales juveniles",
    category: "scouting",
    content: `[SCOUTING] Evaluación de Laterales Juveniles — Criterios por Edad

SUB-12: El lateral a esta edad es un jugador que corre y tiene energía. Observar: disposición a subir y bajar, primer toque con pierna exterior (perfil natural), capacidad de centrar en carrera. NO penalizar errores defensivos — a los 12 muchos laterales aún no saben cuándo subir y cuándo quedarse.

SUB-14: Evaluar el timing de incorporación al ataque. El buen lateral sube cuando hay espacio y se queda cuando hay riesgo. Observar: ¿entiende cuándo incorporarse? ¿puede centrar en movimiento? ¿defiende 1v1 contra extremos? La combinación velocidad + resistencia es esencial — el lateral recorre más distancia que cualquier otro jugador de campo.

SUB-16: El lateral moderno es un creador de amplitud y superioridad. Evaluar: centros desde diferentes posiciones (línea de fondo, zona 14, recortado), 1v1 defensivo (¿puede contener a un extremo rápido?), capacidad de jugar como interior cuando el equipo necesita control. El lateral que solo defiende tiene techo bajo en fútbol moderno.

SUB-18+: Evaluación completa: contribución ofensiva por partido (centros, pases progresivos, asistencias), solidez defensiva (duelos ganados, interceptaciones), resistencia aeróbica (distancia recorrida, sprints repetidos), versatilidad (¿puede jugar de carrilero en 3-5-2?).

PERFILES: Carrilero (Alexander-Arnold, Cancelo) — creativo, se incorpora al mediocampo. Lateral clásico (Carvajal) — equilibrio ataque-defensa. Lateral defensivo (Azpilicueta) — prioriza contención.

SEÑALES DE ALERTA: Solo sube pero no baja (desequilibra al equipo), no puede centrar en movimiento, se pierde posicionalmente en repliegues, no tiene resistencia para repetir esfuerzos.`,
    metadata: { position: "FB", ageRange: "8-21", tags: ["lateral", "defensa", "evaluacion"] },
  },
  {
    id: "scout-dm-eval",
    title: "Evaluación de pivotes y mediocentros defensivos",
    category: "scouting",
    content: `[SCOUTING] Evaluación de Pivotes/Mediocentros Defensivos — Criterios por Edad

SUB-12: El pivote es la posición más difícil de evaluar en juveniles porque requiere inteligencia de juego que aún se está formando. Observar: ¿se ofrece como opción de pase? ¿orienta el cuerpo para ver el campo al recibir? ¿tiene capacidad de girar bajo presión? Un pivote de 12 años con buena orientación corporal es excepcional.

SUB-14: Evaluar distribución de juego. El pivote marca el TEMPO del equipo. Observar: variedad de pase (corto para circular, largo para cambiar orientación, vertical para romper líneas), posicionamiento entre líneas de presión rival, capacidad de recibir de espaldas y girar. La VISIÓN (escaneo antes de recibir) es crítica — el pivote que no escanea siempre tomará decisiones lentas.

SUB-16: Añadir capacidad defensiva: interceptaciones (no tackles — el buen pivote intercepta antes del contacto), cobertura de espacios, pressing en zonas de pérdida. Evaluar también: ¿puede resistir presión de 2 rivales y salir con balón? ¿tiene la personalidad para pedir el balón en situaciones comprometidas?

SUB-18+: El pivote élite domina el juego. Evaluación: distribución precisa a los 4 cuadrantes del campo, capacidad de romper pressing rival con un pase, posicionamiento que corta líneas de pase del rival, liderazgo táctico (organiza al equipo), resistencia para cubrir espacios durante 90 minutos.

EL PIVOTE ES LA POSICIÓN MÁS ESCASA Y VALIOSA. Un jugador con visión alta + técnica alta en posición de pivote tiene techo profesional alto. Es más fácil enseñar a defender que enseñar a distribuir.

PERFILES: Organizador (Rodri, Busquets) — distribución y tempo. Destructor (Kanté, Casemiro) — recuperación y cobertura. Híbrido (Rice, De Jong) — combina ambos.

SEÑALES DE ALERTA: Siempre juega lateral/atrás (no arriesga), mala orientación corporal al recibir, no escanea antes del primer toque, se esconde del balón bajo presión.`,
    metadata: { position: "DM", ageRange: "8-21", tags: ["pivote", "mediocentro", "evaluacion"] },
  },
  {
    id: "scout-cm-eval",
    title: "Evaluación de interiores y mediocampistas",
    category: "scouting",
    content: `[SCOUTING] Evaluación de Interiores/Mediocampistas — Criterios por Edad

SUB-12: Observar la relación con el balón y la capacidad de encontrar espacios. ¿Se mueve al espacio libre? ¿Participa constantemente o desaparece? A esta edad, un mediocampista que siempre quiere el balón y busca combinaciones tiene más proyección que uno que solo corre.

SUB-14: Evaluar la capacidad de jugar entre líneas. El interior moderno recibe entre la defensa y el mediocampo rival — eso requiere timing de movimiento + capacidad técnica para girar + visión para decidir rápido. Observar: ¿llega al área? ¿tiene disparo? ¿equilibra ataque y defensa?

SUB-16: Diferenciación de perfiles. Box-to-box: resistencia + llegada + trabajo defensivo (Bellingham). Creativo: técnica + visión + último pase (Pedri). Interior goleador: disparo + timing de llegada (De Bruyne). Evaluar: ¿cuál es su fortaleza principal? ¿puede jugar en sistemas diferentes?

SUB-18+: Evaluación de impacto en el partido. El mediocampista élite influye en CADA fase: construye, progresa, crea, y recupera. Métricas clave: pases progresivos por 90 min, pases al último tercio, recuperaciones en campo rival, llegadas al área.

LA COMBINACIÓN MÁS VALIOSA en un interior juvenil: técnica + visión + resistencia. Un jugador con estas 3 puede jugar en CUALQUIER sistema. Si además tiene disparo, el techo es máximo.

SEÑALES DE ALERTA: Solo tiene una función (solo defiende O solo ataca), desaparece en partidos difíciles, no tiene personalidad para pedir el balón cuando van perdiendo, pases siempre horizontales (no progresa el juego).`,
    metadata: { position: "CM", ageRange: "8-21", tags: ["interior", "mediocampista", "evaluacion"] },
  },
  {
    id: "scout-winger-eval",
    title: "Evaluación de extremos juveniles",
    category: "scouting",
    content: `[SCOUTING] Evaluación de Extremos Juveniles — Criterios por Edad

SUB-12: Observar la valentía para encarar. El extremo necesita atreverse al 1v1. A esta edad: ¿regatea? ¿tiene cambio de ritmo? ¿se atreve a intentar cosas? NO penalizar pérdidas por regate — el extremo que no pierde balones es un extremo que no arriesga. Valorar la alegría y el desparpajo.

SUB-14: Evaluar end product (producto final). El regate solo tiene valor si genera algo: centro, disparo, pase clave, falta. Observar: ¿puede centrar en movimiento? ¿tiene gol? ¿desborda por fuera o recorta hacia adentro? La capacidad de combinar con el lateral indica inteligencia táctica superior.

SUB-16: Añadir trabajo defensivo. El extremo moderno presiona y replega. Evaluar: pressing sobre el lateral rival, ayuda defensiva cuando el lateral sube, disciplina en transición defensiva. También: ¿puede jugar por ambas bandas? ¿tiene pierna no hábil para recortar/centrar?

SUB-18+: Evaluación completa: éxito en 1v1 (% de regates completados), end product (goles + asistencias por 90 min), pressing efectivo, centros completados, versatilidad banda/posición. El extremo élite tiene al menos 2 recursos: velocidad + regate, o regate + disparo, o velocidad + centro.

EXTREMO QUE SOLO TIENE VELOCIDAD: Techo bajo. Al llegar a profesional, todos los laterales son rápidos. El extremo necesita recurso técnico además de velocidad. Por eso un extremo lento pero con gran técnica a los 14 puede ser mejor inversión que uno rápido pero técnicamente limitado.

PERFILES: Desequilibrante (Vinicius, Mbappé) — velocidad + regate + profundidad. Creador (Saka, Foden) — técnica + visión + asociación. Goleador (Salah, Díaz) — recorte interior + disparo.

SEÑALES DE ALERTA: Solo tiene velocidad (sin recurso técnico alternativo), no replega defensivamente, siempre elige la misma opción (predecible), desaparece cuando el equipo no tiene el balón.`,
    metadata: { position: "W", ageRange: "8-21", tags: ["extremo", "banda", "evaluacion"] },
  },
  {
    id: "scout-st-eval",
    title: "Evaluación de delanteros centro juveniles",
    category: "scouting",
    content: `[SCOUTING] Evaluación de Delanteros Centro Juveniles — Criterios por Edad

SUB-12: Observar instinto de gol y movimiento. ¿Busca estar en posición de gol? ¿Se mueve al espacio? A esta edad NO importa si es alto o bajo, fuerte o débil — importa si ENTIENDE dónde estar. Un delantero de 12 años que siempre aparece en el lugar correcto tiene más futuro que uno que solo mete goles por velocidad.

SUB-14: Evaluar variedad de gol. ¿Remata de cabeza? ¿Con ambos pies? ¿De primera? ¿Desde fuera del área? También evaluar juego de espaldas: ¿puede recibir con defensa detrás, proteger y asociarse? El delantero que solo mete goles con espacio es limitado.

SUB-16: Evaluación táctica completa. Movimientos de desmarque (ruptura al espacio, arrastre de centrales, desmarque de apoyo), pressing al rival (es el primer defensor), juego aéreo ofensivo, capacidad de jugar solo o con un compañero de ataque. ¿Entiende cuándo profundizar y cuándo bajar a asociar?

SUB-18+: El delantero élite tiene eficacia (goles/ocasiones), movimiento inteligente (genera espacios para otros aunque no toque el balón), juego de espaldas, pressing efectivo como primer defensor. xG vs goles reales indica calidad de finalización. Timing de carrera al área indica inteligencia posicional.

LA INTELIGENCIA DE MOVIMIENTO es más predictiva que la velocidad o la potencia de disparo. Un delantero que siempre está en la posición correcta marcará goles toda su carrera. Uno que depende de la velocidad dejará de marcar cuando los defensas sean igual de rápidos.

PERFILES: Depredador de área (Haaland, Lewandowski) — posicionamiento + remate. Falso 9 (Firmino, Griezmann) — baja a asociar + inteligencia. Referente (Kane, Benzema) — juego completo + distribución. Velocista (Mbappé como ST) — profundidad + transición.

SEÑALES DE ALERTA: Solo mete goles por ventaja física (en juveniles esto desaparece), no participa en el juego cuando no tiene el balón, no presiona al rival, frustración visible cuando no recibe pases.`,
    metadata: { position: "ST", ageRange: "8-21", tags: ["delantero", "goleador", "evaluacion"] },
  },
  {
    id: "scout-talent-indicators",
    title: "Indicadores de talento por edad",
    category: "scouting",
    content: `[SCOUTING] Indicadores Predictivos de Talento por Edad

EDAD 8-10 (FUNdamentals): Los mejores indicadores a esta edad NO son rendimiento sino PROCESO. Observar: coordinación motriz general, relación lúdica con el balón (¿disfruta jugando?), capacidad de atención, disposición a intentar cosas nuevas. La velocidad y la fuerza a los 8 años tienen CERO valor predictivo. El 90% de los "mejores" a los 8 no llegan a sub-16 de élite.

EDAD 10-12 (Learning to Train): Primer toque orientado, capacidad de ejecutar bajo presión mínima, frecuencia de escaneo visual (¿mira alrededor antes de recibir?), disposición a pedir el balón. Un jugador de 11 que escanea 2+ veces antes de recibir está en el top 5% de madurez táctica.

EDAD 12-14 (Training to Train): PERÍODO CRÍTICO. Los indicadores más predictivos son: velocidad de decisión con balón (<2s = élite para la edad), capacidad técnica bajo presión de 1-2 rivales, escaneo visual consistente, y AGILIDAD DE APRENDIZAJE (¿mejora rápido cuando se le corrige?). La diferencia física entre early y late maturers es máxima a esta edad — NO confundir ventaja madurativa con talento.

EDAD 14-16 (Training to Compete): Consistencia se vuelve importante. Ya no basta con flashazos de calidad — ¿puede mantener nivel durante 80 minutos? ¿rinde igual contra rivales fuertes que débiles? La inteligencia táctica (posicionamiento, decisiones sin balón, lectura de juego) se vuelve el predictor dominante.

EDAD 16-18 (Training to Win): Evaluación casi profesional. Los indicadores clave: rendimiento bajo presión competitiva real, adaptabilidad (¿puede jugar en diferentes sistemas?), mentalidad (resiliencia, hambre, liderazgo), y capacidad de impactar partidos en momentos decisivos.

REGLA DE ORO: El mejor predictor transversal de talento a CUALQUIER edad es la INTELIGENCIA DE JUEGO — escaneo visual, toma de decisiones rápida, posicionamiento anticipativo. Esto no depende de la maduración biológica y se mantiene estable o mejora con el tiempo.`,
    metadata: { ageRange: "8-21", tags: ["talento", "prediccion", "indicadores", "scouting"] },
  },
  {
    id: "scout-red-flags",
    title: "Señales de alerta en scouting juvenil",
    category: "scouting",
    content: `[SCOUTING] Señales de Alerta (Red Flags) en Scouting Juvenil

RED FLAGS TÉCNICAS:
- Primer toque inconsistente a los 14+ años: Si a los 14 no puede controlar un pase firme de forma consistente, es señal de que la técnica base no fue bien desarrollada en la ventana sensible (10-13).
- Pierna no hábil ausente a los 16+: El jugador que a los 16 solo puede ejecutar con un pie tiene techo bajo en fútbol profesional. A los 12-14 es normal, a los 16+ es limitante.
- Conducción con la cabeza baja: Indica que el jugador necesita mirar el balón para controlarlo, lo que elimina la capacidad de escanear el entorno.

RED FLAGS TÁCTICAS:
- Siempre toma la misma decisión: Si un extremo SIEMPRE regatea (o siempre pasa), indica falta de lectura del juego. El jugador inteligente varía según el contexto.
- No se adapta a instrucciones tácticas: Si después de una instrucción clara del entrenador el jugador sigue haciendo lo mismo, indica baja agilidad de aprendizaje.
- Posicionamiento reactivo constante: Siempre llega tarde a la jugada, siempre detrás de la acción.

RED FLAGS FÍSICAS (CONTEXTUALIZADAS POR PHV):
- Early maturer que SOLO destaca por físico: Si un jugador de 13 años maduro (post-PHV) solo gana por velocidad y fuerza pero tiene técnica y visión bajas (<50), es altamente probable que pierda ventaja cuando los pares maduren.
- Late maturer con rendimiento decreciente: Puede ser señal de frustración psicológica por la desventaja física, no de falta de talento. REQUIERE intervención de soporte psicológico.

RED FLAGS PSICOLÓGICAS:
- Reacción negativa persistente tras errores: Baja la cabeza, deja de pedir el balón, se frustra visiblemente durante varios minutos.
- Desaparece en partidos importantes: Rinde bien en amistosos/entrenamientos pero se esconde en partidos competitivos.
- Culpa a compañeros por errores propios: Señal de baja autoconciencia y resistencia al aprendizaje.
- No acepta corrección del entrenador: El jugador que discute las instrucciones consistentemente tiene problemas de coachability.

IMPORTANTE: Una red flag NO significa descartar al jugador. Significa que necesita intervención específica. Muchas red flags son corregibles con el entrenamiento y el soporte adecuado.`,
    metadata: { ageRange: "8-21", tags: ["red-flags", "alerta", "scouting", "riesgo"] },
  },
  {
    id: "scout-game-intelligence",
    title: "Evaluación de inteligencia de juego",
    category: "scouting",
    content: `[SCOUTING] Evaluación de Inteligencia de Juego — El Predictor Más Importante

La inteligencia de juego es el factor MÁS predictivo de éxito profesional a largo plazo. No depende de la maduración biológica, no se pierde con la edad, y diferencia al jugador profesional del amateur.

COMPONENTES OBSERVABLES:

1. ESCANEO VISUAL (Scanning): Giros de cabeza ANTES de recibir el balón. Investigación (Jordet, 2005; Geert Savelsbergh, 2006) demuestra correlación directa entre frecuencia de escaneo y calidad de decisión. Benchmarks: 0-1 escaneos = bajo, 2-3 = bueno, 4+ = élite. A los 12 años, 2 escaneos ya es excepcional. A los 18, 4+ es esperado en jugadores de nivel.

2. VELOCIDAD DE DECISIÓN: Tiempo desde recepción hasta ejecución. El jugador inteligente decide ANTES de recibir (porque escaneó). Benchmarks por edad: Sub-12: <3s bueno, <2s élite. Sub-14: <2s bueno, <1.5s élite. Sub-16: <1.5s bueno, <1s élite. Sub-18+: <1s esperado, <0.5s élite.

3. POSICIONAMIENTO ANTICIPATIVO: El jugador se mueve a la posición correcta ANTES de que la jugada llegue allí. Observar: ¿el jugador ya está en el espacio cuando llega el balón? ¿O siempre está corriendo HACIA la posición correcta? El primero es inteligente, el segundo es reactivo.

4. LECTURA DEFENSIVA: Capacidad de anticipar la intención del rival. ¿Intercepta pases? ¿Se posiciona para cortar líneas de pase antes de que el rival ejecute? Los centrales con alta lectura defensiva tienen interceptaciones altas y tackles bajos — resuelven antes del contacto.

5. ADAPTABILIDAD TÁCTICA: ¿Cambia de comportamiento según el contexto? Por ejemplo: cuando el equipo pierde ¿se posiciona más alto y arriesga más? Cuando van ganando ¿gestiona tiempos y posesión? Esta capacidad de adaptación es señal de madurez táctica.

CÓMO SE EVALÚA EN VIDEO: Contar escaneos (giros de cabeza), medir velocidad de decisión (tiempo recepción-acción), observar si el jugador llega antes o después al espacio, registrar interceptaciones vs tackles, notar cambios de comportamiento durante el partido.`,
    metadata: { ageRange: "8-21", tags: ["inteligencia", "decision", "escaneo", "tactica"] },
  },
];
