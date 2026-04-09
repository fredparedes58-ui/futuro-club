# VITAS · KPIs, Estadisticas e Indices

> Documento tecnico de todas las metricas del sistema VITAS Football Intelligence.
> Ultima actualizacion: Abril 2026

---

## Indice

1. [VSI — VITAS Scouting Index](#1-vsi--vitas-scouting-index)
2. [RAE — Relative Age Effect](#2-rae--relative-age-effect)
3. [PHV — Peak Height Velocity](#3-phv--peak-height-velocity)
4. [UBI — Unified Bias Index](#4-ubi--unified-bias-index)
5. [TruthFilter — Ajuste de VSI](#5-truthfilter--ajuste-de-vsi)
6. [VAEP — Valor de Acciones por Probabilidad](#6-vaep--valor-de-acciones-por-probabilidad)
7. [Dominant Features / Play Style](#7-dominant-features--play-style)
8. [Metricas de Tracking (GPS/YOLO)](#8-metricas-de-tracking-gpsyolo)
9. [Voronoi — Control Territorial](#9-voronoi--control-territorial)
10. [Similarity Score — Comparacion con Profesionales](#10-similarity-score--comparacion-con-profesionales)
11. [Proyecciones de Desarrollo](#11-proyecciones-de-desarrollo)
12. [Role Profile — Perfil Tactico](#12-role-profile--perfil-tactico)
13. [Metricas de Eventos de Partido](#13-metricas-de-eventos-de-partido)
14. [Pose Analysis — Analisis de Pose](#14-pose-analysis--analisis-de-pose)
15. [Biomechanics Score](#15-biomechanics-score)
16. [6 Dimensiones del Reporte IA](#16-6-dimensiones-del-reporte-ia)
17. [Tabla Resumen](#17-tabla-resumen)

---

## 1. VSI — VITAS Scouting Index

**Que es:** El indice principal de VITAS. Un score compuesto que resume el nivel global de un jugador juvenil en una sola cifra.

**Archivo:** `src/services/real/metricsService.ts`

**Formula:**
```
VSI = (Speed x 0.18) + (Technique x 0.22) + (Vision x 0.20) +
      (Stamina x 0.15) + (Shooting x 0.13) + (Defending x 0.12)
```

**Pesos y justificacion:**
| Metrica | Peso | Razon |
|---------|------|-------|
| Technique | 22% | El mayor predictor de exito en futbol juvenil |
| Vision | 20% | Capacidad de lectura de juego, segundo predictor |
| Speed | 18% | Importante pero puede dar ventaja temporal (PHV) |
| Stamina | 15% | Base fisica necesaria |
| Shooting | 13% | Relevante pero posicion-dependiente |
| Defending | 12% | Menor peso en formacion juvenil general |

**Rango:** 0-100

**Clasificacion:**
| Rango | Etiqueta | Significado |
|-------|----------|-------------|
| 80-100 | Elite | Top 5% de la cohorte |
| 65-79 | Alto | Potencial para cantera profesional |
| 50-64 | Medio | Buen nivel, necesita desarrollo |
| 0-49 | Desarrollo | En fase formativa temprana |

**Tendencia (Trend):**
- `up`: Delta > +2 puntos (en ascenso)
- `down`: Delta < -2 puntos (en descenso)
- `stable`: entre -2 y +2

**Percentil:**
```
percentil = (jugadores_por_debajo / total_jugadores) x 100
```

**Para que sirve:** Permite comparar jugadores de distintas posiciones y edades con una metrica unica. Es el "credit score" del talento juvenil.

---

## 2. RAE — Relative Age Effect

**Que es:** Cuantifica la ventaja/desventaja que tiene un jugador por su fecha de nacimiento dentro de la cohorte anual. Los nacidos en enero tienen hasta 11 meses de ventaja fisica sobre los nacidos en diciembre.

**Archivo:** `src/services/real/advancedMetricsService.ts`

**Formula:**
```
relativeMonths = (birthMonth - cutoffMonth + 12) % 12
```

**Cuartiles:**
| Cuartil | Meses desde corte | Clasificacion | Factor de sesgo |
|---------|-------------------|---------------|-----------------|
| Q1 | 0-2 | early_cohort | 1.22 (maxima ventaja) |
| Q2 | 3-5 | mid_cohort_early | ~1.14 |
| Q3 | 6-8 | mid_cohort_late | ~1.06 |
| Q4 | 9-11 | late_cohort | 1.00 (sin ventaja) |

**Correccion al VSI:**
| Cuartil | Ajuste |
|---------|--------|
| Q1 | -2 puntos (sobreestimados) |
| Q2 | 0 puntos |
| Q3 | +2 puntos |
| Q4 | +5 puntos (subestimados) |

**Para que sirve:** Identifica jugadores que estan siendo sobreestimados (nacidos temprano, mas grandes fisicamente) o subestimados (nacidos tarde, mas pequenos). Permite descubrir "talentos ocultos" en Q4.

---

## 3. PHV — Peak Height Velocity

**Que es:** Calcula el momento de maxima velocidad de crecimiento de un jugador (maduracion biologica). Determina si un jugador es madurador precoz, normal o tardio respecto a su edad cronologica.

**Archivo:** `api/agents/phv-calculator.ts`

**Formula (Mirwald et al.):**
```
Maturity Offset = -9.236
  + (0.0002708 x leg_length x sitting_height)
  - (0.001663 x age x leg_length)
  + (0.007216 x age x sitting_height)
  + (0.02292 x (weight/height) x 100)
```

**Estimaciones si faltan datos:**
```
sitting_height ≈ height x 0.52
leg_length ≈ height x 0.48
```

**Categorias:**
| Offset | Categoria | Estado | Significado |
|--------|-----------|--------|-------------|
| < -1.0 | Early (Precoz) | pre_phv | Ya paso su pico de crecimiento. Ventaja fisica actual, declinara |
| -1.0 a +1.0 | On-time (Normal) | during_phv | Maduracion acorde a su edad |
| > +1.0 | Late (Tardio) | post_phv | Aun no llega a su pico. Desventaja actual, potencial futuro alto |

**Ajuste al VSI:**
| Categoria | Factor | Efecto |
|-----------|--------|--------|
| Early | x1.12 | Se reduce VSI (sobreestimado por fisico) |
| On-time | x1.0 | Sin cambio |
| Late | x0.92 | Se aumenta VSI (subestimado por fisico) |

**Confianza:**
- Con datos reales (sitting height + leg length): 0.92
- Con datos estimados: 0.74

**Para que sirve:** Es el diferenciador clave de VITAS. Ningun competidor ofrece correccion por maduracion biologica. Permite ver el potencial real detras de la ventaja/desventaja fisica transitoria.

---

## 4. UBI — Unified Bias Index

**Que es:** Combina los sesgos de RAE y PHV en un solo indice que indica cuan sesgada esta la evaluacion de un jugador.

**Archivo:** `src/services/real/advancedMetricsService.ts`

**Formula:**
```
raeComponent = (birthQuartile - 1) / 3        [0 = Q1, 1 = Q4]
phvComponent = clamp(|phvOffset| / 2, 0, 1)   [late maturers -> 1]
UBI = (0.55 x raeComponent) + (0.45 x phvComponent)
```

**Rango:** 0-1

**Interpretacion:**
| UBI | Nivel | Significado |
|-----|-------|-------------|
| >= 0.7 | Alto | Jugador probablemente MUY subestimado |
| 0.4-0.7 | Moderado | Sesgo significativo presente |
| 0.2-0.4 | Leve | Sesgo menor |
| < 0.2 | Minimo | Sin sesgo significativo |

**Factor de correccion VSI:**
```
vsICorrectionFactor = 1 + (UBI x 0.12)
Maximo: +12% sobre el VSI
```

**Para que sirve:** Alerta a scouts y entrenadores sobre jugadores cuya evaluacion esta distorsionada por factores biologicos. Un UBI alto = "mira mas de cerca a este jugador".

---

## 5. TruthFilter — Ajuste de VSI

**Que es:** Algoritmo que ajusta el VSI eliminando los sesgos de maduracion y edad relativa. Produce el "VSI verdadero" que refleja habilidad pura.

**Archivo:** `src/services/real/advancedMetricsService.ts`

**4 Casos de ajuste:**

### Caso 1: Madurador Precoz (phvOffset > +0.5)
```
Magnitud = min(8, round(phvOffset x 4))
Correccion: -Magnitud (reduce 3-8 puntos)
Confianza: 0.85 (datos reales), 0.60 (estimados)
Razon: Sobreestimado por ventaja fisica transitoria
```

### Caso 2: Madurador Tardio (phvOffset < -0.5)
```
Magnitud = min(10, round(|phvOffset| x 4))
Correccion: +Magnitud (aumenta 3-10 puntos)
Confianza: 0.88 (datos reales), 0.65 (estimados)
Razon: Subestimado por desventaja fisica temporal
```

### Caso 3: Normal + RAE Alto (Q1-Q2)
```
Magnitud = Q1 ? 3 : 1
Correccion: -Magnitud (-1 a -3 puntos)
Confianza: 0.70
Razon: Ligera ventaja por RAE
```

### Caso 4: Normal + RAE Bajo (Q3-Q4)
```
Magnitud = Q4 ? 4 : 1
Correccion: +Magnitud (+1 a +4 puntos)
Confianza: 0.72
Razon: Ligera desventaja por RAE
```

**Para que sirve:** Produce el score mas justo posible al eliminar sesgos sistematicos. Es como "ver al jugador a los 21 anos" desde hoy.

---

## 6. VAEP — Valor de Acciones por Probabilidad

**Que es:** Mide el valor real de cada accion de un jugador (pases, disparos, duelos) en terminos de probabilidad de gol generado o evitado. Basado en Decroos et al., 2019.

**Archivos:** `src/services/real/advancedMetricsService.ts`, `src/lib/geminiToVaep.ts`

**Formula base:**
```
VAEP(accion) = [P(gol_despues) - P(gol_antes)] - [P(conceder_despues) - P(conceder_antes)]
```

**Pesos simplificados por evento:**
| Evento | Exito | Fallo |
|--------|-------|-------|
| Disparo | +0.15 | -0.03 |
| Pase (zona ofensiva) | +0.03 | -0.015 |
| Pase (zona media) | +0.015 | -0.015 |
| Pase (zona defensiva) | +0.0075 | -0.015 |
| Regate | +0.06 | -0.02 |
| Tackle | +0.04 | -0.015 |
| Pressing | +0.025 | -0.005 |
| Centro | +0.08 | -0.02 |
| Cabezazo | +0.05 | -0.01 |

**Metricas generadas:**
| Metrica | Descripcion |
|---------|-------------|
| `vaepTotal` | Suma de todos los deltas de acciones |
| `vaep90` | VAEP normalizado a 90 minutos |
| `topActions` | Top 5 acciones de mayor impacto |

**Fuentes de datos:**
1. Log manual de eventos (botones rapidos en PlayerProfile)
2. Deteccion automatica via Gemini (video observation)

**Para que sirve:** Va mas alla de estadisticas basicas (pases completados). Muestra el IMPACTO real de cada accion en el resultado. Un jugador puede tener 90% de pases completos pero VAEP negativo si solo hace pases laterales sin riesgo.

---

## 7. Dominant Features / Play Style

**Que es:** Clasifica automaticamente el estilo de juego de un jugador y detecta sus caracteristicas dominantes e infra-desarrolladas.

**Archivo:** `src/services/real/advancedMetricsService.ts`

**Z-Score:**
```
zScore = (valor_metrica - media_norma) / desviacion_estandar
```

**Normas de referencia (grupo VITAS):**
| Metrica | Media | Desviacion |
|---------|-------|------------|
| Speed | 60 | 14 |
| Technique | 58 | 13 |
| Vision | 55 | 14 |
| Stamina | 60 | 13 |
| Shooting | 52 | 15 |
| Defending | 56 | 14 |

**Clasificacion de estilo:**
| Estilo | Condicion |
|--------|-----------|
| Ofensivo | offensive_avg > 72 AND > defensive_avg + 10 |
| Defensivo | defensive_avg > 72 AND > offensive_avg + 10 |
| Tecnico | technique > 72 AND vision > 68 |
| Fisico | physical_avg > 72 |
| Equilibrado | Ninguna de las anteriores |

**Indice de especializacion:**
```
varianza = sum((zScore_i - mean_zScore)^2) / 6
indice = min(1, sqrt(varianza) / 2)
```
- 0 = Generalista puro
- 1 = Altamente especializado

**Para que sirve:** Permite entender rapidamente el ADN de un jugador: es un tecnico puro, un motor fisico, un ofensivo nato, etc. Las areas "infra-desarrolladas" guian el plan de entrenamiento.

---

## 8. Metricas de Tracking (GPS/YOLO)

**Que es:** Metricas fisicas de rendimiento extraidas del tracking por vision artificial (YOLO) aplicando homografia para convertir pixeles a metros reales.

**Archivos:** `src/lib/yolo/types.ts`, `src/services/real/advancedMetricsService.ts`

**Metricas calculadas:**

| Metrica | Calculo | Unidad | Que mide |
|---------|---------|--------|----------|
| maxSpeedMs | Velocidad instantanea pico | m/s | Velocidad maxima del jugador |
| avgSpeedMs | Velocidad media de sesion | m/s | Ritmo general de trabajo |
| totalDistanceM | Suma distancia frame-a-frame | metros | Distancia total recorrida |
| sprintCount | Tramos >6.5 m/s por >= 1s | cantidad | Numero de sprints |
| sprintDistanceM | Distancia acumulada en sprints | metros | Metros recorridos a maxima velocidad |
| fieldCoveragePct | Celdas 5x5m visitadas / 273 total | % | Cobertura territorial del campo |
| maxAccelMs2 | Derivada de velocidad | m/s2 | Capacidad de aceleracion |

**Zonas de intensidad:**
| Zona | Velocidad | Tipo de esfuerzo |
|------|-----------|------------------|
| Walk | 0-2 m/s | Caminata / recuperacion |
| Jog | 2-4 m/s | Trote |
| Run | 4-5.83 m/s | Carrera |
| Sprint | >5.83 m/s (>21 km/h) | Sprint |

**Fuente de datos:**
- YOLO v8/v11 detecta jugadores por frame (25 FPS)
- Homografia convierte bbox pixel -> coordenadas reales en metros
- Tracker asigna IDs persistentes (filtro de Kalman)

**Para que sirve:** Equivale a datos GPS profesionales (Catapult, STATSports) pero SIN hardware. Solo necesitas un video.

---

## 9. Voronoi — Control Territorial

**Que es:** Diagrama de Voronoi que divide el campo en zonas de influencia por jugador, mostrando quien controla cada area del terreno.

**Archivo:** `src/lib/yolo/voronoi.ts`

**Calculo:**
1. Triangulacion de Delaunay (d3-delaunay) sobre posiciones de jugadores
2. Voronoi tessellation genera poligonos por jugador
3. Area calculada con formula del Shoelace

**Metricas:**
| Metrica | Descripcion | Rango |
|---------|-------------|-------|
| areaM2 | Area del poligono Voronoi por jugador | 0-7140 m2 |
| Control % | Porcentaje del campo controlado por equipo | 0-100% |
| Space Run | Deteccion de movimiento hacia espacio libre (delta area > 5m2) | evento |

**Requisitos:** Minimo 3 jugadores detectados para generar diagrama significativo.

**Para que sirve:** Visualiza en tiempo real quien domina el espacio. Entrenadores pueden ver si un jugador esta bien posicionado o deja espacios. "Control territorial" es una metrica tactica avanzada antes solo disponible en ligas top.

---

## 10. Similarity Score — Comparacion con Profesionales

**Que es:** Compara el perfil de metricas de un jugador juvenil con 290+ jugadores profesionales (datos EA FC25) para encontrar su "clon" profesional.

**Archivo:** `src/services/real/similarityService.ts`

**Formula (Cosine Similarity):**
```
similitud(a, b) = dot(a, b) / (||a|| x ||b||) x 100
```

**Mapeo de metricas:**
| VSI Metrica | EA FC25 Metrica |
|-------------|-----------------|
| Speed | Pace (0-99) |
| Shooting | Shooting |
| Vision | Passing |
| Technique | Dribbling |
| Defending | Defending |
| Stamina | Physic |

**Modos:**

**Modo 1 — Age-Adjusted (recomendado):**
- "De-envejece" al profesional a la edad del juvenil usando curvas de desarrollo
- Estima como eran las metricas del pro a esa edad
- Mas justo para comparar un chico de 14 con Messi de 35

**Modo 2 — Classic (directo):**
- Compara vectores directamente
- Penaliza si gap de nivel > 10 puntos: `factor = max(0.5, 1 - (gap-10)/80)`

**Bonus de posicion:**
- Misma posicion: +5%
- Posicion no coincide: -15%

**Clasificacion de similitud:**
| Score | Etiqueta |
|-------|----------|
| 92+ | Clon (perfil casi identico) |
| 85-91 | Muy similar |
| 75-84 | Similar |
| 60-74 | Referencia |
| <60 | Inspiracion |

**Para que sirve:** Da un referente aspiracional al jugador y su familia ("tu perfil se parece al de Pedri a tu edad"). Tambien ayuda a scouts a proyectar el tipo de jugador que podria ser.

---

## 11. Proyecciones de Desarrollo

**Que es:** Estima el nivel futuro del jugador a diferentes edades usando curvas de desarrollo biologico-deportivo.

**Archivo:** `src/lib/kpiProjections.ts`, `src/data/developmentCurves.ts`

**Proyeccion de VSI:**
```
factor_actual = curvaDesarrollo(edadActual)
factor_18 = curvaDesarrollo(18)
factor_21 = curvaDesarrollo(21)
VSI_proyectado_18 = VSI_actual x (factor_18 / factor_actual)
VSI_proyectado_21 = VSI_actual x (factor_21 / factor_actual)
```

**Margenes de confianza:**
| Edad | Margen |
|------|--------|
| <= 13 | +-20% |
| 14-16 | +-15% |
| 17+ | +-10% |

**Curvas de desarrollo por metrica:**
| Metrica | Edad pico | Nota |
|---------|-----------|------|
| Pace | 25-26 | Velocidad pura, desarrollo temprano |
| Shooting | 27-28 | Mejora con practica, pico tardio |
| Passing | 28-30 | Pico mas tardio (experiencia) |
| Dribbling | 25-27 | Ventana critica 10-14 anos |
| Defending | 29-30 | El mas tardio (requiere experiencia) |
| Physic | 27-29 | Ventana de potencia 13-17 anos |

**Edad equivalente profesional:**
```
Busqueda inversa: "el nivel de este jugador = el de un pro tipico a edad X.Y"
```

**Para que sirve:** Permite tomar decisiones de largo plazo. Un jugador con VSI 55 a los 13 podria proyectar VSI 78 a los 18. Sin esta informacion, se descartaria.

---

## 12. Role Profile — Perfil Tactico

**Que es:** Genera un perfil tactico completo del jugador usando Claude AI, incluyendo posiciones ideales, arquetipos y proyecciones.

**Archivos:** `src/services/roleProfileService.ts`, `api/agents/role-profile.ts`

**Scores de capacidad (0-100):**
| Dimension | Que mide |
|-----------|----------|
| Tactical | Posicionamiento, lectura de juego, gestion |
| Technical | Control, tecnica, toma de decisiones |
| Physical | Velocidad, fuerza, resistencia |

**Proyecciones temporales:**
- Actual (ahora)
- +6 meses (ajuste 1-3% por PHV)
- +18 meses (ajuste 2.5x por PHV)
- +36 meses (estimacion con maduracion)

**Position Fit (11 posiciones):**
- Por posicion: probabilidad (0-1), score (0-100), confianza (0-1)

**20 Arquetipos:**
- recuperador, interceptor, organizador, distribuidor, finalizador, rematador, regateador, etc.
- Cada uno con score, confianza y estabilidad (emergente/en_desarrollo/estable/consolidado)

**Sample Tier (basado en minutos jugados):**
| Tier | Minutos | Confianza |
|------|---------|-----------|
| Bronze | <360 | 0.55 |
| Silver | 360-899 | 0.70 |
| Gold | 900-1799 | 0.85 |
| Platinum | >=1800 | 0.85+ |

**Para que sirve:** Responde "donde deberia jugar este chico?" y "que tipo de jugador sera?". Ayuda a entrenadores a posicionar jugadores y planificar rotaciones.

---

## 13. Metricas de Eventos de Partido

**Que es:** Registro de acciones individuales durante un partido con peso VAEP asociado.

**Archivo:** `src/services/real/matchEventsService.ts`

**Tipos de evento:**
| Tipo | Exito | Fallo |
|------|-------|-------|
| pass | Pase completo | Pase perdido |
| shot | Disparo al marco | Disparo fuera |
| dribble | Regate exitoso | Regate fallado |
| tackle | Tackle limpio | Falta / Superado |
| press | Recuperacion por presion | Superado en pressing |
| cross | Centro que llega | Centro cortado |
| header | Cabezazo efectivo | Cabezazo fallido |

**Zonas del campo:**
- `offensive`: Tercio ofensivo (mayor peso VAEP)
- `middle`: Centro del campo
- `defensive`: Tercio defensivo (menor peso VAEP)

**Fuentes:**
1. Manual: Botones rapidos en PlayerProfile ("LOG")
2. Automatico: Deteccion por Gemini video observation

**Para que sirve:** Alimenta directamente el calculo VAEP. Convierte observaciones subjetivas ("jugo bien") en datos cuantificables.

---

## 14. Pose Analysis — Analisis de Pose

**Que es:** Analisis de keypoints corporales (17 puntos COCO) para detectar acciones tacticas y fisicas.

**Archivo:** `src/lib/yolo/poseAnalyzer.ts`

**Detecciones:**

**Scan Events (Vision Periferica):**
- Detecta rotacion de cabeza (izquierda/derecha)
- Umbral: 28 grados de diferencia angular
- Duracion minima: 2 frames a >=0.3 confianza
- Output: trackId, timestamp, direccion, duracion

**Duel Detection:**
- Distancia entre jugadores < 1.8 metros
- Duracion minima: 3 frames
- Tipo: aereo (salto detectado via cadera-rodilla) vs terrestre

**Para que sirve:** Mide aspectos invisibles en estadisticas clasicas. "Scan events" mide la conciencia espacial de un jugador (cuanto mira a su alrededor antes de recibir). Es un predictor de elite.

---

## 15. Biomechanics Score

**Que es:** Score basado en analisis biomecanico de movimiento (actualmente stub, requiere datos de pose avanzada).

**Archivo:** `src/services/real/advancedMetricsService.ts`

**Formula:**
```
Si asimetria bilateral < 5%:   Score = 90
Si 5-10%:                      Score = 80
Si 10-20%:                     Score = 65
Si > 20%:                      Score = 50
```

**Riesgo de lesion:**
```
injuryRisk = min(1, (asimetria / 100) x 2)
```

**Estado:** Stub — requiere datos de Roboflow o pose estimation avanzada.

**Para que sirve:** Cuando este activo, detectara asimetrias de movimiento que predicen lesiones, permitiendo intervencion preventiva.

---

## 16. 6 Dimensiones del Reporte IA

**Que es:** Claude AI analiza video del jugador y genera scores en 6 dimensiones cualitativas.

**Archivo:** `api/agents/video-intelligence.ts`

| Dimension | Que evalua | Score |
|-----------|-----------|-------|
| Velocidad de Decision | Rapidez y calidad de decisiones con balon | 0-100 |
| Tecnica con Balon | Control, primer toque, precision | 0-100 |
| Inteligencia Tactica | Posicionamiento, lectura de juego, anticipacion | 0-100 |
| Capacidad Fisica | Potencia, velocidad, resistencia visible | 0-100 |
| Liderazgo y Presencia | Comunicacion, influencia en companeros | 0-100 |
| Eficacia Competitiva | Impacto real en el juego, decisiones que cambian el partido | 0-100 |

**Ajuste Video-Score:**
```
ajusteVSIVideoScore: +-10 puntos sobre el VSI existente
Basado en lo que Claude observa vs lo que dicen los numeros
```

**Para que sirve:** Complementa las metricas cuantitativas con analisis cualitativo de video. Un jugador puede tener stats promedio pero demostrar liderazgo excepcional en video.

---

## 17. Tabla Resumen

| Metrica/Indice | Rango | Tipo | Archivo Principal |
|----------------|-------|------|-------------------|
| VSI | 0-100 | Compuesto ponderado | metricsService.ts |
| RAE Bias Factor | 1.00-1.22 | Formula demografica | advancedMetricsService.ts |
| PHV Offset | -2 a +2 | Formula Mirwald | phv-calculator.ts |
| UBI | 0-1 | Indice combinado | advancedMetricsService.ts |
| TruthFilter Delta | -10 a +10 | Ajuste case-based | advancedMetricsService.ts |
| VAEP Total | -inf a +inf | Probabilidad de gol | advancedMetricsService.ts |
| VAEP/90 | Normalizado | Por 90 minutos | advancedMetricsService.ts |
| Similarity Score | 0-100% | Coseno vectorial | similarityService.ts |
| Play Style | 5 categorias | Reglas + Z-score | advancedMetricsService.ts |
| Specialization Index | 0-1 | Varianza de Z-scores | advancedMetricsService.ts |
| Tracking (distancia) | 0-15000 m | Suma frame-to-frame | yolo/types.ts |
| Tracking (velocidad) | 0-12 m/s | Instantanea por frame | yolo/types.ts |
| Voronoi Area | 0-7140 m2 | Delaunay/Shoelace | voronoi.ts |
| Field Coverage | 0-100% | Grid 5x5m visitado | advancedMetricsService.ts |
| Role Profile Score | 0-100 | IA (Claude) | roleProfileService.ts |
| Biomechanics Score | 0-100 | Asimetria bilateral | advancedMetricsService.ts |
| 6D Video Scores | 0-100 cada | IA (Claude vision) | video-intelligence.ts |
| VSI Proyectado | 0-120 | Curvas desarrollo | kpiProjections.ts |
| Percentil | 0-100% | Rank en cohorte | metricsService.ts |

---

> **Nota:** Todas las metricas se almacenan con precision completa internamente y se redondean para display (1-2 decimales). El sistema usa calculos deterministicos para todas las metricas excepto Role Profile, PHV y 6 Dimensiones, que usan Claude API.
