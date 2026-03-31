# Agente: VideoUploadAgent
**Fase:** 2 — Video + Roboflow
**Área:** Upload y almacenamiento de video

## Propósito
Implementar el sistema de upload de video en VitasLab y SoloDrill.
Conecta el input de archivo con storage y dispara el pipeline de análisis.

## Contrato

### INPUT
```
- Módulo destino: VitasLab | SoloDrill
- Storage backend: Supabase Storage | Cloudflare R2 | local (dev)
- Límite de tamaño de video (MB)
```

### PROCESO
1. Leer `src/pages/VitasLab.tsx` y `src/pages/SoloDrill.tsx`
2. Agregar `<input type="file" accept="video/*">` con UI consistente con el diseño
3. Crear `src/services/real/videoService.ts` con:
   - `uploadVideo(file)` → sube al storage configurado
   - `getUploadStatus(videoId)` → estado del procesamiento
4. Al completar el upload → llamar al pipeline (Fase 2B)
5. Mostrar progress bar durante el upload
6. Conectar el botón "START ANALYSIS" de VitasLab al handler real

### OUTPUT
```
- Input de video funcional en VitasLab y SoloDrill
- VideoService con upload real al storage
- Progress bar durante el upload
- Estado "video subido, procesando..." visible
- Build sin errores TypeScript
```

## Arquitectura del VideoService
```typescript
interface VideoUpload {
  videoId: string
  status: 'uploading' | 'processing' | 'completed' | 'error'
  progress: number  // 0-100
  url?: string
  insights?: ScoutInsightOutput[]
}
```

## Archivos que puede crear/modificar
- `src/services/real/videoService.ts` (crear)
- `src/pages/VitasLab.tsx`
- `src/pages/SoloDrill.tsx`
- `api/pipeline/process-video.ts` (crear — Vercel Function)

## Restricciones
- Video máximo 500MB por upload
- Formatos aceptados: mp4, mov, avi, mkv
- Mostrar preview del video antes de confirmar el upload
- NO procesar video en el browser — siempre en el servidor
