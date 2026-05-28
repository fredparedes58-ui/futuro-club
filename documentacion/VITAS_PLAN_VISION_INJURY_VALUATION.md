# VITAS · Plan Estratégico: Vision-Only Scouting + Injury Prediction + Valoración Predictiva

> Documento de contexto y sprints para evaluación del equipo técnico.
> Fecha: 2026-05-28 · Autor: Pedro Paredes + Claude Opus
> **Rev 2 (2026-05-28): Corregido con auditoría completa del código existente. Eliminados gaps, duplicaciones y supuestos incorrectos.**

---

## 1. CONTEXTO: ¿Dónde estamos hoy?

### Sprints completados (0-8 + Fase 3 SaaS)

| Sprint | Contenido | Estado |
|--------|-----------|--------|
| 0 | Core: PHV Calculator, VSI Model, 6 jugadores seed | Producción |
| 1 | ScoutFeed, RoleProfile, PlayerProfile | Producción |
| 2 | Video Upload + Bunny CDN | Producción |
| 3 | Tracking: YOLO + ByteTrack + EventDetection (35 tipos) | Producción |
| 4 | Re-ID: Dorsal OCR + Team Color + Identity Persistence | Producción |
| 5 | Auto Homography: RANSAC + FIFA template matching | Producción |
| 6 | xG Model: logistic regression + PHV adjustment | Producción |
| 7 | Pipeline Orchestrator: 7 reportes + fatigue detection | Producción |
| 8 | Team/Rival Analysis: formaciones + pass networks | Producción |
| F3 | SaaS sin Stripe: quotas, admin plans, team invites, UX gates | Producción |

### Capacidades ya construidas (inventario verificado del código)

| Capacidad | Archivos clave | Estado | Relevancia para las 3 capas |
|-----------|---------------|--------|------------------------------|
| **PHV Calculator** | `api/agents/_phv-calculator.ts` (Mirwald, determinista) | Producción | Eje transversal de las 3 capas |
| **VSI Scoring** | `src/lib/scoring/vsiScoringModel.ts` (5 dimensiones, PHV-corregido) | Producción | Input para Valoración |
| **16 agentes IA** | `api/agents/` (Claude Sonnet/Haiku + Gemini) | Producción | Base para injury/valuation reports |
| **Pipeline Orchestrator** | `api/agents/_pipeline-orchestrator.ts` — 7 reportes en paralelo | Producción | **Se extiende** para injury + valuation |
| **YOLO + ByteTrack** | `src/lib/yolo/` — tracker, kalmanLite, colorReId, homography | Producción | Vision-Only engine |
| **Pose Estimation** | `src/lib/mediapipe/` — mediaPipeService, keypointMapper | Producción | Biomecánica → Injury |
| **Biomechanics Engine** | `src/lib/mediapipe/biomechanicsEngine.ts` — `injuryRisk` (0-100) + `asymmetryPct` + 5 dimensiones | Producción | **Semilla directa** del modelo de lesiones |
| **Event Detection Engine** | `src/lib/tracking/eventDetectionEngine.ts` — 35 tipos + SPADL export + `vaepApprox` | Producción | **Base** para vision-metrics extraction |
| **Fatigue Engine + ACWR** | `src/lib/fatigue/` — EWMA dual (7d/28d), zones PHV-adjusted, decay metrics | Producción | **60% del modelo de lesiones ya existe** |
| **Fatigue Sessions (DB)** | `supabase/migrations/043_fatigue_sessions.sql` — acwr_value, window_metrics, posture_signals | Producción | Carga longitudinal ya persistida |
| **FatiguePanel** | `src/components/FatiguePanel.tsx` — gauge, ACWR, decay 1st/2nd half, alerts | Producción | UI base para injury dashboard |
| **xG Accumulator** | `src/lib/xg/xgAccumulator.ts` — PHV-adjusted xG, shot timeline | Producción | Input para Valoración |
| **Homography + Voronoi** | `src/lib/yolo/homography.ts` — coordenadas reales FIFA 105×68m | Producción | Distancias y velocidades reales |
| **Player Evolution Page** | `src/pages/PlayerEvolutionPage.tsx` — 6 dimensiones longitudinales | Producción | **Se extiende** para injury/valuation trends |
| **Parent Dashboard** | `src/pages/ParentDashboardPage.tsx` — VSI, PHV, badges, sharing | Producción | **Se extiende** con estado físico |
| **SaaS Feature Gating** | `usePlan` + `usageGuard` — feature flags por plan | Producción | Injury/Valuation gateados por plan |
| **42 migraciones Supabase** | Anthropometrics, tracking sessions, live matches, pgvector | Definidas | Infraestructura DB existente |

### Lo que YA tenemos que es fundacional (verificado en código)

