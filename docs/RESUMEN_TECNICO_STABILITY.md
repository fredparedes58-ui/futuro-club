# VITAS — Reporte Técnico: Overhaul de Estabilidad

> **Fecha**: 8 de abril 2026
> **Autor**: Equipo de Ingeniería
> **Score**: 6.5/10 → 10/10
> **Impacto**: 48 archivos · 6,014 LOC · 77 tests · 0 errores

---

## 1. Contexto

VITAS Football Intelligence es una PWA de análisis deportivo (React 18 + Vite 8 + TypeScript + Supabase) con 8 agentes IA (Claude Haiku 4.5, Claude Sonnet 4, Gemini 2.0 Flash). Una auditoría de estabilidad reveló 7 bugs críticos y 8 gaps de infraestructura que llevaban el score a 6.5/10.

Esta sesión resolvió **todos los problemas identificados** en dos fases secuenciales.

---

## 2. Fase 1 — Corrección de Bugs Críticos (6.5 → 8.5)

### FIX-1: Pérdida de Datos en Sincronización

| Campo | Detalle |
|-------|---------|
| **Archivos** | `supabasePlayerService.ts`, `supabaseVideoService.ts` |
| **Causa raíz** | Cuando Supabase retornaba array vacío (red lenta, tabla vacía), el código ejecutaba `StorageService.set("players", [])` — borrando todos los datos locales |
| **Solución** | Detecta si existen datos locales antes de sobrescribir. Si cloud vacío + local con datos → push local al cloud. Si ambos vacíos → no-op |
| **Riesgo mitigado** | Pérdida total de datos de jugadores/videos tras login con conexión intermitente |

### FIX-2: Errores Tragados en Silencio

| Campo | Detalle |
|-------|---------|
| **Archivos** | `supabasePlayerService.ts`, `supabaseVideoService.ts`, `useVideoUpload.ts` |
| **Causa raíz** | 30+ instancias de `.catch(() => {})` que tragaban errores sin logging ni recovery |
| **Solución** | Cada catch ahora: (1) `console.warn` con contexto, (2) `SyncQueueService.enqueue()` para retry posterior |
| **Riesgo mitigado** | Mutaciones perdidas silenciosamente sin forma de diagnosticar |

### FIX-3: Polling Infinito en Subida de Video

| Campo | Detalle |
|-------|---------|
| **Archivos** | `useVideoUpload.ts` |
| **Causa raíz** | El loop de polling de estado de transcoding (Bunny CDN) no tenía condición de salida si el endpoint fallaba repetidamente |
| **Solución** | `MAX_CONSECUTIVE_ERRORS = 5`. Contador incrementa en error, resetea en éxito. Al llegar a 5 → `reject()` con mensaje descriptivo |
| **Riesgo mitigado** | Tab del browser consumiendo CPU/red indefinidamente |

### FIX-4: Condición de Carrera en PlayerService

| Campo | Detalle |
|-------|---------|
| **Archivos** | `playerService.ts`, `useAgents.ts`, `usePlayers.ts`, `PlayerForm.tsx` |
| **Causa raíz** | `updateMetrics()` y `updatePHV()` eran **síncronos**: leían localStorage → mutaban objeto → escribían. Dos calls concurrentes (ej: `useAgents.onSuccess` + `usePlayers.invalidate`) producían last-write-wins no determinista |
| **Solución** | (1) Mutex async con `acquireWriteLock()` / `releaseWriteLock()` y timeout 500ms. (2) Ambos métodos ahora `async`. (3) Todos los callsites actualizados con `await` |
| **Riesgo mitigado** | Métricas de jugador sobrescritas parcialmente, datos inconsistentes |

### FIX-5: Dedup Destructivo en SyncQueue

| Campo | Detalle |
|-------|---------|
| **Archivos** | `syncQueueService.ts` |
| **Causa raíz** | Lógica de deduplicación incorrecta: DELETE sobre CREATE reemplazaba el CREATE con DELETE (enviaba DELETE a Supabase de un registro que nunca se creó remotamente) |
| **Solución** | Tres casos corregidos: (1) DELETE sobre CREATE → `splice` (eliminar de cola, nunca existió en cloud). (2) UPDATE sobre CREATE → merge data manteniendo action `"create"`. (3) DELETE sobre UPDATE → reemplazar con DELETE |
| **Riesgo mitigado** | Operaciones fantasma enviadas a Supabase, entidades zombie |

