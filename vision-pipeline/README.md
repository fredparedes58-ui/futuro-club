# VITAS · Vision Pipeline (Modal)

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
pip install modal==0.66.0       # pin la versión del SDK
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
