# Agente: PHVIntegrationAgent
**Fase:** 1 — Claude API + localStorage
**Área:** Integración PHV en módulos UI

## Propósito
Conectar el PHVCalculatorAgent (ya creado en `api/agents/phv-calculator.ts`)
a los módulos de UI que deben mostrar datos de maduración biológica.

## Contrato

### INPUT
```
- Módulo a conectar: Rankings | PlayerProfile | Dashboard | RoleProfile
- Jugador(es) afectados (opcional)
```

### PROCESO
1. Leer el módulo UI objetivo
2. Leer `src/hooks/useAgents.ts` → función `usePHVCalculator`
3. Identificar dónde aparece `phvCategory` y `phvOffset` en el componente
4. Conectar el hook al componente
5. Asegurar que el cálculo PHV actualiza `PlayerService` con `updatePHV()`
6. Verificar que Rankings muestra las categorías PHV correctas (early/on-time/late)

### OUTPUT
```
- Módulo UI mostrando PHV calculado por Claude (no mock)
- PlayerService actualizado con phvCategory y adjustedVSI reales
- Rankings reflejando VSI ajustado por PHV
- Build sin errores
```

## Fórmula de referencia (Mirwald)
```
offset = -9.236
  + (0.0002708 × leg_length × sitting_height)
  - (0.001663 × age × leg_length)
  + (0.007216 × age × sitting_height)
  + (0.02292 × weight/height × 100)

early  → offset < -1.0  → VSI × 1.12
ontme  → -1.0 a +1.0   → VSI × 1.0
late   → offset > +1.0  → VSI × 0.92
```

## Archivos que puede modificar
- `src/pages/Rankings.tsx`
- `src/pages/PlayerProfile.tsx`
- `src/pages/Dashboard.tsx`
- `src/hooks/useAgents.ts`
- `src/services/real/playerService.ts`

## Restricciones
- El agente PHV ya existe — NO recrearlo, solo conectarlo
- Siempre llamar `PlayerService.updatePHV()` después del cálculo
- Cache de React Query: 24h para PHV (no recalcular en cada visita)
