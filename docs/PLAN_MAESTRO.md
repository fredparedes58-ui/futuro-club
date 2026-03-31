# VITAS · Football Intelligence — Plan Maestro de Desarrollo
**Versión:** 1.0 | **Fecha:** 2026-03-31 | **Estado:** Fase 1 activa

---

## ÍNDICE
1. [Estado actual del proyecto](#1-estado-actual)
2. [Decisión: Almacenamiento de Video e Imágenes](#2-storage-video-imagenes)
3. [Arquitectura técnica completa](#3-arquitectura-tecnica)
4. [FASE 1 — Claude API + localStorage](#4-fase-1)
5. [FASE 2 — Video + Roboflow](#5-fase-2)
6. [FASE 3 — Supabase + Auth + YOLOv11M](#6-fase-3)
7. [FASE 4 — SaaS + Monetización](#7-fase-4)
8. [Ítems faltantes identificados](#8-items-faltantes)
9. [Plan Q&A y Testing](#9-qa-testing)
10. [DevOps y Operaciones](#10-devops-operaciones)
11. [Cronograma estimado](#11-cronograma)
12. [Métricas de éxito](#12-metricas-exito)

---

## 1. ESTADO ACTUAL

### ✅ Completado y en producción
| Módulo | Estado | Notas |
|--------|--------|-------|
| PWA instalable (puerto 5200) | ✅ | Service Worker + manifest |
| Deploy Vercel con auto-deploy | ✅ | Push → build → deploy |
| Tema claro con contraste | ✅ | WCAG AA compliant |
| VSI Algorithm | ✅ | 6 métricas ponderadas |
| PHV / Mirwald Formula | ✅ | En prompt del agente |
| PlayerService CRUD | ✅ | localStorage |
| MetricsService | ✅ | Percentil, tendencia, clasificación |
| AgentService (4 agentes) | ✅ | Vercel Edge Functions |
| Scout Insight Agent | ✅ | Insights en español |
| Role Profile Agent | ✅ | Perfil táctico completo |
| PHV Calculator Agent | ✅ | Con ajuste VSI |
| Tactical Label Agent | ✅ | Lista para Fase 2 |
| AuditService + /api/audit | ✅ | Health check completo |
| 10 development agents (docs/) | ✅ | Contratos por área |
| Adapters UI ↔ Services | ✅ | Sin acoplamiento duro |
| React Query caching | ✅ | 24h PHV, 30min RoleProfile |
| Seed data (6 jugadores) | ✅ | Con PHV y métricas |

### ⚠️ Parcial (mock data activo)
| Módulo | Estado | Qué falta |
|--------|--------|-----------|
| Dashboard (Pulse) | ⚠️ Partial | Live matches = mock, Stats = real |
| PlayerProfile | ⚠️ Mock | Usar PlayerService real |
| PlayerComparison | ⚠️ Mock | Conectar a PlayerService |
| SoloDrill | ⚠️ Mock | Handlers de grabación reales |
| VitasLab | ⚠️ Prototype | Implementación Fase 2 |
| ReportsPage | ⚠️ Mock | Videos reales Fase 2 |
| OrderConfirmation | ⚠️ Fake | Checkout real Fase 4 |
| MasterDashboard | ⚠️ Mock | Pipelines reales |

### ❌ No iniciado (faltantes críticos)
| Módulo | Fase | Prioridad |
|--------|------|-----------|
| Autenticación | Fase 3 | CRÍTICA |
| Multi-academia | Fase 3 | ALTA |
| Upload de videos | Fase 2 | ALTA |
| Notificaciones push | Fase 2 | MEDIA |
| Gestión de equipos | Fase 3 | ALTA |
| Panel de entrenador | Fase 3 | ALTA |
| Exportar reportes PDF | Fase 2 | MEDIA |
| Error monitoring (Sentry) | Transversal | ALTA |
| Analytics (Mixpanel/Plausible) | Transversal | MEDIA |
| Tests unitarios y e2e | Transversal | ALTA |
| i18n (inglés/português) | Fase 4 | BAJA |
| Modo offline completo | Transversal | MEDIA |

---

## 2. STORAGE: VIDEO E IMÁGENES

### Decisión recomendada: **Arquitectura Híbrida**

> **Bunny.net Stream** para videos + **Cloudflare R2** para imágenes/assets estáticos

### Comparativa detallada

| Factor | Cloudflare R2 | Bunny.net | Ganador |
|--------|--------------|-----------|---------|
| **Storage precio** | $0.015/GB/mes | $0.01/GB/mes | 🐰 Bunny |
| **Egress** | $0 (con CF Workers) | $0.01/GB | ☁️ CF R2 |
| **Video streaming HLS** | ❌ Necesita CF Stream | ✅ Incluido | 🐰 Bunny |
| **Thumbnails automáticos** | ❌ Manual | ✅ Automático | 🐰 Bunny |
| **Encoding automático** | ❌ Manual | ✅ Multi-resolución | 🐰 Bunny |
| **CF Stream precio** | +$5/1000 min | Incluido | 🐰 Bunny |
| **CDN Global** | 300+ PoPs | 114 PoPs | ☁️ CF R2 |
| **Integración Vercel** | SDK/API | URL directa | Empate |
| **Latencia LATAM** | Excelente | Buena | ☁️ CF R2 |
| **API simplicidad** | S3-compatible | REST simple | 🐰 Bunny |
| **Signed URLs** | ✅ | ✅ | Empate |
| **Analytics de video** | Básico | ✅ Avanzado | 🐰 Bunny |

### Arquitectura híbrida elegida

```
VIDEOS DE ENTRENAMIENTO    →  Bunny Stream
  - Upload directo desde app
  - HLS adaptativo automático
  - Thumbnails en segundos
  - Analytics: views, completion rate
  - Precio: ~$0.005/min almacenado

IMÁGENES / AVATARES / ASSETS →  Cloudflare R2
  - Fotos de jugadores
  - Imágenes de insigias/equipos
  - Assets estáticos (SVG, PNG)
  - CDN Cloudflare = latencia mínima
  - Precio: $0.015/GB/mes, egress gratis

ROBOFLOW (Fase 2)          →  Directo (API endpoint)
  - Frames extraídos → Roboflow
  - No se almacenan en Bunny/R2
  - Solo video original en Bunny
```

### Costos estimados (100 jugadores, 50 videos/mes)

| Servicio | Uso estimado | Costo/mes |
|----------|-------------|-----------|
| Bunny Stream | 50 videos × 10min = 500min | ~$2.50 |
| Bunny CDN egress | 200GB visto | ~$2.00 |
| Cloudflare R2 | 5GB avatares/assets | ~$0.08 |
| Claude Haiku | ~1000 calls/mes | ~$2.00 |
| Vercel Pro | Plan Pro | $20.00 |
| **Total** | | **~$26.58/mes** |

### Variables de entorno necesarias (Fase 2)
```bash
# Bunny.net
BUNNY_STORAGE_ZONE=vitas-videos
BUNNY_STORAGE_API_KEY=xxx
BUNNY_STREAM_LIBRARY_ID=xxx
BUNNY_STREAM_API_KEY=xxx
BUNNY_CDN_HOSTNAME=vitas.b-cdn.net

# Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=vitas-assets
R2_PUBLIC_URL=https://assets.vitas.app
```

---

## 3. ARQUITECTURA TÉCNICA COMPLETA

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENTE (PWA)                           │
│  React 18.3 + TypeScript + Vite 8 + Tailwind + shadcn/ui   │
│  Puerto 5200 (local) | futuro-club.vercel.app (prod)        │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼────────────────────────────────┐
│                  VERCEL EDGE FUNCTIONS                      │
│  /api/agents/phv-calculator   (Claude Haiku, temp=0)        │
│  /api/agents/scout-insight    (Claude Haiku, temp=0)        │
│  /api/agents/role-profile     (Claude Haiku, temp=0)        │
│  /api/agents/tactical-label   (Claude Haiku, temp=0)        │
│  /api/audit                   (health check)                │
│  /api/upload/video            [FASE 2] Bunny Stream upload  │
│  /api/upload/image            [FASE 2] CF R2 upload         │
│  /api/roboflow/analyze        [FASE 2] Frame análisis       │
└──────┬──────────────┬──────────────────────────────────────┘
       │              │
┌──────▼──────┐  ┌────▼──────────────────────────────────────┐
│ Anthropic   │  │           STORAGE LAYER                   │
│ Claude API  │  │  Bunny Stream → Videos HLS                │
│ Haiku 4.5   │  │  Cloudflare R2 → Imágenes/Assets          │
└─────────────┘  │  Roboflow API → Frame detection [F2]      │
                 │  Supabase DB → Datos persistentes [F3]     │
                 │  Supabase Auth → Multi-academia [F3]       │
                 └────────────────────────────────────────────┘
```

---

## 4. FASE 1 — Claude API + localStorage
**Objetivo:** App funcional 100% sin backend propio
**Estado:** 85% completo

### Sprint 1.1 — UI Modules conectados (URGENTE)
**Duración:** 3-5 días

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| Conectar PlayerProfile | `pages/PlayerProfile.tsx` | Usar PlayerService.getById() |
| Conectar PlayerComparison | `pages/PlayerComparison.tsx` | Usar PlayerService.getAll() |
| PHV en Rankings | `pages/Rankings.tsx` | Badge PHV en PlayerCard |
| PHV en PlayerProfile | `pages/PlayerProfile.tsx` | Sección biológica + gauge |
| SoloDrill handler | `pages/SoloDrill.tsx` | "Grabar Drill" → stub Fase 2 |
| MasterDashboard real | `pages/MasterDashboard.tsx` | Pipelines con AuditService |
| Crear/editar jugador UI | `components/PlayerForm.tsx` | Form + validación Zod |
| Eliminar jugador UI | `components/PlayerCard.tsx` | Confirm dialog |

### Sprint 1.2 — Formularios y CRUD completo
**Duración:** 3-4 días

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| Form crear jugador | Nueva página `/players/new` | 6 métricas + datos básicos |
| Form editar jugador | `/players/:id/edit` | Pre-fill con datos actuales |
| Actualizar métricas | Botón en PlayerProfile | Slider o número input |
| Historial VSI | Componente gráfico | Recharts LineChart |
| Búsqueda de jugadores | Rankings + Scout | Input con filtro en tiempo real |
| Filtros avanzados | Rankings | Por posición, edad, nivel |

### Sprint 1.3 — Pulir experiencia
**Duración:** 2-3 días

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| Empty states | Todas las páginas | Si no hay jugadores |
| Loading states | Todas las páginas | Skeleton loaders |
| Error states | Todas las páginas | ErrorBoundary personalizado |
| Toast notifications | Actions CRUD | Feedback de acciones |
| Confirmaciones | Delete, acciones críticas | Dialog de confirmación |

### Entregables Fase 1
- [ ] App 100% funcional con datos reales (no mocks)
- [ ] CRUD completo de jugadores
- [ ] PHV visible en todos los módulos
- [ ] Scout insights generados por Claude
- [ ] Role profiles por jugador
- [ ] 0 referencias a mockData en producción

---

## 5. FASE 2 — Video + Roboflow
**Objetivo:** Análisis automático de rendimiento por video
**Duración estimada:** 4-6 semanas

### Sprint 2.1 — Infrastructure de Storage
**Semana 1-2**

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| Setup Bunny Stream account | Externo | Crear library, obtener API keys |
| Setup Cloudflare R2 bucket | Externo | Crear bucket vitas-assets |
| API upload video | `api/upload/video.ts` | Proxy seguro → Bunny Stream |
| API upload imagen | `api/upload/image.ts` | Proxy seguro → CF R2 |
| VideoUploadService | `src/services/real/videoService.ts` | Cliente frontend |
| ImageUploadService | `src/services/real/imageService.ts` | Resize + upload |
| Variables Vercel | Dashboard Vercel | BUNNY_* + R2_* vars |

### Sprint 2.2 — Pipeline Roboflow
**Semana 2-3**

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| Setup Roboflow proyecto | Roboflow.com | Dataset fútbol juvenil |
| Etiquetar primeras 100 imágenes | Roboflow | PHV + posición + acción |
| Entrenar modelo YOLOv8 | Roboflow | Primer modelo base |
| API frame extractor | `api/video/extract-frames.ts` | FFmpeg o Bunny webhooks |
| API Roboflow proxy | `api/roboflow/detect.ts` | Proxy seguro con API key |
| TacticalLabelAgent conectado | `api/agents/tactical-label.ts` | Usar detecciones reales |
| Pipeline completo | `api/video/analyze.ts` | Video → Frames → Detecciones → Etiquetas |

### Sprint 2.3 — UI de Video
**Semana 3-4**

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| VitasLab upload | `pages/VitasLab.tsx` | Drop zone + progress bar |
| Video player HLS | `components/VideoPlayer.tsx` | HLS.js o Video.js |
| Overlay anotaciones | `components/VideoAnnotations.tsx` | Canvas sobre video |
| Progress de análisis | `components/AnalysisProgress.tsx` | Pasos del pipeline |
| Reports reales | `pages/ReportsPage.tsx` | Videos desde Bunny CDN |
| Video por jugador | `pages/PlayerProfile.tsx` | Sección de videos del jugador |
| Drill grabación | `pages/SoloDrill.tsx` | WebRTC upload directo |

### Sprint 2.4 — SoloDrill con cámara
**Semana 4-5**

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| Acceso cámara WebRTC | `hooks/useCamera.ts` | MediaDevices API |
| Grabación en cliente | `hooks/useRecorder.ts` | MediaRecorder API |
| Upload post-grabación | `services/real/videoService.ts` | Upload a Bunny Stream |
| PHV overlay en grabación | `components/DrillOverlay.tsx` | Info PHV durante drill |
| Thumbnails automáticos | Bunny Stream webhook | Almacenar en CF R2 |

### Entregables Fase 2
- [ ] Videos subidos y servidos por Bunny CDN
- [ ] Imágenes en Cloudflare R2
- [ ] Pipeline: Video → Frames → Roboflow → Etiquetas PHV
- [ ] TacticalLabelAgent usando detecciones reales
- [ ] SoloDrill con grabación real desde cámara
- [ ] Reports con thumbnails automáticos
- [ ] VitasLab funcional con análisis real

---

## 6. FASE 3 — Supabase + Auth + YOLOv11M
**Objetivo:** Backend real, multi-academia, producción SaaS
**Duración estimada:** 6-8 semanas

### Sprint 3.1 — Base de datos Supabase
**Semana 1-2**

```sql
-- Tablas principales
academias         (id, nombre, plan, owner_id, created_at)
usuarios          (id, email, role: admin|scout|entrenador, academia_id)
jugadores         (id, nombre, posicion, academia_id, ...metricas)
metricas_historial(id, jugador_id, vsi, fecha, metricas_json)
phv_records       (id, jugador_id, offset, categoria, adjusted_vsi, fecha)
videos            (id, jugador_id, bunny_video_id, url, duration, analizado)
detecciones       (id, video_id, frame_num, roboflow_json, etiquetas_json)
insights          (id, jugador_id, tipo, headline, body, urgencia, fecha)
role_profiles     (id, jugador_id, identidad, arquetipos_json, capacidades_json)
drills            (id, jugador_id, video_id, categoria, duracion, fecha)
```

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| Crear proyecto Supabase | supabase.com | Proyecto + región más cercana |
| SQL migrations | `supabase/migrations/` | Crear todas las tablas |
| Row Level Security | Supabase Dashboard | Jugadores visibles solo en su academia |
| Supabase Storage buckets | Dashboard | Videos privados + avatares públicos |
| SupabaseService | `src/services/supabase/` | Cliente tipado con Zod |
| Migración localStorage→Supabase | `src/services/migration.ts` | One-time migration script |

### Sprint 3.2 — Autenticación multi-academia
**Semana 2-3**

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| Auth con Supabase | `src/auth/` | Email + password básico |
| Roles: Admin/Scout/Entrenador | `src/auth/roles.ts` | RBAC completo |
| Login page | `pages/LoginPage.tsx` | Form + validación |
| Register academia | `pages/RegisterPage.tsx` | Onboarding multi-paso |
| Protected routes | `src/router/ProtectedRoute.tsx` | Redirect si no autenticado |
| Perfil de usuario | `pages/ProfilePage.tsx` | Editar datos + foto |
| Cambio de contraseña | `pages/SettingsPage.tsx` | Integrar en Settings |
| Invitar scouts | `pages/SettingsPage.tsx` | Email invitation flow |
| Límites por plan | `src/auth/limits.ts` | Free: 10 jugadores, Pro: 50, Enterprise: ∞ |

### Sprint 3.3 — YOLOv11M propio
**Semana 3-5**

| Tarea | Plataforma | Descripción |
|-------|-----------|-------------|
| Dataset 1000+ imágenes etiquetadas | Roboflow | Acumular en Fase 2 |
| Fine-tune YOLOv11M | Roboflow Training | Con contexto PHV juvenil |
| Export modelo | Roboflow | ONNX o TensorRT |
| Deploy modelo | Modal.com o Replicate | GPU serverless |
| YOLO API endpoint | `api/yolo/detect.ts` | Reemplaza Roboflow |
| Comparativa Roboflow vs YOLO | AuditAgent | Métricas de precisión |
| A/B test silencioso | Feature flag | Switch entre motores |

### Sprint 3.4 — Panel de entrenador
**Semana 5-6**

| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| Dashboard entrenador | `pages/CoachDashboard.tsx` | Vista equipo completo |
| Gestión de equipo | `pages/TeamPage.tsx` | Lista + CRUD jugadores |
| Calendario entrenamientos | `pages/CalendarPage.tsx` | Sesiones por semana |
| Asignación de drills | `pages/DrillAssignment.tsx` | Drill → jugador |
| Notificaciones push | `src/services/pushService.ts` | Web Push API + VAPID |
| Alertas PHV automáticas | Background job Supabase | Si PHV cambia de categoría |

### Entregables Fase 3
- [ ] Autenticación funcional con roles
- [ ] Multi-academia con aislamiento de datos (RLS)
- [ ] Toda la data en Supabase (no localStorage)
- [ ] YOLOv11M propio en producción
- [ ] Panel de entrenador completo
- [ ] Notificaciones push activas
- [ ] 0 mock data en producción

---

## 7. FASE 4 — SaaS + Monetización
**Objetivo:** Producto de pago con múltiples academias reales
**Duración estimada:** 4-6 semanas

### Planes de precios propuestos

| Plan | Precio/mes | Jugadores | Videos/mes | Agentes IA | Target |
|------|-----------|-----------|-----------|------------|--------|
| **Free** | $0 | 10 | 5 | Limitado | Demo / prueba |
| **Scout** | $29 | 50 | 50 | Completo | Ojeador individual |
| **Academy** | $99 | 200 | 200 | Completo + YOLO | Academia pequeña |
| **Elite** | $299 | ∞ | ∞ | Todo + API | Academia grande |

### Sprint 4.1 — Pagos
| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| Setup Stripe | stripe.com | Cuenta + productos |
| Checkout flow | `pages/CheckoutPage.tsx` | Reemplaza OrderConfirmation mock |
| Webhooks Stripe | `api/webhooks/stripe.ts` | Activar/desactivar plan |
| Customer portal | `api/stripe/portal.ts` | Gestión auto-servicio |
| Billing page | `pages/BillingPage.tsx` | Estado plan + historial |
| Límites por plan | Middleware | Bloquear si excede límite |

### Sprint 4.2 — Onboarding y retención
| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| Onboarding guiado | `components/OnboardingWizard.tsx` | 5 pasos para primera academia |
| Email transaccional | Resend.com | Bienvenida, alertas PHV |
| Analytics de uso | Plausible.io | Privacidad-first, GDPR |
| Error monitoring | Sentry.io | Alerts de errores en prod |
| NPS survey | In-app | Cada 30 días |
| Referral program | `pages/ReferralPage.tsx` | Descuentos por referidos |

### Sprint 4.3 — API pública (Enterprise)
| Tarea | Archivo | Descripción |
|-------|---------|-------------|
| API keys management | `pages/ApiKeysPage.tsx` | Generar/revocar keys |
| Rate limiting | `api/middleware/rateLimit.ts` | Por plan |
| Documentación API | docs.vitas.app | Swagger/OpenAPI |
| Webhooks outbound | `api/webhooks/outbound.ts` | Notificar sistemas externos |

### Sprint 4.4 — Expansión internacional
| Tarea | Descripción |
|-------|-------------|
| i18n (en/es/pt) | react-i18next |
| GDPR compliance | Cookie consent + data export |
| Términos legales | ToS + Privacy Policy |
| VAT handling | Stripe Tax |

---

## 8. ÍTEMS FALTANTES IDENTIFICADOS

### 🔴 Críticos (sin esto el producto no funciona en producción)

| Ítem | Fase | Descripción |
|------|------|-------------|
| **Autenticación** | F3 | Sin auth, cualquiera ve todos los datos |
| **Aislamiento de datos** | F3 | Sin RLS de Supabase, academias se mezclan |
| **CRUD completo UI** | F1 | No hay form para crear/editar jugadores |
| **Error Monitoring** | F1 | Sin Sentry, los errores de producción son invisibles |
| **Validación de inputs** | F1 | Formularios sin validación completa |

### 🟠 Alta prioridad (degradan experiencia sin ellos)

| Ítem | Fase | Descripción |
|------|------|-------------|
| **Búsqueda de jugadores** | F1 | No se puede buscar por nombre |
| **Filtros en Rankings** | F1 | Solo ordenación, no filtro por posición/edad |
| **Historial VSI visual** | F1 | El gráfico de evolución no existe en UI |
| **Notificaciones push** | F3 | Sin alertas de PHV, el entrenador no actúa a tiempo |
| **Exportar PDF** | F2 | Sin PDF, el informe no sale de la app |
| **Modo offline completo** | F2 | Service Worker cachea pero sin sync conflict resolution |
| **PlayerProfile con datos reales** | F1 | Usa mockPlayers todavía |
| **PlayerComparison con datos reales** | F1 | Usa mockPlayers todavía |

### 🟡 Media prioridad (mejoras importantes)

| Ítem | Fase | Descripción |
|------|------|-------------|
| **Tests unitarios** | F1 | 0 tests en el proyecto actualmente |
| **Tests e2e (Playwright)** | F2 | Flujos críticos sin cobertura |
| **Gestión de equipo** | F3 | Sin gestión de plantilla del equipo |
| **Calendario de entrenamientos** | F3 | Sin planning de sesiones |
| **Comparación multi-jugador** | F2 | Solo 2 jugadores actualmente |
| **Comentarios en perfil** | F2 | Scout notes no persisten |
| **Asignación drill → jugador** | F3 | No hay asignación personalizada |
| **Dashboard entrenador** | F3 | Vista diferente a la del scout |
| **Analytics de uso** | F2 | No se sabe qué usa cada scout |
| **Rate limiting en API** | F2 | Sin límites, un usuario puede agotar cuota |

### 🔵 Baja prioridad (nice to have)

| Ítem | Fase | Descripción |
|------|------|-------------|
| **Dark mode** | F4 | Toggle tema oscuro |
| **i18n** | F4 | Inglés y portugués |
| **Compartir perfil jugador** | F3 | Link público temporal |
| **Chat entre scouts** | F4 | Mensajería interna |
| **Integración con WyScout/InStat** | F4 | Import de datos externos |
| **Match data import** | F4 | Importar desde archivo CSV |
| **App nativa (React Native)** | F4 | iOS/Android nativo |
| **Wearables integration** | F4 | GPS, frecuencia cardíaca |

---

## 9. Q&A Y TESTING

### Plan de testing por fase

#### FASE 1 — Testing manual + unitario

```
UNIT TESTS (Vitest — configurar)
├── metricsService.test.ts
│   ├── calculateVSI con pesos correctos
│   ├── calculatePercentile con arrays de prueba
│   ├── classifyVSI cubre todos los rangos
│   └── calculateTrend detecta delta < 2
├── playerService.test.ts
│   ├── create retorna jugador con VSI calculado
│   ├── updateMetrics actualiza vsiHistory
│   ├── delete elimina correctamente
│   └── seedIfEmpty no duplica datos
├── auditService.test.ts
│   ├── runSync retorna AuditReport
│   └── worstStatus calcula correctamente
└── adapters.test.ts
    ├── adaptPlayerForUI mapea phvCategory
    └── computeDashboardStats calcula hiddenTalents
```

```
MANUAL QA CHECKLIST — Fase 1
□ Abrir app en Chrome → carga sin errores de consola
□ Instalar PWA → icono en escritorio/inicio
□ Navegar todas las páginas → sin pantallas en blanco
□ Crear jugador → aparece en Rankings y Dashboard
□ Editar métricas → VSI se recalcula
□ Eliminar jugador → desaparece de todos los módulos
□ Ver ScoutFeed → insights en español (no JSON crudo)
□ Ver RoleProfile de un jugador → perfil táctico completo
□ Calcular PHV → categoría visible en PlayerProfile
□ Rankings → ordenar por VSI, nombre, edad
□ Búsqueda → filtrar por nombre (cuando esté implementado)
□ GET /api/audit → overall: ok o warning (no error)
□ Modo offline → página carga sin internet (SW activo)
□ Responsive → funciona en móvil 375px
```

#### FASE 2 — Testing pipeline de video

```
VIDEO PIPELINE QA
□ Subir video MP4 < 100MB → progress bar real
□ Video aparece en Bunny CDN con URL pública
□ Thumbnail generado automáticamente en < 30s
□ HLS streaming funciona sin buffering excesivo
□ Extracción de frames → N frames enviados a Roboflow
□ Detecciones Roboflow → JSON válido con bboxes
□ TacticalLabelAgent → etiquetas PHV coherentes
□ Video asociado al jugador correcto
□ Eliminar video → se borra de Bunny Stream

PERFORMANCE QA
□ Video < 100MB sube en < 60s (fibra)
□ Thumbnail visible en < 10s post-upload
□ Pipeline completo (upload→análisis) < 5 min
□ Frames por segundo: mínimo 1 FPS para análisis
```

#### FASE 3 — Testing de autenticación y datos

```
AUTH QA
□ Registro → email de confirmación recibido
□ Login con credenciales correctas → redirect a dashboard
□ Login con credenciales incorrectas → mensaje de error claro
□ Token expirado → redirect a login automático
□ Scout no puede ver jugadores de otra academia (RLS)
□ Admin puede invitar scouts por email
□ Scout solo puede ver, no crear jugadores (RBAC)

MULTI-ACADEMIA QA
□ Academia A crea jugador → Academia B no lo ve
□ Eliminar academia → elimina todos sus datos (cascade)
□ Límite plan → error claro al exceder (no crash)
□ Upgrade plan → límites se actualizan inmediatamente

MIGRACIÓN QA
□ Script migración localStorage → Supabase: 0 pérdida de datos
□ Seed data en Supabase = mismo resultado que localStorage
□ Rollback posible si migración falla
```

#### FASE 4 — Testing de pagos

```
STRIPE QA (modo test)
□ Checkout con tarjeta test 4242 4242 4242 4242 → éxito
□ Webhook Stripe recibido → plan actualizado en Supabase
□ Cancelación → plan degradado a Free
□ Factura generada → PDF accesible en Billing page
□ Customer portal → auto-servicio funciona
□ Tarjeta fallida → mensaje de error claro
```

### Herramientas de testing recomendadas

| Herramienta | Uso | Prioridad |
|-------------|-----|-----------|
| **Vitest** | Unit tests (ya en deps) | 🔴 Ahora |
| **Testing Library** | Component tests | 🔴 Ahora |
| **Playwright** | E2E tests críticos | 🟠 Fase 2 |
| **Sentry** | Error monitoring producción | 🔴 Ahora |
| **Lighthouse CI** | Performance en cada deploy | 🟠 Fase 2 |
| **k6** | Load testing API agents | 🟡 Fase 3 |

---

## 10. DEVOPS Y OPERACIONES

### CI/CD actual
```
GitHub push main
  └── Vercel auto-detect
        ├── npm install --legacy-peer-deps
        ├── npm run build
        └── Deploy edge functions + static
```

### CI/CD mejorado (implementar en Fase 2)

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  test:
    - npm run test (Vitest)
    - npm run type-check
    - npm run lint
  build:
    - npm run build
    - Lighthouse CI score > 90
  deploy:
    - Solo si rama = main
    - Solo si tests pasan
```

### Monitoreo de producción

| Herramienta | Métrica | Alerta si |
|-------------|---------|-----------|
| **Sentry** | Errores JS | > 0 nuevos errores |
| **Vercel Analytics** | Web Vitals | LCP > 2.5s |
| **/api/audit** | Health check | overall != "ok" |
| **Bunny Analytics** | CDN bandwidth | Pico anómalo |
| **Anthropic Console** | Token usage | > $10/día |
| **Uptime Robot** | URL disponible | > 2 min caído |

### Variables de entorno — Inventario completo

```bash
# FASE 1 — Ya configuradas en Vercel
ANTHROPIC_API_KEY=sk-ant-...

# FASE 2 — Agregar en Vercel cuando se implemente
BUNNY_STORAGE_ZONE=vitas-videos
BUNNY_STORAGE_API_KEY=
BUNNY_STREAM_LIBRARY_ID=
BUNNY_STREAM_API_KEY=
BUNNY_CDN_HOSTNAME=
CLOUDFLARE_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=vitas-assets
R2_PUBLIC_URL=
ROBOFLOW_API_KEY=
ROBOFLOW_PROJECT_ID=
ROBOFLOW_VERSION=

# FASE 3 — Agregar cuando Supabase esté listo
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
YOLO_ENDPOINT_URL=
YOLO_API_KEY=

# FASE 4 — Agregar cuando Stripe esté listo
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_SCOUT=
STRIPE_PRICE_ACADEMY=
STRIPE_PRICE_ELITE=
VITE_STRIPE_PUBLISHABLE_KEY=
RESEND_API_KEY=
```

### Branching strategy

```
main          ← Producción (protegido, requiere PR)
develop       ← Staging (deploy automático a preview)
feature/*     ← Features individuales
fix/*         ← Bug fixes
```

---

## 11. CRONOGRAMA ESTIMADO

```
2026 — Q1-Q4

ABRIL 2026       FASE 1 — Completar (3-4 semanas)
  Semana 1-2:    Sprint 1.1 — Conectar UI a datos reales
  Semana 2-3:    Sprint 1.2 — CRUD jugadores completo
  Semana 3-4:    Sprint 1.3 — Pulir + tests unitarios
  MILESTONE:     App 100% funcional sin mocks

MAYO 2026        FASE 2 — Video (4-6 semanas)
  Semana 1-2:    Sprint 2.1 — Bunny Stream + CF R2 setup
  Semana 2-3:    Sprint 2.2 — Pipeline Roboflow
  Semana 3-4:    Sprint 2.3 — UI de video + Reports
  Semana 4-5:    Sprint 2.4 — SoloDrill con cámara
  MILESTONE:     Video análisis automático en producción

JUNIO-JULIO      FASE 3 — Backend real (6-8 semanas)
  Semana 1-2:    Sprint 3.1 — Supabase + migraciones SQL
  Semana 2-3:    Sprint 3.2 — Auth multi-academia
  Semana 3-5:    Sprint 3.3 — YOLOv11M entrenamiento + deploy
  Semana 5-6:    Sprint 3.4 — Panel entrenador + push
  MILESTONE:     MVP SaaS con autenticación real

AGOSTO 2026      FASE 4 — SaaS (4-6 semanas)
  Semana 1-2:    Sprint 4.1 — Stripe + planes
  Semana 2-3:    Sprint 4.2 — Onboarding + emails
  Semana 3-4:    Sprint 4.3 — API pública Enterprise
  MILESTONE:     Primer cliente de pago
```

---

## 12. MÉTRICAS DE ÉXITO

### Técnicas (cada fase)
| Métrica | Fase 1 | Fase 2 | Fase 3 | Fase 4 |
|---------|--------|--------|--------|--------|
| Test coverage | > 60% | > 70% | > 80% | > 85% |
| Lighthouse perf | > 85 | > 85 | > 90 | > 90 |
| LCP (Core Web Vitals) | < 2.5s | < 2.5s | < 2.0s | < 2.0s |
| Errores Sentry/semana | < 10 | < 5 | < 2 | < 1 |
| Build time | < 60s | < 90s | < 120s | < 120s |
| Bundle size | < 1.5MB | < 2MB | < 2MB | < 2MB |

### De producto (Fase 4)
| Métrica | Target 3 meses | Target 6 meses |
|---------|---------------|---------------|
| Academias registradas | 5 | 20 |
| Jugadores en plataforma | 200 | 1000 |
| Videos analizados | 100 | 500 |
| MRR (Monthly Recurring Revenue) | $500 | $2000 |
| Retención mes 2 | > 70% | > 80% |
| NPS score | > 40 | > 50 |

---

## APÉNDICE: Agentes de desarrollo disponibles

Todos en `docs/agents/`:

| Agente | Archivo | Área |
|--------|---------|------|
| PlayerCRUD Agent | `fase1-player-crud-agent.md` | CRUD jugadores |
| PHV Integration | `fase1-phv-integration-agent.md` | Conectar PHV a UI |
| UI Connect Agent | `fase1-ui-connect-agent.md` | Módulos restantes |
| Video Upload Agent | `fase2-video-upload-agent.md` | Bunny + CF R2 |
| Roboflow Pipeline | `fase2-roboflow-pipeline-agent.md` | Análisis automático |
| Supabase Migration | `fase3-supabase-migration-agent.md` | localStorage → DB |
| Auth Agent | `fase3-auth-agent.md` | Multi-academia auth |
| YOLO Agent | `fase3-yolo-agent.md` | YOLOv11M deploy |
| **Audit Agent** | `transversal-audit-agent.md` | Health check |
| Debug Agent | `transversal-debug-agent.md` | Diagnóstico errores |
| Deploy Agent | `transversal-deploy-agent.md` | Build + push + deploy |

---

*Documento generado: 2026-03-31 | Próxima revisión: Al completar Fase 1*
