# VITAS · Football Intelligence — Instrucciones para Claude Code

## Identidad del proyecto
Plataforma de análisis deportivo de fútbol con corrección de maduración biológica (PHV).
Detecta talento oculto en academias juveniles usando IA y visión computacional.
**Diferenciador único:** corrección de maduración biológica (PHV) por fórmula (Mirwald/Khamis-Roche) aplicada en toda la plataforma + etiquetado táctico con contexto PHV vía LLM sobre el tracking. La visión de producción usa modelos pose de stock (YOLOv8n/YOLOv11m); el modelo propio afinado con footage juvenil (`vitas-pose-v1`) es objetivo de Fase 3, aún sin desplegar.

## Stack técnico
- React 18.3 + TypeScript + Vite 8
- Tailwind CSS + shadcn/ui + Framer Motion + Recharts
- React Router v6 + TanStack Query v5
- vite-plugin-pwa + Workbox
- Vercel (deploy) + GitHub (repo)
- `npm install` SIEMPRE con `--legacy-peer-deps` (conflicto lovable-tagger/Vite 8)
- `.npmrc` tiene `legacy-peer-deps=true` para Vercel

## URLs importantes
- **Producción:** https://futuro-club.vercel.app
- **GitHub:** https://github.com/fredparedes58-ui/futuro-club.git
- **Local dev:** http://localhost:5200
- **Puerto exclusivo:** 5200 (no cambiar — conflicto con otros PWA instalados)

## Arquitectura de agentes (producción)
Los agentes viven en `api/agents/` y son Vercel Edge Functions:
- `PHVCalculatorAgent` — fórmula Mirwald, temperature=0
- `ScoutInsightAgent` — insights en español para ScoutFeed
- `RoleProfileAgent` — perfil táctico por jugador
- `TacticalLabelAgent` — etiquetado PHV/táctico para video (Fase 2)
La API key vive en Vercel env vars como `ANTHROPIC_API_KEY`. NUNCA en el código.

## Servicios deterministas (sin IA)
Viven en `src/services/real/`:
- `StorageService` — localStorage tipado con prefijo `vitas_`
- `MetricsService` — cálculo VSI, percentiles, tendencias
- `PlayerService` — CRUD jugadores + seed inicial 6 jugadores
- `adapters.ts` — mapeo entre formatos de agente y componentes UI

## Regla de fallback
Todos los servicios que usan IA tienen fallback automático a mock data.
Si `AgentService` falla → datos mock. La app NUNCA se rompe por falta de API key.

## Fases de desarrollo (estado real, ago 2026)
Las fases originales se solaparon. Estado actual honesto:
- **Datos/Auth:** Supabase + Auth + Stripe YA cableados (RLS multi-tenant,
  ProtectedRoute, webhooks Modal/Stripe, tripwire de presupuesto). PERO la regla
  de fallback sigue intacta: sin Supabase configurado la app degrada a
  localStorage/mock y NO se rompe.
- **Vídeo:** upload (Bunny) + pipeline (tracking cliente onnxruntime + eventos +
  PHV, y Modal async) operativos; validación de precisión con clip real pendiente.
- **Modelo propio:** producción usa pose de stock (YOLOv8n/v11m); `vitas-pose-v1`
  afinado con footage juvenil sigue SIN desplegar (objetivo futuro).
- **Identidad por dorsal:** diseñada pero NO construida ni validada (sin ground
  truth humano) → el sistema abstiene (pistas anónimas), no atribuye por jugador.

## Agentes de desarrollo disponibles
Ver `.claude/agents/` para los agentes especializados por fase y área.
Cada agente tiene un contrato estricto: input → tarea específica → output verificable.

## Comandos frecuentes
```bash
npm run dev          # desarrollo local puerto 5200
npm run build        # build producción
npx vercel --prod --yes  # deploy a producción
git push origin main # auto-deploy en Vercel
```

## Reglas importantes
1. Nunca cambiar el puerto 5200
2. Siempre `--legacy-peer-deps` en npm install
3. API keys solo en Vercel env vars, nunca en código
4. Cada módulo nuevo necesita fallback a mock data
5. Commits siempre en inglés con Co-Authored-By Claude