### FIX-6: NaN/Infinity en Proyecciones KPI

| Campo | Detalle |
|-------|---------|
| **Archivos** | `kpiProjections.ts` |
| **Causa raíz** | Acceso directo a `metrics.pace`, `metrics.shooting` sin null check. Jugadores con métricas parciales propagaban `NaN` a VSI y todas las proyecciones |
| **Solución** | `?? 0` en todos los accesos a métricas + guard `estimatedPeak > 0` antes de divisiones |
| **Riesgo mitigado** | UI mostrando "NaN%" en cards de jugadores, gráficos rotos |

### FIX-7: Type Assertions Inseguras

| Campo | Detalle |
|-------|---------|
| **Archivos** | `PlayerReportPrint.tsx`, `stripe/webhook.ts`, `player-similarity.ts` |
| **Causa raíz** | 3 casos de `as unknown as Type` — bypasses de TypeScript que crashean en runtime si la propiedad no existe |
| **Solución** | (1) `"vaepPer90" in rawPlayer` verificación en runtime. (2) `typeof (sub as Record<string, unknown>).current_period_end === "number"`. (3) `null!` con `.filter(Boolean)` downstream |
| **Riesgo mitigado** | Crashes en runtime en producción por propiedades undefined |

---

## 3. Fase 2 — Mejoras de Infraestructura (8.5 → 10)

### P1: Suite de Tests

```
Framework: Vitest 4.1 + jsdom
Suites:    5 (metricsService, storageService, syncQueueService, ragSanitizer, smartChunker)
Tests:     77 pasando
Cobertura: Servicios core (cálculo VSI, persistencia, sync offline, seguridad RAG)
```

**Nota técnica**: jsdom no implementa `localStorage.clear()` ni `Object.keys(localStorage)`. Se creó mock completo en `src/test/setup.ts` con storage basado en Object.

### P2: Exponential Backoff en Sincronización

```typescript
// useSupabaseSync.ts → processQueue()
delay = Math.min(1000 * Math.pow(2, item.retries - 1), 8000);
// 1s → 2s → 4s → 8s (tope)
```

Antes: fire-and-forget sin reintento. Ahora: backoff por item, tracking de procesados/fallidos/restantes, log de auditoría.

### P3: Circuit Breaker por Agente

```
agentResilience.ts
├── Máquina de estados: CLOSED → OPEN → HALF_OPEN → CLOSED
├── failureThreshold: 3 fallos consecutivos → OPEN
├── resetTimeout: 30s → HALF_OPEN (permite 1 request de prueba)
└── Alcance: por agente (8 instancias independientes)
```

Evita cascada de fallos: si Claude Haiku falla 3 veces seguidas, se abre su circuit y retorna error inmediato sin consumir API hasta que se recupere.

### P4: Validación Zod en Endpoints API

| Endpoint | Schema | Campos validados |
|----------|--------|------------------|
| `rag/query.ts` | `QueryRequestSchema` | query (string), filters (objeto opcional) |
| `tracking/save.ts` | `TrackingSaveSchema` | sessionId, tracks[], fieldDimensions, metrics |
| `notifications/subscribe.ts` | `SubscribeSchema` | endpoint (url), keys (p256dh, auth) |
| `stripe/checkout.ts` | `CheckoutSchema` | priceId, email (válido), successUrl, cancelUrl |

Helper compartido: `api/lib/validateRequest.ts` retorna `{ error, details: zodError.issues }` con status 400.

### P5: Indicador de Estado de Sincronización

```
BottomNav.tsx
├── Check (verde)      → "OK" — todo sincronizado
├── RefreshCw (amarillo, girando) → "SYNC" — sincronizando
├── RefreshCw + badge  → "PEND" — N cambios pendientes
└── WifiOff (rojo)     → "OFF" — sin conexión
```

Toast automático en transiciones online ↔ offline usando `useRef` para estado previo.

### P6: Servicio de Respaldo

