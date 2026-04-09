/**
 * VITAS Knowledge Base — Sistemas Tácticos
 *
 * Documentos sobre formaciones, modelos de pressing, transiciones,
 * juego posicional, balón parado y construcción desde atrás.
 */

import type { KnowledgeDocument } from "./types";

export const TACTICAL_SYSTEMS_DOCS: KnowledgeDocument[] = [
  {
    id: "tac-433",
    title: "Sistema 4-3-3: principios y variantes",
    category: "methodology",
    content: `[METHODOLOGY] Sistema 4-3-3 — Principios, Variantes y Evaluación

ESTRUCTURA BASE: 4 defensas (2 centrales + 2 laterales), 3 mediocampistas (1 pivote + 2 interiores), 3 atacantes (2 extremos + 1 delantero centro).

PRINCIPIOS OFENSIVOS: Amplitud natural con 3 atacantes. Los extremos dan profundidad por bandas. El pivote distribuye desde atrás. Los interiores llegan al área como tercer hombre. Los laterales dan amplitud cuando los extremos se meten adentro. Triángulos naturales en cada zona: lateral-interior-extremo por banda.

PRINCIPIOS DEFENSIVOS: Se puede transformar en 4-5-1 (extremos bajan) o 4-1-4-1 (interiores bajan). El pressing se organiza con los 3 delanteros como primera línea. Pivote cubre espacio central. Interiores cubren las bandas interiores.

VARIANTES: 4-3-3 con falso 9 (delantero baja, extremos atacan profundidad). 4-3-3 con doble pivote encubierto (un interior baja a la línea del pivote). 4-3-3 asimétrico (un extremo se mete, el lateral de ese lado sube más).

EVALUACIÓN EN JUVENILES: ¿Los extremos dan amplitud real o se meten todos al centro? ¿El pivote recibe entre líneas o se esconde detrás de los centrales? ¿Los interiores llegan al área o se quedan en zona media? ¿Hay sincronización entre lateral e interior por banda?

FORTALEZAS: Superioridad natural en ataque (3v2 contra centrales), amplitud, presión alta organizada. DEBILIDADES: Vulnerable en el mediocampo si el rival juega con 2 pivotes (superioridad rival en zona media), dependiente de laterales ofensivos.`,
    metadata: { tags: ["433", "formacion", "sistema", "tactica"] },
  },
  {
    id: "tac-442",
    title: "Sistema 4-4-2: principios y variantes",
    category: "methodology",
    content: `[METHODOLOGY] Sistema 4-4-2 — Principios, Variantes y Evaluación

ESTRUCTURA BASE: 4 defensas, 4 mediocampistas (2 centrales + 2 bandas), 2 delanteros. La formación más equilibrada defensivamente.

PRINCIPIOS OFENSIVOS: Los 2 delanteros generan profundidad y combinaciones. Los mediocampistas de banda dan amplitud. Los mediocampistas centrales controlan el tempo y distribuyen. Los laterales se incorporan como recurso ofensivo adicional. Juego directo a los delanteros como alternativa a la construcción.

PRINCIPIOS DEFENSIVOS: 2 líneas de 4 compactas. Pressing en pares (2 delanteros, 2 mediocampistas de banda ayudan). Fácil de organizar defensivamente: las líneas son claras. Basculación colectiva hacia el lado del balón.

VARIANTES: 4-4-2 plano (mediocampistas en línea). 4-4-2 diamante (mediocampista ofensivo + defensivo en rombo). 4-4-1-1 (un delantero baja como mediapunta). 4-2-2-2 (mediocampistas avanzados como mediapuntas).

EVALUACIÓN EN JUVENILES: ¿Las 2 líneas de 4 mantienen distancia compacta (15-20m entre líneas)? ¿Los mediocampistas de banda contribuyen ofensiva Y defensivamente? ¿Los 2 delanteros combinan entre sí o juegan aislados? ¿El equipo bascula como unidad?

FORTALEZAS: Solidez defensiva, compacidad natural, fácil de enseñar. DEBILIDADES: Puede perder control del mediocampo contra equipos con 3 mediocampistas centrales, menos opciones de pase en construcción.`,
    metadata: { tags: ["442", "formacion", "sistema", "tactica"] },
  },
  {
    id: "tac-352",
    title: "Sistema 3-5-2: principios y variantes",
    category: "methodology",
    content: `[METHODOLOGY] Sistema 3-5-2 — Principios, Variantes y Evaluación

ESTRUCTURA BASE: 3 centrales, 2 carrileros (laterales largos), 2 mediocampistas centrales + 1 mediapunta (o 3 centrocampistas), 2 delanteros. Sistema que requiere alta comprensión táctica.

PRINCIPIOS OFENSIVOS: Superioridad en la salida de balón (3 centrales contra 2 delanteros rivales). Los carrileros dan amplitud total (banda a banda). Los mediocampistas controlan el centro. Los 2 delanteros combinan en el área. En posesión se transforma en 3-2-5 (carrileros suben a línea de ataque).

PRINCIPIOS DEFENSIVOS: Se transforma en 5-3-2 (carrileros bajan a la línea defensiva). 5 defensores cierran espacios por dentro. Los 3 mediocampistas cubren el ancho del campo. Los 2 delanteros son la primera línea de pressing.

VARIANTES: 3-4-3 en ataque (carrileros + delanteros forman 5 atacantes). 3-1-4-2 (un pivote profundo, 4 avanzados). 5-2-1-2 en defensa (ultra defensivo). 3-4-1-2 con mediapunta enlazador.

EVALUACIÓN EN JUVENILES: ¿Los carrileros tienen resistencia para subir y bajar (12+ km por partido)? ¿Los centrales pueden jugar con balón (especialmente el central del medio)? ¿El equipo entiende cuándo es 3-5-2 y cuándo 5-3-2? ¿Los 2 delanteros se complementan (uno baja, otro profundiza)?

FORTALEZAS: Control del mediocampo, solidez defensiva con 5 en defensa, superioridad en salida de balón. DEBILIDADES: Depende enormemente de la calidad y resistencia de los carrileros, vulnerable en las bandas si los carrileros no bajan.`,
    metadata: { tags: ["352", "formacion", "sistema", "tactica", "carrilero"] },
  },
  {
    id: "tac-high-pressing",
    title: "Pressing alto: triggers, organización y recuperación",
    category: "methodology",
    content: `[METHODOLOGY] Pressing Alto — Análisis Táctico Completo

DEFINICIÓN: Presión organizada en campo rival (a partir de la línea media o más arriba) con el objetivo de recuperar el balón cerca del arco rival y atacar inmediatamente.

PRESSING TRIGGERS (señales que activan la presión):
- Pase atrás del rival (señal de que están en dificultad)
- Mal control del receptor (ventana de oportunidad)
- Pase al portero (máxima presión, portero bajo estrés)
- Receptor de espaldas (no puede ver opciones de pase)
- Pase lateral predecible (el equipo bascula hacia ese lado)

ORGANIZACIÓN:
- Primera línea (delanteros): bloquean líneas de pase centrales, presionan al portador.
- Segunda línea (mediocampistas): cierran la segunda línea de pase, presionan si el rival supera la primera línea.
- Tercera línea (defensas): adelantan posición para comprimir el espacio, juegan línea ALTA.
- CLAVE: Las 3 líneas deben estar a máximo 30-35m de distancia total. Equipo compacto verticalmente.

GEGENPRESSING (contrapresión):
- Pressing INMEDIATO tras perder el balón (0-5 segundos). No esperar a organizarse.
- Los 3-4 jugadores más cercanos al balón presionan intensamente.
- Objetivo: recuperar antes de que el rival se organice para el contraataque.
- Klopp (Liverpool), Tuchel, Nagelsmann son referentes de este modelo.

EVALUACIÓN EN VIDEO:
- ¿El pressing es coordinado (todos presionan juntos) o individual (uno corre y el resto mira)?
- ¿Cuántos segundos tarda el equipo en activar el pressing tras la pérdida? (<3s = élite, 3-6s = bueno, >6s = lento)
- ¿Hay pressing triggers claros o presionan siempre?
- ¿La línea defensiva sube para acompañar el pressing (compactar) o se queda atrás (espacio entre líneas)?
- Pressing success rate: ¿De cada 10 presiones, cuántas recuperan balón? (>35% = efectivo)`,
    metadata: { tags: ["pressing", "gegenpressing", "presion-alta", "recuperacion", "tactica"] },
  },
  {
    id: "tac-transitions",
    title: "Transiciones ofensivas y defensivas",
    category: "methodology",
    content: `[METHODOLOGY] Transiciones — Los Momentos Más Decisivos del Fútbol Moderno

DEFINICIÓN: Los 3-8 segundos inmediatamente después de un cambio de posesión. Es cuando ambos equipos están desorganizados — el que reacciona más rápido tiene ventaja.

TRANSICIÓN OFENSIVA (Recuperación → Ataque):
Tipos: 1) Contraataque directo (balón largo a jugadores rápidos). 2) Ataque rápido (progresión con pocos toques). 3) Pausa para reorganizar (control de posesión post-recuperación).
La DECISIÓN de cuál usar es tan importante como la ejecución. Un equipo que siempre contraataca es predecible.
Claves: El primer pase tras la recuperación es el más importante (¿avanza o asegura?). Los jugadores rápidos deben reaccionar al instante. Los mediocampistas deben decidir en <1s si apoyan el ataque rápido o estabilizan.

TRANSICIÓN DEFENSIVA (Pérdida → Defensa):
Tipos: 1) Gegenpressing (presión inmediata). 2) Repliegue organizado (volver a posiciones). 3) Falta táctica (cortar la transición rival).
CLAVE: Los primeros 5 segundos tras la pérdida son los más peligrosos. Si el equipo NO reacciona en ese tiempo, el rival tiene ventaja de contraataque.
Rest defense: Jugadores que NO participan en el ataque y se quedan atrás para prevenir contraataques (típicamente 2-3 jugadores: pivote + 1-2 defensas).

EVALUACIÓN EN VIDEO:
- Velocidad de reacción colectiva: ¿Cuántos segundos tarda el equipo en cambiar de fase?
- ¿Quién lidera las transiciones? (Generalmente mediocampistas con buena lectura)
- ¿El equipo tiene rest defense o todos suben al ataque?
- En transición ofensiva: ¿aprovechan la desorganización rival o son lentos?
- En transición defensiva: ¿presionan inmediatamente o caminan de vuelta?
- Los goles en transición son los más frecuentes en fútbol moderno (~35% de goles en juego abierto).`,
    metadata: { tags: ["transicion", "contraataque", "gegenpressing", "rest-defense", "tactica"] },
  },
  {
    id: "tac-positional-play",
    title: "Juego posicional: principios fundamentales",
    category: "methodology",
    content: `[METHODOLOGY] Juego Posicional — Principios Fundamentales

DEFINICIÓN: Modelo de juego basado en la POSICIÓN de los jugadores para crear y explotar superioridades. Originado en el Ajax de Cruyff, refinado por Guardiola. No se trata de tener el balón, sino de tener jugadores en las POSICIONES correctas.

5 PRINCIPIOS DEL JUEGO POSICIONAL:

1. SUPERIORIDADES: Numérica (más jugadores en la zona que el rival), posicional (mejores posiciones aunque seamos menos), cualitativa (enfrentar a nuestro mejor jugador contra su peor defensor). El juego posicional busca crear al menos una superioridad en cada zona.

2. AMPLITUD Y PROFUNDIDAD: El equipo debe ocupar todo el campo — ancho (amplitud: laterales/extremos en las bandas) y largo (profundidad: delanteros estiran la defensa). Esto crea espacios entre las líneas rivales.

3. HALF-SPACES (canales interiores): Las zonas entre el centro y la banda. Son los canales de MAYOR creación en fútbol moderno. Los interiores, mediapuntas y extremos que se meten operan en estos canales. Un pase al half-space es más peligroso que un pase a la banda porque se recibe de cara a la portería.

4. TERCER HOMBRE: El jugador que NO participa directamente en el pase pero se beneficia de él. Ejemplo: A pasa a B, B devuelve a A, y C ya se desmarcó mientras B tenía el balón. La jugada no es A→B→A, sino A→B→C (el tercer hombre). Requiere movimiento anticipativo y visión periférica.

5. CIRCULACIÓN CON PROPÓSITO: No es posesión por posesión. Cada pase debe tener intención: cambiar la orientación del rival, atraer presión para liberar espacio, o progresar verticalmente. La posesión sin propósito es contraproducente.

EVALUACIÓN EN VIDEO: ¿El equipo busca superioridades o juega en igualdad? ¿Hay amplitud real (jugadores en las bandas)? ¿Los jugadores ocupan los half-spaces? ¿Se ven jugadas de tercer hombre? ¿La circulación tiene propósito (progresa) o es estéril?`,
    metadata: { tags: ["juego-posicional", "superioridad", "half-space", "tercer-hombre", "guardiola"] },
  },
  {
    id: "tac-set-pieces",
    title: "Balón parado: organización ofensiva y defensiva",
    category: "methodology",
    content: `[METHODOLOGY] Balón Parado — Organización Táctica

IMPORTANCIA: El 25-35% de los goles en fútbol provienen de situaciones de balón parado (corners, faltas, penaltis, saques de banda largos). En categorías juveniles y en partidos igualados, el balón parado puede ser el factor decisivo.

DEFENSA DE CORNERS — Sistemas:
ZONAL: Cada defensor cubre una zona del área, no un jugador específico. Ventaja: posición corporal correcta (de cara al balón). Desventaja: los atacantes pueden acumular en una zona.
AL HOMBRE: Cada defensor marca a un atacante específico. Ventaja: responsabilidad clara. Desventaja: los atacantes que se mueven bien pueden despistar.
MIXTO: 3-4 jugadores zonales en posiciones clave + el resto marca al hombre. Es el sistema más usado en élite.

ATAQUE DE CORNERS — Principios:
Movimientos predefinidos: cortinas (bloqueos), carreras cruzadas, jugadores que atacan primer palo/segundo palo/penalti.
Variantes: corner corto para cambiar ángulo, segundo balón preparado, corner directo al área.

FALTAS LATERALES — Principios:
Zona 1 (lejos del arco): jugar corto para progresar. Zona 2 (media distancia): centro al área o pase al half-space. Zona 3 (cerca del arco): disparo directo o jugada ensayada al área.

EVALUACIÓN EN EQUIPOS JUVENILES:
- ¿Tienen jugadas ensayadas o improvisan?
- ¿Quién ejecuta los saques? (¿El mejor ejecutor o el más cercano?)
- Defensa: ¿Sistema claro (zonal/hombre/mixto) o desorden?
- ¿Aprovechan los balones parados como oportunidad o los desperdician?
- En juveniles: el balón parado bien trabajado puede compensar diferencias de calidad individual.`,
    metadata: { tags: ["balon-parado", "corner", "falta", "set-piece", "tactica"] },
  },
  {
    id: "tac-build-up",
    title: "Salida de balón desde atrás",
    category: "methodology",
    content: `[METHODOLOGY] Construcción desde Atrás — Principios y Evaluación

DEFINICIÓN: Progresión organizada del balón desde el portero y los centrales hacia el mediocampo y ataque. Es uno de los principios fundamentales del fútbol moderno — el equipo que no puede salir jugando desde atrás está limitado tácticamente.

ESTRUCTURAS DE SALIDA:
2+1: 2 centrales abiertos + pivote entre ellos (el más básico). Los laterales suben a dar amplitud.
3+1: 2 centrales + pivote que baja a formar línea de 3. Portero como opción de retroceso.
2+2: 2 centrales + 2 mediocampistas (pivote + interior) que bajan. Más opciones de pase pero deja el centro vacío.
3+2: 1 central baja a la posición de lateral, 1 lateral sube. Salida asimétrica. Guardiola la usa frecuentemente.

PRINCIPIOS:
1. El portero es el primer constructor — DEBE poder recibir y distribuir bajo presión.
2. Los centrales abren para crear amplitud y atraer al pressing rival.
3. El pivote se ofrece entre líneas de presión — es la llave para superar la primera línea.
4. Los laterales dan amplitud como opción larga.
5. El objetivo es ATRAER al pressing rival para generar espacio detrás.

EVALUACIÓN EN VIDEO:
- ¿El equipo intenta salir jugando o despeja directamente?
- ¿El portero juega con los pies o solo saca largo?
- ¿Los centrales se abren para recibir? ¿Están cómodos bajo presión?
- ¿El pivote baja a ofrecer opción? ¿Recibe de cara o de espaldas?
- ¿Cuántos toques necesitan para superar la primera línea de presión?
- Si el rival presiona alto: ¿superan la presión o pierden balones peligrosos?

EN JUVENILES: La intención de salir jugando es MÁS valiosa que la ejecución perfecta. Un equipo sub-14 que intenta construir desde atrás y pierde balones está APRENDIENDO. Un equipo que solo despeja no está desarrollando jugadores. Evaluar la INTENCIÓN táctica, no solo el resultado.`,
    metadata: { tags: ["salida-balon", "construccion", "portero", "pivote", "centrales", "tactica"] },
  },
];