## Vision Pipeline
Hallazgos FASE 0-1 (branch `fix/vision-pipeline`, 2026-07):
- La visión de PRODUCCIÓN corre en el navegador (onnxruntime-web + Web Workers), NO en Modal. Modal (`vision-pipeline/app.py`) está desplegado pero huérfano — ningún caller en la UI.
- `*.onnx` está gitignored (`.gitignore:24-25`) → `/models/` da 404 en prod. Los modelos se sirven como **GitHub Release assets del propio repo** (tag `models-v1`): yolov8n-pose (13MB) y yolov11m-pose (84MB FP32, opset 17, imgsz 640). Antes producción dependía de un repo de terceros (akbartus) para el nano.
- Selección de modelo: registry en `src/lib/yolo/modelConfig.ts` — default por dispositivo (desktop → yolov11m-pose, móvil → yolov8n-pose), override manual en localStorage `vitas_active_model`. `useTracking.ts` carga del registry (antes hardcodeaba nano). Cadena de fallback del worker: pedido → nano local (dev) → release nano propio.
- Compatibilidad: v8n-pose y v11m-pose comparten contrato de salida `[1,56,8400]`; el worker usa `inputNames[0]`/`outputNames[0]` dinámicos.
- Export reproducible: `modal run vision-pipeline/export_onnx.py` (torch local no viable en Py3.14; recuerda PYTHONUTF8=1 en Windows). El PWA NO precachea los .onnx (límite 2MB de Workbox) — precache se mantiene en ~5.3MB.
- Modal parametrizado: `YOLO_MODEL` env (default yolo11m) + fp16 en `track()`.
- Homografía px→m YA existe y está testeada (`src/lib/yolo/homography.ts` + RANSAC + `homographyVoronoi.test.ts`); métricas físicas ya en metros. Balón = heurística sobre el pose model (`ballModelConfig.ts` modo "heuristic"); detector dedicado `yolov8s-football` es el hueco real (FASE 2).
- FASE 2 (balón dedicado): el ball worker ahora corre inferencia standalone con `yolo11s-detect.onnx` (COCO detect, clase 32 = sports ball, 37.9MB) en desktop; móvil mantiene la heurística. Config en `ballModelConfig.ts` (`yolo11s-detect`, umbral 0.15), default por dispositivo con override en localStorage `vitas_ball_config`. `useTracking.onFrame` alimenta imageData con stride 2 (el Kalman de `ballTracker` predice los gaps). La heurística anterior era esencialmente no funcional (buscaba "personas pequeñas" en el modelo de pose, que no tiene clase balón).
- **CORS gotcha (verificado en navegador):** `github.com/releases/download/...` responde 302 SIN cabeceras CORS → fetch desde navegador falla. `raw.githubusercontent.com` sí sirve CORS `*` (pero solo ficheros del git). Solución: `scripts/download-models.mjs` (npm `prebuild`) baja los 3 modelos del release `models-v1` a `public/models/` en cada build → Vercel los sirve same-origin. Best-effort: si falla, el build sigue y los workers caen al fallback.
- PENDIENTE: benchmark n vs m + balón con clip real (necesita URL pública de vídeo); int8 (~21MB) post-benchmark; FASE 3 pose server (baja prioridad — pose ya existe client-side); decisión producto sobre Modal (cablear a UI para partidos largos o retirar).

## Report Pipeline
Hallazgos FASE 0 (branch `fix/report-pipeline`, 2026-07-06):
- `AnalysisDashboard.tsx` renderiza TODOS los reportes con un único `ReportRenderer` genérico (`AnalysisDashboard.tsx:269,291`). `REPORT_META` (`:62-67`) solo conoce 6 tipos: player-report, lab-biomechanics, dna-profile, best-match, projection, development-plan.
- `ReportRenderer` (`:338-479`) solo mapea title/summary/strengths/concerns/recommendations/next_focus/blocks/metrics_table/pillars/best-match → el resto cae al fallback JSON (`:472`). Campos ricos que se pierden: `phv_summary`/`honesty_note` (`_player-report.ts:72,81`), `scenarios`/`phv_consideration` (`_projection-report.ts:67,69`), `drills[]` (`_development-plan.ts:76`), `caveat` (`_best-match-narrator.ts:59`), y la confianza de `_role-profile.ts:74-76` / `_burnout-report.ts:54` / `_player-similarity.ts:307,340`.
- Bugs confirmados: adapter DNA lee `playing_style` pero agente emite `primary_style` (`usePlayerAnalysisV2.ts:603-606` vs `_dna-profile.ts:71`) → siempre defaults; injury-report ejecuta `claude-sonnet-4-20250514` pese a documentar Haiku (`_injury-risk-report.ts:143,170,9`); valuation lanza 502 en vez de fallback (`_valuation-report.ts:160`); salida LLM con `JSON.parse` crudo en team-report:121 / rival-scout:143 / coaching-assistant:175 / valuation:171.
- Sin PHV: team-intelligence, tactical-pattern, rival-scout. Ningún agente acepta `locale` (reportes solo en español).
- Regla del fix: FASE 3 aditiva (mantener `ReportRenderer` como fallback, nunca borrar); campos nuevos de schema opcionales; `locale` default `es`.