1. **Fatigue Engine ya calcula ACWR con EWMA dual** — acute (7d, λ=0.25) y chronic (28d, λ=0.069). Zones PHV-adjusted. Gap normalization para días sin sesión. **Esto es >60% del modelo de carga para injury prediction.**
2. **Biomechanics Engine ya calcula `injuryRisk` (0-100) y `asymmetryPct`** — basado en ángulos articulares, simetría bilateral, y estabilidad de rango.
3. **Event Detection Engine detecta 35 tipos de eventos** con export SPADL y `vaepApprox`. Es la base natural para vision-metrics.
4. **Pipeline Orchestrator es extensible** — agregar `injury-risk-report` o `valuation-report` es literalmente una línea en el array `PLAYER_REPORT_AGENTS`.
5. **`fatigue_sessions` table ya persiste** ACWR, fatigue index, decay metrics, posture signals, PHV context por sesión.
6. **Player Evolution Page ya muestra tendencias** de 6 dimensiones — extenderla para ACWR/injury/valuation es natural.
7. **Feature flags SaaS ya existen** — `injuryPrediction` y `valuation` se agregan al mismo patrón `PlanLimits`.

---

## 2. VISIÓN: Las 3 capas sobre la misma pipeline

```
                    ┌─────────────────────────┐
                    │      VIDEO CRUDO         │
                    │   (celular / cámara)     │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   VISION-ONLY ENGINE     │  ← CAPA 1
                    │  (ya construido ~80%)     │
                    │                          │
                    │  YOLO v11 → ByteTrack    │ ← existe
                    │  MediaPipe → Biomechanics│ ← existe
                    │  Homography → Field Map  │ ← existe
                    │  EventDetection → 35 evt │ ← existe
                    │  Gemini → Event Timeline │ ← existe
                    │                          │
                    │  NUEVO: Orquestador      │
                    │  unificado client-side    │
                    └────────────┬────────────┘
                                 │
                    genera automáticamente:
                    ├── métricas técnicas (pases, duelos, tiros) ← eventDetectionEngine
                    ├── tracking físico (distancia, sprints, velocidad) ← YOLO tracker
                    ├── biomecánica (ángulos, simetría, cadencia) ← biomechanicsEngine
                    ├── eventos tácticos (escaneos, presión, transiciones) ← poseAnalyzer
                    ├── carga fisiológica (fatigue index, ACWR, decay) ← fatigueEngine
                    └── contexto de partido (sistema, marcador, fase)
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
   ┌──────────▼─────────┐ ┌─────▼──────────┐ ┌────▼──────────────┐
   │  INJURY PREDICTION  │ │ VALORACIÓN     │ │ SCOUTING REPORT   │
   │     (CAPA 2)        │ │ PREDICTIVA     │ │ (ya existe)       │
   │                     │ │ (CAPA 3)       │ │                   │
   │ • ACWR ← YA EXISTE │ │ • VSI trend    │ │ • VSI + PHV       │
   │ • PHV risk windows  │ │   ← YA EXISTE  │ │ • Perfil táctico  │
   │ • Asimetría biomec. │ │ • Risk-adjust  │ │ • Comparación pro │
   │   ← YA EXISTE       │ │ • Contexto     │ │ • Recomendaciones │
   │ • Historial lesiones│ │   táctico      │ │                   │
   │ • Fatiga acumulada  │ │ • PHV maturity │ └───────────────────┘
   │   ← YA EXISTE       │ │   trajectory   │
   └─────────────────────┘ └────────────────┘
```

### Por qué son compatibles y se refuerzan

- **Vision-Only alimenta ambos modelos**: la misma pipeline de video genera métricas de carga (para lesiones) y métricas de rendimiento (para valoración)
- **PHV es el eje transversal**: la maduración biológica afecta tanto el riesgo de lesión (picos de crecimiento = ventanas de riesgo) como la proyección de valor (rendimiento "real" vs. ventaja física temporal)
- **Injury prediction mejora la valoración**: un jugador con alto riesgo de lesión tiene menor valor proyectado — el modelo de valoración consume el output del modelo de lesiones
- **Los tres comparten infraestructura**: misma pipeline de video, misma DB, mismos agentes base, mismo Pipeline Orchestrator
- **La fatigue pipeline ya conecta las 3**: `fatigueEngine` → `fatigue_sessions` → `pipeline-orchestrator.sharedContext` → reportes

---

## 3. PROPUESTA DE VALOR POR AUDIENCIA

| Audiencia | Vision-Only | Injury Prediction | Valoración Predictiva |
|-----------|-------------|-------------------|----------------------|
| **Academias** | Evaluar talento sin infraestructura costosa | Reducir lesiones en picos de crecimiento | Demostrar ROI de formación a padres |
| **Clubes profesionales** | Scouting en ligas sin cobertura de datos | Optimizar gestión de carga en cantera | Identificar talento subvalorado |
| **Padres/familias** | Ver progreso de su hijo con un video | **Estado físico y alertas de riesgo** | Entender proyección y potencial |
| **Agentes/intermediarios** | Acceso a mercados invisibles | Due diligence médica | Timing óptimo de transferencia |
| **Federaciones** | Censo nacional de talento por video | Programa de prevención en selecciones | Benchmarking generacional |

