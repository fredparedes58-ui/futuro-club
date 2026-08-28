# Pendientes de métricas — bloqueada ≠ resuelta

> Tracker canónico que exige la **invariante #8** de `CLAUDE.md` ("Bloqueada ≠ resuelta"):
> una métrica bloqueada con `gate_reason` honesto es un estado de entrega aceptable, pero
> **no** es lo mismo que resuelta. Este fichero distingue las dos y se mantiene al día.
>
> **Última actualización:** 2026-08-28 · **Rama de creación:** `docs/pendientes-metricas`
>
> Estado del arnés a fecha de hoy: `python scripts/audit_metrics.py` → **exit 1**
> (559 errores + 69 avisos). Es el estado **G0 esperado por diseño** — el registro
> `config/metrics.json` documenta que el audit DEBE salir 1 hasta ejecutar la
> remediación G1–G10 (marca las mentiras existentes). `config/metrics.json` tiene
> **26 métricas** declaradas y **0 con `provenance: MEDIDA`** (nada en la plataforma
> califica hoy como medido/calibrado — es un hecho honesto, no un bug del arnés).

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
| **Espacio / Voronoi de sesión** | `src/hooks/useTracking.ts:723` | El cálculo Voronoi solo corre **en vivo**; no se traslada al resumen (G7). | CÓDIGO (cablear resumen o dejar gated) |
| **VSI-vídeo compuesto** | `api/agents/_pipeline-orchestrator.ts:261` (`gateVsiComposite`) | Bloqueado si <4/5 dims reales. Técnica/mental/táctica son `CONSTANTE(null)` → siempre 2/5 reales (physical+projection) → compuesto SIEMPRE bloqueado. Proyección y best-match se **omiten** en consecuencia. | Depende de que la VISIÓN mida técnica/mental/táctica (hueco permanente hoy) |
| **VSI-vídeo sub-scores técnica/mental/táctica** | `_pipeline-orchestrator.ts:244-260` (`buildVsiSubscores`) | `CONSTANTE value:null` por diseño: el pipeline de visión no los mide. Bloqueo honesto. | VALIDACIÓN + modelo que los mida (largo plazo) |

## 2. Métricas 🟡 ORIENTATIVAS (se muestran, pero NO son `MEDIDA`)

| Métrica | Dónde | Estado | Para ascender a `MEDIDA` |
|---|---|---|---|
| **Velocidad máx/media, distancia, sprints, accel** | `src/hooks/useTracking.ts:718-731` (`calibrated:false`, conf. 0.4) | Los bugs de cálculo YA arreglados (máx = p95 `:661`, sprints = `countSprintEvents` `:668`). Pero sin calibración de campo son **píxeles reescalados**, no metros/km-h fiables. | VALIDACIÓN: clip con calibración conocida (`fixtures/golden/calibracion.json`, hoy plantilla vacía) |
| **Escaneos (focus)** | `src/hooks/useTracking.ts:729` | Proxy sin validar; gated si el jugador no tiene frames cercanos. | VALIDACIÓN contra golden anotado |

## 3. Métricas 🟠 MOCK con banner