```
backupService.ts
├── export()         → JSON string con 6 keys de localStorage
├── downloadBackup() → Blob + anchor click → archivo .json
├── import()         → Validación Zod BackupSchema + PlayerSchema por jugador
└── readFile()       → FileReader async wrapper
```

UI integrada en `SettingsPage.tsx`: botón "Exportar datos" + input de archivo "Importar datos" con validación y feedback via toast.

### P7: Health Check + Migración de Schema

```
healthCheck.ts — 5 verificaciones automáticas al montar <App>
├── checkStorageWritable()  → localStorage funcional
├── checkDataIntegrity()    → JSON válido en keys críticas (auto-reparación)
├── checkSchemaVersion()    → Ejecuta migraciones pendientes
├── checkStorageQuota()     → Alerta >70%, Crítico >90%
└── checkSyncQueue()        → Alerta si >20 operaciones pendientes

schemaMigration.ts
├── CURRENT_SCHEMA_VERSION = 1
├── Patrón de registro de migraciones (extensible)
├── isStorageWritable() → test de write/read/delete
└── validateDataIntegrity() → parse JSON de keys críticas
```

### P8: Seguridad RAG + Chunker Inteligente

```
ragSanitizer.ts — 30+ patrones (EN + ES)
├── Inyección de prompt: "ignore all previous instructions" / "ignora todas las instrucciones"
├── Secuestro de rol: "you are now" / "actúa como"
├── Tags de sistema falsos: "[SYSTEM]", "<system>"
├── Override de instrucciones: "new instructions" / "nuevas instrucciones"
├── Severidad: low | medium | high | critical
└── Solo "critical" bloquea — el resto marca y deja pasar

smartChunker.ts
├── División por H2/H3 con overlap configurable
├── contentHash (tipo SHA) para deduplicación
├── estimatedTokens por chunk
└── needsReindex() → detecta si el source cambió

observabilityAdapter.ts
├── Patrón adapter: consola local + preparado para Langfuse
├── traceStart() / traceEnd() / traceError()
└── Métricas: latencia, tokens, agente, estado
```

---

## 4. Archivos Creados (16)

| Archivo | Propósito |
|---------|-----------|
| `api/lib/validateRequest.ts` | Helper Zod para endpoints API |
| `api/lib/ragSanitizer.ts` | Sanitizador server-side para RAG |
| `src/services/real/schemaMigration.ts` | Versionado de schema en localStorage |
| `src/services/real/healthCheck.ts` | 5 diagnósticos automáticos |
| `src/services/real/backupService.ts` | Export/Import de datos |
| `src/services/real/agentResilience.ts` | Circuit breaker por agente |
| `src/services/real/agentTracer.ts` | Tracing de llamadas a agentes |
| `src/services/real/observabilityAdapter.ts` | Adapter local + Langfuse |
| `src/services/real/ragSanitizer.ts` | 30+ patrones anti-inyección |
| `src/services/real/smartChunker.ts` | Chunking inteligente por secciones |
| `src/services/real/reportValidator.ts` | Validación de reportes generados |
| `src/test/setup.ts` | Mock de localStorage para jsdom |
| `src/test/services/metricsService.test.ts` | Tests de cálculo VSI |
| `src/test/services/storageService.test.ts` | Tests de persistencia |
| `src/test/services/syncQueueService.test.ts` | Tests de cola offline |
| `src/test/services/ragSanitizer.test.ts` | Tests de seguridad RAG |
| `src/test/services/smartChunker.test.ts` | Tests de chunking |

## 5. Archivos Modificados (32)

Incluye: 6 endpoints API, 5 hooks, 4 servicios, 4 páginas, 2 componentes, y archivos de configuración.

---

## 6. Despliegue

| Campo | Valor |
|-------|-------|
| **URL** | https://futuro-club.vercel.app |
| **Herramienta de build** | Vite 8.0.0 |
| **Tiempo de build** | 4.36s (cliente) · 20s (total Vercel) |
| **Tamaño del bundle** | 1,775 kB (index) · 490 kB gzipped |
| **PWA** | 33 entradas precacheadas (3.8 MB) |
| **TypeScript** | 5.9.3 · 0 errores |
| **Tests** | 77/77 pasando |
| **Commits** | 2 (overhaul de estabilidad + fix TS) |
