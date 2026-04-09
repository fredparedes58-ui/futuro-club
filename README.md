# VITAS - Football Intelligence

Plataforma de inteligencia deportiva para scouting, desarrollo de talento y analisis de rendimiento en futbol juvenil y profesional.

## Tech Stack

| Capa | Tecnologia |
|------|-----------|
| Frontend | React 18 + TypeScript 5.8 + Vite 8 |
| UI | shadcn/ui + Tailwind CSS 3 + Framer Motion |
| Estado | TanStack React Query 5 |
| Backend | Vercel Edge Functions (TypeScript) |
| Base de datos | Supabase (PostgreSQL + Auth + RLS + Realtime) |
| IA | Anthropic Claude (reportes) + Google Gemini (video) |
| ML | ONNX Runtime Web (YOLO deteccion en navegador) |
| Video | Bunny Stream (CDN + encoding + TUS upload) |
| RAG | Voyage AI embeddings + Supabase pgvector |
| Pagos | Stripe (subscripciones) |
| Monitoring | Sentry (errores + performance + replay) |
| CI/CD | GitHub Actions + Vercel |

## Requisitos

- Node.js >= 20
- pnpm >= 9

## Instalacion

```bash
# Clonar el repositorio
git clone <repo-url>
cd futuro-club

# Instalar dependencias
pnpm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus claves (ver tabla abajo)

# Desarrollo local
pnpm dev          # Frontend en http://localhost:5200
```

## Scripts

| Comando | Descripcion |
|---------|------------|
| `pnpm dev` | Servidor de desarrollo (puerto 5200) |
| `pnpm build` | Build de produccion |
| `pnpm test` | Ejecutar tests (Vitest) |
| `pnpm test:watch` | Tests en modo watch |
| `pnpm lint` | ESLint |
| `pnpm qa` | Suite de QA contra deploy |
| `pnpm qa:prod` | Suite de QA contra produccion |

## Variables de entorno

| Variable | Descripcion | Requerida |
|----------|------------|-----------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase | Si |
| `VITE_SUPABASE_ANON_KEY` | Clave publica (anon) de Supabase | Si |
| `ANTHROPIC_API_KEY` | API key de Anthropic Claude (server-side) | Si |
| `GEMINI_API_KEY` | API key de Google Gemini (server-side) | Si |
| `BUNNY_STREAM_LIBRARY_ID` | ID de libreria Bunny Stream | Si |
| `BUNNY_STREAM_API_KEY` | API key de Bunny Stream | Si |
| `BUNNY_CDN_HOSTNAME` | Hostname CDN de Bunny | Si |
| `VITE_BUNNY_CDN_HOSTNAME` | Hostname CDN (cliente) | Si |
| `VITE_SENTRY_DSN` | DSN de Sentry para monitoring | Opcional |
| `VITE_VAPID_PUBLIC_KEY` | Clave publica VAPID para Web Push | Opcional |
| `VAPID_PRIVATE_KEY` | Clave privada VAPID (server-side) | Opcional |
| `STRIPE_SECRET_KEY` | Clave secreta de Stripe | Opcional |
| `STRIPE_WEBHOOK_SECRET` | Secreto para webhooks de Stripe | Opcional |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Clave publica de Stripe | Opcional |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side) | Opcional |
| `VOYAGE_API_KEY` | API key de Voyage AI para embeddings | Opcional |

> Las variables con prefijo `VITE_` se exponen al cliente. Las demas solo estan disponibles server-side.

## Estructura del proyecto

```
futuro-club/
├── api/                    # Vercel Edge Functions (33 endpoints)
│   ├── agents/             # Agentes IA (PHV, Scout, Video, Role, Tactical)
│   ├── lib/                # Utilidades compartidas (auth, validateRequest, ragSanitizer, rateLimit)
│   ├── pipeline/           # Pipeline de analisis de video
│   ├── rag/                # Endpoints RAG (embed, ingest, query, seed)
│   ├── notifications/      # Web Push notifications
│   ├── stripe/             # Checkout, portal, webhooks
│   ├── tracking/           # Guardar sesiones de tracking
│   ├── upload/             # Upload de video e imagenes
│   └── videos/             # Listar, estado, eliminar videos
├── docs/                   # Documentacion tecnica y de producto
│   ├── API.md              # Documentacion de endpoints
│   ├── ARCHITECTURE.md     # Arquitectura del sistema
│   ├── PLAN_MAESTRO.md     # Plan maestro del producto
│   └── ...                 # Capacidades, KPIs, troubleshooting
├── scripts/                # ETL (Python) y QA deployment
├── src/
│   ├── agents/             # Contratos y tipos de agentes IA
│   ├── components/         # Componentes React (shadcn/ui + custom)
│   │   ├── intelligence/   # DrillCard, DrillRecommendations
│   │   ├── shared/         # ErrorBoundary, Layout
│   │   └── ui/             # Componentes shadcn/ui
│   ├── hooks/              # React hooks (useAgents, useRAG, etc.)
│   ├── lib/                # Utilidades (sentry, supabase, utils)
│   ├── pages/              # Paginas de la app
│   ├── services/real/      # Servicios de dominio (29 servicios)
│   └── test/               # Tests unitarios y de componentes
├── supabase/
│   └── migrations/         # Migraciones SQL
└── public/                 # Assets estaticos + PWA icons
```

## Agentes IA

| Agente | Modelo | Funcion |
|--------|--------|---------|
| PHV Calculator | Claude | Calcula madurez biologica (Peak Height Velocity) |
| Scout Insight | Claude | Genera insights de scouting para metricas |
| Video Intelligence | Claude + Gemini | Analisis completo de video (individual) |
| Team Intelligence | Claude + Gemini | Analisis tactico de equipo |
| Role Profile | Claude | Perfil tactico del jugador |
| Tactical Label | Claude | Etiquetas tacticas para detecciones de video |
| Player Similarity | Determinista | Similitud coseno con jugadores profesionales |

## Testing

```bash
pnpm test              # Ejecutar suite completa
pnpm test:watch        # Modo watch
pnpm test -- --coverage  # Con reporte de coverage
```

## Documentacion adicional

- [API Endpoints](docs/API.md) — Documentacion completa de los 33 endpoints
- [Arquitectura](docs/ARCHITECTURE.md) — Diagrama y descripcion de la arquitectura
- [Plan Maestro](docs/PLAN_MAESTRO.md) — Roadmap y fases del producto
- [Capacidades Tecnicas](docs/CAPACIDADES_TECNICAS_VITAS.md) — Stack y capacidades detalladas
- [Troubleshooting](docs/TROUBLESHOOTING.md) — Guia de resolucion de problemas