| Métrica | Dónde | Estado |
|---|---|---|
| **Bienestar / Wellbeing** (`/family/:id`) | `src/hooks/useWellbeing.ts:140` | MOCK+banner. Inputs manuales YA cableados (cuestionario/asistencia/engagement, PRs #167/#170); falta **que alguien introduzca datos**. |
| **Radar de Retención** (`/director`) | `src/components/retention/RetentionRadarCard.tsx:66` | DemoDataBanner; **ROI en euros YA retirado** (`:113`, la cifra de mayor riesgo comercial). El riesgo subyacente sigue siendo hash del id (`src/lib/retention/dropoutScore.ts:57`) tras el banner y sin euros. Real solo con señales reales. |

## 4. Métricas 🟢 RESUELTAS (honestas, no bloqueadas)

- **PHV / bio-banding** — `DERIVADA` gated; intactas (invariante #4, NO tocar).
- **G6 Escudo de Estirón** — sexo obligatorio sin default `'M'` (`usePHVProduct.ts:60-73`, PRs #136-138); bloquea si faltan sitting/leg (más estricto que medido-sobre-estimado). *Falta: test explícito medido-vs-estimado + decisión sobre jugadores legacy guardados como `'M'`.*
- **VSI-ficha** — reetiquetado "evaluación del entrenador" (`metricsService.ts:61`), nullable (kill-58 #146); no evaluados excluidos de medias/percentiles/tiers (#150-152).
- **Pases / precisión / posesión** — reetiquetados `ESTIMADA_LLM` (`src/services/real/matchStatsService.ts:395`); ya no "datos cuantitativos medidos".
- **Contrato `MetricResult`** — fundación (`src/lib/metrics/MetricResult.ts`, factory con 5 invariantes que lanzan), migrada en tracking/matchStats/poseEligibility. **NO universal** (ver §5-B).

---

## 5. Trabajo pendiente por categoría

### A) DATOS / VALIDACIÓN HUMANA — el cuello de botella real (no lo arregla código)

- [ ] **Ground truth de identidad** — `fixtures/identidad/` (hoy solo `_plantilla`): ≥3 clips de ~60s anotados a mano (cámara fija + móvil + ≥1 en malas condiciones), fila por `(frame, track_id, dorsal, equipo, legible)` + convocatoria cerrada. Define el techo físico de cobertura; sin él la capa de identidad por dorsal **no se puede construir ni validar** (≥98% precisión) → el sistema seguirá abstiéndose (pistas anónimas).
- [ ] **Golden de físicas/duelos** — `fixtures/golden/` (vacío): `calibracion.json` (≥4 puntos medidos), `distancia_gt` (GPS/EPTS o cinta), `duelos_gt.csv`, `vsi_gt`. Sin verdad medida no se validan distancia/velocidad (homografía), duelos ni VSI.
- [ ] **Datos reales de bienestar/retención** — introducir cuestionario/asistencia/engagement por jugador (input ya cableado).
- [ ] **Clip real (idealmente público)** para benchmark de tracking (BoT-SORT vs ByteTrack, pose n vs m, balón, homografía px→m).

### B) CÓDIGO PENDIENTE (lo ejecuta el equipo dev)

- [ ] **Llevar `audit_metrics.py` a verde** (fin de G1): migrar rutas de cálculo restantes a `MetricResult` y mover literales a `config/` con procedencia. Hoy exit 1 · 559 err. De los 557 `LIT001`, **~310 son coeficientes de fórmula PHV/bio-banding** (`khamisRoche.ts` 266 + `mirwald.ts` 44) → invariante #4: **relocalizar a config con cita, NO editar**; ~247 son deuda real (tracking/duelos/vsi).
- [ ] **Bug del audit (Windows)**: el check `ORPH001` compara rutas con `/` (registro) vs `\` (escáner) → **17 falsos positivos** (khamisRoche, mirwald, tracker, useTracking, poseAnalyzer…). *(tarea #2 en curso)*
- [ ] **Unificar duelos** (`DUP001`: 3-4 rutas — tracking/eventengine/gemini, invariante #7) + **desconectar de la UI** `duelos_tracking` (`CONSTANTE`, `winnerId` siempre null → pinta "0G/0P" que significa "no medido", `TrackingMetricsPanel.tsx`). *(tarea #2 en curso)*
- [ ] **Voronoi de sesión (G7)**: cablear reutilizando el cálculo en vivo, o dejar gated si el resumen no tiene posiciones.
- [ ] **Encender `allowAsync` en la UI** (partidos largos): ruta async lista y testeada, sin caller.
- [ ] **`npm audit fix`**: 10 vulns runtime, **1 CRÍTICA** (protobufjs, RCE). *(tarea #3)*
- [ ] **52 ficheros fuera del contrato** (`ORPH001` reales, tras descontar los 17 falsos positivos): transfer/`matchScorer.ts`, wellbeing/`dropoutRiskScorer`, etc. → emiten cifras sobre menores sin `MetricResult`.
- [ ] **`vitas-pose-v1`** (modelo propio): depende de V6 (eval CV con ground truth) + dataset etiquetado versionado con frames/bboxes.

### C) OPERATIVO / DEPLOY — acción del USUARIO (dashboards/claves, sin código)

- [ ] **Activar `custom_access_token_hook`** en el panel Supabase (Authentication → Hooks → Enable) tras la migración 057. **⚠ Lo más crítico**: sin esto `tenant_id` raíz = `NULL` y **toda la RLS multi-tenant de datos de menores queda inerte**. Verificar con `node scripts/diag-jwt-tenant.mjs`.
- [ ] **Verificar/aplicar migraciones 052–059** en prod (`tloadypygzqyfefanrza`): 054 (ledger budget), 055 (RLS táctica owner), 056/058 (género sin default), 057 (hook JWT), 059 (VSI nullable).
- [ ] **Rotar 8 credenciales** (Anthropic, Voyage, Bunny, Supabase service_role, Modal AUTH, Bunny webhook secret, `CRON_SECRET`, `INTERNAL_API_TOKEN`) → actualizar env Vercel + secrets Modal + borrar `.env` locales. Bloquea antes de: firma academia / demo inversor con datos reales.
- [ ] **Hard-caps de gasto**: `GLOBAL_MONTHLY_BUDGET_USD` en Vercel + topes duros en dashboards de **Modal** y **Anthropic** (el tripwire en código es *fail-open* — el hard-cap del proveedor es el backstop real).
- [ ] **`MODAL_TRACK_URL` + `MODAL_API_KEY`** (+ `MODAL_TRACK_ASYNC_URL` + `MODAL_CALLBACK_SECRET`) en Vercel; sin ellas el tracking degrada a mock/cliente.
- [ ] **Stripe** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs), **VAPID** (push), **Resend** (emails RGPD), **Telegram** (`TELEGRAM_BOT_TOKEN` + webhook) — hoy en modo demo/inertes.

---

## Notas de estado (correcciones a documentación previa)

- **Modal ya NO está huérfano** (la nota de `CLAUDE.md` es obsoleta): desplegado (roadmap V1/V2 ✅) y cableado a UI (`useTacticalHeatmap.ts:187`, `videoTrackingService.ts:184`).
- **npm vulns bajaron** de ~35 a 10 en runtime.
- **Modelo de balón dedicado ya existe** (`ball-football.onnx`, `ballModelConfig.ts:107`) — cierra el hueco de FASE 2; falta hacerlo default (desktop usa aún `yolo11s-detect` COCO genérico).

> **Mantenimiento:** actualizar este fichero cuando una métrica cambie de estado
> (p. ej. al cerrar G3/G7, o cuando entre un golden anotado). No borrar las
> resueltas — el histórico de qué se desbloqueó y cómo es parte del valor.
