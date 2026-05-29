# VITAS · Vision Pipeline (Phase 2)

Servidor Modal con GPU que corre el pipeline real de scanning:
YOLOv11 + ByteTrack + MediaPipe Pose + correlación scans↔recepciones.

---

## ¿Qué hace?

Recibe `{ video_url, player_id }` y devuelve:

```json
{
  "scan_iq": 72,
  "receptions_analyzed": 23,
  "avg_scans_pre_reception": 4.1,
  "scans_under_pressure": 3.5,
  "success_with_scan": 0.65,
  "success_without_scan": 0.30,
  "forward_oriented_pct": 0.74,
  "duration_processed_sec": 180.2,
  "receptions": [ { "timestamp_ms": 33200, ... }, ... ],
  "scans":      [ { "timestamp_ms": 32100, "direction": "left", "yaw_deg": 42.1 }, ... ]
}
```

---

## Deploy (una vez)

1. **Instalar Modal localmente**
   ```bash
   pip install modal
   modal token new
   ```

2. **Crear el secret con tu API key**
   Genera una API key fuerte (`openssl rand -hex 32`) y créala como secret:
   ```bash
   modal secret create vitas-api-key API_KEY=tu-token-aqui
   ```
   Guarda esa misma key en Vercel como `MODAL_API_KEY` (la usa el Edge proxy).

3. **Desplegar**
   ```bash
   modal deploy vision-pipeline/app.py
   ```
   Modal te dará una URL del estilo:
   ```
   https://<workspace>--vitas-scanning-detect-scanning-endpoint.modal.run
   ```

4. **Configurar Vercel**
   ```
   MODAL_SCANNING_URL=https://...detect-scanning-endpoint.modal.run
   MODAL_API_KEY=tu-token-aqui
   ```

5. **Listo** — el endpoint `api/behavioral/_detect-scanning.ts` ya lo
   usa automáticamente. El frontend cae a mock si las env vars no
   están configuradas (graceful degradation).

---

## Probarlo localmente

Modal soporta dev loop:

```bash
modal serve vision-pipeline/app.py
```

Te da una URL temporal. Mándale un POST:

```bash
curl -X POST https://<dev-url> \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "video_url": "https://example.com/match.mp4",
    "player_id": "p1",
    "player_name": "Samu"
  }'
```

---

## Coste estimado

- GPU T4 a $0.000164/sec → **~$0.44 / partido de 90min**
- Free tier Modal: $30/mes ≈ **68 partidos gratis/mes**

A partir de ahí, escalable a A10G o A100 si necesitas más velocidad
(2-3× más caro, 3-5× más rápido).

---

## Arquitectura

```
┌─────────────┐      ┌──────────────┐      ┌──────────────────┐
│  Frontend   │ ───► │ Edge proxy   │ ───► │  Modal worker    │
│  /scanning  │      │ /api/        │      │  (GPU + YOLO +   │
│             │ ◄─── │  behavioral/ │ ◄─── │   MediaPipe)     │
└─────────────┘      │  _detect-    │      └──────────────────┘
                     │  scanning    │             │
                     └──────────────┘             ▼
                                          ┌──────────────┐
                                          │  Volume      │
                                          │  (weights    │
                                          │   cache)     │
                                          └──────────────┘
```

---

## Próximos pasos del pipeline

Items que **mejorarían la precisión** del scanning detector:

1. **Jersey-number OCR** para identificar al target player sin hint manual
2. **Color-based re-identification** entre quotes de cámara
3. **Action recognition** (TSM/SlowFast) para clasificar la decisión
   post-recepción con más matices (pase corto / pase largo / regate /
   tiro / pérdida en lugar del actual heurístico simple)
4. **Field homography** para mapear posiciones a coordenadas reales
   del campo (no solo pixel space)
5. **Fine-tune YOLOv11** con dataset propio de fútbol juvenil PHV

Phase 3 (cuando esté Supabase): persistir los `receptions` y `scans`
granulares para poder revisitar el análisis sin reprocesar el video.
