# VITAS · Supabase Setup — Guía completa paso a paso

Esta guía te lleva de `localStorage` a Supabase totalmente activo en
**unos 90-120 minutos de tu tiempo**. Después de esto, todos los
módulos de VITAS funcionan multi-device, multi-coach, con auth real
y datos persistentes.

---

## ✅ Antes de empezar

- [ ] Tarjeta para Supabase (no se cobra nada en el free tier, pero la piden)
- [ ] Acceso al dashboard de Vercel donde está desplegado VITAS
- [ ] 90 minutos sin interrupciones (puedes hacerlo en partes)

---

## Paso 1 — Crear proyecto Supabase (10 min)

1. Ve a **https://supabase.com**
2. Haz click en **"Start your project"** → registrarse con GitHub o email
3. Click **"New project"**
4. Rellena:
   - **Name**: `vitas-prod` (o el que quieras)
   - **Database Password**: genera una fuerte (apúntala en gestor de
     contraseñas, la vas a usar para el CLI)
   - **Region**: `Frankfurt (eu-central-1)` si tu audiencia es Europa,
     `London (eu-west-2)` o `US East (us-east-1)` si es otra
   - **Pricing Plan**: `Free` (cubre hasta 50k usuarios activos/mes)
5. Click **"Create new project"** y espera ~2 minutos a que se aprovisione

---

## Paso 2 — Copiar las credenciales (3 min)

Una vez creado el proyecto, ve a **Settings → API**:

| Campo | Dónde lo encuentras | Para qué sirve |
|---|---|---|
| **Project URL** | "Project URL" | Lo necesita el cliente y el backend |
| **anon public** key | "Project API keys" → `anon` `public` | Cliente (frontend) |
| **service_role** key | "Project API keys" → `service_role` ⚠️ secret | Backend (Edge Functions) |

**Guárdalas en un sitio seguro** (gestor de contraseñas). Las
configuraremos en Vercel en el paso 6.

---

## Paso 3 — Instalar Supabase CLI localmente (5 min)

```bash
# Opción 1: npm (recomendado)
npm install -g supabase

# Opción 2: scoop (Windows)
scoop install supabase

# Verifica que se instaló
supabase --version
```

---

## Paso 4 — Conectar al proyecto y aplicar migraciones (15 min)

Desde la raíz del repo VITAS:

```bash
# 4.1 — Autenticarte con tu cuenta Supabase
supabase login

# 4.2 — Vincular este repo al proyecto
# El project-ref lo ves en la URL del dashboard:
# https://supabase.com/dashboard/project/XXXXXXXX
supabase link --project-ref XXXXXXXX

# Te pedirá la Database Password del Paso 1

# 4.3 — Aplicar las 54 migraciones
supabase db push

# Verás:
#   Applying migration 000_full_schema.sql...
#   Applying migration 001_players.sql...
#   ...
#   Applying migration 046_wellbeing_burnout.sql...
#   Finished supabase db push.
```

**Si alguna migración falla** (no debería, están probadas):
- Anota cuál y el error exacto
- Pásamelo y te ayudo a arreglarla

---

## Paso 5 — Verificar tablas creadas (5 min)

En el dashboard de Supabase → **Table Editor**, deberías ver
~50 tablas:

✅ Tablas críticas que confirman que todo está bien:

- `players` — jugadores
- `videos` — videos subidos a Bunny
- `analyses_reports` — resultados IA (Modal, MediaPipe)
- `user_profiles` — perfiles de usuario
- `organizations` — academias/clubs (multi-tenancy)
- `team_members` — relación coach ↔ academia
- `subscriptions` — Stripe billing
- `behavioral_profiles` — perfiles mentales
- `training_sessions` — sesiones del Coach Dashboard
- `engagement_snapshots` — Wellbeing
- `attendance_records` — asistencia
- `dropout_risk_assessments` — Riesgo de abandono
- `parental_consent` — RGPD para menores
- `match_events` — eventos del partido (set pieces incluidos)
- `live_matches` — match-day live
- `notifications` — push notifications
- `audit_log` — auditoría

Si **falta alguna** o ves errores, pásamelo y lo arreglamos.

---

## Paso 6 — Configurar Vercel (5 min)

En Vercel → tu proyecto → **Settings** → **Environment Variables**.

