# VITAS · Master Document

> 📌 **Documento maestro de VITAS Football Intelligence**
> Estado completo, arquitectura, catálogo de servicios, agentes IA, RAG, backlog, roadmap y costes.
>
> Actualizado: **2026-05-30**
> Repo: https://github.com/fredparedes58-ui/futuro-club
> Producción: https://futuro-club.vercel.app

---

## 📑 Tabla de contenidos

1. [Identidad del proyecto](#1-identidad-del-proyecto)
2. [Estado actual](#2-estado-actual)
3. [Arquitectura](#3-arquitectura)
4. [Stack técnico](#4-stack-técnico)
5. [Módulos funcionales](#5-módulos-funcionales)
6. [Agentes IA (28 agentes Claude)](#6-agentes-ia-28-agentes-claude)
7. [Servicios deterministas (59 servicios)](#7-servicios-deterministas-59-servicios)
8. [Hooks (42)](#8-hooks-42)
9. [RAG Knowledge Base](#9-rag-knowledge-base)
10. [Base de datos (54 migraciones)](#10-base-de-datos-54-migraciones)
11. [Páginas y rutas (62 pages)](#11-páginas-y-rutas-62-pages)
12. [Backlog completo](#12-backlog-completo)
13. [Roadmap](#13-roadmap)
14. [Setup / Activación](#14-setup--activación)
15. [Costes](#15-costes)
16. [Cómo importar a Notion](#16-cómo-importar-a-notion)

---

## 1. Identidad del proyecto

### Qué es VITAS
Plataforma de análisis deportivo de fútbol **con corrección de maduración biológica (PHV)**.
Detecta talento oculto en academias juveniles usando IA y visión computacional.

### Diferenciador único
> **Único producto del mercado que entrena su modelo de visión con contexto PHV juvenil.**
> Ningún competidor (Wyscout, InStat, Hudl) ajusta sus métricas por edad biológica.

### URLs
| Entorno | URL |
|---|---|
| Producción | https://futuro-club.vercel.app |
| GitHub | https://github.com/fredparedes58-ui/futuro-club |
| Local dev | http://localhost:5200 |

### Usuarios objetivo
- **Coaches** de academias juveniles (Sub-10 → Sub-18)
- **Directores deportivos** de clubs
- **Padres/madres** (acceso limitado al perfil del hijo)
- **Scouts** profesionales (Pro tier)

---

## 2. Estado actual

### Fase del producto
**Fase 2 + 3 en transición:**
- ✅ Fase 1 (localStorage + Claude API) → completa, en producción
- ✅ Fase 2 (Video upload + análisis Modal + Bunny CDN) → **infraestructura lista, requiere activación usuario**
- 🟡 Fase 3 (Supabase multi-tenant + auth + Stripe) → **código listo, requiere activación usuario**

### Lo que funciona hoy sin tocar nada
| Módulo | Estado |
|---|---|
| Login en modo demo | ✅ |
| Set Pieces (editor táctico, carpetas, notas, custom events) | ✅ con mocks realistas |
| Highlights (reels, ReelPlayer, detail page) | ✅ con mocks |
| Scanning Intelligence (`/scanning`) | ✅ con MediaPipe Web cliente |
| Behavioral Profiling (`/behavioral`) | ✅ con mocks |
| Wellbeing/Burnout (`/wellbeing`) | ✅ con mocks |
| Coach Dashboard (`/coach`) | ✅ con mocks |
| Set Pieces video analyzer | ✅ con mock (sin Modal) |
| PlayerHub completo (9 tabs) | ✅ |
| Pipeline orchestrator (9 agentes paralelos) | ✅ con Claude API |
| PWA offline | ✅ con Service Worker |
| Sentry error tracking | ✅ |

### Lo que requiere activación tuya
| Servicio | Tiempo setup | Desbloquea |
|---|---|---|
| **Bunny Stream** | ~10 min | Videos a CDN público |
| **Supabase** | ~90-120 min | Auth + multi-device + persistencia |
| **Modal** | ~15 min | Tracking real 22 jugadores + balón |
| **Stripe** | ~15 min | Billing Pro/Club |
| **Resend** (email) | ~10 min | Recordatorios consentimiento RGPD |
| **Sentry DSN** | ~5 min | Ya activado (recibes alertas) |

---

## 3. Arquitectura

### Diagrama de capas

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENTE (Browser)                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  React 18 + Vite + TypeScript + Tailwind + shadcn/ui       │  │
│  │  TanStack Query · React Router v6 · Framer Motion          │  │
│  │  Recharts · Lucide Icons · Sonner toasts                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  PWA Service Worker (Workbox)                              │  │
│  │  NetworkFirst /index.html · CacheFirst /assets/*.js        │  │
│  │  Offline queue (IndexedDB / localStorage)                  │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  MediaPipe Web (BlazePose 33 keypoints)                    │  │
│  │  · Scanning detection (head pose)                          │  │
│  │  · Biomechanics (Lab)                                       │  │
│  │  · Fatigue engine                                           │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                 ↕ HTTPS
┌──────────────────────────────────────────────────────────────────┐
│                    VERCEL EDGE (Backend)                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  174 Edge Functions (api/*.ts)                             │  │
│  │  · 28 agentes Claude (api/agents/*)                        │  │
│  │  · Stripe billing (api/stripe/*)                           │  │
│  │  · Bunny upload (api/videos/*)                             │  │
│  │  · Modal proxy (api/coaching/_track-players.ts)            │  │
│  │  · RAG retrieval (api/rag/*)                               │  │
│  │  · Live matches, players, analyses, wellbeing, etc.        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
        ↕                       ↕                       ↕
┌──────────────┐    ┌──────────────────┐    ┌────────────────────┐
│   SUPABASE   │    │   BUNNY STREAM   │    │  ANTHROPIC CLAUDE  │
│              │    │                  │    │                    │
│ Auth + RLS   │    │ Video CDN +      │    │  Sonnet · Haiku    │
│ Postgres     │    │ Transcoding +    │    │  Opus              │
│ 54 tablas    │    │ HLS streaming    │    │                    │
│ Realtime     │    │                  │    │                    │
│ Storage      │    │                  │    │                    │
└──────────────┘    └──────────────────┘    └────────────────────┘
        ↕                                              ↕
┌──────────────┐                              ┌────────────────────┐
│    STRIPE    │                              │     MODAL (GPU)    │
│              │                              │                    │
│ Subs Pro/    │                              │ YOLOv11 + ByteTrack│
│ Club +       │                              │ + MediaPipe Pose   │
│ Webhooks     │                              │ Player + Ball      │
└──────────────┘                              │ tracking           │
                                              └────────────────────┘
                                                       ↕
                                              ┌────────────────────┐
                                              │   ROBOFLOW (opt)   │
                                              │  Pose estimation   │
                                              │  fallback          │
                                              └────────────────────┘
```

### Flujo de datos típico (subir y analizar un video)

```
1. Coach abre /set-pieces en su móvil
2. Click "Subir video" → selecciona MP4 de la cámara
3. Cliente sube directo a Bunny vía TUS (resumable)
   ↳ /api/videos/_bunny-create reserva slot, devuelve credenciales
4. Bunny encoda → polling cliente → URL pública disponible
5. Click "Analizar video"
   ↳ /api/coaching/_track-players → Modal con la URL Bunny
   ↳ Modal procesa → devuelve players[] + ball[] + ballStops[]
6. Cliente derive set pieces de ballStops, guarda en localStorage o Supabase
7. Pipeline orchestrator dispara 10 agentes Claude en paralelo
   ↳ Reportes (rol, fatiga, biomecánica, behavioral, valuation, etc.)
8. UI actualiza con resultados en tiempo real
```

---

## 4. Stack técnico

### Frontend
| Tecnología | Versión | Para qué |
|---|---|---|
| React | 18.3 | UI |
| TypeScript | 5.x | Type safety |
| Vite | 8.x | Build tool |
| Tailwind CSS | 3.x | Styling |
| shadcn/ui | latest | Componentes |
| Framer Motion | 11.x | Animaciones |
| Recharts | 2.x | Gráficos |
| TanStack Query | 5.x | Data fetching + cache |
| React Router | 6.x | Routing |
| react-i18next | 15.x | i18n |

### Backend
| Tecnología | Para qué |
|---|---|
| Vercel Edge Functions | 174 endpoints (TypeScript, Edge runtime) |
| Vercel Cron | Tasks programadas |
| Anthropic SDK | Agentes Claude |
| Zod | Validación de schemas |

### Infraestructura
| Servicio | Función |
|---|---|
| Vercel | Hosting + Edge Functions + CDN |
| Supabase | Auth + Postgres + Realtime + Storage |
| Bunny Stream | Video hosting + transcoding |
| Modal | GPU serverless (Python + YOLOv11) |
| Stripe | Billing |
| Resend | Email |
| Sentry | Error tracking |

### PWA
- vite-plugin-pwa + Workbox
- NetworkFirst para HTML
- CacheFirst para assets inmutables
- Offline queue para mutations

---

## 5. Módulos funcionales

### 5.1 — Set Piece Intelligence (`/set-pieces`)
**Estado:** ✅ completo (mocks + custom)
**Features:**
- Listado de jugadas con filtros (ofensivas/defensivas, carpetas)
- Editor táctico interactivo (drag jugadores, flechas, anotaciones, texto)
- Carpetas personalizables con icono + color
- Sistema de notas tipo blog por evento (5 tags)
- Subida de video propio + análisis vía Modal
- Generación de recomendaciones IA
- Detalle táctico con PitchView animado

### 5.2 — Highlights (`/highlights`)
**Estado:** ✅ completo (mocks)
**Features:**
- Generación automática de reels desde video
- 12 tipos de momento (gol, tiro, asistencia, regate, etc.)
- ReelPlayer con multi-segment progress bar
- Auto-skip entre clips
- Embed YouTube/Vimeo/Drive (con limitaciones)
- Editor de clips (timestamps, tipo, jugador)

### 5.3 — Scanning Intelligence (`/scanning`)
**Estado:** ✅ real (MediaPipe Web)
**Features:**
- Análisis real de scans pre-recepción
- Timeline scatter por minuto
- Histograma de scans/recepción
- Benchmark por edad (Sub-12, Sub-15, Sub-18, Adult)
- Subida + análisis directo del video subido
- Insight automático ("+X puntos con scan")

### 5.4 — Behavioral Profiling (`/behavioral`)
**Estado:** ✅ con mocks · servicio Supabase listo
**Features:**
- 7 dimensiones: decision speed, scanning, resilience, clutch, leadership, mental fatigue, unpredictability
- 6 arquetipos: Commander, Creator, Engine, Ghost, Warrior, Architect
- Team overview con stats (composite avg, arquetipo dominante, top mental)
- Per-player detail en PlayerHub Mental tab
- Radar + gauge + decision speed timeline + clutch heatmap

### 5.5 — Wellbeing & Burnout Detection (`/wellbeing`)
**Estado:** ✅ con mocks · servicio Supabase listo
**Features:**
- Dropout risk con 8 factores (engagement, sobreentrenamiento, motivación, asistencia, etc.)
- Engagement tracking (físico/social/emocional)
- Calendario de asistencia
- Cuestionarios bienestar (jugador/coach/padre)
- Sistema de intervención protocol
- Push alerts cuando risk > 50

### 5.6 — Coach Dashboard (`/coach`)
**Estado:** ✅ con mocks · servicio Supabase listo
**Features:**
- 4 tabs: Última Sesión · Planificación · Progresión · Reportes Padres
- SessionTimelineView con segmentos coloreados
- SessionBalanceChart (técnica/táctica/física/juego)
- ParticipationHeatmap (jugadores × ejercicios)
- WeekPlannerView
- ParentReport generator

### 5.7 — Live Match (`/live`)
**Estado:** 🟡 mock · servicio Supabase listo + Realtime
**Features (cuando se cablee):**
- Tagging en tiempo real durante partido
- Cronómetro
- Eventos: goles, tarjetas, sustituciones
- Multi-coach colaborativo (Realtime)
- Resumen post-match

### 5.8 — PlayerHub (`/players/:id`)
**Estado:** ✅ completo (9 tabs)
**Tabs:**
1. **Resumen** — VSI + métricas base + Talento Oculto
2. **Stats** 🔒 — Stats de video
3. **Movimiento** — Tracking snapshot
4. **Rol** 🔒 — Perfil de rol táctico
5. **Mental** 🔒 — Behavioral + Scanning embebido
6. **Salud** — Injury risk + ACWR + lesiones
7. **Bienestar** — Dropout risk + engagement
8. **Valoración** 🔒 — Valuation tier + probability
9. **Histórico** 🔒 — Lista de análisis

### 5.9 — Family Dashboard (`/family/:playerId`)
**Estado:** ✅ con consent banner RGPD · datos mock
**Features:**
- Vista padre/madre simplificada
- Banner consentimiento RGPD (auto para <14yo)
- Badges/logros desbloqueados
- VSI con delta vs hace 1 mes
- Tips para la familia

### 5.10 — Director Dashboard (`/director`)
**Estado:** 🟡 mock · pendiente cablear queries multi-coach

### 5.11 — Admin / RGPD (`/admin/consent`)
**Estado:** ✅ con servicio ParentalConsent listo

### 5.12 — Billing (`/billing`)
**Estado:** ✅ código listo (Stripe checkout + portal preexistentes)

### 5.13 — Reports & Insights
- ScoutFeed (`/scout`)
- Reports (`/reports`)
- Bias Audit (`/admin/bias`)
- Analyses por jugador

---

## 6. Agentes IA (28 agentes Claude)

> Cada agente vive en `api/agents/_<name>.ts` y es una Vercel Edge Function.
> Pattern común: Zod input → Claude Haiku/Sonnet/Opus → Zod output validado → persist.

| # | Agente | Modelo | Función |
|---|---|---|---|
| 1 | `_phv-calculator.ts` | Haiku | Calcula PHV (Mirwald formula) con explicación natural |
| 2 | `_scout-insight.ts` | Haiku | Insights ScoutFeed en español |
| 3 | `_role-profile.ts` | Sonnet | Perfil táctico completo del jugador |
| 4 | `_tactical-label.ts` | Haiku | Etiquetado PHV/táctico para video (Fase 2) |
| 5 | `_player-report.ts` | Sonnet | Reporte completo individual |
| 6 | `_player-similarity.ts` | Haiku | Encuentra jugadores similares |
| 7 | `_best-match-narrator.ts` | Haiku | Narra el mejor match pro |
| 8 | `_progression-tracker.ts` | Haiku | Trackea progresión histórica |
| 9 | `_projection-report.ts` | Sonnet | Proyección de desarrollo futuro |
| 10 | `_dna-profile.ts` | Sonnet | Perfil genético / DNA táctico |
| 11 | `_fatigue-report.ts` | Haiku | Reporte de fatiga + ACWR |
| 12 | `_injury-risk-calculator.ts` | Determinista | Cálculo modelo de lesión (sin IA) |
| 13 | `_injury-risk-report.ts` | Haiku | Narrativa del riesgo de lesión |
| 14 | `_behavioral-report.ts` | Haiku | Reporte behavioral con archetype |
| 15 | `_burnout-report.ts` | Haiku | Reporte burnout + plan intervención |
| 16 | `_coaching-assistant.ts` | Haiku | Análisis sesión + recomendaciones |
| 17 | `_development-plan.ts` | Sonnet | Plan de desarrollo individual (IDP) |
| 18 | `_team-report.ts` | Sonnet | Reporte completo del equipo |
| 19 | `_team-intelligence.ts` | Sonnet | Inteligencia táctica del equipo |
| 20 | `_rival-scout-report.ts` | Sonnet | Análisis del rival próximo |
| 21 | `_lab-biomechanics-report.ts` | Haiku | Biomecánica desde Lab |
| 22 | `_biomechanics-extractor.ts` | Haiku | Extrae métricas biomecánicas |
| 23 | `_scan-detector.ts` | Determinista | Detector de scans (MediaPipe) |
| 24 | `_player-id-reidentifier.ts` | Haiku | Re-ID de jugadores entre videos |
| 25 | `_pipeline-orchestrator.ts` | Sonnet | Orquesta 10 agentes en paralelo |
| 26 | `_invalidate-cache.ts` | (utility) | Cache invalidation |
| 27 | `_phv-calculator.legacy.ts` | (deprecated) | Versión vieja PHV |
| 28 | `_promptVersionRegistry.ts` | (utility) | Versionado de prompts |

### Routers
- `api/agents/[action].ts` — router maestro de agentes

### Patrón común
```typescript
1. Validar input con Zod
2. Construir prompt (templating + RAG context)
3. Llamar Claude API con retry + timeout
4. Validar output con Zod
5. Persistir en BD (Supabase) + cache
6. Devolver respuesta tipada
```

---

## 7. Servicios deterministas (59 servicios)

> Vive en `src/services/real/*.ts`. Sin IA, lógica pura, deterministas.

### Storage + persistencia
| Servicio | Función |
|---|---|
| `storageService.ts` | Wrapper localStorage tipado (prefix `vitas_`) |
| `supabasePlayerService.ts` | CRUD jugadores en Supabase |
| `supabaseVideoService.ts` | CRUD videos en Supabase |
| `syncQueueService.ts` | Cola offline (push automático al reconectar) |
| `localStorageMigrationService.ts` | Migra localStorage → Supabase al primer login |
| `backupService.ts` | Exporta/importa datos en JSON |
| `schemaMigration.ts` | Migración de schemas localStorage |

### Dominio: jugadores
| Servicio | Función |
|---|---|
| `playerService.ts` | CRUD jugadores + VSI |
| `playerTrackingService.ts` | Tracking snapshots Lab |
| `metricsService.ts` | VSI, percentiles, tendencias |
| `advancedMetricsService.ts` | Métricas avanzadas (VAEP) |
| `positionRollupService.ts` | Agregado por posición |
| `similarityService.ts` | Búsqueda de jugadores similares |
| `benchmarkService.ts` | Benchmarks por edad |

### Dominio: video
| Servicio | Función |
|---|---|
| `bunnyStreamService.ts` | Upload TUS + polling encoding |
| `videoAdvancedMetricsService.ts` | Métricas desde video |
| `videoMetricsExtractor.ts` | Extracción raw |
| `scanningVideoDetector.ts` | Scanning con MediaPipe Web |
| `setPieceVideoDetector.ts` | Set pieces detection |
| `highlightsDetector.ts` | Highlights detection |
| `videoTrackingService.ts` | Modal pipeline proxy |

### Dominio: módulos
| Servicio | Función |
|---|---|
| `behavioralProfileService.ts` | Perfil mental 7 dimensiones |
| `wellbeingService.ts` | Engagement, asistencia, dropout risk |
| `coachingSessionService.ts` | Sesiones de entrenamiento |
| `liveMatchService.ts` | Live match + Realtime |
| `parentalConsentService.ts` | RGPD para menores |
| `setPieceService.ts` | Set pieces base |
| `setPieceCustomStorage.ts` | Set pieces custom del usuario |
| `setPieceFolderStorage.ts` | Carpetas de set pieces |
| `highlightsStorage.ts` | Highlights guardados |
| `matchEventsService.ts` | Eventos de partido |
| `matchStatsService.ts` | Estadísticas de partido |
| `eventNotesStorage.ts` | Notas blog por evento |

### Dominio: gestión y multi-tenancy
| Servicio | Función |
|---|---|
| `organizationService.ts` | Academias / clubs |
| `teamService.ts` | Equipos (multi-coach) |
| `userProfileService.ts` | Perfil de usuario |
| `subscriptionService.ts` | Stripe billing |
| `auditService.ts` | Audit log RGPD |

### Dominio: agentes IA
| Servicio | Función |
|---|---|
| `agentService.ts` | Cliente Claude (proxy) |
| `agentResilience.ts` | Retry + circuit breaker |
| `agentTracer.ts` | Tracing de llamadas IA |
| `observabilityAdapter.ts` | Metrics + logs |
| `ragService.ts` | RAG retrieval |
| `ragSanitizer.ts` | Limpieza de chunks |
| `smartChunker.ts` | Chunking inteligente |
| `reportValidator.ts` | Validación de outputs IA |

### Utilidades
| Servicio | Función |
|---|---|
| `adapters.ts` | Mapeo entre formatos agente↔UI |
| `imageService.ts` | Avatares, thumbnails |
| `pdfService.ts` | Exportar a PDF |
| `pushNotificationService.ts` | Push notifications |
| `injuryAlertService.ts` | Alertas de lesión |
| `wellbeingAlertService.ts` | Alertas de bienestar |
| `healthCheck.ts` | Diagnóstico al iniciar |
| `demoDataService.ts` | Seed de datos demo |
| `valuationExportService.ts` | Export valoraciones |

---

## 8. Hooks (42)

| Hook | Función |
|---|---|
| `useAuth` (context) | Sesión Supabase |
| `useSupabaseSync` | Sync bidireccional |
| `useLocalStorageMigration` | Migración auto al login |
| `usePlayers` | CRUD jugadores (TanStack Query) |
| `usePlayerAnalysisV2` | Análisis IA del jugador |
| `useRankings` | Rankings con filtros |
| `useScoutFeed` | Feed de scouting |
| `useRoleProfile` | Perfil de rol |
| `useBehavioralProfile` | Perfil mental |
| `useWellbeing` | Dropout risk + engagement + attendance |
| `useCoachingSession` | Sesiones coach |
| `useParentalConsent` | RGPD |
| `useLiveMatch` | Match-day live |
| `useMatchEvents` | Eventos de partido |
| `useBallTracking` | Tracking del balón |
| `useFatigue` | Fatiga + ACWR |
| `useInjuryRisk` | Riesgo de lesión |
| `useMediaPipePose` | MediaPipe Web |
| `useTracking` | Tracking general |
| `useDashboard` | Datos del dashboard |
| `useOrganization` | Multi-tenancy |
| `useSubscription` | Stripe |
| `usePlan` | Plan + feature gates |
| `useAdminOrgs` | Admin de organizaciones |
| `useAudit` | Audit log |
| `useAgents` | Agentes IA |
| `usePushNotifications` | Push web |
| `useOfflineMutation` | Mutations offline |
| `useOneClickAnalysis` | Análisis automatizado |
| `useGdprExport` | Export RGPD |
| `useLegalAcceptance` | Términos legales |
| `useValuation` | Valoración |
| `useBusinessAnalytics` | Métricas business |
| Y otros 8 utilitarios... |

---

## 9. RAG Knowledge Base

> Vive en `src/data/knowledgeBase/` + tablas Supabase `rag_*`.

### Documentos indexados
1. **PHV / Mirwald formula** — fórmulas y benchmarks
2. **YOUTH_DEVELOPMENT_DOCS (LTAD)** — Long-term Athlete Development
3. **PERFORMANCE_BENCHMARKS_DOCS** — por edad y categoría
4. **DRILLS_LIBRARY** — librería de ejercicios
5. **WEAKNESS_TO_DRILL_MAP** — mapeo debilidad → drill
6. **ROLE_PROFILES** — arquetipos tácticos
7. **INJURY_PROTOCOLS** — protocolos de retorno
8. **NUTRITION_BASICS** — fundamentos
9. **MENTAL_TRAINING** — entrenamiento mental
10. **REFEREE_RULES** — reglas IFAB

### Pipeline RAG
```
1. Documento markdown → smartChunker (chunks de 500 tokens con overlap)
2. ragSanitizer limpia
3. Embedding (text-embedding-3-small de OpenAI)
4. Insert en `rag_documents` (pgvector)
5. Query usuario → embedding → similarity search → top 5 chunks
6. Inyectar chunks en prompt del agente
```

### Tablas Supabase
- `rag_documents` (002 + 039)
- `rag_feedback` (014)
- `agent_response_cache` (022)

---

## 10. Base de datos (54 migraciones)

> Vive en `supabase/migrations/*.sql`. Aplicar con `supabase db push`.

### Categorías
| Bloque | Migraciones | Tablas principales |
|---|---|---|
| **Schema base** | 000-001 | `players`, `users` |
| **RAG** | 002, 014, 039 | `rag_documents`, `rag_feedback` |
| **Legal** | 003, 030 | `legal_acceptances`, `consents` |
| **Notifs** | 003, 018, 023 | `push_subscriptions`, `notifications` |
| **Analyses** | 004, 007, 015, 041 | `analyses_reports`, `analyses_used` |
| **Match** | 004, 032, 042 | `match_events`, `live_matches` |
| **Anthropometrics** | 005, 011 | `player_anthropometrics`, `development_curves` |
| **Subscriptions** | 005, 008 | `subscriptions`, `stripe_customers` |
| **User profiles** | 006 | `user_profiles` |
| **Teams** | 007, 008, 019, 020 | `team_members`, `team_invitations`, `team_audit_log` |
| **Tracking** | 009 | `tracking_sessions` |
| **Team analyses** | 012, 028 | `team_analyses` |
| **Indexes** | 013, 017 | Performance |
| **Scout** | 016 | `scout_insights` |
| **Cache** | 022 | `agent_response_cache` |
| **Notifs ext** | 023 | `notification_extensions` |
| **Normalize** | 024, 025 | Normalización |
| **Organizations** | 026, 027, 038 | `organizations`, `org_isolation`, `multi_academy_isolation` |
| **Usage** | 029 | `usage_log` |
| **Video** | 025, 031 | `videos`, `video_file_hash` |
| **Live** | 032, 042 | `live_matches` |
| **Telegram** | 033 | `telegram_coach` |
| **Cleanup** | 034 | `cleanup_orphan_data` |
| **Position** | 035 | `played_position` |
| **RGPD minors** | 036 | `parental_consent_*`, `consent_audit_log` |
| **Bias audit** | 037 | `bias_audit` |
| **Queue** | 040 | `atomic_queue_lock` |
| **Fatigue** | 043 | `fatigue_sessions` |
| **Coaching** | 044 | `training_sessions`, `player_session_metrics`, `parent_reports` |
| **Injury + Valuation** | 044 | `injuries`, `valuations` |
| **Behavioral** | 045 | `behavioral_profiles` |
| **Wellbeing** | 046 | `attendance_records`, `engagement_snapshots`, `wellbeing_questionnaires`, `dropout_risk_assessments` |
| **Rankings RPC** | 021 | Stored procedures |

---

## 11. Páginas y rutas (62 pages)

### Públicas
- `/login`, `/register`, `/forgot-password`, `/reset-password`
- `/terms`, `/privacy`, `/pricing`, `/welcome`
- `/share/analysis/:analysisId`
- `/aceptar-invitacion`

### Coach (protegidas)
- `/home`, `/pulse`, `/master`
- `/scout`, `/drill`, `/rankings`
- `/lab`, `/reports`
- `/equipo`, `/equipo/baseline`, `/equipo/rival`
- `/team-analysis`
- `/coach`, `/live`, `/live/:matchId`, `/live/:matchId/summary`
- `/set-pieces`, `/set-pieces/new`, `/set-pieces/edit/:id`, `/set-pieces/folder/:id`
- `/highlights`, `/highlights/:id`
- `/scanning`, `/behavioral`, `/wellbeing`
- `/billing`, `/settings`, `/onboarding`, `/guide`

### Player-centric
- `/players/new`, `/players/:id` (Hub con 9 tabs)
- `/players/:id/edit`, `/players/:id/classic`, `/players/:id/print`
- `/players/:id/reports`, `/players/:id/evolution`
- `/players/:id/intelligence`, `/players/:id/role-profile`
- `/player/:id`, `/player/:id/analysis/:analysisId`

### Family / Parents
- `/family/:playerId`

### Admin
- `/director`, `/admin`, `/admin/plans`, `/admin/bias`, `/admin/consent`

### Print/Export
- `/report/:id`, `/analysis-report/:id`

---

## 12. Backlog completo

### ✅ DONE (en producción)

#### Fase 1 (localStorage + Claude)
- [x] Player CRUD + VSI + PHV
- [x] Rankings + Scout Feed + Compare
- [x] Insights agentes (Scout, Role, PHV)
- [x] VITAS Lab (análisis de video)
- [x] Reports + PDF export
- [x] Onboarding wizard
- [x] PWA offline

#### Fase 2 (parcial)
- [x] Bunny Stream integration (cliente + endpoints)
- [x] Modal pipeline template (Python + YOLOv11)
- [x] MediaPipe Web client (scanning + biomechanics)
- [x] Pipeline orchestrator (10 agentes paralelos)
- [x] Live match infrastructure

#### Sprints 14-23 (completos)
- [x] Coaching Assistant (S14-16)
- [x] Behavioral Profiling Engine (S17-20)
- [x] Burnout & Dropout Detection (S21-23)

#### Sesiones recientes (Mayo 2026)
- [x] Set Piece Intelligence completo (editor, carpetas, notas, video, custom events)
- [x] Highlights module completo (reels + player)
- [x] /behavioral team overview
- [x] /scanning dedicated page + report
- [x] PlayerHub Mental tab con scanning embebido
- [x] BottomNav "Más" mega-menú con 5 grupos
- [x] Sentry stale-chunk fix (NetworkFirst + lazyWithRetry)

#### Servicios Supabase preparados
- [x] behavioralProfileService
- [x] wellbeingService
- [x] coachingSessionService
- [x] parentalConsentService
- [x] liveMatchService
- [x] localStorageMigrationService

#### Hooks conectados
- [x] useWellbeing → WellbeingService
- [x] useBehavioralProfile → BehavioralProfileService
- [x] useCoachingSession → CoachingSessionService
- [x] useParentalConsent (nuevo)
- [x] useLocalStorageMigration (nuevo)

#### Páginas wired
- [x] /family/:playerId con consent banner RGPD

### 🟡 IN PROGRESS / REQUIERE ACTIVACIÓN USUARIO

- [ ] **Bunny env vars** en Vercel → activa CDN
- [ ] **Supabase setup completo** → activa auth + multi-device + persistencia
- [ ] **Modal deploy** → activa pipeline IA real
- [ ] **Stripe env vars** → activa billing real
- [ ] **Resend** (opcional) → activa emails

### 🔴 PENDING (próximas sesiones)

#### Cableado de páginas
- [ ] `/director` queries multi-coach + agregaciones
- [ ] `/live` con LiveMatchService + Realtime
- [ ] `/live/:matchId` tagger en tiempo real
- [ ] `/live/:matchId/summary` post-match
- [ ] `/admin/consent` validar wiring con ParentalConsentService

#### Endpoints faltantes
- [ ] `api/consent/_send-reminder.ts` (Resend integration)
- [ ] `api/push/_subscribe.ts`
- [ ] `api/push/_send.ts`

#### Service Worker mejoras
- [ ] Push notification handler en SW
- [ ] Background sync queue
- [ ] Update prompt cuando hay nueva versión

#### Highlights / Set Pieces Supabase
- [ ] Servicio highlightsSupabase (wrap Supabase de highlightsStorage)
- [ ] setPieceEventsService (persist en match_events)
- [ ] scanningAnalysisService persist en analyses_reports

#### Phase 3 SaaS adicional
- [ ] Stripe webhook handler completo
- [ ] Customer portal en /billing
- [ ] Multi-tenant onboarding flow
- [ ] Email templates (welcome, reset password, consent, burnout alert)
- [ ] Telegram bot integration (033 ya tiene tabla)

#### UX & Polish
- [ ] Tour onboarding para módulos nuevos
- [ ] Mobile bottom-sheet del mega-menú
- [ ] Drag-to-reorder clips en Highlights
- [ ] Búsqueda global ⌘K
- [ ] Settings page completo
- [ ] Dark mode mejorado en /scanning, /behavioral
- [ ] Internacionalización (claves i18n para nuevos módulos)

#### Tests
- [ ] E2E: signup → upload → analyze → see results
- [ ] Migration test: localStorage → Supabase
- [ ] RLS verification
- [ ] Tests de pipeline orchestrator
- [ ] Tests de agentes con golden samples

#### Módulos nuevos (medio scope, 3-6h cada uno)
- [ ] **Transfer Intelligence** — marketplace de fichajes
- [ ] **Heatmap táctico de equipo** — clustering por fases
- [ ] **Plan de desarrollo IDP** — goals trimestrales + drills

#### Bugs conocidos
- [ ] AttendanceCalendar celdas sin ancho restringido en /wellbeing
- [ ] BalanceChart polígono casi vacío en Coach Dashboard
- [ ] YouTube/Vimeo iframes no soportan seek programado (esperado)

---

## 13. Roadmap

### Sprint actual (mayo 2026)
- ✅ Set Pieces, Highlights, Scanning, Behavioral
- ✅ Servicios Supabase preparados
- ✅ Bunny + Modal templates
- ✅ Sentry fix

### Próximo sprint (1-2 semanas)
1. **Tú activas** Bunny + Supabase (3h)
2. **Yo cableo** /director, /live, /admin/consent (8h)
3. **Yo construyo** push notifications real + email reminders (5h)
4. **Validación** end-to-end juntos (2h)

### Sprint +1 (2-3 semanas)
- Servicios Supabase para Highlights + Set Pieces
- Stripe billing UI completa
- Multi-tenant onboarding
- Tests E2E

### Sprint +2 (1 mes)
- Transfer Intelligence module
- Heatmap táctico
- Plan de desarrollo IDP
- Telegram bot

### Sprint +3 (2 meses)
- Polish, i18n, dark mode
- Onboarding tours
- Marketing copy / landing pages
- Launch beta cerrado

---

## 14. Setup / Activación

> Ver guías detalladas:
> - `docs/BUNNY_SETUP.md`
> - `docs/SUPABASE_SETUP.md`
> - `docs/PHASE_3_STATUS.md`
> - `vision-pipeline/README.md`

### Env vars necesarios en Vercel

```bash
# Bunny Stream
BUNNY_STREAM_LIBRARY_ID
BUNNY_STREAM_API_KEY
BUNNY_CDN_HOSTNAME

# Supabase
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
VITAS_PUBLIC_URL

# Modal
MODAL_TRACK_URL
MODAL_API_KEY

# Stripe
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRO_PRICE_ID
STRIPE_CLUB_PRICE_ID

# Anthropic Claude (ya activado)
ANTHROPIC_API_KEY

# Sentry (ya activado)
VITE_SENTRY_DSN
SENTRY_AUTH_TOKEN  (opcional, para source maps)
SENTRY_ORG
SENTRY_PROJECT

# Email (opcional)
RESEND_API_KEY

# Telegram (opcional)
TELEGRAM_BOT_TOKEN
```

### Orden recomendado de activación
1. **Sentry** ✅ ya activo
2. **Bunny** → desbloquea videos a CDN
3. **Supabase** → desbloquea TODO el resto (auth, multi-device, persistencia, billing)
4. **Modal** → desbloquea análisis IA real de equipo
5. **Stripe** → desbloquea monetización
6. **Resend** → desbloquea emails RGPD

---

## 15. Costes

### Proyección mensual realista

| Volumen | Bunny | Supabase | Modal | Anthropic | Stripe | Total |
|---|---|---|---|---|---|---|
| **Demo** (0-5 partidos/mes) | $1 | $0 free | $0 free | $5 | $0 | **~$6/mes** |
| **Pequeño** (10-30 partidos/mes) | $3 | $0 free | $5 | $20 | 2.9% trans | **~$30/mes** |
| **Medio** (50-100 partidos/mes) | $10 | $25 Pro | $20 | $80 | 2.9% trans | **~$135/mes** |
| **Grande** (200-500 partidos/mes) | $30 | $25 Pro | $80 | $300 | 2.9% trans | **~$435/mes** |
| **Escala** (1000 partidos/mes) | $50 | $25 Pro | $30 self-host VPS | $800 | 2.9% trans | **~$905/mes** |

### Punto de break-even
- **Plan Pro**: $19/mes/coach → break-even a partir de 2-3 suscriptores en plan medio
- **Plan Club**: $99/mes/club → break-even a partir de 5 clubes

### Free tiers que utilizamos
- Supabase Free: 50k usuarios activos, 500MB BD, 1GB transfer
- Modal Free: $30/mes ≈ 75 partidos GPU
- Sentry Free: 5000 errores/mes
- Resend Free: 3000 emails/mes
- Anthropic: pay-as-you-go (sin free tier real)

---

## 16. Cómo importar a Notion

### Opción A — Markdown directo (recomendado, 5 min)

Notion soporta **importación de archivos `.md`** nativamente:

1. Abre Notion → crea una página nueva llamada **"VITAS Master"**
2. Click en los **`···`** (tres puntos) arriba a la derecha de la página
3. Click **"Import"** → **"Markdown & CSV"**
4. Selecciona los archivos:
   - `docs/VITAS_MASTER.md` (este archivo)
   - `docs/BUNNY_SETUP.md`
   - `docs/SUPABASE_SETUP.md`
   - `docs/PHASE_3_STATUS.md`
   - `vision-pipeline/README.md`
5. Notion convierte automáticamente:
   - Headings → bloques de heading
   - Tablas → bloques de tabla Notion
   - Code blocks → bloques de código con syntax highlighting
   - Listas → bullet/numbered lists
   - Checkboxes (`- [ ]`) → to-do items reales en Notion
6. **Mueve los archivos** como sub-páginas de "VITAS Master"

### Opción B — Notion AI (5 min, requiere Notion AI)

1. Abre Notion AI
2. Pega el contenido de `VITAS_MASTER.md`
3. Pregunta: *"Convierte esto en una base de datos Notion con vistas por categoría"*
4. Notion AI genera una database con properties y vistas

### Opción C — Sync continuo con GitHub (avanzado)

Para mantener Notion siempre sincronizado con tu repo:

1. Notion + Zapier/Make integration:
   - Trigger: nuevo commit en `docs/` en GitHub
   - Action: actualizar página Notion correspondiente
2. O usa **Notion API** con un GitHub Action que dispare en cada push

### Estructura sugerida en Notion

```
📚 VITAS Master (página raíz)
├── 🎯 Identidad & Estado
├── 🏗️ Arquitectura
│   ├── Frontend stack
│   ├── Backend (Edge functions)
│   └── Infraestructura
├── 🤖 Agentes IA (database)
│   ├── 28 agentes como filas
│   ├── Properties: modelo, función, status, prompt version
│   └── Vistas: por modelo, por status, por módulo
├── 🔧 Servicios (database)
│   ├── 59 servicios como filas
│   └── Vistas: por dominio, por tier
├── 📋 Backlog (database)
│   ├── Tareas como filas
│   └── Properties: estado, prioridad, esfuerzo, owner, sprint
│   └── Vistas: Kanban, Lista, Calendario
├── 🗺️ Roadmap (Timeline view)
├── 📖 Setup guides
└── 💰 Costes (database)
    └── Vistas: por servicio, por volumen
```

### Tip: para tracking del backlog
- Convierte la sección **"12. Backlog completo"** en una **database Notion** con properties:
  - `Estado` (Done / In Progress / Pending)
  - `Prioridad` (Critical / High / Medium / Low)
  - `Esfuerzo` (hours)
  - `Sprint` (Mayo / Junio / Julio…)
  - `Dependencias` (relaciones)
- Vistas: Kanban (Done/In Progress/Pending), Calendar, By Sprint

---

## 📋 Resumen de salud del proyecto

| Métrica | Valor |
|---|---|
| **Líneas de código aprox.** | ~50,000-70,000 LOC |
| **Archivos TypeScript** | 400+ |
| **Componentes React** | 200+ |
| **Endpoints API** | 174 |
| **Agentes Claude** | 28 |
| **Servicios deterministas** | 59 |
| **Hooks** | 42 |
| **Páginas** | 62 |
| **Migraciones SQL** | 54 |
| **Test coverage** | ~25% (mejorable) |
| **PWA score** | A (Lighthouse) |
| **Bundle size** | ~4.7MB precache |
| **Deploys/día** | ~5-10 durante desarrollo activo |

---

## 🎯 Top 3 prioridades inmediatas

1. **TÚ** activa Bunny + Supabase (3h tu tiempo) → desbloquea 70% del producto
2. **YO** cableo /director + /live + push notifications (15h) → cierra módulos pendientes
3. **JUNTOS** validación end-to-end + onboarding del primer beta (4h) → ready para vender

---

*Documento generado el 2026-05-30. Actualizado por Claude tras sesión de Phase 3 prep.*
*Para feedback o cambios, edita este archivo y haz commit.*
