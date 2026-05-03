# VITAS · Checklist de ejecución sprints S1-S7

Sigue este checklist en orden. **No saltes etapas.** Cada ✓ debe estar verificado antes del siguiente.

---

## ✅ SPRINT 1 · Compliance Legal (3 días)

### Día 1 · Consentimiento parental
- [ ] Crear migración Supabase: tabla `parental_consents` (player_id, parent_email, signed_at, ip, signature_hash)
- [ ] Pantalla `/onboarding/consent` con checkbox + email del padre + verificación
- [ ] Endpoint POST `/api/auth/sign-consent` que persiste con timestamp + IP
- [ ] Email Resend con link de verificación (válido 24h)
- [ ] Bloquear acceso a upload si no hay consentimiento firmado

### Día 2 · Retención + RLS multi-tenant
- [ ] Tabla `data_retention_policies` con duraciones por tipo
- [ ] Cron Vercel diario: purga vídeos brutos >90 días
- [ ] Endpoint `/api/account/delete-me` que purga TODO en <72h
- [ ] RLS Supabase: cada tabla con `tenant_id` y policy `tenant_id = auth.tenant_id()`
- [ ] Tests automatizados: usuario A no puede leer datos de usuario B

### Día 3 · T&Cs + privacidad
- [ ] Contratar gestoría online (~€70) para T&Cs + privacidad
- [ ] Páginas `/legal/terms`, `/legal/privacy`, `/legal/cookies`
- [ ] Aceptación obligatoria en signup con timestamp guardado
- [ ] Banner cookies (decline by default, RGPD-compliant)

**🎯 Sprint 1 cerrado cuando:** todos los tests RLS pasan + flujo consent funciona en staging.

---

## ✅ SPRINT 2 · Foundation técnico (3 días)

### Día 1 · Cuentas + accesos
- [ ] Cuenta Modal.com → meter tarjeta + verificar free tier $30
- [ ] Cuenta Anthropic → API key + spend limit €100/mes
- [ ] Cuenta Bunny Stream → library de vídeo creada
- [ ] Cuenta Voyage AI → API key (free 50M tokens)
- [ ] Cuenta Resend → dominio verificado
- [ ] Variables entorno en Vercel: `ANTHROPIC_API_KEY`, `MODAL_TOKEN`, `BUNNY_API_KEY`, `VOYAGE_API_KEY`, `RESEND_API_KEY`

### Día 2 · Servicios deterministas críticos
- [ ] **Verificar** que `_phv-calculator-deterministic.ts` está en `api/agents/`
- [ ] Renombrar el antiguo `_phv-calculator.ts` → `_phv-calculator.legacy.ts`
- [ ] Renombrar `_phv-calculator-deterministic.ts` → `_phv-calculator.ts`
- [ ] **Verificar** `_vsi-calculator.ts` creado
- [ ] Test unitario: ejemplo del MD `VSI_FORMULA.md` debe dar 69.6
- [ ] Test unitario: PHV con jugador 14 años, 165cm, 55kg, sittingHeight=85 → offset esperable
- [ ] Documento `docs/agents/VSI_FORMULA.md` revisado y comprometido

### Día 3 · Datos foundation
- [ ] Pantalla `/player/edit` con campos: altura, peso, altura sentado, fecha nacimiento
- [ ] Validaciones Zod en frontend + backend
- [ ] Tabla `player_anthropometrics` con histórico (vs solo último valor)
- [ ] Pre-cargar 50 jugadores pro de referencia → script `scripts/seed-pro-players.ts`
- [ ] Embeddings VideoMAE precalculados sobre vídeos públicos (LaLiga clips highlight)

**🎯 Sprint 2 cerrado cuando:** VSI calculator devuelve 69.6 en el test del ejemplo + 50 pros indexados en pgvector.

---

## ✅ SPRINT 3 · Pipeline GPU (5 días)

### Día 1 · Modal setup
- [ ] `pip install modal` localmente
- [ ] `modal token new` → autenticarse
- [ ] `modal deploy modal/modal_app.py` → debe deployar sin errores
- [ ] Probar `modal run modal_app.py::main` con vídeo de prueba

