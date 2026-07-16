# B1 / Visión V4 — Pipeline async de tracking (partidos de 90 min)

> Estado: **DISEÑO** (2026-07-16). Convierte VITAS de "clips cortos" a "partidos
> completos". Bloqueo de verificación E2E: un clip/vídeo largo real (A2, Pedro).

## Problema

Hoy el tracking de jugadores/balón es **síncrono**:

```
Cliente ──POST──▶ /api/coaching/track-players (Vercel Edge)
                        │  await fetch(MODAL_TRACK_URL)   ← bloquea
                        ▼
                   Modal track()  (timeout=900s = 15 min)
```

- El endpoint Edge de Vercel muere a los ~25-30 s → un vídeo largo nunca
  completa por esta vía.
- Guard actual (`_track-players.ts:104`, `MAX_SYNC_TRACK_SEC=240`): vídeos
  > 4 min se **rechazan** con 413 `video_too_long_for_sync`.
- `videoTrackingService.trackVideo` (cliente) devuelve `stage:"too_long"` — un
  callejón sin salida. El servicio, además, está **huérfano** (producción usa
  ONNX en el navegador para clips), así que hoy no hay NINGUNA ruta que trackee
  un partido completo.

## Objetivo

Trackear un partido de 90 min en segundo plano y que el resultado aparezca en la
UI cuando esté listo, sin bloquear al usuario.

## Patrón a espejar (ya existe para *analyses*)

- Tabla con `status` `queued → processing → done/failed`.
- RPC atómica `claim_queued_analyses(batch_size)` (`FOR UPDATE SKIP LOCKED`,
  migración `040`).
- Cron drenador `/api/crons/process-analyses-queue` (`vercel.json`).

Diferencia clave: el tracking corre en **GPU Modal durante minutos**, más que el
timeout de cualquier invocación Edge. Por eso no vale "cron llama y espera" →
hace falta **spawn asíncrono + callback**.

## Arquitectura propuesta

```
1. ENQUEUE           2. SPAWN (fire-and-forget)      3. CALLBACK            4. POLL
Cliente                                                Modal ──POST──▶ webhook   Cliente
  │ POST track-async     Edge ──▶ Modal.track_async      guarda result        │ GET track-status
  ▼                        │        (.spawn())              status=done        ▼
tracking_jobs (queued) ────┘        └─▶ corre en bg ──────────┘            lee la fila del job
```

### 4.1 · DB — nueva migración `052_tracking_jobs.sql`
```sql
create table tracking_jobs (
  id uuid primary key default gen_random_uuid(),
  video_id text not null,
  player_id text,               -- null = todos los jugadores
  org_id uuid not null,         -- RLS (ver supabase-schema-gotchas: no user_id)
  status text not null default 'queued'
        check (status in ('queued','processing','done','failed')),
  sample_fps int not null default 5,
  duration_sec int,
  modal_call_id text,           -- id del spawn (para reintentos/observabilidad)
  result jsonb,                 -- TrackingResponse cuando done
  error text,
  attempts int not null default 0,
  created_at timestamptz default now(),
  started_at timestamptz,
  finished_at timestamptz
);
-- índice para el cron drenador / limpieza
create index on tracking_jobs (status, created_at);
-- RPC atómica análoga a 040
create function claim_queued_tracking_jobs(batch_size int default 3) ...
-- RLS: org_id = academia del usuario (patrón 038_multi_academy_isolation)
```

### 4.2 · Modal `vision-pipeline/app.py` — spawn + callback
- Nueva `@app.function(timeout=1800)` `run_track_and_callback(payload, callback_url, token)`:
  corre el tracking existente (reutiliza la lógica de `track()`), y al terminar
  hace `requests.post(callback_url, json={jobId, result}, headers={X-Modal-Token})`.
- Nuevo `@modal.fastapi_endpoint(POST)` `track_async(payload)`:
  `run_track_and_callback.spawn(...)` y responde `{ call_id }` al instante.
- El token es un HMAC corto (secreto compartido `MODAL_CALLBACK_SECRET`) para que
  el webhook no acepte payloads falsos.

### 4.3 · API (TS, sí verificable sin clip)
- `POST /api/coaching/track-async` — crea fila `tracking_jobs` (queued), llama a
  `track_async` de Modal (spawn), guarda `modal_call_id`, responde `{ jobId }`.
  Reutiliza `withHandler` (auth + rate-limit + allowServiceToken).
- `POST /api/webhooks/modal-tracking` — verifica el token HMAC, escribe
  `result` + `status='done'` (o `failed`) en la fila. `rawBody:true` +
  `ctx.rawBody` (ojo al bug de doble-consumo del stream, ver RAG `_ingest`).
- `GET /api/coaching/track-status?jobId=` — devuelve `{ status, result?, error? }`
  para el polling del cliente.
- (Red de seguridad) `GET /api/crons/process-tracking-queue` — reencola jobs
  `queued` sin `modal_call_id` (spawn falló) y marca `failed` los `processing`
  colgados > N min. Añadir a `vercel.json` crons.

### 4.4 · Cliente `src/services/real/videoTrackingService.ts`
- En `trackVideo`, cuando `durationSec > MAX_SYNC_TRACK_SEC`: en vez de
  `stage:"too_long"`, llamar a `track-async` → obtener `jobId` → **poll**
  `track-status` cada ~10 s con `onProgress`, resolver cuando `done`.
- Mantener la ruta síncrona actual para clips cortos (sin cambios).
- Nuevo stage `"queued"`/`"processing"` en el tipo de progreso.

## Plan por fases (cada una = 1 PR)

| Fase | Contenido | Verificable sin clip |
|------|-----------|----------------------|
| **V4.1** | Migración `052_tracking_jobs` + RPC + RLS | ✅ (SQL + test RLS) |
| **V4.2** | Endpoints TS: track-async / webhook / track-status + tests | ✅ (unit + `vitest.api`) |
| **V4.3** | Modal `track_async` + `run_track_and_callback` (deploy) | ⚠️ smoke (health), E2E necesita clip |
| **V4.4** | Cliente: enqueue+poll en videoTrackingService | ✅ (unit con fetch mock) |
| **V4.5** | Cron red-de-seguridad + observabilidad (Slack ping) | ✅ |
| **V4.6** | **E2E real con un clip largo** + benchmark | ❌ **bloqueado en A2 (Pedro)** |

## Gotchas conocidos (de sesiones previas)
- `withHandler({rawBody:true})` → leer `ctx.rawBody`, NUNCA `req.json()` (doble
  consumo del stream en Edge = "Invalid JSON"). Bug ya visto en RAG `_ingest`.
- Modal deploy en Windows: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8` (charmap peta con
  `✓`); `pip install fastapi==0.115.5` local (Modal introspecciona el fichero).
- RLS: no hay `user_id`/`org_id` uniformes — seguir el patrón de
  `038_multi_academy_isolation`; `players.id` es `text`.
- El contrato de salida de Modal (`TrackingResponse` con `team`/`teamColor`/
  `teams` de V2) ya está tipado en `_track-players.ts` y el cliente — reutilizar.

## Decisión de producto pendiente (Pedro)
Modal está desplegado pero **huérfano**. B1 lo convierte en la ruta oficial para
partidos largos. Alternativa: retirar Modal y quedarse solo con ONNX-navegador
para clips (renunciando a partidos completos). B1 asume "cablear Modal".
