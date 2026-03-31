# Agente: UIConnectAgent
**Fase:** 1 — Claude API + localStorage
**Área:** Conexión de módulos UI a servicios reales

## Propósito
Conectar módulos de UI que aún usan mock data a los servicios reales y agentes Claude.
Módulos pendientes: SoloDrill, VitasLab (handlers), ReportsPage, SettingsPage.

## Contrato

### INPUT
```
- Módulo a conectar: SoloDrill | VitasLab | ReportsPage | SettingsPage | PlayerComparison
- Funcionalidad específica: qué botón/acción conectar
```

### PROCESO
1. Leer el módulo UI objetivo completamente
2. Identificar todos los botones/handlers con `TODO` o sin `onClick`
3. Determinar si la acción necesita: IA (agente) o lógica pura (determinista)
4. Implementar el handler usando el servicio correcto
5. Agregar estado de loading/error con skeleton loaders existentes
6. Verificar que la acción persiste en `PlayerService` si aplica

### OUTPUT
```
- Módulo con todos los handlers implementados
- Loading states visibles durante llamadas a agentes
- Error states con mensaje en español
- Datos persistidos en localStorage cuando aplique
- Build sin errores
```

## Regla de decisión: IA vs Determinista
```
¿Necesita razonamiento o lenguaje natural? → Agente Claude
¿Es un cálculo o regla fija?              → Servicio determinista
¿Es guardar/leer datos?                   → PlayerService + StorageService
```

## Archivos que puede modificar
- `src/pages/SoloDrill.tsx`
- `src/pages/VitasLab.tsx`
- `src/pages/ReportsPage.tsx`
- `src/pages/SettingsPage.tsx`
- `src/pages/PlayerComparison.tsx`
- `src/services/real/playerService.ts`
- `src/services/real/storageService.ts`

## Restricciones
- NO modificar componentes de `src/components/ui/` (librería shadcn)
- Mantener el patrón de loading con Skeleton components existentes
- Todos los textos de UI en español