### Día 2 · Quality check + RTMDet
- [ ] **Verificar** `_video-quality-check.ts` creado y testeable
- [ ] Test: vídeo 720p OK, vídeo 480p bloqueado
- [ ] Endpoint `/api/agents/video-quality-check` accesible desde frontend
- [ ] Modal: descargar pesos RTMDet en volumen persistente (1ª ejecución)
- [ ] Verificar detección de personas en vídeo de fútbol real

### Día 3 · Player ID + MMPose
- [ ] UI `/video/[id]/identify-player`: muestra capturas de jugadores detectados
- [ ] Padre selecciona "este es mi hijo" → persiste en BBDD con embedding
- [ ] Modal: descargar pesos MMPose RTMPose-m
- [ ] Verificar 17 keypoints extraídos por jugador por frame

### Día 4 · Biomechanics + VideoMAE
- [ ] **Verificar** `_biomechanics-extractor.ts` creado
- [ ] Test: keypoints input → ángulos rodilla calculados correctamente
- [ ] Modal: descargar VideoMAE v2 weights (HuggingFace)
- [ ] Embedding 768-dim persistido en pgvector

### Día 5 · VSI integration + tests
- [ ] Pipeline E2E: subir vídeo CLI → recibir JSON con keypoints + métricas + VSI
- [ ] Test: 10 vídeos de referencia, VSI consistente ±3 puntos en re-runs
- [ ] **Verificar** `_player-id-reidentifier.ts` creado (puede ser stub MVP)

**🎯 Sprint 3 cerrado cuando:** comando CLI con vídeo MP4 → JSON completo en <60 seg.

---

## ✅ SPRINT 4 · 6 Reportes Claude (5 días)

### Día 1 · Versionado + plantillas base
- [ ] Tabla Supabase `prompt_versions` (id, agent_name, version, prompt_text, hash, created_at)
- [ ] Constante `PROMPT_VERSION` en cada agent (semver)
- [ ] Migrar `_scout-insight.ts` → `_player-report.ts` (Sonnet)

### Día 2 · LAB + DNA
- [ ] **Verificar** `_lab-biomechanics-report.ts` creado
- [ ] Test: input métricas reales → output JSON con estructura correcta
- [ ] Crear `_dna-profile.ts` fusionando `_tactical-label.ts` + `_role-profile.ts`

### Día 3 · Best-Match + Projection
- [ ] Crear `_best-match-narrator.ts` (Haiku) que narre el output de `_player-similarity.ts`
- [ ] Crear `_projection-report.ts` (Haiku) que use PHV adjusted

### Día 4 · Development Plan + Orchestrator
- [ ] **Verificar** `_development-plan.ts` creado
- [ ] Verificar que llama a RAG drills y devuelve JSON estructurado
- [ ] **Verificar** `_pipeline-orchestrator.ts` creado
- [ ] Test: orchestrator dispara 6 reportes en paralelo

### Día 5 · Eval harness + cleanup
- [ ] Crear `eval/golden-tests.ts` con 30 vídeos + outputs esperados
- [ ] Comando `npm run eval` que ejecuta y reporta % regresión
- [ ] CI: bloquear deploy si eval <90%
- [ ] **Eliminar** `_team-intelligence.ts` y `_video-intelligence.ts`

**🎯 Sprint 4 cerrado cuando:** subir vídeo CLI → recibir 6 reportes en <25 seg + eval >90%.

---

## ✅ SPRINT 4 · 6 Reportes Claude · ADICIONES (Sprint 2 retrospectiva)

### 🎯 Métrica diferenciadora · Scan Rate Detection
**Origen:** decisión del usuario tras Sprint 2 (intención original detrás de "gestos faciales").

**Qué es:** medir cuántas veces el jugador gira la cabeza ANTES de recibir el balón.
Métrica validada científicamente (Geir Jordet · Universidad Noruega).
- Pedri sub-12: 0.51 scans/s
- Pro promedio: 0.4-0.8 scans/s
- Sub-12 promedio: 0.15 scans/s

