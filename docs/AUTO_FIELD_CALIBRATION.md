# Auto-calibración de campo + camino a alta fiabilidad del tracking

Objetivo: pasar el tracking físico (velocidad, distancia, sprints) de **fiabilidad
media-baja** a **alta**, y eliminar la necesidad de **marcar puntos a mano** para
calibrar la homografía píxel↔metros.

Este documento es el **runbook**: qué ya está hecho (código), y los pasos que
requieren **GPU + dataset + un clip real** (no ejecutables en el sandbox de Claude,
pero dejados listos para "darle al play").

---

## 0. Por qué (el problema)

La conversión de píxeles a metros usa una **homografía** de 4 puntos. Hoy:

- Arranca con `identityHomography()` → sin calibrar, las "velocidades en m/s" son
  **píxeles disfrazados** (no significan nada).
- La calibración real requiere que el usuario **marque ≥4 puntos** del campo, o que
  la auto-calibración RANSAC (opt-in) enganche.
- No hay medición de **confianza** de la calibración → cifras dudosas se muestran
  como si fueran medidas.

El estado del arte resuelve esto con un **modelo que detecta los keypoints del
campo** (intersecciones de líneas) → homografía automática. Benchmark de referencia:
**SoccerNet Camera Calibration Challenge**.

---

## 1. Lo que YA está hecho (en el código, PR #73)

- **`src/lib/yolo/homography.ts`** — DLT con **normalización de Hartley** (antes el
  DLT sin normalizar tenía error de reproyección de varios px aun con datos
  exactos). RANSAC corregido (bug de reproyección con `Hinv`) y refinamiento seguro
  (4 inliers más separados, solo si no empeora). Mejora la calibración de toda la app.
- **`src/lib/yolo/fieldRegistration.ts`** — plantilla de 27 landmarks (FIFA 105×68),
  `registerFieldFromLandmarks(detecciones)` → homografía + **score de confianza**
  (`classifyCalibration`), `metricsTrustworthy()` (**el gate**), y
  `FieldRegistrationAccumulator` (acumula landmarks entre frames; cámara fija → H
  estable).
- **`src/lib/yolo/fieldModelConfig.ts`** — registry plug-and-play del modelo ONNX de
  keypoints (default `none` → la app sigue con calibración manual).
- **`TrackingSnapshotPanel` + `TrackingSnapshot.calibrationConfidence`** — el panel
  muestra un **aviso honesto** cuando la sesión no está calibrada (métricas físicas
  orientativas). Backward-compatible: los snapshots antiguos (sin el campo) muestran
  el aviso.
- Tests: `src/test/lib/yolo/fieldRegistration.test.ts` (campo sintético; verifica
  recuperación de H, confianza y robustez a ruido/outliers).

**El contrato clave:** un modelo de keypoints debe emitir los 27 landmarks en el
**mismo orden de `id`** que `FIELD_TEMPLATE`. Nada más hay que tocar en el pipeline.

---

## 2. Fase 2 — conseguir el modelo de keypoints (necesita GPU)

Dos caminos. Recomendado el A (rápido, reutiliza pesos SOTA).

### Camino A — exportar No-Bells / PnLCalib a ONNX (recomendado)

Repos SOTA con **pesos pre-entrenados en SoccerNet** (MIT):
- No-Bells-Just-Whistles: https://github.com/mguti97/No-Bells-Just-Whistles
- PnLCalib (sucesor, mejor): https://github.com/mguti97/PnLCalib

Pasos:
1. `git clone` + descargar los pesos single-view (README de cada repo).
2. Cargar el modelo de keypoints (HRNet/ResNet backbone) en PyTorch y exportar a ONNX
   con `torch.onnx.export(..., opset_version=17, input=(1,3,640,640))`. Usar el mismo
   patrón que `vision-pipeline/export_onnx.py` (Modal, GPU; `PYTHONUTF8=1` en Windows).
3. **Mapear** los keypoints de SoccerNet (su set de ~30 puntos) a nuestro
   `FIELD_TEMPLATE` (27 landmarks). Es una tabla de correspondencia `id_soccernet → id_vitas`
   (algunos puntos coinciden 1:1; los que no, se descartan o se re-entrena la última capa).
