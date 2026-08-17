# Benchmark del detector de balón (#17)

Medido sobre frames reales de tus clips (`yolo11s-detect.onnx`, COCO clase 32 =
sports ball, conf 0.15 según `ballModelConfig`). Cobertura = % de frames con ≥1 balón.

## Detección plana @640

| Clip | Resolución | Cobertura balón | Balones/frame | Conf. media |
|---|---|---|---|---|
| IMG_1249 | 4K, cerca | 27% | 0.36 | 0.37 |
| IMG_1255 | 4K, medio | 31% | 0.38 | 0.30 |
| IMG_2029 | 1080p, lejos | **3%** | 0.03 | 0.22 |

Conclusión: el detector COCO stock a 640 **pierde el balón** en 2 de cada 3 frames
incluso en 4K cercano, y casi entero en plano lejano. El balón es pequeño y rápido;
640 lo hace desaparecer.

## Con tiling (IMG_1249, 4K)

| Config | Cobertura balón | Balones/frame |
|---|---|---|
| plano 640 | 27% | 0.36 |
| **tiling 2×2** | **64%** | **1.18** |
| tiling 3×3 | 73% | 0.91 |

**El tiling 2×2 más que duplica la cobertura del balón (27% → 64%)** — el mismo efecto
que tuvo con los jugadores (1.2 → 5.6 det/frame). 3×3 sube la cobertura a 73% pero baja
balones/frame (tiles más pequeños fragmentan/duplican en bordes); 2×2 es el punto dulce.

## Recomendación

1. **Aplicar tiling 2×2 al worker de balón** (igual que el tiling de jugadores en
   PR #114). Es la mejora de mayor relación beneficio/coste para posesión y eventos
   de balón — que hoy dependen de una detección de balón pobre.
2. **Modelo dedicado** `yolov8s-football` (persona 0 + balón 1, mAP 0.92 en datasets de
   fútbol) mejoraría aún más — está en el registro (`modelConfig.ts`) pero **no
   desplegado** en `public/models/`. Es el hueco real de FASE 2 (ver `CLAUDE.md`).
3. **int8** (cuantización de modelos, sub-item de #17): optimización de tamaño, no de
   recall — dejar para después de decidir 1/2, no bloquea nada.

> Coherente con el gate de calibración (#21/#22): posesión y eventos de balón siguen
> gateados por calibración; esto mejora la *entrada* (recall del balón), no relaja el gate.