Añade estas **5 variables**:

```bash
# Frontend (con prefijo VITE_, accesibles desde el cliente)
VITE_SUPABASE_URL          = https://XXXXXXXX.supabase.co
VITE_SUPABASE_ANON_KEY     = eyJhbGciOiJIUzI1NiI...   (anon public del paso 2)

# Backend (sin prefijo VITE_, secretas)
SUPABASE_URL               = https://XXXXXXXX.supabase.co  (misma URL)
SUPABASE_SERVICE_ROLE_KEY  = eyJhbGciOiJIUzI1NiI...   (service_role del paso 2)

# (Opcional) URL pública del front
VITAS_PUBLIC_URL           = https://futuro-club.vercel.app
```

Aplica a: **Production**, **Preview**, **Development**.

Click **Save**.

---

## Paso 7 — Redeploy Vercel (5 min)

Para que coja las nuevas env vars:

**Opción A — Push trigger:**
```bash
git commit --allow-empty -m "trigger redeploy after supabase env"
git push origin main
```

**Opción B — UI:**
- Deployments → encuentra el último → ⋯ → **Redeploy**

Espera ~2 minutos al deploy.

---

## Paso 8 — Verificar end-to-end (10 min)

### 8.1 — Health check del frontend

Abre **https://futuro-club.vercel.app/login** en una ventana nueva.

- Si ves el formulario de login (no el "modo offline"), Supabase está
  conectado al frontend ✅

### 8.2 — Crear tu primera cuenta

1. Click **"Crear academia"** en el form de login
2. Rellena email + contraseña
3. Si recibes el email de confirmación o entras directo → ✅

### 8.3 — Verificar en Supabase

Dashboard → **Authentication** → **Users**: deberías ver tu cuenta.

Dashboard → **Table Editor** → `user_profiles`: deberías ver una fila
con tu user_id.

### 8.4 — Subir un video de prueba

1. Login en VITAS
2. `/set-pieces` → Click **"Subir video"**
3. Selecciona un MP4 pequeño (<50 MB)
4. **Si Bunny está configurado**: toast "Video subido a Bunny correctamente"
5. **En el dashboard Supabase**: tabla `videos` debería tener una fila nueva

### 8.5 — Multi-device test

1. Misma cuenta, abre VITAS desde el móvil
2. Deberías ver el video que acabas de subir desde PC

**Si esto funciona, has terminado.** 🎉

---

## ❓ Qué hago si algo falla

| Síntoma | Causa probable | Fix |
|---|---|---|
| "Modo offline" en login | env vars no cargaron | Revisa Vercel env vars → redeploy |
| "Database error" al signup | RLS bloqueando insert | Pásame el error y miramos las policies |
| Migración falla con "relation exists" | Migraciones ya aplicadas | Normal, ignora o usa `supabase db reset` |
| Video sube pero no aparece en Supabase | Endpoint no usa Supabase | Pásame el módulo y lo arreglo |
| Login funciona pero no veo mis datos | Falta sync inicial | Es esperado en la primera carga · refresca |

---

## 🎁 Bonus: Datos demo

Para tener datos con los que probar sin tener que subir todo manualmente:

```bash
# Inserta jugadores demo + análisis falsos (solo en dev)
supabase db remote commit -m "seed demo data"
```

O dispara desde el dashboard SQL Editor:

```sql
SELECT seed_demo_data();   -- si existe la función
```

---

## 📊 Coste real esperado

| Volumen | Plan | Coste/mes |
|---|---|---|
| 0-50k usuarios activos | Free | $0 |
| 50k-100k usuarios + 8GB DB | Pro | $25 |
| 500GB egress | Pro | $25 + $0.09/GB sobre 250GB |
| Empresa | Team | $599 |

**Para empezar: $0/mes** durante muchos meses.

---

## 🚀 Siguiente paso

Una vez completados estos 8 pasos:
- Auth funciona ✅
- Multi-device ✅
- Multi-coach (con team_members) ✅
- Persistencia real ✅
- Stripe billing listo para activar
- Push notifications listos para activar

Yo continuaré construyendo los servicios específicos para los módulos
que aún están en mock (/family, /director, /live, /admin/consent, etc.)
mientras tú haces este setup.

Cuando termines, dime y validamos junto. 🚀
