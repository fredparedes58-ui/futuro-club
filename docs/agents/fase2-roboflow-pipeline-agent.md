# Agente: RoboflowPipelineAgent
**Fase:** 2 — Video + Roboflow
**Área:** Pipeline automático de análisis de video

## Propósito
Implementar el pipeline completo: video → frames → Roboflow → Claude etiquetado PHV → modelo entrenado.
Este es el corazón técnico de VITAS para Fase 2.

## Contrato

### INPUT
```
- Video ID (ya subido al storage)
- Roboflow API Key (en Vercel env vars como ROBOFLOW_API_KEY)
- Roboflow Project ID (en Vercel env vars como ROBOFLOW_PROJECT_ID)
- Datos de jugadores del equipo (para contexto PHV)
```

### PROCESO
1. Crear `api/pipeline/extract-frames.ts`:
   - Recibe videoId
   - Extrae 1 frame por segundo usando ffmpeg (via @ffmpeg/ffmpeg WASM o servidor)
   - Retorna array de frames base64

2. Crear `api/pipeline/roboflow-detect.ts`:
   - Recibe frames
   - Llama a Roboflow Inference API para detectar jugadores
   - Retorna detecciones por frame

3. Crear `api/pipeline/label-frames.ts`:
   - Recibe detecciones de Roboflow
   - Llama a `TacticalLabelAgent` (ya existe en `api/agents/tactical-label.ts`)
   - Retorna frames con etiquetas PHV/táctica

4. Crear `api/pipeline/train-model.ts`:
   - Sube frames etiquetados a Roboflow Dataset
   - Dispara entrenamiento automático
   - Retorna modelo ID actualizado

5. Crear `api/pipeline/orchestrator.ts`:
   - Orquesta los 4 pasos anteriores en secuencia
   - Actualiza estado del video en tiempo real
   - Al completar → llama ScoutInsightAgent para generar insights

### OUTPUT
```
- 5 Vercel Functions del pipeline creadas
- Roboflow conectado y recibiendo frames etiquetados
- TacticalLabelAgent integrado en el pipeline
- Insights generados automáticamente al finalizar el análisis
- Estado del pipeline visible en MasterDashboard
```

## Variables de entorno requeridas (Vercel)
```
ROBOFLOW_API_KEY=rf_...
ROBOFLOW_PROJECT_ID=vitas-football-v1
ROBOFLOW_WORKSPACE=vitas-intelligence
```

## Archivos que puede crear
- `api/pipeline/extract-frames.ts`
- `api/pipeline/roboflow-detect.ts`
- `api/pipeline/label-frames.ts`
- `api/pipeline/train-model.ts`
- `api/pipeline/orchestrator.ts`
- `src/services/real/pipelineService.ts`
- `src/hooks/usePipeline.ts`

## Restricciones
- Cada step del pipeline debe ser idempotente (re-ejecutable sin duplicar datos)
- Máximo 100 frames por llamada a Roboflow (batch processing)
- El pipeline NUNCA bloquea la UI — siempre async con estado de progreso
- Si Roboflow falla → guardar frames localmente para reintentar