---

## 4. ARQUITECTURA TÉCNICA DETALLADA

### 4.1 Principio de diseño: EXTENDER, no duplicar

**Regla fundamental:** Cada componente nuevo se integra en la infraestructura existente. No se crean pipelines paralelas ni dashboards aislados.

| Existe | Se extiende con |
|--------|----------------|
| `Pipeline Orchestrator` (7 reportes) | +2 reportes: `injury-risk-report`, `valuation-report` |
| `PlayerEvolutionPage` (6 dimensiones) | +ACWR trend, +injury events, +valuation tier |
| `ParentDashboardPage` (VSI, badges) | +Card "Estado físico" (ACWR zone, fatigue severity) |
| `FatiguePanel` (gauge, ACWR, decay) | +Injury risk overlay, +historical ACWR chart |
| `usePlan` (feature flags) | +`canUseInjuryPrediction`, +`canUseValuation` |
| `fatigue_sessions` table | +`injury_risk_score` column |
| `EventDetectionEngine` (35 types) | +Aggregation across sessions for trends |

### 4.2 Nuevos agentes (se agregan al pipeline existente)

```
api/agents/
├── _injury-risk-calculator.ts    ← NUEVO: modelo determinista (consume ACWR + biomech existentes)
├── _injury-risk-report.ts        ← NUEVO: reporte narrativo (Claude Haiku, se agrega al orchestrator)
├── _valuation-model.ts           ← NUEVO: modelo determinista de valor
├── _valuation-report.ts          ← NUEVO: reporte para scouts (Claude Haiku, se agrega al orchestrator)
└── _progression-tracker.ts       ← NUEVO: snapshots longitudinales post-análisis
```

**NO se crea** `_vision-metrics-extractor.ts` como agente API — las métricas de visión se procesan client-side (YOLO/MediaPipe corren en el browser). Se crea un **servicio client-side** que orquesta los extractores existentes.

**NO se crea** `_load-accumulator.ts` — el ACWR ya se calcula en `acwrService.ts` con EWMA dual y se persiste en `fatigue_sessions`.

### 4.3 Contratos (Zod schemas)

```typescript
// INJURY RISK — consume datos que YA existen en el sistema
InjuryRiskInput {
  playerId, age, phvStatus, phvCategory, phvOffset,
  // ← De fatigueEngine (ya existe):
  currentACWR: number,           // acwrService.compute().value
  acwrZone: string,              // acwrService.compute().zone
  fatigueIndex: number,          // fatigueEngine output
  fatigueSeverity: string,       // fatigueEngine output
  // ← De biomechanicsEngine (ya existe):
  biomechanicsInjuryRisk: number, // biomechanicsEngine.injuryRisk
  asymmetryPct: number,           // biomechanicsEngine.asymmetryPct
  // ← NUEVO (requiere tabla player_injuries):
  injuryHistory: Array<{ type, severity, daysOut, date, bodyPart }>,
  daysSinceLastInjury: number | null,
  // ← De tracking (ya existe):
  sessionsLast28Days: number,     // fatigue_sessions count
  matchesLast7Days: number        // manual input o calendar
}

InjuryRiskOutput {
  playerId,
  overallRisk: 0-100,
  riskCategory: "low" | "moderate" | "high" | "critical",
  riskFactors: Array<{ factor, weight, score, description }>,
  acuteChronicRatio: number,     // del ACWR existente
  phvRiskMultiplier: number,     // crecimiento rápido = más riesgo
  recommendations: string[],
  returnToPlayReady: boolean,
  confidenceLevel: number,
  dataPointsUsed: number,        // transparencia sobre datos disponibles
  coldStartWarning: boolean      // true si <4 sesiones (ACWR unreliable)
}

// VALORACIÓN PREDICTIVA — consume outputs de todo el sistema
ValuationInput {
  playerId, age, position, phvCategory, phvOffset,
  currentVSI: number,                        // ← vsiScoringModel
  vsiHistory: Array<{ date, vsi }>,          // ← analyses table
  injuryRisk: number,                        // ← del modelo de injury
  eventSummary: EventSummary,                // ← eventDetectionEngine
  xgAccumulated: number,                     // ← xgAccumulator
  tacticalVersatility: number,               // posiciones que domina
  competitiveLevel: string,
  sessionsAnalyzed: number,                  // data depth indicator
  benchmarkPercentile: number                // ← benchmarkService
}

ValuationOutput {
  playerId,
  currentTier: "elite" | "advanced" | "developing" | "foundational",
  projectedTier12m: string,
  projectedTier36m: string,
  probabilityFirstDivision: number,     // % a 3 años
  probabilityProfessional: number,      // % a 5 años
  strengthIndex: number,                 // 0-100
  ceilingEstimate: number,              // 0-100
  riskAdjustedValue: number,            // ceiling * (1 - injuryRisk/200)
  keyDrivers: Array<{ factor, impact, trend }>,
  comparableProfessionals: string[],
  confidenceLevel: number,
  dataPointsUsed: number,
  coldStartWarning: boolean              // true si <3 análisis
}
```

