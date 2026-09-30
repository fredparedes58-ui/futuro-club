# Pendientes de métricas — bloqueada ≠ resuelta

> Tracker canónico que exige la **invariante #8** de `CLAUDE.md` ("Bloqueada ≠ resuelta"):
> una métrica bloqueada con `gate_reason` honesto es un estado de entrega aceptable, pero
> **no** es lo mismo que resuelta. Este fichero distingue las dos y se mantiene al día.
>
> **Última actualización:** 2026-09-07 · **Rama de creación:** `docs/pendientes-metricas`
>
> Estado del arnés a fecha de hoy: el **GATE real** (pre-commit → `audit_metrics.py
> --baseline`) sale **exit 0** (deuda baselined). El audit CRUDO `audit_metrics.py` →
> **exit 1** (559 errores + 58 avisos), que es el estado **G0 esperado por diseño** — el registro
> `config/metrics.json` documenta que el audit DEBE salir 1 hasta ejecutar la
> remediación G1–G10 (marca las mentiras existentes). `config/metrics.json` tiene
> **26 métricas** declaradas y **0 con `provenance: MEDIDA`** (nada en la plataforma
> califica hoy como medido/calibrado — es un hecho honesto, no un bug del arnés).

---

## Plan de cierre — qué se puede dejar al 100% HOY (y qué no)

"100% funcional" tiene **dos mitades** que no se cierran igual:

- **🟢 SEGURO + DESPLEGADO (cerrable HOY):** todo el **§C** son toggles/claves en dashboards
  (Supabase, Vercel, Modal, Anthropic) — acción del usuario, sin código, ejecutable desde el
  móvil. Cerrar §C entero deja la plataforma **segura y operativa al 100%**. Empezar por **C1**
  (el hook JWT — sin él la seguridad multi-tenant de menores está inerte).
- **🔴 CIFRAS VALIDADAS (NO cerrable "hoy" ejecutando pasos):** el **§A** exige **datos humanos**:
  clips anotados a mano (identidad), calibración medida y golden (físicas/duelos), datos reales
  introducidos (bienestar). Es trabajo humano/físico, no un toggle. **Hasta que existan esos
  datos, las cifras siguen orientativas o bloqueadas** — por honestidad NO se marca "100%
  validado". Máximo apalancamiento: **un solo clip anotado** desbloquea identidad+físicas+duelos.
