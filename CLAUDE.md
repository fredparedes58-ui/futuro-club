# VITAS · Football Intelligence — Instrucciones para Claude Code

## Identidad del proyecto
Plataforma de análisis deportivo de fútbol con corrección de maduración biológica (PHV).
Detecta talento oculto en academias juveniles usando IA y visión computacional.
**Diferenciador único:** modelo de visión entrenado con contexto PHV juvenil (ninguna plataforma lo tiene).

## Stack técnico
- React 18.3 + TypeScript + Vite 8
- Tailwind CSS + shadcn/ui + Framer Motion + Recharts
- React Router v6 + TanStack Query v5
- vite-plugin-pwa + Workbox
- Vercel (deploy) + GitHub (repo)
- `npm install` SIEMPRE con `--legacy-peer-deps` (conflicto lovable-tagger/Vite 8)
- `.npmrc` tiene `legacy-peer-deps=true` para Vercel

## URLs importantes
- **Producción:** https://futuro-club.vercel.app
- **GitHub:** https://github.com/fredparedes58-ui/futuro-club.git
- **Local dev:** http://localhost:5200
- **Puerto exclusivo:** 5200 (no cambiar — conflicto con otros PWA instalados)

## Arquitectura de agentes (producción)
Los agentes viven en `api/agents/` y son Vercel Edge Functions:
- `PHVCalculatorAgent` — fórmula Mirwald, temperature=0
- `ScoutInsightAgent` — insights en español para ScoutFeed
- `RoleProfileAgent` — perfil táctico por jugador
- `TacticalLabelAgent` — etiquetado PHV/táctico para video (Fase 2)
La API key vive en Vercel env vars como `ANTHROPIC_API_KEY`. NUNCA en el código.

## Servicios deterministas (sin IA)
Viven en `src/services/real/`:
- `StorageService` — localStorage tipado con prefijo `vitas_`
- `MetricsService` — cálculo VSI, percentiles, tendencias
- `PlayerService` — CRUD jugadores + seed inicial 6 jugadores
- `adapters.ts` — mapeo entre formatos de agente y componentes UI

## Regla de fallback
Todos los servicios que usan IA tienen fallback automático a mock data.
Si `AgentService` falla → datos mock. La app NUNCA se rompe por falta de API key.

## Fases de desarrollo
- **Fase 1 (actual):** Claude API + localStorage. Sin Supabase.
- **Fase 2 (siguiente):** Video upload + Roboflow + pipeline automático
- **Fase 3 (futuro):** Supabase + Auth + YOLOv11M propio + SaaS

## Agentes de desarrollo disponibles
Ver `.claude/agents/` para los agentes especializados por fase y área.
Cada agente tiene un contrato estricto: input → tarea específica → output verificable.

## Comandos frecuentes
```bash
npm run dev          # desarrollo local puerto 5200
npm run build        # build producción
npx vercel --prod --yes  # deploy a producción
git push origin main # auto-deploy en Vercel
```

## Reglas importantes
1. Nunca cambiar el puerto 5200
2. Siempre `--legacy-peer-deps` en npm install
3. API keys solo en Vercel env vars, nunca en código
4. Cada módulo nuevo necesita fallback a mock data
5. Commits siempre en inglés con Co-Authored-By Claude
