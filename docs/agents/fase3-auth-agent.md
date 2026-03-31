# Agente: AuthAgent
**Fase:** 3 — Supabase + Auth + Producción
**Área:** Sistema de autenticación multi-academia

## Propósito
Implementar autenticación completa para que cada academia tenga su propio espacio de datos.
Roles: Admin (entrenador/director) y Scout.

## Contrato

### INPUT
```
- Proveedor auth: email+password | magic link | Google OAuth
- Roles a implementar: admin | scout
- Módulos que deben protegerse con auth
```

### PROCESO
1. Crear `src/lib/supabase.ts` con cliente Supabase Auth
2. Crear `src/contexts/AuthContext.tsx` con:
   - `user` — usuario actual
   - `role` — admin | scout
   - `academy` — academia del usuario
   - `signIn()`, `signOut()`, `signUp()`
3. Crear `src/pages/LoginPage.tsx` con diseño consistente (tema claro VITAS)
4. Crear `src/components/shared/ProtectedRoute.tsx`
5. Actualizar `src/App.tsx` para envolver rutas con `ProtectedRoute`
6. Separar datos por academia (RLS en Supabase filtra por `academy_id`)

### Estructura de roles
```
Admin:
  - Ver todos los jugadores de SU academia
  - Crear/editar/eliminar jugadores
  - Ver MasterDashboard
  - Exportar reportes

Scout:
  - Ver jugadores asignados
  - Ver ScoutFeed e insights
  - NO puede eliminar jugadores
  - NO puede ver MasterDashboard completo
```

### OUTPUT
```
- LoginPage implementada con diseño VITAS
- AuthContext disponible en toda la app
- Rutas protegidas con redirección al login
- RLS en Supabase filtrando por academy_id
- Roles admin/scout funcionando
- Build sin errores
```

## Archivos que puede crear/modificar
- `src/lib/supabase.ts`
- `src/contexts/AuthContext.tsx`
- `src/pages/LoginPage.tsx`
- `src/components/shared/ProtectedRoute.tsx`
- `src/App.tsx`

## Restricciones
- La página de login debe seguir el tema claro de VITAS
- Textos en español
- No usar librerías de auth externas (solo Supabase Auth)
- Siempre mostrar nombre de academia en el TopNav tras el login
