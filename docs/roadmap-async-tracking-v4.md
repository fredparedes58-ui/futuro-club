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
- Nueva `@app.function(timeout=1800)` `run_track_and_callback(payload, callback_url)`:
  corre el tracking existente (reutiliza la lógica de `track()`), y al terminar
  hace `requests.post(callback_url, data=body, headers={"X-Vitas-Signature": sig})`
  donde **`body` es el JSON serializado** `{"job_id","status":"done"|"failed","result"|"error"}`
  (snake_case) y **`sig = HMAC-SHA256(MODAL_CALLBACK_SECRET, body)`** en hex minúsculas.
- Nuevo `@modal.fastapi_endpoint(POST)` `track_async(payload)`: recibe
  `{video_url, sample_fps, classes, job_id, callback_url}`, hace
  `run_track_and_callback.spawn(...)` y responde `{ call_id }` al instante.
- **La firma es del CONTENIDO (rawBody), no del `job_id`** — así una firma
  observada no puede re-adjuntarse a un payload forjado. Modal guarda su propia
  copia de `MODAL_CALLBACK_SECRET` (Modal secret); el secreto NUNCA viaja en el
  spawn. Contrato exacto pineado por `api/webhooks/__tests__/modal-tracking.test.ts`.

### 4.3 · API (TS, sí verificable sin clip)
- `POST /api/coaching/track-async` — crea fila `tracking_jobs` (queued), llama a
  `track_async` de Modal (spawn), guarda `modal_call_id`, responde `{ jobId }`.
  Reutiliza `withHandler` (auth + rate-limit + allowServiceToken).
- `POST /api/webhooks/modal-tracking` — verifica `HMAC(secret, rawBody)`
  (fail-closed: sin `MODAL_CALLBACK_SECRET` → 503), escribe `result` +
  `status='done'` (o `failed`) con un **PATCH atómico condicional**
  `status=in.(queued,processing)` (evita que un retry tardío pise un resultado
  final). Estados no terminales → `200 {ignored}`. `rawBody:true` + `ctx.rawBody`
  (ojo al bug de doble-consumo del stream, ver RAG `_ingest`).
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
| **V4.3** | Modal `track_async` + `run_track_and_callback` (código ✅, deploy pendiente) | ⚠️ py_compile OK; deploy+smoke pendiente |
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

## Despliegue de V4.3 (Modal) — pasos exactos
El código de `track_async` + `run_track_and_callback` ya está en
`vision-pipeline/app.py` (py_compile OK). Para activarlo:
1. Añadir la clave del callback al secret existente (extra, no rompe API_KEY):
   `modal secret create vitas-api-key API_KEY=<actual> MODAL_CALLBACK_SECRET=<nuevo>`
   (en Windows: `set PYTHONUTF8=1 & set PYTHONIOENCODING=utf-8` antes; ver gotchas).
2. `modal deploy vision-pipeline/app.py` → nueva URL
   `https://<org>--vitas-vision-track-async.modal.run`.
3. Env vars en Vercel (production): `MODAL_TRACK_ASYNC_URL` = esa URL;
   `MODAL_CALLBACK_SECRET` = **el mismo** valor del paso 1; `VITAS_PUBLIC_URL` =
   `https://futuro-club.vercel.app`.
4. Smoke: `POST /api/coaching/track-async` con un clip corto y un `job_id` de
   prueba → 202; verificar que la fila pasa a `processing` y luego el webhook la
   deja `done`. (E2E de 90 min = V4.6, bloqueado en clip real.)

Nota: Modal emite `result` en snake_case (igual que el `track` síncrono); el
webhook lo guarda verbatim y **V4.4 (cliente)** hará el mapeo snake→camel (la
misma lógica que `_track-players.ts` ya aplica en la ruta síncrona).

## Decisión de producto pendiente (Pedro)
Modal está desplegado pero **huérfano**. B1 lo convierte en la ruta oficial para
partidos largos. Alternativa: retirar Modal y quedarse solo con ONNX-navegador
para clips (renunciando a partidos completos). B1 asume "cablear Modal".
