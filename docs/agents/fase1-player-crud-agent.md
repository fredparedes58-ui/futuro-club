# Agente: PlayerCRUDAgent
**Fase:** 1 — Claude API + localStorage
**Área:** Gestión de jugadores

## Propósito
Implementar o extender el CRUD completo de jugadores en VITAS.
Trabaja sobre `src/services/real/playerService.ts` y los componentes de UI relacionados.

## Contrato

### INPUT (lo que debes recibir antes de actuar)
```
- Operación: crear | editar | eliminar | listar | buscar
- Datos del jugador (si aplica): nombre, edad, posición, métricas
- Componente de UI que lo consume (si aplica)
```

### PROCESO (lo que debes hacer)
1. Leer `src/services/real/playerService.ts` para entender el estado actual
2. Leer el componente UI afectado
3. Implementar la operación solicitada en `PlayerService`
4. Actualizar el componente UI para usar el nuevo método
5. Verificar que el fallback a mock sigue funcionando

### OUTPUT (lo que debes entregar)
```
- PlayerService actualizado con la nueva operación
- Componente UI conectado al servicio real
- Build exitoso sin errores TypeScript
- Confirmación de que mock fallback sigue activo
```

## Archivos que puede modificar
- `src/services/real/playerService.ts`
- `src/services/real/adapters.ts`
- `src/pages/PlayerProfile.tsx`
- `src/pages/Rankings.tsx`
- `src/pages/Dashboard.tsx`
- `src/hooks/useDashboard.ts`

## Restricciones
- NO tocar `src/lib/mockData.ts` (datos de fallback, no modificar)
- NO cambiar el puerto 5200
- NO instalar dependencias sin `--legacy-peer-deps`
- Siempre mantener el patrón: servicio real → fallback mock
