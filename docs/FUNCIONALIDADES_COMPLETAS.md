# VITAS · Funcionalidades Completas de la Plataforma

> Inventario exhaustivo de todo lo que tiene la aplicacion VITAS Football Intelligence.
> Ultima actualizacion: Abril 2026

---

## Indice

1. [Vision General](#vision-general)
2. [Paginas y Rutas](#paginas-y-rutas)
3. [Motor de Analisis de Video (VitasLab)](#motor-de-analisis-de-video-vitaslab)
4. [Tracking por Vision Artificial (YOLO)](#tracking-por-vision-artificial-yolo)
5. [Sistema de Inteligencia Artificial](#sistema-de-inteligencia-artificial)
6. [Metricas y Algoritmos](#metricas-y-algoritmos)
7. [Base de Datos de Jugadores Profesionales](#base-de-datos-de-jugadores-profesionales)
8. [Knowledge Base (RAG)](#knowledge-base-rag)
9. [Gestion de Equipos](#gestion-de-equipos)
10. [Sistema de Notificaciones](#sistema-de-notificaciones)
11. [Billing y Suscripciones](#billing-y-suscripciones)
12. [Sincronizacion y Offline](#sincronizacion-y-offline)
13. [Exportacion y Reportes](#exportacion-y-reportes)
14. [Partidos en Vivo](#partidos-en-vivo)
15. [Configuracion y Preferencias](#configuracion-y-preferencias)
16. [Infraestructura Tecnica](#infraestructura-tecnica)
17. [APIs y Endpoints](#apis-y-endpoints)
18. [Integraciones Externas](#integraciones-externas)
19. [Estado de Cada Feature](#estado-de-cada-feature)

---

## Vision General

VITAS es una **PWA (Progressive Web App)** de inteligencia futbolistica diseñada para scouts, entrenadores y directores de academias juveniles. Combina:

- **Video Analysis por IA** (Claude Sonnet + Gemini Vision)
- **Tracking por vision artificial** (YOLO en navegador)
- **Correccion por maduracion biologica** (PHV / TruthFilter)
- **Metricas avanzadas** (VAEP, UBI, VSI, Voronoi)
- **Base de datos de 290+ profesionales** (EA FC25)
- **Knowledge base de ejercicios** (RAG con embeddings)
- **Modo offline-first** con sincronizacion automatica

**Stack tecnologico:**
- Frontend: React 18 + Vite 8 + TypeScript + Tailwind CSS
- Backend: Vercel Serverless (Edge + Node)
- Base de datos: Supabase (PostgreSQL + Auth + RLS + Realtime)
- Video: Bunny Stream CDN
- IA: Claude Sonnet (Anthropic) + Gemini (Google)
- ML: ONNX Runtime Web (YOLO v8/v11)
- Pagos: Stripe
- Notificaciones: Web Push (VAPID)

---

## Paginas y Rutas

### Autenticacion (publicas)
| Ruta | Pagina | Funcion |
|------|--------|---------|
| `/login` | LoginPage | Email + password via Supabase Auth |
| `/register` | RegisterPage | Registro de nuevo usuario |
| `/forgot-password` | ForgotPasswordPage | Solicitar reset de password |
| `/reset-password` | ResetPasswordPage | Confirmar nuevo password |

### Principales (protegidas)
| Ruta | Pagina | Funcion |
|------|--------|---------|
| `/pulse` | Dashboard | Hub principal: stats, matches, trending players |
| `/lab` | VitasLab | Pipeline completo de video analysis |
| `/master` | MasterDashboard | Vista academia: todos los jugadores, bias alerts |
| `/rankings` | Rankings | Leaderboards por metrica |
| `/compare` | PlayerComparison | Comparacion lado a lado de 2-4 jugadores |
| `/scout` | ScoutFeed | Feed de observaciones de scouting |
| `/drill` | SoloDrill | Tracking de drills individuales |
| `/equipo` | TeamPage | Gestion de equipo (roster, posiciones) |
| `/team-analysis` | TeamAnalysisPage | Analisis tactico de equipo |
| `/director` | DirectorDashboard | Analytics de uso (solo plan Club) |
| `/billing` | BillingPage | Gestion de suscripcion Stripe |
| `/settings` | SettingsPage | Configuracion de la app |
| `/onboarding` | OnboardingPage | Setup inicial para nuevos usuarios |

### Jugador (protegidas)
| Ruta | Pagina | Funcion |
|------|--------|---------|
| `/player/:id` | PlayerProfile | Perfil completo del jugador |
| `/players/new` | PlayerForm | Crear nuevo jugador |
| `/players/:id/edit` | PlayerForm | Editar datos del jugador |
| `/players/:id/intelligence` | PlayerIntelligencePage | Resultados de analisis IA |
| `/players/:id/role-profile` | RoleProfile | Perfil tactico y arquetipos |
| `/players/:id/role-profile/compare` | RoleProfileCompare | Comparar perfiles de rol |
| `/players/:id/role-profile/audit` | RoleProfileAudit | Historial de cambios |

### Reportes (protegidas)
| Ruta | Pagina | Funcion |
|------|--------|---------|
| `/reports` | ReportsPage | Gestion de reportes |
| `/report/:id` | PlayerReportPrint | Reporte imprimible del jugador |
| `/analysis-report/:id` | AnalysisReportPrint | Reporte imprimible de analisis |

---

## Motor de Analisis de Video (VitasLab)

### Upload de video
- Subida directa a Bunny Stream CDN
- Protocolo TUS (resumable uploads)
- Barra de progreso en tiempo real
- Polling automatico de estado de encoding
- Formatos soportados: MP4 (H.264 recomendado), WebM

### Galeria de videos
- Grid de videos guardados con thumbnails
- Badge con nombre del jugador vinculado
- Seleccion rapida para analisis
- Preview con VideoPlayer integrado
- Eliminacion de videos

### Modos de analisis
| Modo | Descripcion |
|------|-------------|
| All Players | Analiza a todos los jugadores visibles |
| Click to Track | Click manual para seleccionar jugador |
| Team | Comparacion de equipos (home vs away) |
| Specific Player | Filtra por numero de camiseta y posicion |

### Calibracion de campo
- 3 presets de perspectiva: Vista Lateral, Vista Aerea, Vista Tribuna
- Calibracion manual: click en 4 esquinas del campo
- Homografia 3x3 para convertir pixels a metros
- Validacion: puntos deben formar cuadrilatero convexo

### Reporte generado
- Estado Actual (6 dimensiones con scores)
- ADN Futbolistico (perfil cualitativo)
- Jugador Referencia (comparacion con pro)
- Proyeccion de Carrera (3 escenarios: optimista/realista/pesimista)
- Plan de Desarrollo (objetivos 6m/18m + pilares + acciones)
- Ejercicios Recomendados (RAG knowledge base)
- Riesgos Identificados
- Metricas VAEP (si hay eventos)

### Historial de analisis
- Todos los analisis guardados por jugador
- Accesibles via boton HISTORIAL
- Filtro por jugador seleccionado
- Persistencia en Supabase + localStorage

---

## Tracking por Vision Artificial (YOLO)

### Deteccion
- YOLO v8/v11 corriendo en ONNX Runtime Web (navegador)
- Web Worker dedicado (no bloquea UI)
- Deteccion de: jugadores, balon, arbitros
- 17 keypoints de pose (modelo COCO)
- Confianza por deteccion y keypoint

### Tracking
- Algoritmo Hungaro para asignacion de IDs
- Filtro de Kalman para suavizado de trayectorias
- IDs persistentes a traves de frames
- Manejo de oclusiones temporales

### Metricas fisicas (tiempo real)
- Velocidad maxima (m/s y km/h)
- Velocidad promedio
- Distancia total recorrida (metros)
- Numero de sprints (>6.5 m/s por >=1s)
- Distancia en sprints
- Aceleracion maxima
- Zonas de intensidad (walk/jog/run/sprint)
- Scan events (rotacion de cabeza = conciencia espacial)
- Deteccion de duelos (aereos y terrestres)

### Visualizaciones
- **TrackingMetricsPanel**: Panel lateral con todas las metricas
- **PlayerHeatmap**: Mapa de calor sobre el campo
- **VoronoiOverlay**: Poligonos de control territorial (toggle ON/OFF)
  - Colores semi-transparentes alternados por jugador
  - Labels con ID y area m2
  - Metricas: Control Home% / Away%, area promedio

---

## Sistema de Inteligencia Artificial

### Claude Sonnet (Anthropic)
| Endpoint | Funcion | Runtime |
|----------|---------|---------|
| video-intelligence | Analisis individual de jugador | Edge |
| team-intelligence | Analisis tactico de equipo | Edge |
| player-similarity | Comparacion con profesionales | Edge |
| role-profile | Perfil tactico y arquetipos | Edge |
| phv-calculator | Calculo de maduracion biologica | Edge |
| scout-insight | Insights para feed de scouting | Edge |
| tactical-label | Etiquetado tactico de detecciones | Edge |

### Gemini (Google)
| Endpoint | Funcion | Runtime |
|----------|---------|---------|
| video-observation | Observaciones detalladas de video | Node |
| team-observation | Observaciones tacticas de equipo | Node |

### Pipeline IA
1. Keyframes extraidos del video (8 frames)
2. Gemini analiza video completo (observaciones + event counts)
3. Claude recibe: keyframes + context + Gemini observations + YOLO metrics
4. Claude genera reporte estructurado (JSON)
5. Streaming SSE con eventos de progreso

---

## Metricas y Algoritmos

### Indices principales
| Indice | Que hace |
|--------|----------|
| **VSI** | Score compuesto 0-100 (VITAS Scouting Index) |
| **PHV** | Maduracion biologica (formula Mirwald) |
| **UBI** | Indice de sesgo combinado (RAE + PHV) |
| **TruthFilter** | VSI ajustado eliminando sesgos |
| **VAEP** | Valor de acciones por probabilidad |
| **RAE** | Efecto de edad relativa (cuartiles) |

### Clasificaciones
| Sistema | Categorias |
|---------|-----------|
| VSI Tier | Elite (80+), Alto (65+), Medio (50+), Desarrollo (<50) |
| PHV | Precoz (<-1), Normal (-1 a +1), Tardio (>+1) |
| Play Style | Ofensivo, Defensivo, Tecnico, Fisico, Equilibrado |
| Similarity | Clon (92+), Muy similar (85+), Similar (75+), Referencia (60+) |
| Sample Tier | Bronze (<360min), Silver, Gold, Platinum (1800+min) |

### Radar de 6 metricas
Speed (Velocidad), Technique (Tecnica), Vision, Stamina (Resistencia), Shooting (Disparo), Defending (Defensa)

### Proyecciones
- VSI proyectado a 18 y 21 anos
- Curvas de desarrollo por metrica (edad 8-35)
- Margenes de confianza por edad (+-10% a +-20%)
- Edad equivalente profesional

---

## Base de Datos de Jugadores Profesionales

- **290+ jugadores** con metricas EA FC25
- Fuente: `src/data/proPlayers.ts` (local) + tabla `pro_players` (Supabase)
- Metricas por jugador: pace, shooting, passing, dribbling, defending, physic (0-99)
- Posiciones: GK, RB, CB, LB, DM, CM, AM, RW, LW, ST
- Usado para: Similarity matching, referencia en reportes IA
- Supabase-first con fallback a datos locales

---

## Knowledge Base (RAG)

### Contenido
- 32 drills iniciales (ejercicios de entrenamiento)
- Categorias: drill, methodology, scouting
- Embeddings vectoriales (Voyage AI / Gemini)
- Full-text search en espanol (fallback)

### Busqueda
- Widget `KnowledgeSearch` con debounce 300ms
- Filtro por categoria (pills)
- Resultados con score de similitud (barra visual)
- Integrado en reporte de VitasLab ("Ejercicios Recomendados")

### Ingesta
- Endpoint `/api/rag/ingest` para agregar contenido
- Seed automatico con `/api/rag/seed`

---

## Gestion de Equipos

### Team Management
- Crear/gestionar equipo
- Roster de jugadores
- Asignacion de posiciones
- Invitaciones por email (`/api/team/invite`)
- Aceptacion via link (`/aceptar-invitacion`)

### Team Analysis
- Analisis tactico de equipo completo
- Deteccion de formacion (4-2-3-1, 3-5-2, etc.)
- Posesion por fases
- Pressing colectivo
- Compactness y transiciones
- Heatmaps de equipo

---

## Sistema de Notificaciones

### Web Push
- Registro via VAPID keys
- Permiso del navegador (Notification API)
- Almacenado en tabla `push_subscriptions`

### Cron diario (09:00 UTC)
- Endpoint: `/api/notifications/cron`
- Configurado en Vercel Crons

### Triggers automaticos
| Trigger | Condicion | Mensaje |
|---------|-----------|---------|
| Rendimiento bajo | VSI < 50 | "Jugador X tiene VSI bajo" |
| Inactividad | >30 dias sin actualizar | "Jugador X lleva 30+ dias sin datos" |
| Limite de plan | Uso >= 90% | "Estas cerca del limite de tu plan" |

### Preferencias granulares
- Toggle por tipo de notificacion en Settings
- Persistencia en AppSettings (localStorage)

---

## Billing y Suscripciones

### Planes
| Caracteristica | Free | Pro ($19/mes) | Club ($79/mes) |
|----------------|------|---------------|-----------------|
| Jugadores | 5 | 25 | Ilimitado |
| Analisis/mes | 3 | 20 | Ilimitado |
| VAEP | No | Si | Si |
| PDF Export | No | Si | Si |
| Role Profiles | No | No | Si |
| Push Notifications | No | Si | Si |
| Director Dashboard | No | No | Si |

### Integracion Stripe
- Checkout Session para nueva suscripcion
- Customer Portal para gestion
- Webhooks para actualizacion en tiempo real
- PlanGuard component para gate de features

---

## Sincronizacion y Offline

### Offline-first
- Toda la app funciona sin internet
- Datos almacenados en localStorage
- Cola de sync para operaciones pendientes

### SyncQueueService
- Enqueue: Deduplicacion por entity + entityId
- Dequeue: Procesamiento FIFO al reconectar
- Pruning: Items con >5 reintentos se eliminan
- Timestamps: Delta sync por entidad

### Indicadores UI
- Synced / Syncing / Offline / N pendientes
- Conflictos: Last-Write-Wins automatico

---

## Exportacion y Reportes

### PDF del jugador
- `PlayerReportPrint.tsx`: Version print-friendly
- Incluye: datos, radar, VSI, PHV, metricas
- Via html2canvas o Ctrl+P nativo

### PDF del analisis
- `AnalysisReportPrint.tsx`: Version print-friendly
- Incluye: 6 dimensiones, referencia pro, proyeccion, plan

### Comparison Report
- `PlayerComparison.tsx`: Vista lado a lado
- Radar overlay, VSI, percentiles, tendencias

---

## Partidos en Vivo

### LiveFixtures widget
- Fuente: Football-Data.org API
- Proxy: `/api/fixtures/live`
- Auto-refresh: cada 60s si hay partidos en juego
- Cards: equipo vs equipo, minuto, score, status
- Status: En Juego (verde pulse), Pausado, Programado, Finalizado
- Warning si falta FOOTBALL_DATA_API_KEY

---

## Configuracion y Preferencias

### Settings
| Seccion | Opciones |
|---------|----------|
| Cuenta | Email, rol (scout activo) |
| Plan | Plan actual, limites, link a billing |
| Notificaciones | Toggle push + 4 sub-toggles granulares |
| Idioma | Espanol (ES) |
| Tema | Dark Obsidian / Light Mode |
| Seguridad | Estado de autenticacion, API keys |
| Datos | Supabase PostgreSQL status |

---

## Infraestructura Tecnica

### Frontend
| Tecnologia | Version | Uso |
|------------|---------|-----|
| React | 18.3.1 | UI framework |
| Vite | 8.x | Build tool + dev server |
| TypeScript | Strict | Type safety |
| Tailwind CSS | 3.4.17 | Styling |
| Framer Motion | 12.38.0 | Animaciones |
| React Query | 5.83.0 | Data fetching + cache |
| React Router | 6.30.1 | Routing |
| Radix UI | Multiple | Componentes accesibles |
| Recharts | 2.15.4 | Graficos |
| Lucide React | 0.462.0 | Iconos |
| Sonner | 1.7.4 | Toast notifications |

### Backend
| Tecnologia | Uso |
|------------|-----|
| Vercel Serverless | API endpoints (Edge + Node runtime) |
| Supabase | Auth, PostgreSQL, RLS, Realtime |
| Bunny Stream | Video hosting + transcoding + CDN |
| Stripe | Pagos + webhooks |
| Web Push (VAPID) | Notificaciones push |

### ML / IA
| Tecnologia | Uso |
|------------|-----|
| ONNX Runtime Web | YOLO inference en navegador |
| d3-delaunay | Voronoi tessellation |
| Claude Sonnet | Reportes de inteligencia |
| Gemini Vision | Observaciones de video |
| Voyage AI | Embeddings para RAG |

### PWA
- Service Worker para cache offline
- Manifest para instalacion
- Puerto: 5200
- Build: `npm run build` -> `dist/`

---

## APIs y Endpoints

### Video
| Metodo | Endpoint | Funcion |
|--------|----------|---------|
| POST | /api/upload/video-init | Iniciar upload Bunny |
| GET | /api/videos/:id/status | Estado de encoding |
| GET | /api/videos/list | Listar videos |
| DELETE | /api/videos/:id/delete | Eliminar video |

### Agentes IA
| Metodo | Endpoint | Funcion |
|--------|----------|---------|
| POST | /api/agents/video-intelligence | Analisis individual (Claude) |
| POST | /api/agents/video-observation | Observaciones (Gemini) |
| POST | /api/agents/team-intelligence | Analisis de equipo (Claude) |
| POST | /api/agents/team-observation | Observaciones equipo (Gemini) |
| POST | /api/agents/player-similarity | Similitud con pros |
| POST | /api/agents/role-profile | Perfil tactico |
| POST | /api/agents/phv-calculator | Calculo PHV |
| POST | /api/agents/scout-insight | Insights scouting |
| POST | /api/agents/tactical-label | Etiquetado tactico |

### RAG
| Metodo | Endpoint | Funcion |
|--------|----------|---------|
| POST | /api/rag/query | Busqueda knowledge base |
| POST | /api/rag/ingest | Ingestar contenido |
| POST | /api/rag/embed | Generar embeddings |
| GET | /api/rag/seed | Seed datos iniciales |

### Billing
| Metodo | Endpoint | Funcion |
|--------|----------|---------|
| POST | /api/stripe/checkout | Crear sesion Stripe |
| GET | /api/stripe/portal | Portal de cliente |
| POST | /api/stripe/webhook | Webhook de Stripe |

### Otros
| Metodo | Endpoint | Funcion |
|--------|----------|---------|
| POST | /api/notifications/subscribe | Registrar push |
| GET | /api/notifications/cron | Cron diario |
| POST | /api/team/invite | Invitar a equipo |
| POST | /api/team/accept | Aceptar invitacion |
| GET | /api/fixtures/live | Partidos en vivo |
| POST | /api/upload/image | Subir imagen |

---

## Integraciones Externas

| Servicio | Proposito | Tipo |
|----------|-----------|------|
| **Supabase** | Auth + DB + RLS + Realtime | Core |
| **Bunny Stream** | Video hosting + CDN + transcoding | Video |
| **Anthropic Claude** | Reportes IA + Role profiles + PHV | IA |
| **Google Gemini** | Video observation + embeddings | IA |
| **Stripe** | Pagos + suscripciones + webhooks | Billing |
| **Football-Data.org** | Fixtures en vivo | Datos |
| **Voyage AI** | Embeddings vectoriales para RAG | IA |
| **ONNX Runtime** | YOLO inference en navegador | ML |
| **d3-delaunay** | Voronoi territorial control | Geometria |

---

## Estado de Cada Feature

| Feature | Estado | Notas |
|---------|--------|-------|
| Autenticacion Supabase | ✅ Completo | + modo offline |
| CRUD de Jugadores | ✅ Completo | localStorage + Supabase sync |
| Upload de Video (Bunny) | ✅ Completo | TUS protocol |
| Tracking YOLO (navegador) | ✅ Completo | Web Worker + ONNX |
| Calibracion Homografica | ✅ Completo | + 3 presets |
| Voronoi Territorial | ✅ Completo | Toggle + metricas |
| Claude Intelligence | ✅ Completo | SSE streaming |
| Gemini Observations | ✅ Completo | Video + team |
| Pro Player Matching | ✅ Completo | 290+ jugadores EA FC25 |
| Role Profiles | ✅ Completo | 20 arquetipos |
| VAEP | ✅ Completo | Manual + Gemini events |
| PHV / TruthFilter | ✅ Completo | Formula Mirwald |
| RAG Knowledge Base | ✅ Completo | 32 drills + busqueda |
| Billing Stripe | ✅ Completo | 3 planes + webhooks |
| Push Notifications | ✅ Completo | Cron + 4 triggers |
| Team Analysis | ✅ Completo | Formacion + posesion |
| Sync Bidireccional | ✅ Completo | Cola offline + delta sync |
| Video-Player Linking | ✅ Completo | Automatico en analisis |
| Live Fixtures | ✅ Completo | Football-Data.org |
| PDF Export | ✅ Completo | html2canvas |
| Comparacion de Jugadores | ✅ Completo | Radar + metricas |
| Director Dashboard | ✅ Completo | Solo plan Club |
| Biomechanics | ⚠️ Stub | Requiere datos avanzados de pose |
| GPS Real (hardware) | ⚠️ Stub | Bridge YOLO->GPS funcional |
| Auto-detect Campo (ML) | ⚠️ Presets | Presets de perspectiva disponibles |
| Colaboracion Multi-usuario | ❌ No implementado | Futuro |

---

> **Build:** 2.1.0 | **Engine:** YOLOv11M | **PWA:** Puerto 5200
> **Copyright:** 2026 Prophet Horizon Technology