**Implementación (servicio determinista):**
- [ ] Crear `_scan-detector.ts` (post-procesa keypoints MediaPipe)
- [ ] Algoritmo: detectar cambios bruscos de yaw (cabeza) > 20° en <0.4s
- [ ] Inputs: `nose`, `leftEye`, `rightEye` (índices 0, 2, 5 de MediaPipe)
- [ ] Outputs:
  - `scan_rate` (scans/s global)
  - `pre_reception_scans` (en 3s antes de recibir)
  - `scan_amplitude_avg` (grados)
  - `scan_bilaterality_pct` (% miradas a ambos lados)

**Integración en reportes:**
- [ ] Añadir sección "Scanning" en LAB Biomechanics
- [ ] Crear subscore "Lectura de Juego" en VSI (peso ajustable)
- [ ] Ejemplo en Player Report: "tu hijo escanea X veces/segundo · top Y%"

**Bloqueador parcial (Sprint 5+):**
- ⚠️ Requiere detector de balón (YOLOv8) para identificar "pre-recepción"
- En Sprint 4: implementar como `scan_rate global` (sin pre-recepción)
- En Sprint 5+: añadir detector de balón → `pre_reception_scans` real

**Por qué importa:**
- Diferenciador BRUTAL vs MyCoach/Once/Veo (nadie lo hace bien)
- Métrica predictiva del talento futuro (papers Jordet)
- Apreciada por scouts profesionales

---

## ✅ SPRINT 5 · Integración App (3 días)

### Día 1 · Webhook + Queue
- [ ] Webhook Bunny → `/api/webhooks/bunny-uploaded`
- [ ] Tabla `analysis_queue` con estado (pending, processing, done, failed)
- [ ] Cron worker que procesa queue
- [ ] Reintentos exponenciales 3 veces con jitter

### Día 2 · Email + UI
- [ ] Plantilla email Resend "Análisis listo de [Jugador]"
- [ ] Pantalla `/player/[id]/analysis/[videoId]` con tabs por reporte
- [ ] Render markdown + métricas + gráficas

### Día 3 · Testing E2E
- [ ] Test E2E manual: nuevo usuario → registro → consent → upload → email → ver reporte
- [ ] Documentar flujo en `docs/USER_FLOW.md`

**🎯 Sprint 5 cerrado cuando:** demo E2E de un nuevo usuario funciona sin intervención técnica.

---

## ✅ SPRINT 6 · Producción Hardening (2 días)

### Día 1 · Monitoreo + costes
- [ ] Pantalla `/admin/costs` con €/vídeo, latencia, error rate
- [ ] Sentry instalado en frontend + backend
- [ ] Logs estructurados (JSON) con prompt_version, model, cost

### Día 2 · Rate limiting + alertas
- [ ] Cuotas por plan en `_lib/usageGuard.ts` (ya existe)
- [ ] Detección uploads sospechosos (mismo hash, mismo IP rapidito)
- [ ] Slack webhook + reglas: latencia >3min, coste >€0,25/vídeo, error rate >5%

**🎯 Sprint 6 cerrado cuando:** test de stress con 50 vídeos simultáneos sin caídas.

---

## ✅ SPRINT 7 · Mejora Continua (1 día)

- [ ] Cron nocturno retención datos (verificar funcionamiento real)
- [ ] Componente `<FeedbackWidget />` en cada reporte (👍 / 👎)
- [ ] Endpoint `/api/feedback` que persiste

**🎯 Sprint 7 cerrado cuando:** 5 feedbacks recogidos en testing interno.

---

## ✅ SPRINT 5 día 3 · Migración hooks frontend al pipeline nuevo (~3-4h)

### Hooks que llaman agentes deprecated y deben migrar:

#### `src/hooks/usePlayerIntelligence.ts`
- [ ] Reemplazar llamada a `/api/agents/video-intelligence` por:
  - POST `/api/videos/create-upload` → upload TUS → POST `/api/videos/finalize`
  - Polling a `/api/analyses/by-video?videoId=...`
  - GET `/api/analyses/reports?analysisId=...` cuando `status='completed'`