### 4.4 Nuevas tablas Supabase

```sql
-- Historial de lesiones (GDPR: datos médicos sensibles → cifrado at-rest, RLS estricto)
CREATE TABLE player_injuries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),  -- RLS por organización
  injury_date DATE NOT NULL,
  injury_type TEXT NOT NULL,     -- 'muscular' | 'articular' | 'overuse' | 'growth_related' | 'trauma'
  body_part TEXT NOT NULL,
  severity TEXT NOT NULL,        -- 'minor' | 'moderate' | 'severe'
  days_out INT,
  mechanism TEXT,                -- 'non_contact' | 'contact' | 'overuse'
  phv_status_at_injury TEXT,
  notes TEXT,
  return_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: solo miembros de la misma org pueden ver/crear
ALTER TABLE player_injuries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_injuries" ON player_injuries
  USING (org_id IN (SELECT org_id FROM team_members WHERE member_id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM team_members WHERE member_id = auth.uid()));

-- Snapshot longitudinal de métricas (para valoración)
CREATE TABLE player_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  vsi REAL,
  phv_offset REAL,
  phv_category TEXT,
  injury_risk REAL,
  fatigue_index REAL,
  acwr REAL,
  event_summary JSONB,          -- eventDetectionEngine.summarize() output
  xg_accumulated REAL,
  valuation_tier TEXT,
  probability_pro REAL,
  ceiling_estimate REAL,
  source TEXT,                   -- 'video_analysis' | 'manual'
  analysis_id UUID,              -- referencia al análisis que lo generó
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_id, snapshot_date, source)  -- un snapshot por día por fuente
);

-- Valoraciones calculadas
CREATE TABLE player_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  valuation_date DATE NOT NULL,
  current_tier TEXT NOT NULL,
  projected_tier_12m TEXT,
  projected_tier_36m TEXT,
  probability_first_division REAL,
  probability_professional REAL,
  strength_index REAL,
  ceiling_estimate REAL,
  risk_adjusted_value REAL,
  key_drivers JSONB,
  injury_risk_at_valuation REAL,  -- snapshot del risk al momento
  model_version TEXT NOT NULL DEFAULT 'v1',
  confidence_level REAL,
  data_points_used INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Extend fatigue_sessions con injury risk score
ALTER TABLE fatigue_sessions ADD COLUMN IF NOT EXISTS injury_risk_score REAL;
ALTER TABLE fatigue_sessions ADD COLUMN IF NOT EXISTS injury_risk_category TEXT;
```

### 4.5 Componentes UI — se integran en páginas existentes

**NO se crean páginas nuevas aisladas.** Todo se integra en la arquitectura existente:

```
src/components/
├── injury/
│   ├── InjuryRiskCard.tsx              ← card compacta para PlayerProfile/ParentDash
│   ├── InjuryRiskGauge.tsx             ← gauge 0-100 (estilo FatiguePanel)
│   ├── ACWRHistoryChart.tsx            ← gráfico ACWR 28d (para PlayerEvolution)
│   ├── InjuryLogForm.tsx               ← CRUD de lesiones (modal)
│   ├── InjuryTimeline.tsx              ← timeline de lesiones del jugador
│   ├── PhvRiskOverlay.tsx              ← zona de riesgo PHV en gráfico growth
│   └── TeamRiskGrid.tsx                ← grid equipo coloreado por riesgo
├── valuation/
│   ├── ValuationCard.tsx               ← card compacta para PlayerProfile
│   ├── TierBadge.tsx                   ← badge visual de tier
│   ├── TierProgressionChart.tsx        ← progresión tier (para PlayerEvolution)
│   ├── ProbabilityDisplay.tsx          ← prob. profesional/1ra div
│   ├── CeilingComparison.tsx           ← techo vs comparables
│   ├── RiskAdjustedCard.tsx            ← valor ajustado por injury risk
│   └── TeamValuationRanking.tsx        ← ranking potencial del plantel
```

**Integración en páginas existentes:**