4. Cuantizar a int8 si hace falta bajar tamaño (post-benchmark), como con el pose model.

### Camino B — afinar un YOLOv8-pose de 27 keypoints (más control)

Receta Roboflow: https://blog.roboflow.com/camera-calibration-sports-computer-vision/
1. Dataset: SoccerNet-Calibration (anotado) + **footage propio de academias** anotado
   con los 27 landmarks (crucial: el dominio juvenil/amateur difiere del broadcast).
2. Entrenar `yolov8s-pose` con 27 keypoints a `FIELD_TEMPLATE` (Ultralytics, GPU).
3. Exportar a ONNX imgsz 640.

### Servir el modelo (igual que pose/ball)

1. Subir `field-keypoints.onnx` como **release asset** del repo (tag `models-v1`).
2. `scripts/download-models.mjs` (npm `prebuild`) ya baja los modelos del release a
   `public/models/` (same-origin; evita el problema de CORS de github releases). Añadir
   `field-keypoints.onnx` a esa lista.
3. Activar la config en `fieldModelConfig.ts` (`field-keypoints-v1`, poner `modelUrl`).

### Cablear al worker de tracking (integración)

En el worker de tracking (`src/workers/trackingWorker.ts`), cada
`registerEveryNFrames` (15 por defecto — la cámara es fija):
```ts
// pseudo:
const kp = await fieldSession.run(frameTensor);          // ONNX keypoints
const dets = decodeKeypoints(kp, config.numKeypoints);   // → DetectedLandmark[]
accumulator.add(dets);
const reg = accumulator.register(config);                // FieldRegistration + confianza
// usar reg.Hpix2field para convertir píxeles de jugador → metros
// propagar reg.confidence al snapshot (calibrationConfidence)
```
El resto (métricas en metros, gate en la UI) ya funciona.

---

## 3. Fase 3 — validar contra ground truth (necesita el clip)

Sin validación, "alta fiabilidad" no es una afirmación defendible. Con un clip real:

1. **Smoke test de auto-cal:** grabar 1 clip (cámara fija, líneas del campo visibles —
   ver la guía de grabación) y comprobar que `reg.confidence` sale `high/medium` y el
   error de reproyección medio es bajo (< ~5px). Si sale `low/none`, la UI ya lo
   caveatea (no miente).
2. **Error métrico:** medir una distancia conocida en el campo (p.ej. el ancho del área,
   40.32 m) proyectando dos puntos con `Hpix2field` y comparar. Objetivo: < 2-3% de error.
3. **Ideal (referencia dura):** grabar a un jugador con GPS/STATSports/Catapult en la
   misma sesión y comparar distancia total y velocidad máxima. Publicar el error esperado
   (p.ej. "±5% en distancia, ±0.3 m/s en velocidad punta") — eso convierte las métricas en
   vendibles como medición.
4. Correr el **benchmark n-vs-m + balón** ya pendiente en `CLAUDE.md` con ese clip.

Cuando 1-2 pasen, subir el umbral del gate a `high` para exponer métricas como "medidas";
mientras, `medium` se puede mostrar como "estimadas con buena calibración".

---

## 4. Lo que sube la fiabilidad AUNQUE no toques la cámara

- **Cámara fija** (trípode): el `FieldRegistrationAccumulator` acumula landmarks entre
  frames y da una H muy estable. Un paneo rompe la homografía → la guía de grabación lo
  exige y el gate lo detecta.
- **Líneas del campo visibles**: el modelo necesita ver intersecciones para calibrar.
- **Resolución ≥1080p**: keypoints más precisos.

---

## 5. Resumen de dependencias

| Paso | Recurso | ¿Sandbox? |
|---|---|---|
| Geometría + gate + tests (Fase 0/1) | — | ✅ hecho (PR #73) |
| Exportar/entrenar el modelo (Fase 2) | GPU + dataset | ❌ (Modal/Colab) |
| Servir + cablear al worker | — | ✅ (cuando exista el ONNX) |
| Validar vs ground truth (Fase 3) | Clip real (+ GPS ideal) | ❌ (footage) |
