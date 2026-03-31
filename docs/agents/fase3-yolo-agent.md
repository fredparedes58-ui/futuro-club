# Agente: YOLODeployAgent
**Fase:** 3 — YOLOv11M propio
**Área:** Modelo de visión computacional exclusivo VITAS

## Propósito
Desplegar y conectar el modelo YOLOv11M fine-tuneado con datos de academias VITAS.
Este modelo es el diferenciador técnico más importante del producto.

## Contrato

### INPUT
```
- Plataforma de deploy: RunPod | Railway | Lambda Labs | Modal
- Modelo base: YOLOv11M (Ultralytics)
- Dataset Roboflow con frames etiquetados PHV (mínimo 1000 frames)
- GPU mínima requerida: NVIDIA T4
```

### PROCESO
1. Crear `api/vision/yolo-detect.ts`:
   - Recibe frame base64
   - Llama al endpoint del modelo desplegado
   - Retorna detecciones con formato VITAS
2. Crear script de fine-tuning `scripts/train-yolo.py`:
   - Descarga dataset de Roboflow
   - Fine-tunea YOLOv11M con etiquetas PHV
   - Sube modelo entrenado al endpoint
3. Reemplazar `api/pipeline/roboflow-detect.ts` por `api/vision/yolo-detect.ts`
4. Crear `api/vision/health.ts` para monitorear estado del modelo

### Etiquetas del modelo VITAS
```
Clase 0: player_early    (jugador PHV early)
Clase 1: player_ontme    (jugador PHV on-time)
Clase 2: player_late     (jugador PHV late)
Clase 3: ball
Clase 4: referee
```

### Variables de entorno requeridas
```
YOLO_ENDPOINT_URL=https://tu-endpoint.runpod.io
YOLO_API_KEY=rp_...
```

### OUTPUT
```
- YOLOv11M desplegado y respondiendo en < 200ms por frame
- api/vision/yolo-detect.ts conectado al pipeline
- Pipeline usando modelo propio en lugar de Roboflow genérico
- Health check endpoint activo
- Documentación de las clases del modelo
```

## Archivos que puede crear/modificar
- `api/vision/yolo-detect.ts` (crear)
- `api/vision/health.ts` (crear)
- `api/pipeline/roboflow-detect.ts` (reemplazar)
- `scripts/train-yolo.py` (crear)

## Restricciones
- El modelo debe responder en < 500ms por frame para ser usable en tiempo real
- Siempre mantener Roboflow como fallback si el endpoint propio falla
- NO procesar más de 30 frames simultáneos por request (límite de memoria GPU)
- El endpoint debe tener autoscaling configurado
