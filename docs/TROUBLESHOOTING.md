# VITAS · Troubleshooting — Problemas Conocidos y Soluciones

## Bunny Stream

### Upload falla con HTTP 401
**Síntoma:** "Error al subir — Upload failed: HTTP 401" al subir video.
**Causa:** Bunny solo acepta uploads firmados via protocolo TUS (`https://video.bunnycdn.com/tusupload`). PUT directo a `/library/{id}/videos/{guid}` solo acepta `AccessKey` header (no firmas).
**Solución:** Usar `tus-js-client` con headers `AuthorizationSignature`, `AuthorizationExpire`, `VideoId`, `LibraryId`.
**Firma:** SHA256 plain (NO HMAC): `SHA256(libraryId + apiKey + expirationTime + videoId)`.
**Archivos:** `api/upload/video-init.ts` (genera firma), `src/hooks/useVideoUpload.ts` (TUS upload).

### Upload falla con HTTP 403
**Síntoma:** Bunny rechaza el upload con 403 Forbidden.
**Causa:** La `BUNNY_STREAM_API_KEY` es inválida, expiró, o no coincide con el `BUNNY_STREAM_LIBRARY_ID`.
**Solución:** Verificar en Bunny Dashboard > Stream > Library > API Key. Actualizar en Vercel env vars.

### Video no reproduce después de subir
**Síntoma:** Video aparece como "subido" pero no se puede reproducir.
**Causa:** Bunny todavía está encodificando. El polling (`/api/videos/{id}/status`) espera hasta 4 min.
**Solución:** Esperar a que `encodeProgress` llegue a 100%. Si falla, verificar que el formato es compatible (MP4 H.264 recomendado).

---

## Videos Locales

### MEDIA_ELEMENT_ERROR: Format error (code 4)
**Síntoma:** Error rojo "Error cargando video (code 4): MEDIA_ELEMENT_ERROR: Format error".
**Causa:** El video fue guardado con un `blob:` URL que se invalidó al refrescar la página. NO es un error de formato.
**Solución:** Volver a subir el archivo de video. Los blob URLs no sobreviven al refresh del navegador.
**Prevención futura:** Subir siempre a Bunny CDN para que el video persista.

### Video demasiado grande para análisis Gemini
**Síntoma:** Análisis falla o timeout al enviar video a Gemini.
**Causa:** Gemini tiene límites de tamaño para video inline base64. Videos >50MB pueden fallar.
**Solución:** Usar videos de 30s-5min, preferiblemente <50MB. El sistema hace fallback a extracción de frames si Gemini falla.

---

## Vercel / APIs

### Endpoints Gemini timeout en localhost
**Síntoma:** `video-observation` y `team-observation` no responden en `vercel dev`.
**Causa:** El Node runtime en `vercel dev` local es muy lento en la primera compilación (especialmente en Windows).
**Solución:** Testear endpoints Gemini solo en Vercel deploy (producción). Los endpoints Claude (Edge runtime) sí funcionan en localhost.

### Error 503: GEMINI_API_KEY / ANTHROPIC_API_KEY no configurada
**Síntoma:** Endpoint retorna `{ "error": "..._API_KEY no configurada", "fallback": true }`.
**Causa:** Falta la env var en Vercel.
**Solución:** `vercel env add GEMINI_API_KEY` / `vercel env add ANTHROPIC_API_KEY`. No usar prefix `VITE_` (son server-side).

### Error 502: Gemini API error
**Síntoma:** Endpoint retorna `{ "error": "Gemini API error: 4xx" }`.
**Causa:** API key inválida (403), límite de cuota (429), o video inválido (400).
**Solución:** Verificar key en Google AI Studio. Si es 429, esperar o cambiar plan.

### Payload >4.5MB en Vercel
**Síntoma:** Error al enviar muchos frames a `video-intelligence`.
**Causa:** Vercel Edge tiene límite de body 4.5MB.
**Solución:** El sistema auto-reduce frames (`keyframes.filter((_, i) => i % 2 === 0)`). Si persiste, reducir `frameCount`.

---

## Supabase

### RLS: new row violates row-level security policy
**Síntoma:** Insert/update falla con error de RLS.
**Causa:** El usuario no está autenticado o `auth.uid()` no coincide con `user_id`.
**Solución:** Verificar que hay sesión activa. Las tablas usan `default auth.uid()` en `user_id`.

### Tabla no existe (team_analyses, etc.)
**Síntoma:** Query falla con "relation does not exist".
**Causa:** No se ejecutó la migración SQL.
**Solución:** Ejecutar el SQL correspondiente en Supabase Dashboard > SQL Editor. Migraciones en `supabase/migrations/`.

---

## YOLO Tracking

### Worker no carga / WASM error
**Síntoma:** Tracking panel muestra error al iniciar.
**Causa:** El modelo YOLOv8n-pose ONNX no se descargó o el navegador no soporta WebAssembly SIMD.
**Solución:** Usar Chrome/Edge actualizado. Verificar que el modelo está en `public/models/`.

### Velocidad muestra 0 km/h
**Síntoma:** Tracking funciona pero velocidad siempre es 0.
**Causa:** No se calibró la homografía (4 puntos del campo).
**Solución:** Calibrar con los 4 puntos de esquina del campo antes de iniciar tracking.

---

## Stripe / Billing

### Error "Stripe no configurado"
**Síntoma:** Página de billing muestra error.
**Causa:** Faltan `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_STRIPE_PRO_PRICE_ID`, `VITE_STRIPE_CLUB_PRICE_ID`.
**Solución:** Configurar en Vercel env vars con valores de Stripe Dashboard.
