# VITAS · Roadmap de Tracking de Visión (calidad → 90 min → modelo propio)

> **Objetivo:** llevar el tracking de partido completo (90 min) a calidad de producción,
> **unificando primero el stack de identidad sobre el path GPU (Modal)** y **luego**
> habilitando el procesado async de partidos largos. La orquestación hace que *corra*;
> el stack de tracking es lo que determina la *calidad*.
>
> **Orden (decidido):** calidad primero (V1–V3) → async 90 min (V4) → coste (V5) → eval CV (V6) → fine-tune (V7).

## Estado de partida (lo que YA existe)
- **Modal GPU** (`vision-pipeline/app.py`): YOLOv11m + **ByteTrack pelado**, T4, endpoint HTTP **síncrono** (timeout 900s). Sin Re-ID / equipo / OCR.
- **Navegador (ONNX)** `src/lib/yolo/`: stack de identidad **bueno** ya construido — `teamClassifier`, `colorReId`, `dorsalOCR`, `playerIdentityManager`, `ballDetector`/`ballTracker`, `homography`, `voronoi`, `kalmanLite`, `interpolator`.
- **Cola async** para player-analysis (Gemini): `bunny-uploaded` → `analyses` queued → `process-analyses-queue` → (Gemini). Ya async; **no cubre tracking GPU**.
- **Guard** (PR #17): el proxy síncrono `_track-players` rechaza vídeo largo (413) → fail-fast, no timeout/mock silencioso.
- **Eval harness LLM** (PR #16): validadores anti-alucinación + golden set + test CI. **Falta el equivalente para CV.**

## Diagnóstico
El path que haría los 90 min (Modal) es el **pobre**. Sobre 90 min, ByteTrack pelado acumula **ID switches** en cada cruce/oclusión → heatmaps y métricas por jugador sucios. **La calidad se gana trayendo el stack de identidad del navegador al path GPU**, no en la fontanería de la cola.

---

## Leyenda
Esfuerzo: **S** (≤1-2 días) · **M** (3-5 días) · **L** (1-2 semanas) · **XL** (2+ semanas, depende de datos).
Cada sprint es un PR aislado y desplegable (misma disciplina que el resto del proyecto).

---

## SPRINT V1 · Tracker: ByteTrack → BoT-SORT + Re-ID  ⭐ *mayor salto / menor esfuerzo*
**Por qué primero:** el mayor impacto en calidad con el menor cambio. Re-ID por apariencia reduce drásticamente los cambios de ID en 90 min.

- **Alcance:** en `vision-pipeline/app.py`, cambiar el tracker de Ultralytics de ByteTrack a `botsort.yaml` con `with_reid: True`; tunear (`conf`, `iou`, `match_thresh`, embedder). Mantener EXACTO el contrato de salida (`players[]`, `ball[]`, etc.) para no romper el cliente.
- **Entregable:** Modal redeployado con BoT-SORT+Re-ID (`modal deploy` con `PYTHONUTF8=1`, ver gotchas en memoria).
- **Aceptación:** en un clip con cruces/oclusiones, **menos ID switches** que ByteTrack (medir antes/después, aunque sea manual sobre un clip corto).
- **Esfuerzo:** S · **Riesgo:** bajo · **Dep:** deploy Modal.

## SPRINT V2 · Identidad server-side (portar el stack del navegador a Modal)
**Por qué:** un `track_id` no es identidad. Quieres que un jugador conserve su **identidad real (equipo + dorsal)** todo el partido.

- **Alcance:** llevar la lógica de `teamClassifier` (clustering de color de camiseta) + `colorReId` + `dorsalOCR` (número de dorsal) + `playerIdentityManager` a un **post-proceso server-side** sobre la salida de Modal. Decisión técnica: reimplementar en Python dentro de `app.py` (crops → color/OCR) **o** un endpoint post-proceso Node. Recomendado: Python en `app.py` (evita round-trip de crops).
- **Entregable:** salida enriquecida con `team` + `jerseyNumber` estable por jugador, además del `track_id`.
- **Aceptación:** en un clip, un jugador mantiene la misma identidad tras una oclusión; dorsal detectado en ≥X% de jugadores.
- **Esfuerzo:** M–L · **Riesgo:** medio (OCR de dorsal es sensible a resolución) · **Dep:** V1.

## SPRINT V3 · Endurecer detección de balón
**Por qué:** el balón es el eslabón débil real (pequeño, rápido); Modal solo detecta clase 32 con YOLO pelado → a 5 fps pierde muchísimo.

- **Alcance:** portar el enfoque de `ballDetector`/`ballTracker` (navegador) al path GPU: detección a mayor resolución / por crops, Kalman de balón + interpolación entre huecos, NMS estricto.
- **Entregable:** trayectoria de balón con menos huecos.
- **Aceptación:** balón detectado en ≥X% más de frames vs baseline; trayectoria más suave en clip de prueba.
- **Esfuerzo:** M · **Riesgo:** medio · **Dep:** V1 (independiente de V2, puede paralelizar).

---

## SPRINT V4 · Orquestación async para 90 min (opción B)
**Por qué:** con la calidad ya unificada (V1–V3), habilitar que un partido completo *corra* sin timeouts.

- **Alcance:**
  - `app.py`: convertir `track` de HTTP síncrono a **`.spawn()`** (job async) + subir `timeout` (~2h). Devolver call-id al instante.
  - Nuevo **callback** de tracking (calcado de `api/webhooks/modal-callback.ts`) que persiste el resultado.
  - Tabla/estado de **tracking jobs** (status queued/running/done/failed) + resultado.
  - `videoTrackingService`: en vez de solo `too_long`, **encolar** y hacer **polling** del resultado (el guard de PR #17 pasa de "rechazar" a "rutar a async").
- **Entregable:** un partido de 90 min se trackea end-to-end en segundo plano y el resultado se recupera.
- **Aceptación:** vídeo de 90 min completa tracking async; cliente obtiene el resultado; sin timeouts.
- **Esfuerzo:** L · **Riesgo:** medio (infra + estado) · **Dep:** V1 (calidad); ideal tras V2–V3.

## SPRINT V5 · Control de coste / throughput
**Por qué:** 90 min en GPU es caro; recortar sin perder calidad útil.

- **Alcance:** `sample_fps` configurable por caso (heatmap < set-pieces), **filtrado de balón-en-juego** (saltar paradas/segmentos de baja actividad), opcional **A10G + fp16 + batching** para acabar antes.
- **Entregable:** coste por partido ↓ X% documentado.
- **Aceptación:** coste/latencia medidos, dentro de presupuesto (recordar spend cap manual en modal.com).
- **Esfuerzo:** S–M · **Riesgo:** bajo · **Dep:** V4.

---

## SPRINT V6 · Eval + golden set de CV (tracking)
**Por qué:** hoy no hay eval de visión (el harness que montamos es solo LLM). Sin esto, cualquier cambio de modelo/tracker es a ciegas.

- **Alcance:** anotar un **golden set** pequeño (unos clips con bboxes + IDs ground-truth) + runner de eval que calcule **MOTA, IDF1, #ID switches, tasa de detección de balón**. Integrar con el flywheel.
- **Entregable:** scorecard de tracking; guard de regresión antes de tocar modelo/tracker.
- **Aceptación:** métricas reproducibles sobre el golden set; detecta una regresión inyectada.
- **Esfuerzo:** M–L (**el coste es la anotación**) · **Riesgo:** depende de generar datos anotados · **Dep:** datos etiquetados.

## SPRINT V7 · Flywheel de fine-tune (el techo de calidad)
**Por qué:** el salto por encima de modelos genéricos = **tu propio modelo entrenado con datos PHV juveniles**. Es el moat.

- **Alcance:** QA de etiquetado, **splits train/eval**, **versionado de datasets** (el flywheel `labeled_datasets` hoy guarda métricas, no frames → hay que capturar frames/bboxes), job de **entrenamiento en Modal GPU**, eval contra el golden set (V6), registro/versionado de modelos, deploy de pesos fine-tuneados.
- **Entregable:** detector VITAS propio, medible como mejor que YOLO genérico en fútbol juvenil.
- **Aceptación:** eval (V6) muestra mejora sobre baseline; rollback si regresa.
- **Esfuerzo:** XL · **Riesgo:** alto (dependiente de datos) · **Dep:** V6 (eval) + datos etiquetados.

---

## Resumen y dependencias

| Sprint | Qué | Esfuerzo | Riesgo | Depende de |
|---|---|---|---|---|
| **V1** ⭐ | Tracker → BoT-SORT + Re-ID | S | bajo | — |
| **V2** | Identidad server-side (equipo/dorsal) | M–L | medio | V1 |
| **V3** | Detección de balón robusta | M | medio | V1 |
| **V4** | Async 90 min (spawn+callback+polling) | L | medio | V1 (ideal V2–V3) |
| **V5** | Coste/throughput (fps, in-play, A10G) | S–M | bajo | V4 |
| **V6** | Eval CV + golden set (MOTA/IDF1) | M–L | datos | datos anotados |
| **V7** | Fine-tune flywheel (modelo propio) | XL | alto | V6 + datos |

**Ruta crítica de valor:** V1 → V2 → V4 (calidad de identidad + partido completo corriendo). V3 en paralelo. V5 tras V4. V6/V7 dependen de generar datos anotados (tarea de datos, no solo de código).

**Quick win inmediato:** **V1** — cambio pequeño en `app.py`, el mayor salto de calidad por esfuerzo.

## Nota estratégica
El análisis **por jugador** (VSI, biomecánica, reportes) **ya funciona con 90 min** (vía Gemini async). Este roadmap es para el **tracking táctico de partido completo** (heatmaps, posiciones, set-pieces) — feature nueva y más cara. Si el diferenciador es PHV + desarrollo individual, priorizar V1–V2 (calidad de identidad, útil también para clips) sobre V4 (infra de 90 min) es defendible según demanda real de clientes.