---

<!-- ↓ Añadido desde el arnés de procedencia de métricas (goal vitas, 2026-08-11).
     Los invariantes de abajo son DUROS y aplican a TODA sesión sobre este repo.
     El contexto técnico de VITAS se conserva arriba; esto lo COMPLEMENTA, no lo reemplaza. -->

# Vitas — Invariantes

Producto de scouting y desarrollo de futbolistas **menores de edad**. Las cifras que
emite este sistema informan decisiones sobre carga de entrenamiento, selección y
comunicación con familias. Una cifra equivocada no es un bug de UI: es una decisión
equivocada sobre un niño.

Estos invariantes aplican a **toda** sesión de trabajo sobre este repo, sin excepción
y sin importar qué goal esté activo.

## 1. Ningún número sin procedencia

Toda métrica que llega a la UI es un `MetricResult` con `provenance` declarada.
Un número desnudo (`number` suelto) en una ruta de cálculo o en un componente es
un defecto, no un atajo.

Procedencias válidas, y solo estas:
`MEDIDA` · `DERIVADA` · `ESTIMADA_LLM` · `CONSTANTE` · `MOCK`

`MEDIDA` exige trazabilidad a un sensor, una antropometría introducida por una
persona, o píxeles con calibración válida. Si no hay calibración, no es `MEDIDA`.

Ver `.claude/rules/metricas.md` para el contrato completo.

## 2. Ante dato ausente se bloquea, nunca se estima

Cuando falta el dato, `value = null` + `gate_reason`. Nunca:

- un `0` que en realidad significa «no se pudo medir»
- un valor por defecto, una media, o el valor más probable
- una constante que rellene el hueco para que el compuesto se pueda calcular
- una heurística nueva inventada para tapar la ausencia

Un hueco visible es el resultado correcto. Taparlo es el fallo que esta base de
código ya cometió una vez.

## 3. Abstenerse es un resultado válido

Aplica a identidad por dorsal, a duelos, a VSI y a cualquier módulo con umbral de
confianza. Cobertura baja con precisión alta es un sistema que funciona. Cobertura
alta con precisión baja es un sistema que miente.

**Nunca** se relaja un umbral de precisión para ganar cobertura.

## 4. PHV y bio-banding no se tocan

Son los únicos módulos que hoy aguantan escrutinio externo. Ninguna tarea de
remediación tiene permiso para modificar:

- las ecuaciones de Mirwald ni sus offsets
- el cálculo de %PAH ni sus gates
- los datos de referencia ni los valores golden asociados

Si un cambio altera un valor de PHV o bio-banding en cualquier punto, ese cambio
está mal y se revierte. No se «actualiza el golden para que pase».

Excepción única: G6 (Escudo de Estirón) corrige la selección de entrada
—medida sobre estimada— y la fórmula por sexo. Eso corrige *qué entra* en el
módulo, no el módulo.

## 5. Fórmula por sexo, nunca por defecto

A una jugadora no se le aplica la fórmula masculina. Si falta el sexo registrado,
el resultado se bloquea pidiendo el dato. No se infiere el sexo de ningún otro
campo.

## 6. Identidad: dorsal, nunca cara

El reconocimiento facial de menores es dato biométrico bajo el RGPD. La capa de
identidad se construye sobre **dorsal** y color de equipación. Esta frontera no se
cruza aunque el reconocimiento facial resolviera un problema de cobertura.

Ver `.claude/rules/identidad.md`.

## 7. Una sola implementación por concepto

Si un concepto se calcula en dos sitios, tarde o temprano dan números distintos.
Ya ocurrió con duelos: tres rutas, tres números. Antes de añadir un cálculo, se
busca si ya existe.

## 8. Bloqueada ≠ resuelta

Una métrica bloqueada con `gate_reason` honesto es un estado aceptable de entrega.
No es lo mismo que resuelta. `docs/pendientes-metricas.md` distingue los dos y se
mantiene al día.

---

## Orientación de trabajo

- El plan completo de remediación vive en `docs/remediacion-metricas.md`.
- Una sesión = un goal. No arrastrar contexto entre goals.
- Tope de 5 intentos por subproblema. Al quinto: bloquear, documentar en
  `docs/pendientes-metricas.md`, seguir. Insistir más allá de 5 es señal de que la
  capacidad no existe todavía.
- `python scripts/audit_metrics.py` debe salir 0 antes de cualquier commit.
