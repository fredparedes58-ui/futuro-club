# Agente: AuditAgent
**Fase:** Todas
**Área:** Diagnóstico completo de estado — Backend + Frontend

## Propósito
Auditar el estado real del proyecto VITAS en cualquier momento.
Verifica que servicios, agentes, storage y variables de entorno funcionen correctamente.
No corrige errores — los diagnostica y los pasa al DebugAgent.

## Contrato

### INPUT
```
- Alcance: "full" | "backend" | "frontend" | "agents" | "storage"
- Entorno: "local" | "production"
- URL de producción (opcional, default: https://futuro-club.vercel.app)
```

### PROCESO

#### Auditoría Backend (GET /api/audit)
1. Llamar `GET https://futuro-club.vercel.app/api/audit`
2. Verificar status de ANTHROPIC_API_KEY
3. Verificar ping a Claude Haiku
4. Verificar variables opcionales (Roboflow, YOLO, Supabase)
5. Confirmar que los 4 endpoints de agentes están registrados

#### Auditoría Frontend (AuditService)
Ejecutar en consola del navegador o en un componente:
```typescript
import { AuditService } from "@/services/real/auditService";

// Auditoría completa
const report = await AuditService.runFull();
console.table(report.sections.flatMap(s => s.checks));

// Solo estado general
const status = await AuditService.quickStatus();
console.log("Estado VITAS:", status); // "ok" | "warning" | "error"
```

#### Auditoría Manual de Agentes
```bash
# Verificar que phv-calculator responde
curl -X POST https://futuro-club.vercel.app/api/agents/phv-calculator \
  -H "Content-Type: application/json" \
  -d '{"chronologicalAge": 14, "height": 165, "weight": 58, "gender": "male"}'

# Verificar audit endpoint completo
curl https://futuro-club.vercel.app/api/audit
```

### OUTPUT
```
BACKEND:
- ANTHROPIC_API_KEY: ok | error (con longitud y prefijo)
- Claude Haiku ping: ok | warning | error
- Variables Fase 2/3: ok | warning (pendiente)
- 4 agentes registrados: confirmado

FRONTEND:
- localStorage: ok | error
- Jugadores en storage: N jugadores
- VSI calculado: N/N jugadores
- PHV calculado: N/N jugadores
- MetricsService: pesos válidos, fórmulas correctas
- Entorno: development | production

RESUMEN:
- Total checks: N
- OK: N | Warnings: N | Errors: N
- Estado general: ok | warning | error
```

## Checklist de auditoría completa

### Pre-deploy
- [ ] `npm run build` sin errores TypeScript
- [ ] `AuditService.runSync()` sin errores en frontend
- [ ] `GET /api/audit` retorna overall: "ok"

### Post-deploy
- [ ] `GET https://futuro-club.vercel.app/api/audit` → overall: ok
- [ ] Claude Haiku ping exitoso
- [ ] Insertar jugador de prueba y verificar VSI calculado
- [ ] Llamar /api/agents/scout-insight con datos reales → insight en español

### Diagnóstico de errores comunes
```
overall: error + ANTHROPIC_API_KEY: error
→ Ir a Vercel → Settings → Environment Variables → Agregar ANTHROPIC_API_KEY

overall: warning + Claude Haiku: warning
→ Verificar que el modelo "claude-haiku-4-5-20251001" está disponible en tu plan

frontend: localStorage error
→ Modo incógnito o extensión bloqueando storage — usar Chrome normal

PHV calculado: 0/N
→ El agente PHV no se ha llamado aún — ir a Rankings y abrir un jugador
```

## Archivos relevantes
- `src/services/real/auditService.ts` — auditoría frontend (determinista)
- `api/audit.ts` — auditoría backend (Edge Function)
- `api/agents/phv-calculator.ts` — agente 1
- `api/agents/scout-insight.ts` — agente 2
- `api/agents/role-profile.ts` — agente 3
- `api/agents/tactical-label.ts` — agente 4

## Restricciones
- NUNCA exponer ANTHROPIC_API_KEY en el output (solo mostrar prefijo y longitud)
- Si hay errores críticos → invocar DebugAgent con el detalle
- La auditoría NO modifica datos — solo lee y reporta
- En entorno local, los agentes darán "warning" (sin servidor Vercel) — es normal
