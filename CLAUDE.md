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

## Vision Pipeline
Hallazgos FASE 0-1 (branch `fix/vision-pipeline`, 2026-07):
- La visión de PRODUCCIÓN corre en el navegador (onnxruntime-web + Web Workers), NO en Modal. Modal (`vision-pipeline/app.py`) está desplegado pero huérfano — ningún caller en la UI.
- `*.onnx` está gitignored (`.gitignore:24-25`) → `/models/` da 404 en prod. Los modelos se sirven como **GitHub Release assets del propio repo** (tag `models-v1`): yolov8n-pose (13MB) y yolov11m-pose (84MB FP32, opset 17, imgsz 640). Antes producción dependía de un repo de terceros (akbartus) para el nano.
- Selección de modelo: registry en `src/lib/yolo/modelConfig.ts` — default por dispositivo (desktop → yolov11m-pose, móvil → yolov8n-pose), override manual en localStorage `vitas_active_model`. `useTracking.ts` carga del registry (antes hardcodeaba nano). Cadena de fallback del worker: pedido → nano local (dev) → release nano propio.
- Compatibilidad: v8n-pose y v11m-pose comparten contrato de salida `[1,56,8400]`; el worker usa `inputNames[0]`/`outputNames[0]` dinámicos.
- Export reproducible: `modal run vision-pipeline/export_onnx.py` (torch local no viable en Py3.14; recuerda PYTHONUTF8=1 en Windows). El PWA NO precachea los .onnx (límite 2MB de Workbox) — precache se mantiene en ~5.3MB.
- Modal parametrizado: `YOLO_MODEL` env (default yolo11m) + fp16 en `track()`.
- Homografía px→m YA existe y está testeada (`src/lib/yolo/homography.ts` + RANSAC + `homographyVoronoi.test.ts`); métricas físicas ya en metros. Balón = heurística sobre el pose model (`ballModelConfig.ts` modo "heuristic"); detector dedicado `yolov8s-football` es el hueco real (FASE 2).
- PENDIENTE: benchmark n vs m con clip real (necesita URL pública de vídeo); int8 (~21MB) como optimización post-benchmark; FASE 2 balón dedicado; decisión producto sobre Modal (cablear a UI para partidos largos o retirar).
