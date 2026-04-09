# VITAS — Arquitectura del Sistema

## Diagrama General

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE (PWA)                            │
│                                                                 │
│  React 18 + TypeScript + Vite 8 + shadcn/ui + Tailwind CSS     │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │   Pages      │  │  Components  │  │  Hooks             │    │
│  │  (Router)    │  │  (shadcn/ui) │  │  (React Query)     │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘    │
│         │                 │                    │                │
│  ┌──────┴─────────────────┴────────────────────┴───────────┐   │
│  │              Services Layer (29 servicios)               │   │
│  │                                                         │   │
│  │  playerService      advancedMetrics    agentResilience  │   │
│  │  metricsService     similarityService  reportValidator  │   │
│  │  agentTracer        auditService       observability    │   │
│  │  errorDiagnostic    storageService     ragService       │   │
│  │  ...                                                    │   │
│  └────────────────────────────┬────────────────────────────┘   │
│                               │                                │
│  ┌────────────────────────────┴────────────────────────────┐   │
│  │              ML / Tracking (navegador)                   │   │
│  │  ONNX Runtime Web (YOLO) → Deteccion de jugadores       │   │
│  │  D3 Delaunay → Voronoi / Zonas espaciales               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                   │
│  │  Sentry SDK      │  │  Service Worker  │                   │
│  │  (monitoring)    │  │  (PWA offline)   │                   │
│  └──────────────────┘  └──────────────────┘                   │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTPS
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                   VERCEL EDGE FUNCTIONS                         │
│                   (33 endpoints TypeScript)                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Middleware Layer                        │   │
│  │  api/lib/auth.ts          → JWT verification            │   │
│  │  api/lib/validateRequest.ts → Zod body validation       │   │
│  │  api/lib/rateLimit.ts     → Sliding window rate limit   │   │
│  │  api/lib/ragSanitizer.ts  → Prompt injection defense    │   │
│  │  api/lib/apiResponse.ts   → Standardized responses      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Agents   │  │ Pipeline │  │ RAG      │  │ Upload   │      │
│  │ (9 eps)  │  │ (1 ep)   │  │ (5 eps)  │  │ (2 eps)  │      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│       │              │              │              │            │
└───────┼──────────────┼──────────────┼──────────────┼────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐ ┌──────────────┐
│ Anthropic    │ │ Google   │ │ Voyage AI    │ │ Bunny        │
│ Claude API   │ │ Gemini   │ │ (embeddings) │ │ Stream/CDN   │
│              │ │ API      │ │              │ │              │
│ - Reportes   │ │ - Video  │ │ - voyage-3   │ │ - TUS upload │
│ - Insights   │ │   obs.   │ │ - 1024 dims  │ │ - Encoding   │
│ - PHV calc   │ │ - Team   │ │              │ │ - CDN serve  │
│ - Roles      │ │   obs.   │ │              │ │              │
└──────────────┘ └──────────┘ └──────────────┘ └──────────────┘

        ┌─────────────────────────────────┐
        │         SUPABASE                │
        │                                 │
        │  PostgreSQL                     │
        │  ├── players (perfiles)         │
        │  ├── players_indexed (FBref)    │
        │  ├── knowledge_base (RAG)       │
        │  ├── tracking_sessions          │
        │  ├── push_subscriptions         │
        │  ├── team_invitations           │
        │  ├── subscriptions (Stripe)     │
        │  └── agent_traces (logs)        │
        │                                 │
        │  Auth (JWT + email)             │
        │  RLS (Row Level Security)       │
        │  pgvector (embeddings)          │
        │  Realtime (subscripciones)      │
        └─────────────────────────────────┘
```

## Capas

### 1. Frontend (PWA)

Single Page Application con React Router. Se instala como PWA con Service Worker (vite-plugin-pwa). Funcionalidad offline parcial via localStorage + sync queue.

**Paginas principales:**
- Landing / Dashboard
- Player Profile + Intelligence (reportes IA)
- Team Analysis (analisis tactico)
- Scout Feed (insights automaticos)
- Rankings (comparativas)
- Lab (tracking YOLO en tiempo real)
- Solo Drill (ejercicios individuales)

### 2. Services Layer

29 servicios en `src/services/real/` con separacion clara de responsabilidades:

- **Datos:** playerService, storageService, ragService
- **Metricas:** metricsService, advancedMetricsService, similarityService
- **IA:** agentService (proxy a API), agentResilience (circuit breaker + retry)
- **Validacion:** reportValidator (semantica), errorDiagnosticService (diagnostico)
- **Observabilidad:** agentTracer (traces), observabilityAdapter (multi-provider), auditService (health check)

### 3. API Layer (Vercel Edge)

33 endpoints TypeScript desplegados como Vercel Serverless/Edge Functions. Usan middleware compartido para auth, validacion y rate limiting.

**Pipeline de analisis de video:**
1. Cliente sube video via TUS → Bunny Stream
2. Bunny codifica → CDN
3. Pipeline extrae keyframes + metricas
4. Gemini observa video completo
5. Claude genera reporte de inteligencia
6. reportValidator valida coherencia semantica
7. Frontend muestra reporte interactivo

### 4. Agentes IA

Cada agente tiene circuit breaker independiente (via agentResilience):
- **Closed:** Funciona normal
- **Open:** Tras N fallos consecutivos, retorna error inmediato
- **Half-open:** Tras timeout, intenta una llamada de prueba

Token budgeting limita gasto por ventana de tiempo. Todas las llamadas se tracean via observabilityAdapter.

### 5. RAG (Retrieval-Augmented Generation)

- **Ingestion:** Drills, metodologia, scouting → Voyage AI embeddings → Supabase pgvector
- **Query:** Busqueda semantica (coseno) + full-text fallback
- **Sanitization:** 40+ patrones de prompt injection (EN/ES) detectados y neutralizados server-side
- **UI:** DrillRecommendations muestra ejercicios relevantes por area de desarrollo

### 6. Observabilidad

```
Sentry (errores + performance + replay)
    │
    ├── BrowserTracing (latencia de paginas)
    ├── Session Replay (10% sampling, 100% en error)
    └── ErrorBoundary (captura errores React)

agentTracer (traces de agentes IA)
    │
    ├── Latencia por agente (p95)
    ├── Success rate
    ├── Token usage
    └── Alertas (cascading failures, high latency)

observabilityAdapter (dual-write)
    │
    ├── LocalProvider (agentTracer + localStorage)
    └── LangfuseProvider (futuro, comentado)
```

### 7. Seguridad

- **Auth:** JWT Supabase verificado server-side
- **RLS:** Row Level Security en todas las tablas
- **Rate Limiting:** Sliding window por IP en endpoints de agentes
- **Prompt Injection:** ragSanitizer detecta 40+ patrones
- **Validacion:** Zod schemas en endpoints POST
- **CORS:** Headers configurados en Edge Functions
- **API Keys:** Nunca expuestas al cliente (sin prefijo VITE_)
