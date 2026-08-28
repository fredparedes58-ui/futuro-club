# Pendientes de métricas — bloqueada ≠ resuelta

> Tracker canónico que exige la **invariante #8** de `CLAUDE.md` ("Bloqueada ≠ resuelta"):
> una métrica bloqueada con `gate_reason` honesto es un estado de entrega aceptable, pero
> **no** es lo mismo que resuelta. Este fichero distingue las dos y se mantiene al día.
>
> **Última actualización:** 2026-08-28 · **Rama de creación:** `docs/pendientes-metricas`
>
> Estado del arnés a fecha de hoy: el **GATE real** (pre-commit → `audit_metrics.py
> --baseline`) sale **exit 0** (deuda baselined). El audit CRUDO `audit_metrics.py` →
> **exit 1** (559 errores + 58 avisos), que es el estado **G0 esperado por diseño** — el registro
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
| ~~**Espacio / Voronoi de sesión**~~ 🟢 | `src/hooks/useTracking.ts` | **RESUELTA (G7 · #187):** media de muestras Voronoi en instantes vivos del jugador enfocado; DERIVADA orientativa o gated (nunca 0). | — |
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
- **npm vulns bajaron** de ~35 → 10 → **2 moderate** en runtime (#186 cerró el RCE crítico de protobufjs). Restan `sharp`/`@vite-pwa/assets-generator` (build-time, CVEs libvips upstream sin fix).
- **Modelo de balón dedicado ya existe** (`ball-football.onnx`, `ballModelConfig.ts:107`) — cierra el hueco de FASE 2; falta hacerlo default (desktop usa aún `yolo11s-detect` COCO genérico).

> **Mantenimiento:** actualizar este fichero cuando una métrica cambie de estado
> (p. ej. al cerrar G3/G7, o cuando entre un golden anotado). No borrar las
> resueltas — el histórico de qué se desbloqueó y cómo es parte del valor.
