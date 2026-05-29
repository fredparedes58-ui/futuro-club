# VITAS · Phase 3 (Supabase + Bunny + Modal) — Estado actual

> Actualizado en la sesión del 2026-05-29

---

## 🟢 Lo que está 100% construido en código

### Storage + CDN
- ✅ **Bunny Stream integration** (`api/videos/_bunny-create.ts`, `_bunny-status.ts`, `bunnyStreamService.ts`)
- ✅ **VideoUploadDialog** sube a Bunny cuando configurado, blob fallback
- ✅ Soporte TUS multipart resumable upload + polling de encoding

### IA pipelines
- ✅ **MediaPipe Web (cliente)** para scanning (`scanningVideoDetector.ts`)
- ✅ **Modal pipeline bulletproof** para tracking 22 jugadores + balón (`vision-pipeline/app.py`)
- ✅ Edge proxy con fallback automático (`api/coaching/_track-players.ts`)

### Supabase services (offline-first híbrido)
- ✅ `behavioralProfileService.ts` — 7 dimensiones mentales
- ✅ `wellbeingService.ts` — engagement, asistencia, cuestionarios, risk
- ✅ `coachingSessionService.ts` — sesiones + métricas + reportes padres
- ✅ `parentalConsentService.ts` — RGPD workflow para menores
- ✅ `liveMatchService.ts` — partidos en directo + Realtime
- ✅ `localStorageMigrationService.ts` — migración automática

### Hooks conectados
- ✅ `useWellbeing` → WellbeingService
- ✅ `useBehavioralProfile` → BehavioralProfileService
- ✅ `useCoachingSession` → CoachingSessionService
- ✅ `useParentalConsent` (nuevo) → ParentalConsentService
- ✅ `useLocalStorageMigration` (nuevo) — corre tras login

### Auth + Sync (preexistente, verificado)
- ✅ `AuthContext` con login/signup/reset
- ✅ `SyncContext` + `useSupabaseSync` con queue offline
- ✅ LoginPage, RegisterPage, ForgotPasswordPage

### Stripe (preexistente, verificado)
- ✅ `api/stripe/_checkout.ts`, `_portal.ts`, `_webhook.ts`
- ✅ `subscriptionService.ts` con PLAN_LIMITS
- ✅ BillingPage con UI completa

### Páginas wired
- ✅ `/family/:playerId` con banner consentimiento parental
- ✅ `/wellbeing` con engagement/attendance reales (cuando hay datos)
- ✅ PlayerHub Mental tab con behavioral data real

### Documentación
- ✅ `docs/SUPABASE_SETUP.md` — guía completa 8 pasos
- ✅ `docs/BUNNY_SETUP.md` — guía Bunny 10 min
- ✅ `vision-pipeline/README.md` — guía Modal 15 min
- ✅ `docs/PHASE_3_STATUS.md` (este archivo)

---

## 🟡 Lo que falta para ser 100% funcional

### Cableado de páginas restantes (~6-8h)
- [ ] `/admin/consent` — ya tiene UI, validar funciona con nuevo servicio
- [ ] `/director` — queries multi-coach + agregaciones
- [ ] `/coach` — usar CoachingSessionService completo
- [ ] `/live/:matchId` — usar LiveMatchService con Realtime
- [ ] `/live/:matchId/summary` — generar resumen post-match

### Endpoints faltantes (~3-4h)
- [ ] `api/consent/_send-reminder.ts` — email al tutor (Resend o similar)
- [ ] `api/push/_subscribe.ts` — Web Push subscription endpoint
- [ ] `api/push/_send.ts` — disparar notificación push

### Service Worker (~3-4h)
- [ ] Push notification handler en SW
- [ ] Background sync queue para offline
- [ ] Update prompt cuando hay nueva versión

### Hooks faltantes (~2h)
- [ ] Highlights service Supabase (highlights_reels + highlights_clips)
- [ ] Set Pieces service Supabase (en match_events)
- [ ] Scanning analysis persistence en Supabase

### Tests + verificación (~3-4h)
- [ ] E2E test: signup → upload video → analyze → see results
- [ ] Migration test: usuario localStorage existente → login → ver datos
- [ ] RLS policy verification (que cada coach solo vea sus datos)

---

## 🚀 Lo que TÚ tienes que hacer (en orden)

### Paso 1 — Bunny (10 min)
Sigue `docs/BUNNY_SETUP.md`. Configura 3 env vars en Vercel.
**Resultado:** videos suben a CDN público.

### Paso 2 — Supabase (90-120 min)
Sigue `docs/SUPABASE_SETUP.md`. Configura proyecto + 5 env vars.
**Resultado:** auth, multi-device, datos persistentes funcionan.