| Página existente | Se agrega |
|-----------------|-----------|
| `PlayerHubPage` (tabs) | Tab "Salud" con InjuryRiskCard + InjuryTimeline + ACWRHistoryChart |
| `PlayerHubPage` (tabs) | Tab "Valoración" con ValuationCard + TierProgressionChart + CeilingComparison |
| `PlayerEvolutionPage` | Chart ACWR + markers de lesiones + tier trend line |
| `ParentDashboardPage` | Card "Estado Físico" (ACWR zone + fatigue severity + riesgo) |
| `DirectorDashboard` | TeamRiskGrid + TeamValuationRanking |
| `ScoutFeed` | Insights tipo "injury_alert" y "valuation_milestone" |
| `PlayerHubPrint` (PDF) | Sección "Riesgo & Valoración" en reporte impreso |

### 4.6 SaaS Feature Gating

| Feature | Free | Pro | Club |
|---------|------|-----|------|
| Injury risk básico (gauge solo) | ✓ | ✓ | ✓ |
| Injury history + ACWR chart | ✗ | ✓ | ✓ |
| Injury report narrativo (Claude) | ✗ | ✓ | ✓ |
| Team risk grid | ✗ | ✗ | ✓ |
| Valuation tier básico | ✗ | ✓ | ✓ |
| Valuation report completo | ✗ | ✗ | ✓ |
| Multi-video aggregation | ✗ | ✗ | ✓ |
| Export CSV valoraciones | ✗ | ✗ | ✓ |

### 4.7 Estrategia de Cold-Start

**Problema:** ACWR necesita ≥4 sesiones (28 días) para ser confiable. Injury model necesita historial. Usuarios nuevos no tienen datos.

**Solución por capas:**

1. **Sesión 1 (primer video):** Solo biomechanics risk (injuryRisk + asymmetryPct). ACWR marcado como "Insuficiente — necesita ≥4 sesiones". `coldStartWarning: true` en output.
2. **Sesiones 2-3:** ACWR en modo "estimado" con chronic load interpolada. Warning badge amarillo.
3. **Sesión 4+:** ACWR confiable. Risk model completo. Warning desaparece.
4. **Injury history:** Formulario de registro retroactivo en onboarding ("¿Alguna lesión previa?"). Opcional pero mejora el modelo.
5. **Valuation:** Requiere ≥3 análisis para generar tier. Antes: "Recopilando datos — analiza más videos para desbloquear valoración".

**UI:** Badge claro en cada componente: "🟢 Datos suficientes" / "🟡 Datos parciales (X sesiones más)" / "🔴 Necesita más datos"

### 4.8 Consideraciones de Privacidad (GDPR)

- **Datos de lesiones son categoría especial** (Art. 9 GDPR — datos de salud)
- RLS estricto: solo miembros de la misma org ven lesiones
- Consentimiento explícito para registrar lesiones (checkbox en formulario)
- Derecho de borrado: `DELETE CASCADE` en player_injuries
- No se comparten datos médicos en reportes públicos ni share links
- Parent Dashboard muestra solo "Estado físico" genérico, NO diagnósticos

### 4.9 Cost Management

| Reporte | Modelo | Costo estimado/llamada | Trigger |
|---------|--------|----------------------|---------|
| injury-risk-report | Claude Haiku | ~$0.002 | Post-análisis (si plan ≥ Pro) |
| valuation-report | Claude Haiku | ~$0.003 | Post-análisis (si plan = Club) |
| injury-risk-calculator | Determinista | $0 | Siempre (no usa LLM) |
| valuation-model | Determinista | $0 | Siempre (no usa LLM) |

**Regla:** Los modelos deterministas (risk calculator, valuation model) son gratis y corren siempre. Los reportes narrativos (Claude) son premium y se gatean por plan. Esto mantiene el costo incremental en ~$0.005/análisis.

---

## 5. SPRINTS DE IMPLEMENTACIÓN

> **Nota:** Los sprints anteriores de VITAS fueron 0-8 + Fase 3. Estos nuevos sprints se numeran 9-13 para continuidad.

### Fase A: Foundation + Vision-Only Polish (Sprint 9)

> Objetivo: Orquestador unificado client-side que pega las piezas existentes + tablas de DB para injury/valuation.

#### Sprint 9 — "Vision Orchestrator + DB Foundation" (2 semanas)