- **✅ CÓDIGO (§B): cerrado.** Lo finalizable está hecho (#184–#188); el resto es §A/§C o ya-verde.

**Conclusión honesta:** hoy puedes dejar la herramienta **segura, desplegada y operativa al 100%
(§C)**. El "100% de talento detectado con cifras validadas" depende de §A (datos), que no se
fabrica en un día. Este doc es el recopilatorio único de todo lo pendiente.

---

## Leyenda de estado

| Estado | Significado |
|---|---|
| 🔴 **BLOQUEADA** | `value: null` + `gate_reason`; no se muestra cifra. Correcta pero **no** resuelta. |
| 🟡 **ORIENTATIVA** | Se muestra con `calibrated: false` / `confidence` baja; **no** es `MEDIDA`. |
| 🟠 **MOCK+banner** | Dato de ejemplo tras banner visible; real solo cuando entre dato humano. |
| 🟢 **RESUELTA** | Procedencia correcta declarada; honesta y presentable. |

Tipo de desbloqueo: **CÓDIGO** (implementable) · **DATOS_HUMANOS** (antropometría/anotación) ·
**VALIDACIÓN** (clip/ground truth) · **OPERATIVO** (acción de deploy del usuario).

---

## 1. Métricas 🔴 BLOQUEADAS — qué falta para desbloquear

| Métrica | Dónde | Por qué está bloqueada | Desbloqueo |
|---|---|---|---|
| **Duelos G/P (ruta tracking)** | `src/hooks/useTracking.ts:714`, `src/lib/yolo/types.ts:129` | `winnerId` nunca se resuelve (`poseAnalyzer` deja `null`); G3 sin hacer. | CÓDIGO (unificar rutas + criterio de ganador) + VALIDACIÓN (`duelos_gt.csv`) |
| ~~**Espacio / Voronoi de sesión**~~ 🟢 | `src/hooks/useTracking.ts` | **RESUELTA (G7 · #187):** media de muestras Voronoi en instantes vivos del jugador enfocado; DERIVADA orientativa o gated (nunca 0). | — |
| **VSI-vídeo compuesto** | `api/agents/_pipeline-orchestrator.ts:261` (`gateVsiComposite`) | Bloqueado si <4/5 dims reales. Técnica/mental/táctica son `CONSTANTE(null)` → siempre 2/5 reales (physical+projection) → compuesto SIEMPRE bloqueado. Proyección y best-match se **omiten** en consecuencia. | Depende de que la VISIÓN mida técnica/mental/táctica (hueco permanente hoy) |
| **Variación del VSI de ficha** (`vsi_delta`) | `src/lib/scoring/vsiDelta.ts` (`computeVsiDelta`, `realVsiEvaluations`) | Solo se calcula entre dos evaluaciones del entrenador **con fecha y origen** (`data.vsiEvaluations`); el `vsiHistory` legacy no tiene fechas y contiene el 57.5 fabricado antes de #146 (migración 070 lo marca para revisión) ⇒ los jugadores existentes quedan bloqueados (`historial anterior sin fecha ni origen`) hasta su próxima evaluación. Ya usan la fuente única: ScoutFeed, panel de familia, informe `/report/:id` (variación + gráfica), PDF de servidor (gráfica), análisis baseline (sin `trend/history`; filas antiguas limpiadas al leer), bot de Telegram (`get_player` no envía el historial legacy al LLM), flechas ↑/↓ de `/rankings` y lista «Talentos en tendencia» de `/pulse` (`vsiTrendArrow`: signo de `computeVsiDelta`, banda ±2 pendiente de validar; bloqueada ⇒ sin flecha; solo los jugadores demo —MOCK con banner— conservan la flecha de su historial sembrado). | DATOS_HUMANOS (nuevas evaluaciones con fecha) |
| **VSI-vídeo sub-scores técnica/mental/táctica** | `_pipeline-orchestrator.ts:244-260` (`buildVsiSubscores`) | `CONSTANTE value:null` por diseño: el pipeline de visión no los mide. Bloqueo honesto. | VALIDACIÓN + modelo que los mida (largo plazo) |
| **Detección de balón parado desde vídeo** | `src/services/real/setPieceVideoDetector.ts` (`setPieceDetectionGate`) | No existe detector: antes se simulaba («YOLO + ByteTrack / pose») e inventaba jugadas sobre vídeos reales. Vídeo real ⇒ `gate_reason`; solo partidos demo generan ejemplos MOCK. | CÓDIGO (modelo que clasifique jugadas a balón parado) + VALIDACIÓN |
| **Detección de momentos para highlights** | `src/services/real/highlightsDetector.ts` (`highlightsDetectionGate`) | No existe detector. Vídeo real ⇒ `gate_reason` + reel vacío para clips manuales. | CÓDIGO (detector de eventos) + VALIDACIÓN |
| **Informe Gemini de jugador sin identificar** | `api/_lib/geminiBiomechanics.ts` (`resolvePlayerIdentity`) | Sin dorsal + color de referencia (el pipeline aún no los recibe), el informe solo se atribuye si el vídeo muestra UN único jugador (con advertencia); si no, el análisis se cierra `failed` con motivo y no se generan informes bajo el nombre del menor. Scores/conteos ausentes ⇒ `null` + `gate_reasons` (antes `?? 5` / `?? 0`). | CÓDIGO (llevar dorsal/color del UI → finalize → `analyses` → gemini-analyze; necesita migración) + VALIDACIÓN (identidad.md, ≥98%) |
| **Informe táctico de equipo con vídeo en la nube (Bunny)** | `src/hooks/useTeamIntelligence.ts` (gate cliente), `api/agents/_team-intelligence.ts` (gate servidor, `NO_VISUAL_INPUT`) | Sin entrada visual: el navegador no puede leer fotogramas de un vídeo de Bunny y no hay observación de Gemini → antes se generaba un informe "de 0 fotogramas" (inventado). Ahora se bloquea con motivo en `/team-analysis`. | CÓDIGO (extraer fotogramas u observación en servidor desde la URL de Bunny) |
| **Desglose por jugador del análisis de equipo heredado** (`/team-analysis`: dorsal, pases, duelos, recuperaciones, velocidad, distancia y mapa de calor por jugador) | `api/agents/team-observation.ts`, `api/agents/_team-intelligence.ts`, `src/lib/shared/teamReportIdentity.ts` (`withholdIndividualData`), `src/hooks/useTeamIntelligence.ts`, `src/pages/TeamAnalysisPage.tsx` | **Abstención de identidad (identidad.md, P0 menores).** El dorsal lo ADIVINABA el LLM (`dorsalEstimado`, con "7" de ejemplo en el prompt) y se pintaba junto a cifras por jugador. No existe capa de identidad por dorsal validada (Fase 2 de dorsal PAUSADA por el owner) ⇒ los prompts ya no piden dorsal ni filas por jugador, y servidor, hook y página retiran lo que llegue por jugador (incluidos los textos que nombran a un individuo, con el mismo predicado `mentionsIndividual` del job de partido). Los informes guardados antes se muestran sin esas filas y con un aviso. Solo nivel de equipo. | VALIDACIÓN (GT5 `fixtures/identidad/`, precisión ≥ 98% sobre convocatoria cerrada) + CÓDIGO (capa de dorsal: recorte de torso → distribución sobre la convocatoria → votación por pista → emparejamiento global). Hasta entonces, como mucho pistas anónimas «Pista #N» con procedencia, nunca bajo el nombre de un jugador. |
| **Análisis de partido completo por vídeo** (observación Gemini por tramos: `match_posesion_estimada_*`, `match_dominio_territorial_tramo`, descriptores por tramo, `match_eventos_citados`, informe A-vs-B) | `api/_lib/matchJob/*`, `api/match/[action].ts` (Fase 1, PR-A) | **APAGADO por decisión del owner (2026-09-29)**: el spike sobre un partido real (Veo follow-cam, sub-10 fútbol 8, tramo de 15 min) mostró que Gemini 2.5 Flash a 1 fps **fabrica** eventos de equipo (0 de 5 tiros citados existían en el segundo citado, verificado con fotogramas; eventos en pasos de ~10 s; posesión 50/50 a LOW; dorsales inexistentes, «#11» en un equipo sin números). `MATCH_VIDEO_ENABLED` ≠ `"true"` ⇒ `/start` 503 «en validación», la UI lo muestra deshabilitado y el protocolo step detiene cualquier job en vuelo. Toda la infraestructura está construida. Posesión con gate propio: baja confianza si no hay base visual confirmada o si todo sale 50/50 + «equilibrado». | VALIDACIÓN: clips anotados a mano en `fixtures/partido/` (GT10) que superen `scripts/validate-match-observation.mjs` (precisión/exhaustividad por categoría ≥ umbrales de `config/matchVideo.json`, «pendiente de validar») + decisión del owner. Nunca se relaja un umbral para activar. |

## 2. Métricas 🟡 ORIENTATIVAS (se muestran, pero NO son `MEDIDA`)

| Métrica | Dónde | Estado | Para ascender a `MEDIDA` |
|---|---|---|---|
| **Velocidad máx/media, distancia, sprints, accel** | `src/hooks/useTracking.ts:718-731` (`calibrated:false`, conf. 0.4) | Los bugs de cálculo YA arreglados (máx = p95 `:661`, sprints = `countSprintEvents` `:668`). Pero sin calibración de campo son **píxeles reescalados**, no metros/km-h fiables. | VALIDACIÓN: clip con calibración conocida (`fixtures/golden/calibracion.json`, hoy plantilla vacía) |
| **Escaneos (focus)** | `src/hooks/useTracking.ts:729` | Proxy sin validar; gated si el jugador no tiene frames cercanos. | VALIDACIÓN contra golden anotado |

## 3. Métricas 🟠 MOCK con banner

| Métrica | Dónde | Estado |
|---|---|---|
| **Set pieces (catálogo + «desde vídeo») y highlights de ejemplo** | `src/services/real/setPieceService.ts`, `setPieceVideoDetector.ts`, `highlightsDetector.ts` | MOCK+banner (`ProvenanceBadge` MOCK + `DemoDataBanner` en `/set-pieces`, carpetas, `/highlights`, detalle de reel). Registrados en `config/metrics.json` (`balon_parado_video_simulado`, `highlights_momentos_simulados`). |
| **Bienestar / Wellbeing** (`/family/:id`) | `src/hooks/useWellbeing.ts:140` | MOCK+banner. Inputs manuales YA cableados (cuestionario/asistencia/engagement, PRs #167/#170); falta **que alguien introduzca datos**. |
| **Radar de Retención** (`/director`) | `src/components/retention/RetentionRadarCard.tsx:66` | DemoDataBanner; **ROI en euros YA retirado** (`:113`, la cifra de mayor riesgo comercial). El riesgo subyacente sigue siendo hash del id (`src/lib/retention/dropoutScore.ts:57`) tras el banner y sin euros. Real solo con señales reales. |

## 4. Métricas 🟢 RESUELTAS (honestas, no bloqueadas)

- **PHV / bio-banding** — `DERIVADA` gated; intactas (invariante #4, NO tocar).
- **Gate ÚNICO de PHV** (`src/lib/phv/phvGate.ts`, regla del owner 28-sep) — PHV (offset/APHV/fase) solo con TODAS las entradas introducidas: talla, peso, talla sentado, pierna (o talla − sentado), **edad decimal desde la fecha de nacimiento** y sexo; si falta cualquiera ⇒ `value: null` + «Falta: …» en TODAS las superficies (ficha, impresiones, PDF, equipo, comparador, Rankings cliente+API, ScoutFeed, baseline, orquestador, agente PHV). `players.phv_category/phv_offset` solo los escribe el endpoint de antropometría con fila completa (`age_source='birth_date'`, migración 069). %PAH es otra métrica (`pahGate`, «% talla adulta»). **Bloqueado por diseño** hasta que el coach re-guarde una medición completa con fecha de nacimiento: las filas antiguas (edad entera) NO cuentan. *Pendiente: textos LLM de informes/analyses antiguos generados con PHV no fiable (solo se archivaron los insights del ScoutFeed pre-#156).*
- **G6 Escudo de Estirón** — sexo obligatorio sin default `'M'` (`usePHVProduct.ts:60-73`, PRs #136-138); bloquea si faltan sitting/leg (más estricto que medido-sobre-estimado). *Falta: test explícito medido-vs-estimado + decisión sobre jugadores legacy guardados como `'M'`.*
- **VSI-ficha** — reetiquetado "evaluación del entrenador" (`metricsService.ts:61`), nullable (kill-58 #146); no evaluados excluidos de medias/percentiles/tiers (#150-152).
- **Pases / precisión / posesión** — reetiquetados `ESTIMADA_LLM` (`src/services/real/matchStatsService.ts:395`); ya no "datos cuantitativos medidos".
- **Contrato `MetricResult`** — fundación (`src/lib/metrics/MetricResult.ts`, factory con 5 invariantes que lanzan), migrada en tracking/matchStats/poseEligibility. **NO universal** (ver §5-B).

---

## 4-bis. Ground truth humano requerido — índice único (el cuello de botella real)

> **Todo lo que sigue es dato HUMANO/FÍSICO, no un toggle ni código.** Ningún push
> lo resuelve; hasta que exista, las métricas afectadas siguen 🟡 orientativas, 🔴
> bloqueadas o 🟠 mock (nunca `MEDIDA`). Es deuda de **producto** (aparece en
> desarrollo/producción con vídeo real), **no de la demo** — la demo ni toca estos
> caminos (usa ejemplos pre-horneados). **Máximo apalancamiento: UN solo clip
> calibrado + anotado desbloquea identidad + físicas + duelos a la vez.**
>
> Reglas invariantes al recogerlo: las anotaciones son **humanas**, nunca sintéticas
> ni inferidas por un modelo (inv. identidad); `fixtures/` es **evaluación, no
> entrenamiento** (los umbrales NO se ajustan mirando esos clips); el % de frames
> legibles por un humano define el **techo físico** de cobertura y ninguna cifra de
> éxito puede superarlo.

| # | Qué falta (dato humano) | Fichero / destino | Cómo se recoge | Qué desbloquea | Estado hoy |
|---|---|---|---|---|---|
| GT1 | **Calibración de campo** — ≥4 puntos con coordenadas reales medidas del terreno | `fixtures/golden/calibracion.json` (plantilla vacía) | Marcar ≥4 puntos conocidos del campo (esquinas de área, círculo central…) con su posición en metros | Físicas 🟡→`MEDIDA`: velocidad/distancia/sprints/accel pasan de píxeles reescalados a metros/km-h fiables (valida homografía px→m) | 🔴 vacío |
| GT2 | **Distancia real (verdad medida)** | `fixtures/golden/distancia_gt` | GPS/EPTS por jugador, o cinta métrica sobre recorridos conocidos | Valida distancia/velocidad contra verdad (no solo autoconsistencia de la homografía) | 🔴 vacío |
| GT3 | **Ganador de duelos anotado** | `fixtures/golden/duelos_gt.csv` | Un humano marca por duelo quién gana/pierde | Duelos G/P 🔴→calculado: habilita el **criterio de ganador (G3)**, hoy prohibido inventar sin esta verdad | 🔴 vacío |
| GT4 | **VSI de referencia** | `fixtures/golden/vsi_gt` | Evaluación humana del compuesto para contrastar | Valida el VSI-vídeo compuesto | 🔴 vacío |
| GT5 | **Identidad por dorsal** — ≥3 clips ~60s anotados a mano | `fixtures/identidad/` (solo `_plantilla`) | Cámara fija + móvil + ≥1 en malas condiciones; fila por `(frame, track_id, dorsal, equipo, legible)` + convocatoria cerrada | Construir **y** validar la capa de identidad (≥98% precisión). Sin ella el sistema **abstiene** (pistas anónimas). Define el techo físico de cobertura | 🔴 solo plantilla |
| GT6 | **Umbral de cercanía (pose vs solo-posición)** — validar la frontera cercano/lejano del pipeline de recall | `fixtures/` (V6) + `poseEligibility.ts` | Anotar a mano en qué cajas los keypoints son fiables vs no | Fija el umbral hoy "pendiente de validar"; permite dar recall/FP reales del tracking a plano completo | 🟡 sin validar |
| GT7 | **Dataset para `vitas-pose-v1`** (modelo propio) | eval V6 + dataset etiquetado | Frames/bboxes de footage juvenil etiquetados a mano | Entrenar/validar el pose afinado (objetivo Fase 3); hoy producción usa pose de stock | 🔴 no existe |
| GT8 | **Datos reales de bienestar/retención** | input ya cableado (`useWellbeing.ts`, señales de retención) | Que personas introduzcan cuestionario/asistencia/engagement por jugador | Bienestar y Radar de Retención 🟠 mock→real (hoy tras banner; retención aún = hash del id) | 🟠 mock, sin datos |
| GT9 | **Clip real (idealmente público)** para benchmark de tracking | — | Un vídeo de partido/entreno con URL pública | Benchmark BoT-SORT vs ByteTrack, pose n vs m, balón dedicado, homografía px→m | 🔴 falta |
| GT10 | **Eventos de equipo anotados a mano por partido** (varios partidos, tramos de 15 min) | `fixtures/partido/<clip_id>/{clip.meta.json, eventos.json}` (solo `_plantilla`) | Una persona ve el proxy y anota `[{t, team: home\|away, category}]` de todo lo que vea de cada categoría medida; declara los colores como el entrenador | Activar el análisis de partido completo (`MATCH_VIDEO_ENABLED`): `scripts/validate-match-observation.mjs` puntúa la observación contra esto; también fija fps/resolución/tramo de `config/matchVideo.json` | 🔴 solo plantilla |

> **Nota sobre técnica/mental/táctica del VSI-vídeo:** además de ground truth para
> validar, requieren un **modelo que las mida** (hoy el pipeline de visión no las
> mide → `CONSTANTE(null)`). Es hueco de capacidad a largo plazo, no solo de datos.

---

## 5. Trabajo pendiente por categoría

### A) DATOS / VALIDACIÓN HUMANA — el cuello de botella real (no lo arregla código)

> Resumen ejecutable del **índice §4-bis** (arriba, la lista completa con ficheros y estados).

- [ ] **Ground truth de identidad** — `fixtures/identidad/` (hoy solo `_plantilla`): ≥3 clips de ~60s anotados a mano (cámara fija + móvil + ≥1 en malas condiciones), fila por `(frame, track_id, dorsal, equipo, legible)` + convocatoria cerrada. Define el techo físico de cobertura; sin él la capa de identidad por dorsal **no se puede construir ni validar** (≥98% precisión) → el sistema seguirá abstiéndose (pistas anónimas).
- [ ] **Golden de físicas/duelos** — `fixtures/golden/` (vacío): `calibracion.json` (≥4 puntos medidos), `distancia_gt` (GPS/EPTS o cinta), `duelos_gt.csv`, `vsi_gt`. Sin verdad medida no se validan distancia/velocidad (homografía), duelos ni VSI.
- [ ] **Datos reales de bienestar/retención** — introducir cuestionario/asistencia/engagement por jugador (input ya cableado).
- [ ] **Clip real (idealmente público)** para benchmark de tracking (BoT-SORT vs ByteTrack, pose n vs m, balón, homografía px→m).

### B) CÓDIGO PENDIENTE (lo ejecuta el equipo dev)

> **Aclaración importante (verificada 28 ago):** el "audit a verde" **ya está hecho como GATE**.
> El pre-commit corre `python scripts/audit_metrics.py --baseline` → **exit 0**. El baseline
> (`config/metrics.baseline.json`, 88 keys) suprime la deuda conocida; la key es
> `code::metric::FICHERO` **sin nº de línea**, así que colapsa los 557 `LIT001` en ~20 keys. El
> "559 err / exit 1" es el audit **CRUDO** (estado G0 por diseño). Las 3 keys PHV
> (biobanding_pah, phv_aphv, phv_offset) están baselined → **las fórmulas NUNCA se tocan**
> (inv #4). Enumerar 290+ coeficientes en `allowed_literals` para vaciar el crudo sería
> busywork sin valor. **`ORPH001` es WARN, nunca ERROR → no bloquea nada.**

- [x] **Bug del audit (Windows)** — `ORPH001` comparaba `/` (registro) vs `\` (escáner) → 11 falsos positivos. Fix `.as_posix()`. **HECHO · #185.**
- [x] **Desconectar de la UI el `duelos_tracking` "0G/0P"** (`CONSTANTE`, winnerId siempre null) → ahora muestra el `gate_reason`, no un 0. **HECHO · #185.**
- [x] **Voronoi de sesión (G7)** — muestreo en instantes vivos + media del jugador enfocado; DERIVADA orientativa o gated (nunca 0). **HECHO · #187.**
- [x] **`npm audit fix`** — protobufjs 7.6.4→7.6.6, cierra el RCE crítico; runtime 10→2 vulns. **HECHO · #186.**
- [ ] **Unificar duelos** (`DUP001`: 3-4 rutas — tracking/eventengine/gemini, inv #7). La plomería (una sola ruta) es código, pero el **criterio de ganador (G3) está BLOQUEADO por datos** (prohibido inventarlo sin `duelos_gt.csv` anotado, ver §A).
- [ ] **`allowAsync` en la UI** (partidos largos): ruta async lista+testeada pero **sin caller**; cablearla = UI inerte **hasta que el usuario ponga `MODAL_TRACK_ASYNC_URL`** (§C). No hecho: prematuro.
- [ ] **~52 ficheros fuera del contrato** (`ORPH001`, WARN no-bloqueante): meterlos bajo el registro es **pura cobertura opcional** (no desbloquea nada). Baja prioridad.
- [ ] **`vitas-pose-v1`** (modelo propio): **BLOQUEADO por datos/validación** — depende de la eval V6 (ground truth) + dataset etiquetado con frames/bboxes.
- [ ] **Vaciar el audit CRUDO** (opcional, cosmético): declarar coeficientes en `allowed_literals` para los ~247 literales NO-PHV; los PHV se quedan baselined (inv #4). Sin impacto en el gate (ya verde).
- [ ] **Partido completo · duplicado temporal de la File API de Gemini** (inv #7, deuda conocida): `api/agents/video-observation.ts` conserva su propia subida/poll (con `?key=` en la URL) y el job usa la librería nueva `api/_lib/gemini/{files,generate}.ts` (key en cabecera `x-goog-api-key`). No se tocó en la Fase 1 para no chocar con ramas en vuelo; **migrar en la Fase 2** y borrar la copia.
- [ ] **Partido completo · posesión heredada** (inv #7): `posesion` (`tactico.posesion`, `api/agents/team-observation.ts`) solapa con `match_posesion_estimada_*` (`partido.posesion.*`). La ruta heredada se retira en la Fase 2.
- [x] **Análisis de equipo heredado sin dorsal adivinado ni cifras por jugador** (identidad.md, P0): los prompts de `team-observation` y `team-intelligence` ya no piden `dorsalEstimado` ni `jugadoresObservados[]`/`jugadores[]`; guarda compartida `withholdIndividualData` en servidor, hook y página; retirado del hook el emparejamiento por índice pista YOLO ↔ «jugador» del LLM (mapa de calor atribuido sin validar) y el bloque YOLO del prompt (duelos `0G/0P` fijos). **HECHO · rama `fix/team-analysis-no-llm-dorsal` (PR abierto, sin fusionar).**
- [ ] **Residuales del análisis de equipo heredado** (no hechos en ese PR): (a) las filas antiguas de `team_analyses` siguen guardando `jugadores[]`/`dorsalEstimado` en la base: la UI las oculta al leer, pero limpiarlas es una decisión del owner (migración de datos, no aplicada); (b) el export de cuenta (`api/account/_export.ts`) entrega esas filas tal como están guardadas (sin cambios a propósito: es el dato que se conserva; se resuelve con (a)); (c) claves i18n que quedan sin uso tras retirar la tabla (`teamAnalysis.players*`, `teamAnalysisPage.role/passes/duels/wonAbbr/lostAbbr/recoveriesCount/speed/distance/heatmapTitle`); (d) siguen abiertos en esa pantalla la posesión `?? 0` sin rótulo (B4), `jugadoresDetectados ?? 0` y la confianza autoinformada `?? 0` (y su delta contra 0 en la comparativa).
- [ ] **Partido completo · acelerador del webhook de Bunny sin cablear**: el tick de Modal (cada 5 min) es el conductor durable y despacha los `awaiting_encode` ya codificados; el webhook (Status 3) podría llamar a `processAwaitingJob` para ahorrar hasta 5 min. No hecho en PR-A (opcional; el tick basta).
- [ ] **Partido completo · worker Modal (PR-B) e UI (PR-C)** — sin ellos el backend no recibe ops; la UI debe consultar `GET /api/match/availability` y mostrar «En validación» mientras esté apagado, dejando el informe con notas intacto.
- [ ] **Partido completo · ruta HLS de Bunny y token auth del CDN** «pendiente de validar» (`hlsVariantPathTemplate` en `config/matchVideo.json`; spike (h)). Si el pull zone usa token auth, falta firmar `sourceUrl` en `api/_lib/matchJob/bunnySource.ts`.

### C) OPERATIVO / DEPLOY — acción del USUARIO (dashboards/claves, sin código)

> **Todo esto se puede cerrar HOY desde el móvil/navegador** (paneles Supabase / Vercel /
> Modal / Anthropic). Cerrar C completo deja la herramienta **segura y desplegada al 100%**.
> Orden por prioridad:

- [x] **C1 · Activar `custom_access_token_hook` en Supabase** — ✅ **HECHO Y VERIFICADO (28 ago): hook `ENABLED` + diag `[OK]` (claim raíz `tenant_id` presente en el token, 8/8 usuarios con tenant). RLS multi-tenant de datos de menores OPERATIVA.** (Era ⚠ lo más crítico.) Pasos de referencia (verificados contra `supabase/migrations/057_custom_access_token_hook.sql`):
  1. **Paso 0 — ¿existe la función?** SQL Editor → `select proname from pg_proc where proname = 'custom_access_token_hook';`. Vacío → aplica antes la 057 (pega el fichero entero en el SQL Editor).
  2. **Paso 1 — activar:** Authentication → Hooks → *"Customize Access Token (JWT) Claims"* → función `public.custom_access_token_hook` → **Enable**.
  3. **Paso 2 — verificar** con el script recreado: `node --env-file=.env.production.local scripts/diag-jwt-tenant.mjs` (solo lectura; comprueba la precondición 8/8 usuarios). Para la confirmación DEFINITIVA del claim raíz añade `DIAG_TEST_EMAIL=… DIAG_TEST_PASSWORD=…` de una cuenta tuya → debe salir `[OK]`. Alternativa manual: re-loguear en la app y en consola `JSON.parse(atob((await window.supabase.auth.getSession()).data.session.access_token.split('.')[1])).tenant_id`.
  4. **Rollback:** desactivar el hook → RLS vuelve a fallar-cerrada (estado actual), sin romper la app.
  - ⚠ Al activarlo, un usuario real SIN `app_metadata.tenant_id` dejaría de ver sus datos por lectura directa (la migración dice 9/9 usuarios lo tienen, verificado 20 ago) → hazlo mirando la app justo después.
- [x] **C2 · Verificar/aplicar migraciones 052–059** — ✅ **HECHO (28 ago): las 8 aplicadas vía SQL consolidado en el SQL Editor** (054 ledger, 055 RLS táctica, 056/058 género sin default, 057 hook JWT, 059 VSI nullable).
- [ ] **C3 · Rotar 8 credenciales** (Anthropic, Voyage, Bunny, Supabase service_role, Modal AUTH, Bunny webhook secret, `CRON_SECRET`, `INTERNAL_API_TOKEN`) → regenerar en cada dashboard, actualizar env Vercel + secrets Modal, borrar `.env` locales. **Bloquea antes de:** firma de academia / demo con datos reales.
- [x] **C4 · Hard-caps de gasto** — ✅ **HECHO (28 ago): `GLOBAL_MONTHLY_BUDGET_USD` en Vercel + Anthropic $30/mes (hard-cap) + Modal $1/mes (Starter free tier, SIN tarjeta → tope natural, no puede cobrar).** El tripwire del código es fail-open; estos topes de proveedor son el backstop real.
- [ ] **C5 · `MODAL_TRACK_URL` + `MODAL_API_KEY`** (+ `MODAL_TRACK_ASYNC_URL` + `MODAL_CALLBACK_SECRET`) en env Vercel; sin ellas el tracking de vídeo degrada a mock/cliente y `allowAsync` (§B) queda inerte.
- [ ] **C5-bis · Escalar Modal para PARTIDOS COMPLETOS (diferido)** — hoy NO hacen falta (no se procesan partidos de 90 min; el tracking en navegador maneja clips). Cuando lleguen esos vídeos: (1) subir el **Modal usage limit** — requiere **añadir tarjeta** (se sale del free tier de $1); (2) subir **`GLOBAL_MONTHLY_BUDGET_USD`** — el gasto de Modal cuenta en ese bote compartido con Claude/Gemini, y el tripwire corta Modal si se supera. Coste ~**$0.60/partido** (T4, timeout 60 min; real ~$0.20–0.30). Dimensionado (Modal limit / GLOBAL): 10 partidos/mes → **$15 / $25** · 30 → **$30 / $45** · 50 → **$45 / $65** · 100 → **$80 / $110**.
- [ ] **C6 · Stripe** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs), **VAPID** (push), **Telegram** (`TELEGRAM_BOT_TOKEN` + webhook) — hoy en modo demo/inertes. Activar el que necesites.
- [ ] **C7 · Resend (correo transaccional + leads)** — la migración **063** (tabla `leads`) YA está aplicada, así que `/api/leads` **ya captura en Supabase y devuelve 200**; el lead NO se pierde. Lo único pendiente es la **notificación por email** y el resto del correo transaccional, todo centralizado en `sendEmail` (`api/_lib/email.ts`, #234). Pasos:
  1. **Vercel (producción):** poner `RESEND_API_KEY`. Opcional `RESEND_FROM_EMAIL` (default `"VITAS <noreply@krujens.eu>"`). Sin la key, `sendEmail` degrada limpio (`console.warn` + `return false`, no rompe).
  2. **DNS de `krujens.eu`** (⚠ el paso que se olvida): verificar el dominio en Resend añadiendo **DKIM + SPF + MX de retorno** (este último sobre un **subdominio**, p. ej. `send.krujens.eu`). Aunque pongas la key, si el dominio no está verificado el envío falla igual (el `from` es `@krujens.eu`). Los registros van **donde vivan los nameservers de krujens.eu** (si es **Hostinger**, en su editor de zona DNS; si está delegado a Vercel/Cloudflare, allí). **No requiere contratar nada en Hostinger** ni cambia el MX principal → los buzones/emails actuales de krujens.eu siguen intactos.
  3. **Redesplegar** producción.
  - **Desbloquea de golpe** (misma key, todos usan `sendEmail`): aviso de leads (`api/leads.ts`), bienvenida/confirmación de signup (`api/auth/_welcome.ts`, #227), **consentimiento RGPD** (`api/auth/sign-consent.ts`), borrado de cuenta RGPD (`api/account/delete-me.ts`), invitaciones/solicitudes de club (`api/team/_invite.ts`, `_request.ts`), notificaciones cron (`api/notifications/_cron.ts`).

- [ ] **C8 · Partido completo por vídeo — activación (NO antes de validar)**: tras mergear PR-A/B/C, aplicar la migración **067** en Supabase; en Vercel `MODAL_MATCH_START_URL`, `GLOBAL_MONTHLY_BUDGET_USD=20`, clave Gemini de pago en `GEMINI_API_KEY`; Modal con tarjeta + límite de gasto $10/mes + `VITAS_MATCH_STEP_URL` en el secret `vitas-api-key`; rotar C3 antes de footage real; spike (a)–(i) en Modal con resultados literales aquí. **`MATCH_VIDEO_ENABLED=true` SOLO** cuando `scripts/validate-match-observation.mjs` apruebe varios partidos anotados (GT10) y el owner lo decida. En `vitas-demo`, sin definir.

> **Verificación automática:** `scripts/diag-jwt-tenant.mjs` (recreado) confirma la precondición
> (usuarios con `app_metadata.tenant_id`) y, con `DIAG_TEST_EMAIL/PASSWORD`, el claim raíz del token.
> Solo lectura, nunca imprime la key ni PII. Probado en prod: **8/8 usuarios con tenant_id**.

---

## Notas de estado (correcciones a documentación previa)

- **Spike del 2026-09-29 (partido real del owner, Veo follow-cam, sub-10 fútbol 8, tramo de 15 min, Gemini 2.5 Flash a 1 fps):** 0 de 5 tiros citados existían en el segundo citado (verificado con fotogramas); eventos en pasos plantilla de ~10 s; posesión 50/50 a resolución LOW; citó dorsales inexistentes («#11» en un equipo sin números). Consecuencias en PR-A: análisis APAGADO por defecto (`MATCH_VIDEO_ENABLED`), fps/tramo/resolución configurables (`config/matchVideo.json`, `geminiVideoFps` «pendiente de validar»), arnés `scripts/validate-match-observation.mjs` + `fixtures/partido/`, guarda de identidad que también descarta texto con números de camiseta o referencias a un solo jugador («el portero», «a player»), y gate de baja confianza de la posesión (sin base visual confirmada por `usageMetadata` / 50-50 + «equilibrado» uniforme). Un tramo cuya respuesta no trae tokens de vídeo se descarta entero (`no_visual_input`).

- **Modal ya NO está huérfano** (la nota de `CLAUDE.md` es obsoleta): desplegado (roadmap V1/V2 ✅) y cableado a UI (`useTacticalHeatmap.ts:187`, `videoTrackingService.ts:184`).
- **npm vulns bajaron** de ~35 → 10 → **2 moderate** en runtime (#186 cerró el RCE crítico de protobufjs). Restan `sharp`/`@vite-pwa/assets-generator` (build-time, CVEs libvips upstream sin fix).
- **Modelo de balón dedicado ya existe** (`ball-football.onnx`, `ballModelConfig.ts:107`) — cierra el hueco de FASE 2; falta hacerlo default (desktop usa aún `yolo11s-detect` COCO genérico).
- **`docs/demo-setup.md` está OBSOLETO** (describe el enfoque viejo #233 con Supabase separado + `seed-demo.mjs`). La demo VIGENTE (fases 1–4, #237–#243) corre **SIN Supabase**: `IS_DEMO = VITE_DEMO=1` **Y** Supabase NO configurado (doble guarda, `src/lib/demoMode.ts`); los datos viven en `localStorage`, sembrados por `DemoDataService.seed()` en la primera carga. La demo **no necesita** proyecto Supabase propio, migraciones ni `seed-demo.mjs`. **PENDIENTE:** actualizar o marcar como obsoleto ese doc para que nadie cablee Supabase a la demo (justo lo que la doble guarda evita).

> **Mantenimiento:** actualizar este fichero cuando una métrica cambie de estado
> (p. ej. al cerrar G3/G7, o cuando entre un golden anotado). No borrar las
> resueltas — el histórico de qué se desbloqueó y cómo es parte del valor.
