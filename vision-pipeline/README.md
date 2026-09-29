# VITAS · Vision Pipeline (Modal)

Este directorio contiene **dos apps Modal** independientes:

| App | Fichero | Qué hace | Recursos |
|---|---|---|---|
| `vitas-vision` | `app.py` | tracking YOLO + BoT-SORT (GPU) | T4 |
| `vitas-match-worker` | `match_worker.py` | partido completo, Fase 1: proxy de vídeo + subida a Gemini + conductor del job | **solo CPU** |

Ambas comparten la allowlist de URLs de vídeo (`video_url_guard.py`, una sola
implementación, PR #288) y el secret `vitas-api-key`. Tests (sin red, sin
ffmpeg, sin Modal; corren en CI en el job `Python tests (vision-pipeline)`):

```bash
python -m pip install "httpx==0.27.2" "pytest==8.3.5"
python -m pytest vision-pipeline/test_*.py -q          # bash
# PowerShell: python -m pytest vision-pipeline/test_video_url_guard.py vision-pipeline/test_match_worker.py vision-pipeline/test_match_proxy_ffmpeg.py -q
# Integración opt-in con ffmpeg REAL (clip sintético local, sin red): VITAS_FFMPEG_IT=1
```

La sección [vitas-match-worker](#vitas-match-worker-partido-completo-fase-1-solo-cpu)
está al final. Lo que sigue hasta allí es `vitas-vision`.

---

Servidor Modal con GPU que ejecuta **YOLOv11 + ByteTrack** sobre un video
y devuelve:

- Tracks de jugadores (con `track_id` persistente vía ByteTrack)
- Posiciones del balón frame a frame
- Detección automática de **ball stops** (balón parado >2s) — útil para
  set pieces

> **Pose / scanning del jugador** se sigue haciendo en cliente con
> MediaPipe Web (sin servidor). Este pipeline es para análisis de
> equipo (22 jugadores + balón + táctica).

---

## Deploy en 5 pasos (≈10 minutos)

### 1. Instala Modal y autentícate

```bash
pip install "modal>=1.0"       # app.py usa fastapi_endpoint + add_local_python_source (validado con 1.4.2)
modal token new                  # te abre el navegador para auth
```

### 2. Crea el secret con tu API key

Genera una API key fuerte y guárdala como secret en Modal:

```bash
export VITAS_API_KEY=$(openssl rand -hex 32)
echo "Guarda esto en Vercel también: $VITAS_API_KEY"
modal secret create vitas-api-key API_KEY=$VITAS_API_KEY
```

### 3. Configura hard cap de gasto (anti-sorpresas)

En el dashboard de Modal (`https://modal.com/settings/usage`), pon
un **spend limit** mensual: `$50` o lo que decidas. Modal cortará
automáticamente si se alcanza.

### 4. Prueba en local (sin desplegar) — opcional pero recomendado

```bash
modal serve vision-pipeline/app.py
```

Te da una URL temporal `https://<random>--vitas-vision-track.modal.run`.
Pruébala:

```bash
# Health check
curl https://<random>--vitas-vision-health.modal.run

# Inferencia de prueba (usa un video público pequeño)
curl -X POST https://<random>--vitas-vision-track.modal.run \
  -H "Authorization: Bearer $VITAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "https://download.blender.org/durian/movies/sintel_trailer-480p.mp4",
    "sample_fps": 2
  }'
```

Si el local funciona, sigue. Si falla, **arregla aquí** antes de
desplegar.

### 5. Despliega a producción

```bash
modal deploy vision-pipeline/app.py
```

Modal te dará dos URLs persistentes:

```
✓ Created app vitas-vision
✓ track  → https://<workspace>--vitas-vision-track.modal.run
✓ health → https://<workspace>--vitas-vision-health.modal.run
```

### 6. Configura Vercel

En **Project Settings → Environment Variables**, añade:

```
MODAL_TRACK_URL    = https://...vitas-vision-track.modal.run
MODAL_HEALTH_URL   = https://...vitas-vision-health.modal.run
MODAL_API_KEY      = <el mismo token del paso 2>
```

**Redeploy** Vercel (Settings → Deployments → Redeploy) o haz un
nuevo `git push`.

---

## Cómo verificar que funciona

1. Abre `https://futuro-club.vercel.app/set-pieces`
2. Sube un video MP4 desde el botón verde "Subir video"
3. Click "Analizar video" en Set Pieces
4. En la consola del navegador deberías ver:
   ```
   [setPieceVideoDetector] using Modal vitas-vision pipeline
   ```
5. El análisis tardará 3-5 min para un partido de 90 min
6. Si falla, la app cae automáticamente al mock (sin error visible al usuario)

---

## Troubleshooting

### "ImportError: cannot import name 'X' from 'modal'"
**Causa:** Versión del SDK desactualizada o uso de API experimental.
**Fix:** `pip install --upgrade modal` y revisa que el código solo use
las APIs documentadas (`modal.App`, `modal.Image`, `modal.Volume`,
`modal.Secret`, `modal.fastapi_endpoint`).

### "No GPU available"
**Causa:** Modal está saturado de demanda en esa región/momento.
**Fix:** El decorator ya tiene `retries=2`. Si pasa más de 3 veces
seguidas, intenta `gpu="A10G"` (más caro pero más disponible).

### "OSError: libGL.so.1: cannot open shared object file"
**Causa:** Falta apt package para OpenCV.
**Fix:** Ya está en el image (`libgl1`, `libglib2.0-0`). Si pasa,
revisa que `image.apt_install(...)` no esté siendo sobrescrito.

### "Function timeout"
**Causa:** Video muy largo o GPU lenta.
**Fix:** El timeout está en 900s (15 min). Para videos >90 min,
considera dividir el video o aumentar timeout a 1800s.

### El video no se descarga
**Causa:** URL no es pública o tiene restricciones de CORS/auth.
**Fix:** Asegúrate de que la URL sea HTTPS pública. Google Drive
público funciona con `https://drive.google.com/uc?id=<FILE_ID>`.

### Weights se re-descargan en cada run
**Causa:** El Volume no se commiteó o el path es diferente.
**Fix:** Verifica `modal volume list` que existe `vitas-yolo-weights`.

---

## Coste estimado

| GPU      | $/seg     | 90min video @ 5fps | Tiempo aprox |
|----------|-----------|--------------------|-------------:|
| T4       | $0.000164 | ~$0.40             | 3-5 min      |
| A10G     | $0.00100  | ~$2.50             | 2-3 min      |
| A100-40  | $0.00253  | ~$6.30             | 1-2 min      |

**Free tier de Modal: $30/mes** → ~75 partidos gratis/mes con T4.

Para volúmenes >500 partidos/mes, considera self-host en VPS GPU
($30/mes Hetzner flat).

---

## Arquitectura

```
┌─────────────┐   POST /api/      ┌──────────────────┐
│ Frontend    │ ───────────────►  │ Vercel Edge      │
│ /set-pieces │                   │ proxy            │
│             │  ◄─────────────── │                  │
└─────────────┘   JSON result     └──────────────────┘
                                          │
                                          │ POST + Bearer
                                          ▼
                                  ┌──────────────────┐
                                  │ Modal track      │
                                  │ FastAPI endpoint │
                                  └──────────────────┘
                                          │
                                          │ .remote()
                                          ▼
                                  ┌──────────────────┐
                                  │ Modal GPU worker │
                                  │ (T4 + YOLOv11 +  │
                                  │  ByteTrack)      │
                                  └──────────────────┘
                                          │
                                          ▼
                                  ┌──────────────────┐
                                  │ Persistent       │
                                  │ Volume (weights) │
                                  └──────────────────┘
```

---

## Roadmap

- [x] Player tracking + ball detection
- [x] Ball stops (set pieces auto-detection)
- [ ] Fine-tune YOLOv11 con dataset propio de fútbol juvenil PHV
- [ ] Field homography para coordenadas reales del campo
- [ ] Jersey-number OCR para identificar jugadores sin hint
- [ ] Action recognition (TSM/SlowFast) para clasificar decisiones
- [ ] Batch endpoint para procesar múltiples videos en paralelo

> **Nota (partido completo):** `app.py` ahora importa la allowlist de
> `video_url_guard.py` (misma lógica, movida sin cambios de comportamiento; la
> cubren los mismos tests de #288) y la incluye en la imagen con
> `add_local_python_source`. El `vitas-vision` desplegado hoy sigue funcionando; el
> cambio solo entra en el próximo `modal deploy vision-pipeline/app.py`.

---

## vitas-match-worker (partido completo, Fase 1, solo CPU)

**Estado: infraestructura construida, análisis APAGADO.** El 29-sep, un spike sobre
un partido real del owner (Veo follow-cam, fútbol 8, U10, tramo de 15 min) mostró
que Gemini 2.5 Flash viendo el vídeo a 1 fps **inventa** eventos de equipo: 0 de 5
tiros citados existían en el segundo citado (comprobado con fotogramas), eventos en
pasos de ~10 s, posesión 50/50 y dorsales que no existen. Decisión del owner: se
construye toda la Fase 1, pero `MATCH_VIDEO_ENABLED` (flag de **Vercel**; solo la
cadena exacta `"true"` lo enciende) sigue **OFF** hasta que el arnés de validación
de observaciones del PR de backend supere sus umbrales. El worker no lee ese flag:
sin jobs no hace nada, salvo el `tick`.

El worker **no decide nada**: la máquina de estados, todas las claves de
proveedores (Gemini, Anthropic, Bunny API, Supabase) y todos los parámetros (fps,
altura y crf del proxy, tolerancia de duración, tramos, fps que ve Gemini) viven en
Vercel (`api/match/[action].ts`, `config/matchVideo.json`). Contrato:
`src/lib/shared/matchJob/contract.ts`. Diseño: `docs/diseno-partido-completo.md` §6.

| Fichero | Papel |
|---|---|
| `match_worker.py` | app Modal `vitas-match-worker`: protocolo step, subida reanudable, funciones |
| `match_proxy.py` | receta del proxy + comprobaciones de integridad, **una sola implementación** (la usan el worker y el CLI local del arnés); solo stdlib |
| `video_url_guard.py` | allowlist de hosts de vídeo (#288), compartida con `app.py` |
| `test_match_worker.py` | tests puros (sin red, sin ffmpeg, sin Modal); corren en CI |
| `test_match_proxy_ffmpeg.py` | integración **opt-in** con ffmpeg real (`VITAS_FFMPEG_IT=1`), clip sintético local |

| Función | Recursos | Papel |
|---|---|---|
| `match_start` (web, POST) | 0,125 CPU · 256 MiB · 30 s | `Authorization: Bearer <API_KEY>` (comparación `hmac.compare_digest`), cuerpo `{jobId, epoch}` estricto → `spawn(transcode_and_upload)` → `{status:"spawned", call_id}` |
| `transcode_and_upload` | `cpu=2` (tope duro 2) · 4 GiB · 2 h · `retries=0` · máx. 2 contenedores | `begin` → allowlist + variante HLS → proxy (`match_proxy.py`) → comprobaciones → `upload_session` → subida reanudable a Gemini (`upload, finalize`; si falla, `query` y reanuda desde el offset) → `proxy_ready` → `spawn(drive)`. Hilo de `heartbeat` cada 60 s |
| `drive` | `cpu=0.25` · 1 GiB · 3 h · `retries=0` | bucle `advance` respetando `retryAfterSec` hasta estado terminal (separado para no pagar 2 cores reservados mientras Vercel analiza los tramos) |
| `tick` | 0,125 CPU · 256 MiB · `modal.Period(minutes=5)` | `op=tick` firmado: despacha jobs codificados, re-despacha epochs caducados y barre ficheros Gemini (lo hace Vercel) |
| `spike_proxy` + entrypoint `spike` | como `transcode_and_upload`, máx. 1 contenedor | **solo operador** (`modal run`): allowlist + proxy en Modal desde una URL de Bunny, **sin Vercel y sin Gemini** |

Protocolo: toda llamada a Vercel es `POST <step URL>` con
`X-Vitas-Timestamp` (segundos unix) y
`X-Vitas-Signature = hex(HMAC_SHA256(MODAL_CALLBACK_SECRET, ts + "." + rawBody))`
(vectores de prueba del contrato en `test_match_worker.py`, que además los cruza
con `contract.ts` para detectar deriva). `{superseded:true}`, `{action:"stop"}` o un
estado terminal → el worker sale sin tocar nada. Un error fatal → `op=fail {code,
reason}` con el motivo **sin URLs ni tokens**. 401 → sale (secreto desalineado);
400/404 → sale y registra; 5xx/504/429/red → reintento con retroceso 5-10-20-40-60 s
hasta el plazo global. Si `spawn(drive)` falla, el job no se marca como fallido: el
heartbeat caduca, el tick re-despacha y `begin` responde `advance` (el fichero
Gemini sigue ACTIVE).

### El proxy (lo que ve Gemini)

Primera pista de vídeo, **sin audio** (las voces de menores nunca llegan a Google),
sin subtítulos ni datos; `fps=<proxy.fps>,scale=-2:<proxy.maxHeight>`, libx264
`crf=<proxy.crf>` `-preset veryfast`, yuv420p, `+faststart`. Los valores llegan en
`begin.proxy` desde `config/matchVideo.json`: **ni el worker ni el CLI tienen valores
por defecto** (nada de 1 fps fijo en código).

Comprobaciones antes de subir nada (verificadas con ffmpeg 8.1 sobre HLS local):

- **Segmento HLS perdido → falla.** Con un segmento borrado, ffmpeg sale con código
  0 y el filtro `fps` rellena el hueco repitiendo fotogramas: el proxy tiene la
  duración correcta pero segundos de imagen congelada que Gemini «observaría». Se
  detecta en el log (`Failed to open segment` / `skipping`) → `source_unavailable`
  (`source_forbidden` si el log trae un 403).
- **Hueco en la línea de tiempo → falla.** Más fotogramas repetidos que
  `floor(fps × durationToleranceSec)` (la misma tolerancia expresada en fotogramas,
  sin umbral nuevo) → `transcode_failed`. Si ffmpeg no da las estadísticas del filtro
  `fps`, la continuidad no se puede verificar → también falla (abstenerse, no suponer).
- **ffprobe:** exactamente una pista, de vídeo, h264, altura ≤ `maxHeight`, **sin
  audio** (si apareciera audio, `internal` y no se sube); duración dentro de
  `± durationToleranceSec` del `length` de Bunny, o `duration_mismatch`.
- Si el ffmpeg instalado soporta `-seg_max_retry` (se consulta `ffmpeg -h
  demuxer=hls` en tiempo de ejecución), cada segmento se reintenta 3 veces antes de
  darlo por perdido; `-rw_timeout` corta lecturas de red atascadas más de 60 s.

Para el PR de backend (el worker no ve estos valores):

- el `fps` que se manda a Gemini en `videoMetadata.fps` debe ser **≤ `proxyFps`**;
  con más, Gemini recibiría fotogramas repetidos;
- `durationToleranceSec` debe ser **≥ 1/`proxyFps`**: el último fotograma dura 1/fps
  (verificado: a 0,5 fps un origen de 21,5 s da un proxy de 22 s).

### Proxy local para el arnés de validación (CLI)

Misma receta que producción (un test comprueba que la parte de codificación del
comando es idéntica); solo cambia la E/S: solo ficheros locales, sin timeout de red.

```bash
python vision-pipeline/match_proxy.py --input clip.mp4 --output proxy.mp4 \
  --fps 1 --max-height 360 --crf 30 --duration-tolerance-sec 2 \
  [--expected-duration-sec <s>]
```

Los valores salen de `config/matchVideo.json` (todos obligatorios). Imprime una
línea JSON `{bytes, sha256, durationSec, repeatedFrames, recipe}`; sale con 1 si
falla una comprobación. Requiere ffmpeg/ffprobe locales.

### Spike de la Fase 0 en Modal, sin activar el análisis

```bash
modal run vision-pipeline/match_worker.py::spike \
  --source-url "https://vz-xxx.b-cdn.net/<videoGuid>/playlist.m3u8" \
  --target-variant 360p --fps 1 --max-height 360 --crf 30 \
  --duration-tolerance-sec 2 --expected-duration-sec <length de Bunny> \
  [--save-proxy proxy.mp4]
```

Responde a los puntos (h) y (e) del checklist de `docs/diseno-partido-completo.md`
§18: si el HLS de Bunny da 403 a una IP de Modal (`error.code =
source_forbidden`), qué variante y cuántos segmentos se leen (`source`), y el
tamaño y el tiempo reales del proxy en la CPU de Modal (`proxy.bytes`,
`elapsedSec`). No llama a Vercel ni a Gemini; la URL tiene que pasar la allowlist
del secret; la salida nunca contiene URLs. Con `--save-proxy`, el proxy (≤ 256 MiB)
se copia al disco local: es la mejor entrada para el arnés (misma receta **y**
mismo origen que producción). `modal run` crea una app efímera (el `schedule` del
tick no corre); coste: céntimos. Anotar los resultados literales en
`docs/pendientes-metricas.md`.

### Checklist del operador (nada de esto lo hace el código)

1. **Antes de desplegar**: PR-A (backend `/api/match/step`) mergeado y desplegado en
   Vercel (el `tick` llama a Vercel cada 5 min en cuanto se despliega), migración 067
   aplicada, credenciales C3 rotadas (`API_KEY` / `MODAL_API_KEY` y
   `MODAL_CALLBACK_SECRET`). El spike de arriba **no** necesita nada de esto, solo
   el secret.
2. **Modal · facturación**: método de pago y **límite de gasto del workspace de
   $10/mes** (dashboard de Modal → Settings → Usage & Billing). Sin GPU en Fase 1.
3. **Modal · secret `vitas-api-key`** (compartido con `vitas-vision`).
   `modal secret create --force` **reemplaza el secret entero**: incluye siempre
   todas las claves.

   | Clave | Obligatoria | Valor |
   |---|---|---|
   | `API_KEY` | sí (el deploy falla sin ella) | = `MODAL_API_KEY` de Vercel |
   | `MODAL_CALLBACK_SECRET` | sí (el deploy falla sin ella) | = `MODAL_CALLBACK_SECRET` de Vercel |
   | `BUNNY_CDN_HOSTNAME` | sí (el deploy falla sin ella) | host del pull zone de Bunny Stream, p. ej. `vz-xxx.b-cdn.net` |
   | `VITAS_PUBLIC_URL` | sí, o la siguiente | `https://futuro-club.vercel.app` → step URL = `…/api/match/step` |
   | `VITAS_MATCH_STEP_URL` | opcional (gana a la anterior) | URL completa del step, https |
   | `BUNNY_STORAGE_CDN_URL`, `BUNNY_STREAM_LIBRARY_ID`, `VIDEO_URL_EXTRA_HOSTS` | opcionales | amplían la allowlist (mismas reglas que Vercel) |

   **No** van en este secret: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `BUNNY_STREAM_API_KEY` (regla 3 de CLAUDE.md; un
   test lo comprueba sobre el código del worker). La URL de subida de Gemini la
   acuña Vercel en `upload_session` y el worker no la registra en logs.

   ```bash
   modal secret create vitas-api-key --force \
     API_KEY=... MODAL_CALLBACK_SECRET=... \
     BUNNY_CDN_HOSTNAME=vz-xxx.b-cdn.net \
     VITAS_PUBLIC_URL=https://futuro-club.vercel.app
   ```
4. **Desplegar** (SDK de Modal ≥ 1.0; la definición de la app se validó importándola
   con 1.4.2; en Windows, `PYTHONUTF8=1`):
   ```bash
   modal deploy vision-pipeline/match_worker.py
   ```
   Copia la URL de `match_start`
   (`https://<workspace>--vitas-match-worker-match-start.modal.run`) a Vercel como
   `MODAL_MATCH_START_URL`.
5. **Comprobar**:
   - `curl -sX POST "$MODAL_MATCH_START_URL" -H "Content-Type: application/json" -d '{}'`
     → `{"status":"error","reason":"unauthorized"}` (no levanta ningún worker).
   - `modal app logs vitas-match-worker`: una línea `tick: {...}` cada 5 min.
   - En el primer job o spike, el log del transcode dice `seg_max_retry=3` si el
     ffmpeg de la imagen lo soporta, y termina con `fotogramas repetidos`. Si falta
     esa línea, el job falla con «no se pudo verificar la continuidad»: avisar.
6. **Activación**: **no** la hace este PR. `MATCH_VIDEO_ENABLED` sigue sin definir
   (OFF) hasta que el arnés de validación de observaciones pase sus umbrales.
7. **Pausar**: `modal app stop vitas-match-worker` (para el `tick` y los workers).

### Costes (estimación con precios publicados, no medida)

Precios de Modal consultados el 2026-09-28 (https://modal.com/pricing):
$0,0000131 por core·s y $0,00000222 por GiB·s; se factura el máximo entre lo
reservado y lo usado, por eso `transcode_and_upload` lleva tope duro `cpu=(2, 2)` y
ffmpeg `-threads 2`, y todas las funciones `scaledown_window=2` (sin contenedores
reservados ociosos).

| Concepto | Supuesto | Coste |
|---|---|---|
| `transcode_and_upload` | 2 cores + 4 GiB durante 15–25 min (sobre todo descarga + decodificación del HLS 360p) | ≈ $0,03–0,05 por partido |
| `drive` | 0,25 core + 1 GiB durante ~30 min (tope 3 h ≈ $0,06) | ≈ $0,01 por partido |
| `match_start` | segundos | < $0,001 |
| `tick` | 8.640 invocaciones/mes × pocos s a 0,125 core + 256 MiB | ≈ $0,1–0,3 al mes (fijo) |
| `spike_proxy` | como un transcode, solo cuando lo lanza el operador | ≈ $0,03–0,05 por ejecución |
| **Total Modal** | | **≈ $0,04–0,07 por partido** |

Con el límite de $10/mes de Modal caben >100 partidos: el cuello de botella es
`GLOBAL_MONTHLY_BUDGET_USD = 20` (Gemini + Claude, controlado en Vercel con
reserva por partido), no la CPU. Tras el primer partido real, sustituir estas
cifras por las medidas.

### Límites conocidos

- ffmpeg solo puede abrir `https,tls,tcp,crypto` (ni `file:` ni `http:`) y el
  worker valida **antes** contra la allowlist la playlist maestra, la variante y
  cada segmento/clave. Las redirecciones HTTP que haga ffmpeg al pedir un segmento
  no se re-validan (sí las del worker): riesgo residual bajo, el origen es nuestro
  CDN.
- Si Bunny tiene token auth, la URL firmada la acuña Vercel; las URIs relativas de
  la playlist pierden la query del token: si los segmentos dan 403, el job falla con
  `source_forbidden` (punto (h) del spike). La variante se elige de la playlist
  maestra (la más pequeña ≥ la pedida, nunca se escala hacia arriba); si no hay
  ninguna, `fail source_unavailable`.
- La versión de ffmpeg de la imagen es la del paquete Debian de `debian_slim`; el
  uso de `-seg_max_retry` y el formato de las estadísticas del filtro `fps` se
  confirman en el primer job o spike en Modal (paso 5).
- Intervalo de keyframes: el de libx264 por defecto. Si `startOffset`/`endOffset`
  de Gemini son exactos al segundo es parte de los puntos (b)/(d) del spike.
- El proxy empieza en 0 (verificado: HLS con `start_time` 1,46 s → proxy con
  `start_time` 0). Que coincida al segundo con el `t` del embed de Bunny se comprueba
  en la prueba E2E.