| # | Tarea | Archivos | Criterio de aceptación |
|---|-------|----------|----------------------|
| 9.1 | Crear `VisionMetricsOrchestrator.ts` — servicio CLIENT-SIDE que orquesta YOLO+MediaPipe+EventDetection+Fatigue para generar metrics completas de un video | `src/services/real/visionMetricsOrchestrator.ts` | Un video procesado → output unificado con tracking + events + biomechanics + fatigue, sin tocar la API |
| 9.2 | Crear migraciones: `player_injuries`, `player_metric_snapshots`, `player_valuations` | `supabase/migrations/044_injury_valuation_tables.sql` | Tablas creadas con RLS por org, GDPR-compliant |
| 9.3 | Extender `fatigue_sessions` con `injury_risk_score` + `injury_risk_category` | Dentro de migración 044 | Column añadida sin breaking change |
| 9.4 | Agregar feature flags `injuryPrediction` y `valuation` a `PlanLimits` | `subscriptionService.ts`, `usePlan.ts`, `usageGuard.ts` | Feature flags activos y gateados por plan |
| 9.5 | Crear `_progression-tracker.ts` — guarda metric snapshots post-análisis | `api/agents/_progression-tracker.ts` | Snapshot automático tras cada análisis completado |
| 9.6 | Multi-session aggregation: `getSessionAggregation(playerId, days)` | `src/services/real/playerTrackingService.ts` | Rolling averages, percentiles, trend slopes sobre N sesiones |

**Entregable Sprint 9:** Infraestructura lista para injury + valuation. Vision pipeline unificada client-side.

---

### Fase B: Injury Prediction (Sprints 10-11)

> Objetivo: modelo de predicción de lesiones que funciona con datos existentes (ACWR, biomechanics, PHV) + historial nuevo.

#### Sprint 10 — "Injury Risk Model & Data" (2 semanas)

| # | Tarea | Archivos | Criterio de aceptación |
|---|-------|----------|----------------------|
| 10.1 | Crear `_injury-risk-calculator.ts` — modelo determinista que consume ACWR + biomecánica + PHV + historial | `api/agents/_injury-risk-calculator.ts` | Score 0-100 determinista. Pesos: ACWR zone (30%), PHV window (25%), asimetría biomec. (20%), historial (15%), fatigue severity (10%). `coldStartWarning` si <4 sesiones |
| 10.2 | Crear `InjuryLogForm.tsx` — formulario de registro/edición de lesiones | `src/components/injury/InjuryLogForm.tsx` | CRUD: tipo, body part, severidad, días fuera, mecanismo, con checkbox GDPR consent |
| 10.3 | Crear `_injury-risk-report.ts` — agente Claude Haiku que narra el riesgo | `api/agents/_injury-risk-report.ts` | Reporte español: factores, recomendaciones de carga, alerta PHV. Plan ≥ Pro |
| 10.4 | Integrar `injury-risk-report` en Pipeline Orchestrator | `api/agents/_pipeline-orchestrator.ts` | +1 línea en PLAYER_REPORT_AGENTS. sharedContext ya tiene fatigue data |
| 10.5 | Crear `InjuryRiskCard.tsx` + `InjuryRiskGauge.tsx` — UI compactas | `src/components/injury/` | Card con gauge, risk category badge, top 3 factors, cold-start badge |
| 10.6 | Onboarding: registro retroactivo de lesiones previas (step opcional) | Extend `OnboardingWizard.tsx` | "¿Tu hijo ha tenido alguna lesión?" — mejora cold-start |

**Entregable Sprint 10:** Modelo de riesgo funcional con score 0-100 y narrativa. Formulario de lesiones operativo.

#### Sprint 11 — "Injury Dashboard & Alerts" (2 semanas)

| # | Tarea | Archivos | Criterio de aceptación |
|---|-------|----------|----------------------|
| 11.1 | Crear `ACWRHistoryChart.tsx` — gráfico ACWR 28d con zonas de peligro | `src/components/injury/ACWRHistoryChart.tsx` | Recharts: ACWR line + zone bands (green/yellow/red). Datos de `fatigue_sessions` |
| 11.2 | Crear `InjuryTimeline.tsx` — timeline de lesiones con markers en chart | `src/components/injury/InjuryTimeline.tsx` | Timeline visual: lesión → recuperación → apto. Markers en ACWR chart |
| 11.3 | Crear `PhvRiskOverlay.tsx` — zona de riesgo PHV en growth chart | `src/components/injury/PhvRiskOverlay.tsx` | Overlay en GrowthVelocityChart que marca Peak Height Velocity ±6 meses como zona roja |
| 11.4 | Integrar injury en `PlayerHubPage` — tab "Salud" | Modify `PlayerHubPage.tsx` | Nueva tab con InjuryRiskCard + ACWRHistoryChart + InjuryTimeline. Gateada por plan |
| 11.5 | Integrar injury en `PlayerEvolutionPage` — chart ACWR + injury markers | Modify `PlayerEvolutionPage.tsx` | ACWR trend line + markers de lesiones en timeline existente |
| 11.6 | Crear `TeamRiskGrid.tsx` — vista equipo coloreada por riesgo | `src/components/injury/TeamRiskGrid.tsx` | Grid: todos jugadores con color verde/amarillo/rojo por risk. Solo plan Club |
| 11.7 | Integrar en `ParentDashboardPage` — card "Estado Físico" | Modify `ParentDashboardPage.tsx` | Card simple: ACWR zone + fatigue severity + recomendación. Lenguaje claro para padres |
| 11.8 | Push notification cuando riesgo > 70 | `src/services/real/injuryAlertService.ts` | Notification al coach/padre cuando jugador entra en zona roja |
| 11.9 | Integrar injury alerts en ScoutFeed | Modify `_scout-insight.ts` + contracts | Nuevo context type "injury_alert" en ScoutInsightInput |

