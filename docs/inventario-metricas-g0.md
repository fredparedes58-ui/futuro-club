# G0 — Inventario de procedencia de métricas (VITAS)

> **Estado:** G0 completado 2026-08-11. Inventario honesto + registro `config/metrics.json`
> + audit ejecutado (**exit 1**, como exige G0: rojo = inventario honesto).
> **NO se tocó ninguna lógica de cálculo, etiqueta de UI ni componente.**
> Checkpoint resumible: si G0 se interrumpe, continuar desde este fichero + `config/metrics.json`.

## 1. Tabla de inventario

Procedencia clasificada en exactamente una de: MEDIDA · DERIVADA · ESTIMADA_LLM · CONSTANTE · MOCK.
«Coincide» = la etiqueta/presentación actual de la UI concuerda con la procedencia real.

| Métrica | Ruta de cálculo (fichero) | Procedencia | Etiqueta UI hoy | ¿Coincide? |
|---|---|---|---|---|
| PHV — APHV | src/lib/phv/mirwald.ts | DERIVADA | edad PHV (gated) | ✅ sí |
| PHV — maturity offset | src/lib/phv/mirwald.ts | DERIVADA | offset (gated) | ✅ sí |
| %PAH / bio-banding | src/lib/phv/khamisRoche.ts | DERIVADA | %talla adulta (gated) | ✅ sí |
| Escudo de Estirón | src/hooks/usePHVProduct.ts | DERIVADA | riesgo estirón | ⚠️ entradas mal (pierna estimada; sexo→'M') |
| VSI ficha | src/services/real/metricsService.ts | DERIVADA (sobre input SUBJETIVO) | "VSI" cifra dura | ❌ inputs son sliders del coach, no medida |
| VSI vídeo (compuesto) | api/agents/_vsi-calculator.ts | DERIVADA (2/5 real) | "VSI" | ❌ 3/5 sub-scores constantes |
| VSI vídeo — técnica | api/agents/_pipeline-orchestrator.ts | CONSTANTE (65) | radar/barra | ❌ constante presentada como score |
| VSI vídeo — mental | api/agents/_pipeline-orchestrator.ts | CONSTANTE (60) | radar/barra | ❌ |
| VSI vídeo — táctica | api/agents/_pipeline-orchestrator.ts | CONSTANTE (55) | radar/barra | ❌ |
| VSI vídeo — físico | api/agents/video-observation.ts | ESTIMADA_LLM | radar/barra | ❌ "físico" pero lo estima el LLM |
| VSI vídeo — proyección | api/agents/_pipeline-orchestrator.ts | DERIVADA (o 70 fijo) | radar/barra | ⚠️ cae a constante si no hay anthro |
| Velocidad máx | src/lib/yolo/tracker.ts | DERIVADA | km/h + caveat "orientativas" | ❌ bug: último frame ≠ pico; sin calibración |
| Velocidad media | src/lib/yolo/tracker.ts | DERIVADA | km/h + caveat | ❌ es la del último frame, no media |
| Distancia | src/lib/yolo/tracker.ts | DERIVADA | m + caveat | ⚠️ acumula bien pero orientativa |
| Sprints | src/lib/yolo/tracker.ts | DERIVADA | nº sprints | ❌ cuenta frames, no eventos |
| Duelos G/P (tracking) | src/hooks/useTracking.ts + poseAnalyzer.ts | CONSTANTE (siempre 0) | "0G/0P" | ❌ 0 = "no medido", ROTO (winnerId null) |
| Duelos (EventEngine) | src/lib/tracking/eventDetectionEngine.ts | DERIVADA (heurística) | chips eventos | ❌ 2ª ruta, criterio propio |
| Duelos (Gemini) | api/agents/video-observation.ts | ESTIMADA_LLM | "duelos ganados" | ❌ 3ª ruta, dice ganados siendo IA |
| Pases compl/fall | api/agents/video-observation.ts | ESTIMADA_LLM | "Datos cuantitativos MEDIDOS" | ❌ lo estima el LLM |
| Precisión pases % | src/services/real/matchStatsService.ts | ESTIMADA_LLM | % + rating Élite | ❌ cociente de estimaciones |
| Posesión % | api/agents/team-observation.ts | ESTIMADA_LLM | "Posesión 55%" | ❌ estimación a ojo del LLM |
| Espacio (Voronoi) | src/lib/yolo/voronoi.ts | DERIVADA | "0 m²" en resumen | ❌ 0 = "no calculado" |
| Escaneos | src/lib/yolo/poseAnalyzer.ts | DERIVADA | nº escaneos | ⚠️ proxy no validado; sin gate de identidad |
| Radar Retención (ROI €) | src/lib/retention/dropoutScore.ts | MOCK (hash de id) | € + "en riesgo", sin banner | ❌ SINTÉTICO presentado como real |
| Bienestar del hijo | src/hooks/useWellbeing.ts | MOCK | disfrute/tendencia sin banner | ❌ mock sin banner en /family/:id |

## 2. Constantes numéricas literales en rutas de cálculo (LIT001)

**541 literales** en rutas con provenance DERIVADA (salida completa en el audit).
Categorías principales:
- **Mirwald/Khamis** (`src/lib/phv/*.ts`): coeficientes de la fórmula (−9.236, 0.0002708, …). Inv.4: NO se tocan; van a `config/` **con cita**, sin alterar valor.
- **Tracker** (`src/lib/yolo/tracker.ts`): umbrales físicos (5.83 m/s sprint, 12.5 clamp, 1.8 duelo, 0.35 EMA…) → a `config/` con procedencia (G2).
- **metricsService**: pesos del VSI ficha (0.22, 0.20…) → a `config/` (G4).

## 3. Conceptos calculados en más de una ruta (DUP001)

- **`eventos.duelos`** → **3 implementaciones**: `src/hooks/useTracking.ts`+`poseAnalyzer.ts` (tracking, siempre 0), `src/lib/tracking/eventDetectionEngine.ts` (heurística), `api/agents/video-observation.ts` (Gemini). *«Un concepto, tres números.»* → G3 reduce a una o ninguna.

## 4. Resultado del audit (G0)

`python scripts/audit_metrics.py` → **exit 1** · 25 métricas · **543 errores, 66 avisos**.
Desglose: LIT001 ×541 · DUP001 ×1 · CONST001 ×1 (duelos_tracking) · ORPH001 ×66 (avisos).

## 5. ⚠️ Gaps del propio arnés descubiertos en G0 (endurecer en goal posterior)

El audit **NO** cazó dos de las tres mentiras estrella:
1. **SYN001 no matchea `hash32`.** El Radar de Retención usa `hash32(playerId)`; el patrón busca `hash(` / `mulberry32` / `xorshift`. → Añadir `hash\d*\(` y `seededFactors`/`hash32` al patrón.
2. **UI001 no ve el literal en i18n.** "Datos cuantitativos medidos" vive en `src/i18n/es.json` (clave), no en el `.tsx`. → El audit debe escanear también `es.json`/`en.json` para los literales prohibidos.

Ambos son cambios en `scripts/audit_metrics.py` (fuera del alcance de G0, que no reescribe el script) — anotar para el goal de endurecimiento del arnés.

## 6. Reales y gated hoy (NO tocar en la remediación)
Rankings, Master, Director (métricas de negocio), Live Hub, Fixtures, ScoutFeed, PeerBenchmark, y PHV/bio-banding (inv.4).
