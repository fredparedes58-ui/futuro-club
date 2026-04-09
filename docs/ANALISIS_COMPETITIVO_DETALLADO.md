# VITAS · Analisis Competitivo Detallado

> Comparacion metrica-por-metrica de VITAS contra cada competidor.
> Donde esta VITAS, que le falta, y que hacer para mejorar.
> Ultima actualizacion: Abril 2026

---

## Indice

1. [Posicion General de VITAS](#1-posicion-general-de-vitas)
2. [Scorecard Competitivo](#2-scorecard-competitivo)
3. [Comparacion por Categoria de Metricas](#3-comparacion-por-categoria-de-metricas)
4. [Analisis 1v1 contra cada Competidor](#4-analisis-1v1-contra-cada-competidor)
5. [Donde VITAS esta por Debajo — Plan de Accion](#5-donde-vitas-esta-por-debajo--plan-de-accion)
6. [Donde VITAS esta Bien — Como Mejorar](#6-donde-vitas-esta-bien--como-mejorar)
7. [Donde VITAS es Unico — Como Defender](#7-donde-vitas-es-unico--como-defender)
8. [Roadmap de Mejora Priorizado](#8-roadmap-de-mejora-priorizado)
9. [Conclusion](#9-conclusion)

---

## 1. Posicion General de VITAS

### Resumen de Posicion por Dimension

| Dimension | Posicion de VITAS | Nivel |
|-----------|-------------------|-------|
| Metricas fisicas (tracking) | 5to de 7 | Bajo — necesita mejorar |
| Metricas tecnicas (ball data) | 6to de 8 | Bajo — limitado por falta de ball tracking |
| Metricas tacticas | 4to de 6 | Medio — base solida, falta profundidad |
| Maduracion biologica | **1ro de 16** | Lider absoluto — nadie compite |
| Indices compuestos (VSI, UBI) | **2do de 5** | Fuerte — solo SciSports es comparable |
| Proyecciones de desarrollo | **1ro de 3** | Lider — unico con ajuste PHV |
| Video IA | **2do de 5** | Fuerte — Claude+Gemini es potente |
| Accesibilidad/Precio | **1ro de 16** | Lider — PWA gratis sin hardware |
| Base de datos de scouting | 5to de 6 | Medio-Bajo — 290 pros vs 600K+ de Wyscout |
| Metricas de equipo | 5to de 7 | Bajo — mayormente cualitativo |

### Veredicto General
VITAS esta **bien posicionada como plataforma juvenil integral** pero tiene gaps importantes en metricas fisicas de precision, ball tracking, y profundidad tactica algortimica. Su ventaja competitiva (PHV + TruthFilter) es inigualable y debe ser la base de toda la estrategia.

---

## 2. Scorecard Competitivo

### Puntuacion 1-10 por Capacidad

| Capacidad | VITAS | Wyscout | StatsBomb | InStat | Metrica | SciSports | Catapult | STATSports | PlayerMaker | SkillCorner | AiSCOUT | Veo |
|-----------|-------|---------|-----------|--------|---------|-----------|----------|------------|-------------|-------------|---------|-----|
| **Fisico (GPS/Track)** | 5 | 1 | 1 | 1 | 6 | 1 | **10** | **10** | 7 | 7 | 4 | 2 |
| **Tecnico (ball data)** | 3 | 7 | **9** | 7 | 4 | 6 | 0 | 0 | **8** | 3 | 5 | 2 |
| **Tactico** | 5 | 6 | **8** | 5 | 7 | 5 | 0 | 0 | 0 | **8** | 2 | 3 |
| **Maduracion/PHV** | **10** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 2 | 0 |
| **Indices compuestos** | **8** | 5 | 7 | 6 | 5 | **9** | 3 | 3 | 2 | 5 | 4 | 1 |
| **Proyecciones** | **9** | 2 | 2 | 2 | 2 | **8** | 1 | 1 | 1 | 2 | 3 | 0 |
| **Video IA** | **8** | 4 | 3 | 4 | **7** | 2 | 0 | 0 | 0 | **8** | 6 | 5 |
| **Youth Focus** | **9** | 2 | 2 | 3 | 4 | 3 | 5 | 5 | 6 | 1 | **8** | 5 |
| **Accesibilidad** | **9** | 5 | 1 | 2 | **8** | 4 | 4 | 6 | 5 | 1 | **9** | 4 |
| **Scouting DB** | 4 | **10** | **9** | 8 | 2 | 7 | 0 | 0 | 0 | 3 | 2 | 0 |
| **TOTAL /100** | **70** | 42 | 42 | 38 | 45 | 45 | 23 | 25 | 30 | 38 | 45 | 22 |

### Interpretacion
- VITAS lidera el total con 70/100 gracias a su combinacion unica
- Ningun competidor supera 50/100 cuando se mide todo
- Los especialistas (Catapult, StatsBomb) dominan su nicho pero fallan fuera de el
- AiSCOUT y Metrica son los competidores mas cercanos en filosofia (45 cada uno)

---

## 3. Comparacion por Categoria de Metricas

### A. METRICAS FISICAS — VITAS vs Competidores GPS

| Metrica | VITAS | Catapult | STATSports | PlayerMaker | SkillCorner | Metrica |
|---------|-------|---------|------------|-------------|-------------|---------|
| Velocidad max | Si (YOLO) | Si (GPS 10Hz) | Si (GPS) | Si (IMU) | Si (AI video) | Si (AI video) |
| Distancia total | Si (YOLO) | Si (GPS) | Si (GPS) | Si (IMU) | Si (AI video) | Si (AI video) |
| Sprints (count) | Si (>5.83 m/s) | Si (configurable) | Si (configurable) | Si | Si | Si |
| Aceleracion | Si (EMA) | Si (3 ejes, 100Hz) | Si (3 ejes) | Si (6 ejes, 1000Hz) | No | No |
| PlayerLoad | **No** | **Si (propietario)** | No | No | No | No |
| HMLD | **No** | No | **Si (propietario)** | No | No | No |
| DSL (Dynamic Stress) | **No** | No | **Si (propietario)** | No | No | No |
| Metabolic Power | **No** | **Si** | Si | No | No | No |
| IMA (Inertial) | **No** | **Si** | No | No | No | No |
| Heart Rate zones | **No** | Si (ECG) | Si (HR strap) | No | No | No |
| Step Balance | **No** | No | **Si** | No | No | No |
| Zonas de intensidad | Si (4 zonas) | Si (6+ zonas) | Si (6 zonas) | Si | No | No |
| Field Coverage | Si (5x5m grid) | No | No | No | No | No |
| Voronoi area | **Si (unico)** | No | No | No | No | Si |
| Toques de balon | **No** | No | No | **Si (1000Hz)** | No | No |
| Kick velocity | **No** | No | No | **Si** | No | No |
| Symmetry Index | **No** | No | Si (Step Balance) | **Si** | No | No |

**Diagnostico VITAS:** Las metricas fisicas de VITAS son funcionales pero basicas comparadas con hardware dedicado. YOLO tracking tiene precision de +-2-5% vs GPS que tiene +-0.3%. La ventaja de VITAS es que no necesita hardware.

**Que hacer:**
1. **Prioridad Alta:** Agregar Metabolic Power estimado desde aceleracion/desaceleracion del tracking YOLO
2. **Prioridad Alta:** Agregar Step Balance / asimetria de movimiento desde pose keypoints (COCO-17 ya lo detecta)
3. **Prioridad Media:** Crear un "VITAS Load" equivalente a PlayerLoad basado en aceleracion 2D del centroid tracking
4. **Prioridad Baja:** Integrar con Catapult/STATSports via API para importar datos GPS reales cuando disponibles

---

### B. METRICAS TECNICAS — VITAS vs Data Providers

| Metrica | VITAS | StatsBomb | Wyscout | InStat | Opta | PlayerMaker | AiSCOUT |
|---------|-------|-----------|---------|--------|------|-------------|---------|
| xG (Expected Goals) | **No** | **Si (el mejor)** | Si | No | Si | No | No |
| xA (Expected Assists) | **No** | Si | Si | No | Si | No | No |
| OBV (On-Ball Value) | **No** | **Si (propietario)** | No | No | No | No | No |
| xT (Expected Threat) | Parcial (xt_pass) | No | No | No | **Si (2025)** | No | No |
| VAEP | **Si (simplificado)** | No (usa OBV) | No | No | No | No | No |
| Pases completados | Manual/Gemini | Si (por tipo) | Si | Si | Si | Si | Si |
| Progressive passes | **No** | Si | **Si** | No | Si | No | No |
| Smart passes | **No** | No | **Si (propietario)** | No | No | No | No |
| Deep completions | **No** | No | **Si** | No | No | No | No |
| Regates exitosos | Manual/Gemini | Si | Si | Si | Si | Si (sensor) | Si (drill) |
| Precision disparo | Manual/Gemini | Si | Si | Si | Si | **Si (km/h)** | Si (drill) |
| First Touch quality | **No** | No | No | No | No | **Si (1000Hz)** | No |
| Ball Retention | Parcial | Si | No | No | No | Si | No |

**Diagnostico VITAS:** Esta es la mayor debilidad. VITAS no puede calcular xG, xA, ni metricas de pase avanzadas porque no tiene ball tracking. Depende de input manual o Gemini (que es impreciso para conteos exactos).

**Que hacer:**
1. **Prioridad Critica:** Implementar modelo xG simplificado usando ubicacion del disparo (zona) + tipo de asistencia. No necesita ball tracking — solo los eventos de disparo logueados
2. **Prioridad Alta:** Agregar ball tracking basico via YOLO (el modelo ya detecta balon como clase). Calcular posesion algoritmica
3. **Prioridad Alta:** Calcular Progressive Passes algoritmicamente si se tiene ball tracking (delta Y > 10m hacia porteria rival)
4. **Prioridad Media:** Entrenar VAEP con modelo xG real en vez de pesos heuristicos
5. **Prioridad Baja:** Integrar datos de StatsBomb/Opta open data para benchmarking de xG

---

### C. METRICAS TACTICAS — VITAS vs Analisis Tactico

| Metrica | VITAS | StatsBomb | Metrica | SkillCorner | Opta | Nacsport |
|---------|-------|-----------|---------|-------------|------|----------|
| Deteccion formacion | Gemini (cualitativo) | Si (from events) | Si (from tracking) | Si (from tracking) | Si | Manual |
| Pitch Control | **No** | No | **Si (propietario)** | No | No | No |
| EPV (Expected Possession) | **No** | No | **Si (propietario)** | No | No | No |
| PPDA (pressing) | **No** | Si | No | Si | Si | Manual |
| Pressing intensity | Gemini (1-10) | Si (contrapresion) | Si (from tracking) | **Si (4 tipos)** | Si | Manual |
| Off-ball runs | **No** | No | No | **Si (10 tipos)** | No | No |
| Defensive line height | Gemini (cualitativo) | Si | Si (centroid) | Si | Si | Manual |
| Transition speed | Gemini (cualitativo) | Si (from events) | Si (from tracking) | Si | Si | Manual |
| Compactness | Gemini (1-10) | No | Si (variance) | Si | No | No |
| Voronoi control | **Si (D3 Delaunay)** | No | No | No | No | No |
| Heatmaps | **Si (YOLO)** | Si | Si | Si | Si | Manual |
| Scan events | **Si (pose analysis)** | No | No | No | No | No |
| Duel detection | **Si (proximity)** | Si (from events) | No | No | Si | Manual |

**Diagnostico VITAS:** Tiene una base solida (Voronoi, scans, duels, heatmaps) pero las metricas son mayormente cualitativas via Gemini. Falta profundidad algoritmica en pressing y off-ball.

**Que hacer:**
1. **Prioridad Alta:** Calcular PPDA algoritmicamente — contar pases del equipo rival entre acciones defensivas propias (si se tiene ball tracking + team tracking)
2. **Prioridad Alta:** Calcular Defensive Line Height como centroide Y de los 4 defensores mas retrasados
3. **Prioridad Media:** Implementar Pitch Control simplificado usando posiciones Voronoi + velocidad de jugadores
4. **Prioridad Media:** Detectar Off-Ball Runs midiendo velocidad + direccion de jugadores sin balon hacia zonas de alto xT
5. **Prioridad Baja:** Calcular Compactness como desviacion estandar de posiciones del equipo

---

### D. MADURACION BIOLOGICA — VITAS vs Todos

| Metrica | VITAS | AiSCOUT | PlayerMaker | Hylyght* | Kitman Labs* | Resto (12 plataformas) |
|---------|-------|---------|-------------|----------|-------------|----------------------|
| PHV (Peak Height Velocity) | **Si (Mirwald)** | No | No | **Si (%PAH)** | **Si** | No |
| RAE (Relative Age Effect) | **Si (cuartiles + correccion)** | No | No | No | No | No |
| UBI (Unified Bias Index) | **Si (unico)** | No | No | No | No | No |
| TruthFilter (ajuste VSI) | **Si (unico)** | No | No | No | No | No |
| Benchmarks por edad | **Si (curvas 8-35)** | **Si** | **Si** | Si | Si | No |
| Ventana de desarrollo | **Si** | No | No | Si | Si | No |
| Ajuste de metricas por PHV | **Si (0.85-1.15)** | No | No | No | Parcial | No |
| Proyeccion ajustada por biologia | **Si (unico)** | No | No | No | No | No |

*Hylyght y Kitman Labs son plataformas de salud/maduracion, no de analisis futbolistico.

**Diagnostico VITAS:** LIDER ABSOLUTO. Ningun competidor de analisis futbolistico ofrece lo que VITAS tiene en maduracion. Hylyght y Kitman Labs miden PHV pero no lo conectan con metricas de rendimiento ni ajustan evaluaciones.

**Que hacer para defender esta posicion:**
1. **Prioridad Critica:** Publicar un whitepaper tecnico explicando TruthFilter + UBI con datos anonimizados
2. **Prioridad Alta:** Agregar metodo %PAH (Predicted Adult Height) como alternativa a Mirwald para mayor precision
3. **Prioridad Alta:** Integrar con Hylyght/Kitman Labs para importar datos de maduracion medidos
4. **Prioridad Media:** Crear un dataset publico de correlacion PHV-rendimiento para establecer autoridad cientifica
5. **Prioridad Baja:** Certificacion FIFA (FIFA ha publicado sobre RAE — aliarse con el programa)

---

### E. INDICES COMPUESTOS — VITAS vs Ratings

| Indice | VITAS | SciSports | InStat | Wyscout | SkillCorner |
|--------|-------|-----------|--------|---------|-------------|
| Score compuesto unico | **VSI (0-100)** | **SciSkill (Elo)** | **InStat Index** | Wyscout Index | No |
| Componentes | 6 metricas ponderadas | Ofensivo + Defensivo | 12-14 factores/posicion | No publicado | No |
| Ajuste por posicion | Pesos fijos | Si (ponderacion) | **Si (per-posicion)** | No publicado | No |
| Ajuste por nivel de rival | **No** | **Si (expectation vs result)** | **Si** | No | No |
| Ajuste por maduracion | **Si (TruthFilter)** | No | No | No | No |
| Transparencia de formula | **Total (open)** | Parcial (paper publicado) | Baja (propietario) | Baja | N/A |
| Score de confianza | **Si (0-1 per metrica)** | No publicado | No | No | No |
| Sample Tier | **Si (Bronze-Platinum)** | No | Req minutos minimos | No | No |

**Diagnostico VITAS:** El VSI es competitivo pero necesita mejoras. SciSports tiene un modelo superior (Bayesiano, basado en resultados reales). InStat ajusta por posicion y nivel de rival de forma mas sofisticada.

**Que hacer:**
1. **Prioridad Alta:** Agregar pesos VSI dinamicos por posicion (un portero no deberia pesar 22% en tecnica igual que un mediocampista)
2. **Prioridad Alta:** Agregar factor de nivel de rival/liga — un VSI 70 en liga regional no es igual que en cantera profesional
3. **Prioridad Media:** Evolucionar VSI a un modelo Bayesiano que se actualice partido a partido (como SciSkill)
4. **Prioridad Media:** Agregar componente de impacto en resultado del equipo (como InStat: "contribucion al exito del equipo")
5. **Ya implementado (ventaja):** Score de confianza y Sample Tier — ningun competidor lo ofrece

---

### F. PROYECCIONES DE DESARROLLO — VITAS vs Predictores

| Capacidad | VITAS | SciSports | AiSCOUT | Resto |
|-----------|-------|-----------|---------|-------|
| Proyeccion temporal | **Si (6m, 18m, 3a)** | **Si (5-7 anos)** | No | No |
| Ajuste por PHV | **Si (unico)** | No | No | No |
| Curvas por posicion | **Si (8 posiciones)** | No publicado | No | No |
| Curvas por metrica | **Si (6 metricas x 28 edades)** | No publicado | No | No |
| Margen de confianza | **Si (+-10-20%)** | No publicado | No | No |
| Edad equivalente pro | **Si** | No | No | No |
| Escenarios (opt/real/pess) | **Si (3 escenarios)** | No | No | No |

**Diagnostico VITAS:** LIDER. SciSports predice desarrollo pero no publica como lo hace y no ajusta por biologia. VITAS tiene las curvas mas transparentes y cientificamente fundamentadas.

**Que hacer:**
1. **Prioridad Alta:** Extender horizonte de proyeccion a 5-7 anos (como SciSports) con margenes mas amplios
2. **Prioridad Alta:** Agregar "Transfer Value Estimation" basado en VSI proyectado + posicion + mercado
3. **Prioridad Media:** Validar curvas de desarrollo con datos reales de jugadores que pasaron por el sistema
4. **Prioridad Baja:** Crear modelo ML que aprenda de las proyecciones pasadas vs resultados reales

---

### G. VIDEO IA — VITAS vs AI-Powered Analysis

| Capacidad | VITAS | SkillCorner | Metrica | AiSCOUT | Veo |
|-----------|-------|-------------|---------|---------|-----|
| Tracking automatico 22 jugadores | **No** | **Si (broadcast)** | **Si (any video)** | No | Parcial |
| Analisis de video por LLM | **Si (Claude + Gemini)** | No | No | No | **Si (Coach Assist)** |
| Reporte narrativo completo | **Si (6 dimensiones)** | No | No | No | Parcial |
| Plan de desarrollo personalizado | **Si** | No | No | No | No |
| Comparacion con pros | **Si (cosine similarity)** | No | No | No | No |
| Deteccion de eventos | Gemini (semi-auto) | Si (auto) | Si (Smart Tagging) | Si (75 drills) | Parcial |
| Biomechanics 3D | **No** | No | No | **Si (1000 pts)** | No |
| Pose estimation | **Si (COCO-17)** | No publicado | No publicado | **Si (markerless 3D)** | No |

**Diagnostico VITAS:** Fuerte en analisis narrativo (Claude) pero debil en tracking automatico completo. SkillCorner y Metrica tienen tracking superior de 22 jugadores.

**Que hacer:**
1. **Prioridad Critica:** Mejorar el tracking YOLO para sostener 22 jugadores simultaneos (actualmente funcional pero no optimizado para campo completo)
2. **Prioridad Alta:** Agregar Smart Tagging automatico: detectar contraataques, build-ups, transiciones desde patrones de movimiento
3. **Prioridad Media:** Agregar biomechanics score usando keypoints COCO-17 existentes (angulos articulares, asimetria, zancada)
4. **Prioridad Baja:** Explorar reconstruccion 3D desde 2D (como AiSCOUT) para evaluacion biomecanica mas precisa

---

## 4. Analisis 1v1 contra cada Competidor

### VITAS vs Wyscout
| Dimension | Ganador | Por que |
|-----------|---------|--------|
| Base de datos | **Wyscout** | 600K perfiles vs 290 |
| Video library | **Wyscout** | Miles de partidos completos |
| Metricas avanzadas | **Wyscout** | xG, PPDA, Smart Passes |
| Enfoque juvenil | **VITAS** | PHV, TruthFilter, desarrollo |
| Precio | **VITAS** | $0-19 vs $325+ |
| IA generativa | **VITAS** | Claude reports vs ninguno |
| **Veredicto** | **No compiten directamente.** Wyscout es para ver jugadores ajenos. VITAS es para analizar los propios. |

### VITAS vs StatsBomb
| Dimension | Ganador | Por que |
|-----------|---------|--------|
| Densidad de datos | **StatsBomb** | 3,400 eventos/partido |
| xG/OBV precision | **StatsBomb** | 360 freeze frames |
| VAEP | **Empate** | SB tiene OBV (superior), VITAS tiene VAEP simplificado |
| Maduracion | **VITAS** | StatsBomb no lo tiene |
| Accesibilidad | **VITAS** | Free vs decenas de miles |
| **Veredicto** | StatsBomb es el gold standard de datos. VITAS lo complementa con la capa de maduracion que SB no tiene. |

### VITAS vs Metrica Sports
| Dimension | Ganador | Por que |
|-----------|---------|--------|
| Tracking AI | **Metrica** | GameCloud > YOLO browser |
| Pitch Control / EPV | **Metrica** | VITAS no lo tiene |
| Smart Tagging | **Metrica** | Automatico vs Gemini |
| Maduracion | **VITAS** | Metrica no lo tiene |
| Indices compuestos | **VITAS** | VSI+UBI vs nada |
| IA narrativa | **VITAS** | Claude reports vs nada |
| Precio | **Empate** | Ambos accesibles |
| **Veredicto** | **Competidor mas peligroso.** Metrica podria agregar PHV y cerrar el gap. VITAS debe moverse rapido. |

### VITAS vs SciSports
| Dimension | Ganador | Por que |
|-----------|---------|--------|
| Modelo predictivo | **SciSports** | Bayesiano > curvas estaticas |
| Rating compuesto | **Empate** | SciSkill vs VSI — filosofias distintas |
| VAEP | **SciSports** | Co-desarrollador del framework |
| Maduracion | **VITAS** | SciSports no ajusta por PHV |
| Arquetipos | **VITAS** | 20 arquetipos vs roles genericos |
| Confianza/transparencia | **VITAS** | Score per metrica publicado |
| **Veredicto** | SciSports tiene mejor ciencia de datos. VITAS tiene mejor ciencia de maduracion. Juntos serian imbatibles. |

### VITAS vs Catapult/STATSports
| Dimension | Ganador | Por que |
|-----------|---------|--------|
| Precision GPS | **Catapult/STATSports** | Hardware dedicado 10Hz-100Hz |
| Metricas propietarias | **Catapult/STATSports** | PlayerLoad, HMLD, DSL |
| Metabolic Power | **Catapult** | Modelo probado |
| Sin hardware | **VITAS** | 100% video-based |
| Analisis tactico | **VITAS** | GPS no tiene |
| Maduracion | **VITAS** | GPS no lo mide |
| **Veredicto** | **Complementarios.** VITAS deberia integrar datos de Catapult/STATSports cuando disponibles. |

### VITAS vs AiSCOUT
| Dimension | Ganador | Por que |
|-----------|---------|--------|
| Biomechanics | **AiSCOUT** | 1000 puntos 3D vs 17 keypoints |
| Drills evaluados | **AiSCOUT** | 75 drills estructurados |
| Analisis de partido real | **VITAS** | AiSCOUT solo evalua drills |
| Maduracion | **VITAS** | AiSCOUT no corrige por PHV |
| Plan de desarrollo | **VITAS** | Personalizado por IA |
| Modelo de negocio | **AiSCOUT** | Gratis para jugadores, clubes pagan |
| **Veredicto** | **Competidor en youth.** Pero AiSCOUT evalua ejercicios, VITAS evalua partidos. Diferentes casos de uso. |

### VITAS vs Veo
| Dimension | Ganador | Por que |
|-----------|---------|--------|
| Captura de video | **Veo** | Camara autonoma 180deg |
| Analisis de video | **VITAS** | Claude + Gemini >> Coach Assist |
| Metricas avanzadas | **VITAS** | VSI, VAEP, PHV vs posesion basica |
| Hardware necesario | **Veo** (requiere camara) | VITAS no requiere |
| **Veredicto** | **Perfectamente complementarios.** Veo graba, VITAS analiza. Integracion ideal. |

---

## 5. Donde VITAS esta por Debajo — Plan de Accion

### 5.1 Ball Tracking (CRITICO)
**Problema:** Sin ball tracking, VITAS no puede calcular xG, xA, posesion, progressive passes, ni VAEP basado en probabilidad.

**Competidores que lo tienen:** StatsBomb, Wyscout, Opta, Metrica, SkillCorner, Veo

**Plan de accion:**
| Paso | Accion | Esfuerzo | Impacto |
|------|--------|----------|---------|
| 1 | Agregar clase "ball" al modelo YOLO (ya la detecta) | 1 semana | Alto |
| 2 | Tracker especifico para balon (Kalman separado) | 2 semanas | Alto |
| 3 | Calcular posesion algoritmica (proximidad balon-jugador) | 1 semana | Alto |
| 4 | Detectar eventos automaticos: pases, disparos, centros | 3 semanas | Muy Alto |
| 5 | Implementar xG basico por zona de disparo | 1 semana | Alto |
| 6 | Migrar VAEP de heuristico a modelo basado en xG | 2 semanas | Alto |

**Resultado:** VITAS pasaria de 3/10 a 7/10 en metricas tecnicas.

### 5.2 Precision de Tracking Fisico
**Problema:** YOLO tracking tiene +-2-5% de error vs +-0.3% de GPS dedicado.

**Competidores superiores:** Catapult (10), STATSports (10), SkillCorner (7)

**Plan de accion:**
| Paso | Accion | Esfuerzo | Impacto |
|------|--------|----------|---------|
| 1 | Crear "VITAS Load" (equivalente PlayerLoad) desde aceleracion 2D | 1 semana | Medio |
| 2 | Estimar Metabolic Power desde velocidad + aceleracion | 1 semana | Medio |
| 3 | Agregar asimetria de movimiento desde pose keypoints | 2 semanas | Medio |
| 4 | API de importacion de datos GPS (Catapult CSV, STATSports) | 2 semanas | Alto |
| 5 | Fusion de datos: YOLO tracking + GPS importado | 2 semanas | Alto |

**Resultado:** VITAS pasaria de 5/10 a 7/10 en metricas fisicas.

### 5.3 Metricas Tacticas Algoritmicas
**Problema:** La mayoria de metricas tacticas dependen de Gemini (cualitativo, no reproducible).

**Competidores superiores:** SkillCorner (8), StatsBomb (8), Metrica (7)

**Plan de accion:**
| Paso | Accion | Esfuerzo | Impacto |
|------|--------|----------|---------|
| 1 | Calcular PPDA si hay ball tracking + team tracking | 1 semana | Alto |
| 2 | Calcular Defensive Line Height (centroide Y de defensores) | 3 dias | Medio |
| 3 | Calcular Compactness (std deviation de posiciones) | 3 dias | Medio |
| 4 | Implementar Pitch Control simplificado (Voronoi + velocidad) | 2 semanas | Alto |
| 5 | Detectar Off-Ball Runs (velocidad + direccion hacia zonas libres) | 2 semanas | Alto |

**Resultado:** VITAS pasaria de 5/10 a 7/10 en metricas tacticas.

### 5.4 Base de Datos de Scouting
**Problema:** 290 jugadores EA FC25 vs 600K+ de Wyscout.

**Plan de accion:**
| Paso | Accion | Esfuerzo | Impacto |
|------|--------|----------|---------|
| 1 | Expandir a 1000+ pros con datos de FBref (gratis) | 1 semana | Medio |
| 2 | Agregar jugadores sub-21 de ligas juveniles | 2 semanas | Alto |
| 3 | Crear scraper para actualizar metricas automaticamente | 2 semanas | Medio |
| 4 | Integrar StatsBomb open data (gratis, 200+ partidos) | 1 semana | Medio |

---

## 6. Donde VITAS esta Bien — Como Mejorar

### 6.1 Video IA (actualmente 8/10)
**Para llegar a 10/10:**
- Agregar Smart Tagging automatico (contraataques, build-ups, transiciones)
- Reducir latencia del pipeline (actualmente 30-60s por analisis)
- Agregar analisis comparativo entre reportes del mismo jugador (evolucion en video)
- Permitir upload de video de 90 minutos completo (actualmente optimizado para clips)

### 6.2 Indices Compuestos (actualmente 8/10)
**Para llegar a 10/10:**
- Pesos VSI dinamicos por posicion
- Factor de nivel de rival/liga
- VSI Bayesiano que se actualice partido a partido
- Validacion externa con datos de transferencias reales
- Publicar paper academico sobre VSI para credibilidad

### 6.3 Youth Focus (actualmente 9/10)
**Para llegar a 10/10:**
- Agregar evaluacion de drills estructurados (como AiSCOUT)
- Crear programa de certificacion para academias ("VITAS Certified Academy")
- Dashboard para padres (version simplificada del perfil del jugador)
- Benchmark por liga/region (no solo interno)

### 6.4 Accesibilidad (actualmente 9/10)
**Para llegar a 10/10:**
- App nativa (React Native) para mejor experiencia mobile
- Modo offline completo para zonas sin internet constante
- Soporte multiidioma (portugues, ingles, frances)
- Version lite para smartphones de gama baja

---

## 7. Donde VITAS es Unico — Como Defender

### 7.1 PHV + TruthFilter (Monopolio actual)

**Riesgo:** Metrica Sports o SciSports podrian implementar PHV en 6-12 meses si lo ven como oportunidad.

**Defensa:**
| Accion | Plazo | Efecto |
|--------|-------|--------|
| Publicar whitepaper cientifico | 2 meses | Establece autoridad academica |
| Patentar TruthFilter como metodo | 3 meses | Proteccion legal |
| Alianza con universidad de deportes | 1 mes | Validacion cientifica |
| Dataset publico PHV-rendimiento | 3 meses | Comunidad dependiente de VITAS |
| Presentacion en congreso FIFA/UEFA | 6 meses | Reconocimiento institucional |
| Agregar %PAH como segundo metodo | 1 mes | Mas precision, mas profundidad |

### 7.2 UBI (Sin competencia)
Ningun competidor tiene un indice que combine RAE + PHV. Este es el moat mas defensible.

**Para profundizar:**
- Agregar componente de "nivel de competicion" al UBI
- Agregar componente de "lateralidad" (zurdo subestimado en ciertos sistemas)
- Publicar UBI como open-source para que investigadores lo citen

### 7.3 Voronoi Territorial (Diferenciador visual)
Metrica tiene algo similar pero no lo llama Voronoi ni lo presenta como control territorial individual.

**Para profundizar:**
- Agregar metricas derivadas: "espacio creado por minuto", "reaccion a perdida de espacio"
- Crear "Space Control Index" como metrica exportable
- Comparar Voronoi de jugador vs posicion ideal

### 7.4 Transparencia (Score de confianza + Sample Tier)
Ningun competidor expone confianza per metrica ni calidad de muestra.

**Para profundizar:**
- Publicar metodologia de confianza
- Crear "Data Quality Badge" visible en cada reporte
- Ofrecer API de scores con confianza incluida

---

## 8. Roadmap de Mejora Priorizado

### Fase 1: Cerrar Gaps Criticos (0-3 meses)

| # | Accion | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1 | Ball tracking con YOLO (clase balon) | Desbloquea xG, posesion, pases | 3 semanas |
| 2 | xG basico por zona de disparo | Metrica fundamental faltante | 1 semana |
| 3 | Posesion algoritmica | Metrica basica esperada | 1 semana |
| 4 | VAEP basado en xG (no heuristico) | Credibilidad analitica | 2 semanas |
| 5 | Pesos VSI dinamicos por posicion | VSI mas justo | 1 semana |
| 6 | Whitepaper PHV + TruthFilter | Proteger ventaja | 4 semanas |

### Fase 2: Mejorar Posicion Competitiva (3-6 meses)

| # | Accion | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 7 | VITAS Load (equivalente PlayerLoad) | Compite con Catapult | 1 semana |
| 8 | Metabolic Power estimado | Compite con STATSports | 1 semana |
| 9 | Smart Tagging automatico | Compite con Metrica | 3 semanas |
| 10 | PPDA + Defensive Line Height | Metricas tacticas basicas | 1 semana |
| 11 | Factor nivel de rival en VSI | VSI mas creible | 2 semanas |
| 12 | Expandir DB a 1000+ pros | Mejor similarity | 1 semana |
| 13 | Importacion GPS (Catapult/STATSports CSV) | Interoperabilidad | 2 semanas |

### Fase 3: Liderazgo (6-12 meses)

| # | Accion | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 14 | Pitch Control simplificado | Metrica elite | 3 semanas |
| 15 | Off-Ball Run detection | Tactica avanzada | 3 semanas |
| 16 | VSI Bayesiano (actualizable por partido) | Modelo superior | 6 semanas |
| 17 | Transfer Value Estimation | Monetizable | 4 semanas |
| 18 | Integracion Veo (importar video directo) | Partnership | 4 semanas |
| 19 | Biomechanics score desde COCO-17 | Compite con AiSCOUT | 4 semanas |
| 20 | Alianza FIFA/UEFA sobre RAE | Institucional | Continuo |

### Impacto Proyectado del Roadmap

| Fase | Scorecard VITAS | De | A |
|------|-----------------|-----|-----|
| Actual | Total | **70/100** | — |
| Post Fase 1 | Tecnico 3→6, Indice 8→9 | 70 | **78** |
| Post Fase 2 | Fisico 5→7, Tactico 5→7, DB 4→6 | 78 | **86** |
| Post Fase 3 | Tactico 7→8, Tecnico 6→8, Video 8→9 | 86 | **92** |

---

## 9. Conclusion

### Donde esta VITAS hoy
VITAS es la **plataforma mas completa para scouting juvenil** del mercado (70/100 general). Su ventaja en maduracion biologica es un monopolio que ningun competidor puede replicar rapidamente. Pero tiene gaps importantes en ball tracking y precision fisica que la limitan frente a especialistas.

### Que debe hacer
1. **Proteger lo unico:** Publicar, patentar, y crear comunidad alrededor de PHV + TruthFilter + UBI
2. **Cerrar lo critico:** Ball tracking y xG son metricas que el mercado ESPERA. Sin ellas, VITAS parece incompleta
3. **No competir donde pierde:** No intentar replicar Catapult (hardware) ni Wyscout (600K DB). Integrar con ellos
4. **Moverse rapido:** Metrica Sports es el competidor mas peligroso. Si agrega PHV, VITAS pierde su moat

### El estado ideal
Con las 3 fases del roadmap completadas, VITAS seria una plataforma 92/100 que:
- Tiene las metricas fundamentales (xG, posesion, VAEP)
- Mantiene el monopolio en maduracion biologica
- Ofrece tracking fisico competitivo sin hardware
- Genera reportes de IA superiores a cualquier competidor
- Es accesible para cualquier academia del mundo

**VITAS no necesita ser la mejor en todo. Necesita ser la unica que lo tiene TODO para juventud.**

---

> Fuentes: StatsBomb, Wyscout, Opta/Stats Perform, Metrica Sports, SciSports, Catapult, STATSports, PlayerMaker, SkillCorner, AiSCOUT, Veo, Nacsport, Hudl, Hylyght, Kitman Labs, KU Leuven (VAEP), FIFA RAE Research, Fortune BI, Markets & Markets.
