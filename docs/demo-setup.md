# Demo VITAS — montaje (`vitas-demo.krujens.eu`)

Objetivo: un demo **igual que desarrollo** (mismo código, todas las funciones), en un
**entorno separado con su propia base de datos**, para que quien entre vea la
herramienta llena — **sin tocar los datos reales** de desarrollo/producción.

## Principio clave (honestidad)
La app está hecha para **no enseñar datos falsos**: purga los jugadores mock al
arrancar (`App.tsx` → `purgeMockPlayers`) y bloquea cualquier cifra sin procedencia
real. Por eso el demo **no lleva datos inventados**, sino **datos de ejemplo
genuinos**: jugadores con antropometría real → PHV/maduración/rankings se calculan
de verdad. Nunca datos de menores reales (RGPD): todo es sintético.

## Arquitectura
- **Mismo código** (`main`), desplegado en un **proyecto Vercel del demo** (renómbralo a
  `vitas-demo` para que no confunda) → dominio `vitas-demo.krujens.eu`. Es VITAS, no otra app.
- **Supabase del demo = proyecto NUEVO y separado** (nunca el de producción).
- (Opcional) Bunny del demo separado, para vídeo.
- Datos = seed sintético (`scripts/seed-demo.mjs`).

---

## Pasos

### 1. Supabase del demo (dashboard — TÚ)
1. Crea un **proyecto Supabase nuevo** (será el del demo).
2. Aplica **todas las migraciones** (`supabase/migrations/000…062`) en su SQL Editor,
   en orden. (Es el mismo esquema que producción.)
3. Auth → **activa "Confirm email"** y añade `https://vitas-demo.krujens.eu/auth/confirm`
   a **Redirect URLs** (igual que en prod, pero en este proyecto).
4. Crea un **usuario demo** (Auth → Add user), confírmalo, y anota email/contraseña.

### 2. Vercel del demo (proyecto `vitas-demo` — TÚ)
En el proyecto Vercel del demo, asocia el dominio **`vitas-demo.krujens.eu`** (CNAME
desde el DNS de krujens.eu; Vercel emite el SSL). Luego, en **Settings → Environment
Variables**, pon las del **demo** (NO las de producción):
- `VITE_SUPABASE_URL` = URL del Supabase del demo
- `VITE_SUPABASE_ANON_KEY` = anon key del demo
- `SUPABASE_SERVICE_ROLE_KEY` = service role del demo
- `VITE_ADMIN_EMAILS` / `ADMIN_EMAILS` = el email admin del demo
- IA/vídeo/pagos: ver **Guardarraíles** abajo (topes bajos, o dejar sin clave).
Redespliega el proyecto tras poner las variables.

> ⚠️ Si el proyecto del demo está usando ahora las variables de **producción**, cámbialas
> YA: mientras las comparta, el demo está leyendo/escribiendo datos reales de menores.

### 3. Sembrar datos (YO ya dejé el script — lo corres TÚ)
Con las credenciales del **demo**:
```bash
DEMO_API_BASE="https://vitas-demo.krujens.eu" \
DEMO_SUPABASE_URL="https://<demo-ref>.supabase.co" \
DEMO_SUPABASE_ANON_KEY="<anon del demo>" \
DEMO_EMAIL="<usuario demo>" DEMO_PASSWORD="<pass>" \
node scripts/seed-demo.mjs
```
Crea 8 jugadores de ejemplo con antropometría → PHV/maduración/rankings poblados y
reales. (Trae una salvaguarda que aborta si apunta a producción.)

---

## Guardarraíles del demo (coste + RGPD)
Como el demo es un enlace público, en su **entorno**:
- **Coste IA/vídeo:** poner el tope de presupuesto bajo (`GLOBAL_MONTHLY_BUDGET_USD`)
  y cuotas apretadas, o dejar sin claves de IA/vídeo (entonces esas secciones caen a
  su fallback con banner "Datos de ejemplo").
- **RGPD:** el demo NUNCA debe contener vídeos/datos de menores reales — solo el seed
  sintético. La BD separada ya lo aísla de producción.
- **Pagos:** sin claves reales de Stripe en el demo.

## Decisión pendiente (IA en el demo)
¿Las secciones de IA (informes LLM, análisis de vídeo) en el demo deben:
- **(a)** correr **IA real topada** (resultados genuinos, cuesta y necesita claves+topes), o
- **(b)** mostrar **salidas de ejemplo** con el banner "Datos de ejemplo" que ya existe (gratis)?
Lo determinístico (PHV/VSI/rankings/bienestar) es real en ambos casos.
