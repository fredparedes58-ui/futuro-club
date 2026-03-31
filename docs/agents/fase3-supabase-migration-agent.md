# Agente: SupabaseMigrationAgent
**Fase:** 3 — Supabase + Auth + Producción
**Área:** Migración de localStorage a Supabase

## Propósito
Migrar todos los datos de localStorage a Supabase sin romper la app.
Estrategia: reemplazar servicio por servicio, manteniendo fallback a localStorage.

## Contrato

### INPUT
```
- Supabase Project URL (en .env como VITE_SUPABASE_URL)
- Supabase Anon Key (en .env como VITE_SUPABASE_PUBLISHABLE_KEY)
- Servicio a migrar: PlayerService | VideoService | MetricsService
```

### PROCESO
1. Leer el servicio actual en `src/services/real/`
2. Crear las tablas SQL necesarias en Supabase
3. Crear `src/services/supabase/[nombre]Service.ts` con la misma interfaz
4. Implementar migración: `migrateFromLocalStorage()` que copia datos existentes
5. Actualizar el hook correspondiente para usar el nuevo servicio
6. Verificar que el fallback a localStorage sigue activo si Supabase no está disponible

### SQL a crear (referencia)
```sql
-- players
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER,
  position TEXT,
  foot TEXT,
  height NUMERIC,
  weight NUMERIC,
  competitive_level TEXT,
  minutes_played INTEGER DEFAULT 0,
  metrics JSONB,
  vsi NUMERIC,
  vsi_history JSONB,
  phv_category TEXT,
  phv_offset NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- videos
CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  player_ids TEXT[],
  url TEXT,
  status TEXT,
  pipeline_state JSONB,
  insights JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
```

### OUTPUT
```
- Servicio Supabase creado con misma interfaz que el de localStorage
- Migración automática de datos existentes ejecutada
- Hooks actualizados (sin cambios en componentes UI)
- RLS policies configuradas
- Build sin errores
```

## Archivos que puede crear/modificar
- `src/services/supabase/playerService.ts` (crear)
- `src/services/supabase/videoService.ts` (crear)
- `src/lib/supabase.ts` (crear — cliente Supabase)
- `src/hooks/useDashboard.ts`
- `src/hooks/useRankings.ts`
- `src/hooks/useRoleProfile.ts`

## Restricciones
- NUNCA borrar `src/services/real/` — mantener como fallback
- Instalar supabase-js con `--legacy-peer-deps`
- RLS obligatorio en todas las tablas
- NO usar service_role key en el frontend