**Entregable Sprint 11:** Dashboard injury completo integrado en perfil del jugador, evolución, parent dash, y alertas proactivas.

---

### Fase C: Valoración Predictiva (Sprints 12-13)

> Objetivo: modelo que proyecta potencial y valor. Depende de injury model (riesgo ajusta valor).

#### Sprint 12 — "Valuation Model & Tracking" (2 semanas)

| # | Tarea | Archivos | Criterio de aceptación |
|---|-------|----------|----------------------|
| 12.1 | Crear `_valuation-model.ts` — modelo determinista | `api/agents/_valuation-model.ts` | Score determinista. Factores: VSI trend (25%), PHV ceiling (20%), versatilidad (15%), injury-adjusted (15%), contexto (10%), consistencia (15%). `coldStartWarning` si <3 análisis |
| 12.2 | Lógica de tiers con tasas base calibradas | Dentro de `_valuation-model.ts` | Tiers por percentil ajustado por edad+PHV. Tasas base: 2% llegan a 1ra div a los 18 (UEFA Youth League data), 0.3% a pro top-5 leagues. Ajustes por VSI percentile |
| 12.3 | Crear `_valuation-report.ts` — agente Claude Haiku | `api/agents/_valuation-report.ts` | Reporte español: tier, comparables, factores clave, riesgos. Solo plan Club |
| 12.4 | Integrar `valuation-report` en Pipeline Orchestrator | `api/agents/_pipeline-orchestrator.ts` | +1 línea en PLAYER_REPORT_AGENTS |
| 12.5 | Crear `ValuationCard.tsx` + `TierBadge.tsx` | `src/components/valuation/` | Card: tier badge + probability gauges + ceiling + cold-start indicator |
| 12.6 | Multi-video aggregation: tendencias sobre N análisis | `src/services/real/valuationAggregator.ts` | Slope de VSI, event quality trend, consistency score. Solo plan Club |

**Entregable Sprint 12:** Modelo de valoración funcional con tiers, probabilidades y narrativa.

#### Sprint 13 — "Valuation Dashboard & Integration" (2 semanas)

| # | Tarea | Archivos | Criterio de aceptación |
|---|-------|----------|----------------------|
| 13.1 | Crear `TierProgressionChart.tsx` — progresión tier + hitos | `src/components/valuation/TierProgressionChart.tsx` | Recharts: tier line con markers por análisis + injury events |
| 13.2 | Crear `ProbabilityDisplay.tsx` — probabilidades por horizonte | `src/components/valuation/ProbabilityDisplay.tsx` | Display: 1a, 3a, 5a con gauge visual |
| 13.3 | Crear `CeilingComparison.tsx` — techo vs 3 profesionales comparables | `src/components/valuation/CeilingComparison.tsx` | Comparison card con 3 pros similares de misma posición |
| 13.4 | Integrar valuation en `PlayerHubPage` — tab "Valoración" | Modify `PlayerHubPage.tsx` | Nueva tab con ValuationCard + TierProgressionChart + CeilingComparison |
| 13.5 | Integrar en `PlayerEvolutionPage` — tier trend | Modify `PlayerEvolutionPage.tsx` | Tier line superpuesta en chart existente |
| 13.6 | Crear `TeamValuationRanking.tsx` — ranking potencial del plantel | `src/components/valuation/TeamValuationRanking.tsx` | Tabla rankeada por ceiling. Solo Club |
| 13.7 | Integrar en `PlayerHubPrint` (PDF) — sección "Riesgo & Valoración" | Modify `PlayerHubPrint.tsx` | Sección en reporte impreso con injury risk + tier + probability |
| 13.8 | Export CSV de valoraciones para directivos | `src/services/real/valuationExportService.ts` | CSV: nombre, edad, PHV, VSI, injury risk, tier, prob. Solo Club |

**Entregable Sprint 13:** Dashboard de valoración completo, integrado en perfil de jugador, evolución, y reportes.

---

## 6. TIMELINE

```
2026
Jun              Jul              Ago              Sep
├────────────────┼────────────────┼────────────────┤
│ Sprint 9       │ Sprint 10      │ Sprint 11      │
│ Foundation     │ Injury Model   │ Injury Dash    │
│ + Vision Orch. │ + Data Layer   │ + Alerts       │
│ (2 sem)        │ (2 sem)        │ (2 sem)        │
│                │                │                │
│                │ Sprint 12      │ Sprint 13      │
│                │ Valuation      │ Valuation      │
│                │ Model          │ Dashboard      │
│                │ (2 sem)        │ (2 sem)        │
├────────────────┼────────────────┼────────────────┤
  FASE A           FASE B           FASE C
  Foundation       Injury           Valoración
  (2 sem)          (4 sem)          (4 sem)
```