### Paso 3 — Modal (15 min)
Sigue `vision-pipeline/README.md`. Despliega el pipeline Python.
**Resultado:** análisis IA real (22 jugadores + balón) disponible.

### Paso 4 — Stripe (15 min)
- Crear cuenta Stripe (modo test primero)
- Crear productos: Pro ($X/mes), Club ($Y/mes)
- Configurar env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `STRIPE_CLUB_PRICE_ID`
- En Stripe Dashboard → Webhooks → añadir endpoint `/api/stripe/_webhook` con eventos `customer.subscription.*`
**Resultado:** /billing funciona, los usuarios pueden suscribirse.

### Paso 5 — Email (10 min, opcional)
- Cuenta Resend (gratis 3000 emails/mes)
- Env var `RESEND_API_KEY`
**Resultado:** recordatorios de consentimiento parental se envían.

### Total: ~3 horas tu tiempo distribuido en 5 pasos independientes

---

## 📊 Estado por módulo

| Módulo | Estado | Sin tu acción | Con todos los pasos completos |
|---|---|---|---|
| Login/Signup | ✅ Código listo | ❌ Modo offline | 🟢 Auth real |
| `/set-pieces` | ✅ | 🟢 localStorage | 🟢 Multi-device + Modal real |
| `/highlights` | ✅ | 🟢 localStorage | 🟢 Multi-device |
| `/scanning` | ✅ | 🟢 MediaPipe Web | 🟢 + persistencia |
| `/coach` | ✅ Código wired | 🟢 localStorage | 🟢 Multi-coach + datos reales |
| `/wellbeing` | ✅ Código wired | 🟢 Mock | 🟢 Datos reales |
| `/behavioral` | ✅ Código wired | 🟢 Mock | 🟢 Datos reales |
| PlayerHub Mental tab | ✅ | 🟢 Mock | 🟢 Datos reales |
| `/family/:id` | ✅ Con consent | 🟢 Mock + banner | 🟢 Real + consent |
| `/admin/consent` | ✅ Preexistente | 🟢 Mock | 🟢 Real RGPD |
| `/director` | 🟡 Pendiente cableado | 🟡 Mock | Tras Paso 2 + cableado |
| `/live` | 🟡 Pendiente cableado | 🟡 Mock | Tras Paso 2 + cableado |
| `/billing` | ✅ Preexistente | ❌ No funciona | 🟢 Stripe activo |
| Push notifications | 🟡 Pendiente SW | ❌ No funcionan | Tras Paso 2 + 3-4h código |

---

## 🎯 Hoja de ruta sugerida

### Esta semana
1. **TÚ:** activa Bunny (paso 1)
2. **TÚ:** activa Supabase (paso 2)
3. **YO:** acabo cableado de `/director` y `/live` (~6h)

### Siguiente semana
4. **TÚ:** activa Modal (paso 3)
5. **TÚ:** activa Stripe (paso 4)
6. **YO:** construyo push notifications + email reminders (~7h)
7. **AMBOS:** tests E2E y QA

### En 2 semanas
8. **YO:** servicios Supabase de Highlights + Set Pieces (~4h)
9. **AMBOS:** documentación final + onboarding usuarios

**Tiempo total para 100%: ~3 horas tuyas + ~20-25 horas mías distribuidas en 2-3 semanas.**

---

## 🆘 Si algo no funciona

1. **Bunny:** revisa `docs/BUNNY_SETUP.md` sección troubleshooting
2. **Supabase:** revisa `docs/SUPABASE_SETUP.md` sección troubleshooting
3. **Modal:** revisa `vision-pipeline/README.md` sección troubleshooting
4. **Otra cosa:** dime exactamente qué módulo y qué error ves

---

## 💰 Coste mensual proyectado

| Volumen | Bunny | Supabase | Modal | Stripe | Total |
|---|---|---|---|---|---|
| Demo (1-5 partidos/mes) | $1 | $0 (free) | $0 (free tier) | $0 | **~$1/mes** |
| 50 partidos/mes | $5 | $0 (free) | $20 | 2.9% transacciones | **~$25/mes** |
| 200 partidos/mes | $15 | $25 (Pro) | $80 | 2.9% transacciones | **~$120/mes** |
| 1000 partidos/mes | $50 | $25 (Pro) | $400 (o self-host $30) | 2.9% trans | **~$110/mes** (self-host) |

**Para empezar a vender:** ~$25-30/mes hasta llegar a 100 partidos.

---

**Hoy: empieza por activar Bunny y Supabase. El resto sigue funcionando con localStorage hasta que actives Modal y Stripe.** 🚀