- [ ] Renderizar los 6 reportes con `<AnalysisDashboard />` (ya creado Sprint 3)
- [ ] Eliminar lógica SSE streaming (orchestrator hace todo en una llamada)
- [ ] Verificar que `VitasLab.tsx` también usa el nuevo flujo

#### `src/hooks/useTeamIntelligence.ts` + componentes que lo usan
- [ ] **Decisión:** ¿feature de team analysis va en MVP o no?
  - Si NO: deshabilitar la pestaña/botón del frontend
  - Si SÍ: rediseñar como "team summary" agregando reports individuales
- [ ] Borrar referencias en `src/hooks/useBusinessAnalytics.ts`

### Tras migración exitosa:
- [ ] Borrar `api/agents/_video-intelligence.ts`
- [ ] Borrar `api/agents/_team-intelligence.ts`
- [ ] Borrar `api/agents/_role-profile.ts` (reemplazado por _dna-profile)
- [ ] Borrar `api/agents/_tactical-label.ts` (reemplazado por _dna-profile)
- [ ] Borrar `api/agents/_scout-insight.ts` (reemplazado por _player-report)
- [ ] Borrar `api/agents/_phv-calculator.legacy.ts` (LLM viejo)
- [ ] Eliminar imports en `[action].ts`
- [ ] Limpiar `src/agents/prompts.ts`

---

## ✅ POST-SPRINT 7 · Pre-lanzamiento comercial (1 día)

### 🔐 Rotación de credenciales (OBLIGATORIO antes de cliente real)

Durante el desarrollo se compartieron tokens en chat para configuración rápida.
ANTES de aceptar el primer pago real o demo a inversor, rotar TODO:

- [ ] Anthropic API Key (https://console.anthropic.com/settings/keys)
- [ ] Voyage AI API Key (https://dash.voyageai.com/api-keys)
- [ ] Bunny Stream API Key (al crear library nueva)
- [ ] Supabase service_role (Project Settings → API → Roll)
- [ ] Modal AUTH token (regenerar UUID)
- [ ] Bunny webhook secret (cuando esté configurado)
- [ ] CRON_SECRET (regenerar UUID)
- [ ] INTERNAL_API_TOKEN (regenerar UUID)

**Tras rotar cada uno:**
- [ ] Actualizar Vercel env vars (las 9 variables)
- [ ] Actualizar Modal secrets (vitas-bunny, vitas-anthropic, vitas-voyage)
- [ ] Verificar que pipeline E2E sigue funcionando con un vídeo de prueba
- [ ] Borrar archivos `.env*` locales

**Tiempo estimado:** 30-45 minutos.

**Disparador:** antes del PRIMER de estos eventos, lo que llegue antes:
1. Primera academia firma plan anual
2. Primera demo a inversor con datos reales
3. Federación pide auditoría de seguridad
4. Subida masiva de vídeos de menores reales (>10 jugadores)

---

## 🚦 Reglas globales

1. **Cada sprint cierra con un demo interno** (te enseñas a ti mismo el entregable funcionando).
2. **Si un sprint se atrasa >50%, parar y reevaluar scope** antes de continuar.
3. **Sprint 4 introduce eval harness · a partir de ahí ningún cambio de prompt va sin pasar el eval**.
4. **Sprint 1 y 2 son innegociables.** Sin legal + foundation, todo lo demás es deuda.

---

## 📊 Tracking

| Sprint | Estado | Inicio | Cierre | Demo OK |
|---|---|---|---|---|
| S1 | ⬜ Pendiente | — | — | — |
| S2 | ⬜ Pendiente | — | — | — |
| S3 | ⬜ Pendiente | — | — | — |
| S4 | ⬜ Pendiente | — | — | — |
| S5 | ⬜ Pendiente | — | — | — |
| S6 | ⬜ Pendiente | — | — | — |
| S7 | ⬜ Pendiente | — | — | — |