**Total: 10 semanas (2.5 meses)**

Sprint 12 puede arrancar en paralelo con Sprint 11 si hay capacidad, reduciendo a **8 semanas (2 meses)**.

---

## 7. DEPENDENCIAS Y RIESGOS

### Dependencias

| Sprint | Depende de | Razón |
|--------|-----------|-------|
| Sprint 10 (Injury Model) | Sprint 9 (Foundation) | Necesita tablas + feature flags |
| Sprint 12 (Valuation) | Sprint 9 (Foundation) | Necesita snapshots + tables |
| Sprint 12 (Valuation) | Sprint 10 (Injury Model) | Consume injury risk para ajustar valor |
| Sprint 13 (Valuation Dash) | Sprint 11 (Injury Dash) | Reutiliza pattern de integración en PlayerHub |

### Riesgos y mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| ACWR unreliable con pocas sesiones | Alta | Alto | Cold-start strategy con badges explícitos + biomechanics-only mode |
| Modelo de lesiones sin validación | Alta | Medio | Pesos basados en literatura (Hulin 2014, Gabbett 2016). Calibrar con piloto 3 meses |
| Valoración sin dataset de éxito | Alta | Medio | Tasas base UEFA Youth League (2% → 1ra div). `coldStartWarning` explícito |
| Usuarios no registran lesiones | Alta | Medio | Onboarding retroactivo + notificaciones recordatorio |
| GDPR para datos médicos | Media | Alto | RLS por org, consent checkbox, derecho de borrado, no compartir en share links |
| Cost de Claude Haiku adicional | Baja | Bajo | ~$0.005/análisis. Reports narrativos solo para plan ≥ Pro |
| Complejidad de UI (demasiadas tabs) | Media | Medio | Se integra en tabs existentes de PlayerHub, no páginas nuevas |

---

## 8. KPIs DE ÉXITO

| Fase | KPI | Target |
|------|-----|--------|
| **A: Foundation** | Pipeline client-side genera output unificado | 100% de análisis producen metrics completas |
| **B: Injury** | Correlación risk score ↔ lesiones reales (retrospectivo, 6 meses) | r ≥ 0.55 |
| **B: Injury** | Reducción lesiones en academia piloto (6 meses) | ≥20% |
| **B: Injury** | Coaches activos viendo injury dashboard semanalmente | ≥60% |
| **C: Valoración** | Correlación tier ↔ progresión real (12 meses) | r ≥ 0.45 |
| **C: Valoración** | NPS scouts/directores usando valoración | ≥65 |

### Producto completo

| KPI | Target | Horizonte |
|-----|--------|-----------|
| Academias usando ≥2 capas | 5+ | 6 meses post-launch |
| Videos procesados/mes | 500+ | 6 meses |
| Conversión free → pro por injury features | ≥15% | 3 meses |
| MRR incremental por nuevas features | €3K+ | 6 meses |

---

## 9. VENTAJA COMPETITIVA FINAL

**Ninguna plataforma existente puede hacer esto:**

1. Ir a una academia en Ghana, Perú o Indonesia
2. Grabar con un celular
3. Generar automáticamente:
   - Perfil técnico-táctico completo (VSI + 6 dimensiones)
   - Score de riesgo de lesión (ACWR + PHV + biomecánica)
   - Proyección de valor a 3 años (tier + probabilidad profesional)
   - Reporte comercial para scouts

**Con un celular y sin infraestructura. Sin GPS. Sin Wyscout. Sin nada más que video.**

Esto es posible porque VITAS ya tiene:
- PHV (nadie más lo tiene en juveniles)
- Vision pipeline completa (YOLO + MediaPipe + Gemini + 35 event types)
- Fatigue engine con ACWR production-ready
- 16 agentes de IA especializados
- Modelos deterministas auditables (VSI, Mirwald, ACWR EWMA)
- Pipeline Orchestrator extensible

Las 3 nuevas capas son extensiones naturales del código existente. **Mismo video, 3 veces más inteligencia.**

---

## 10. PRÓXIMOS PASOS

1. **Sprint 9 (Foundation)** — empezar inmediatamente
2. **Sprint 10-11 (Injury)** — mayor ROI comercial, academias pagarían solo por esto
3. **Sprint 12-13 (Valuation)** — diferenciador definitivo vs competencia
4. **Piloto con 2-3 academias** — calibrar modelos con datos reales
5. **Pitch deck** — actualizar con las 3 capas para inversores/clientes
