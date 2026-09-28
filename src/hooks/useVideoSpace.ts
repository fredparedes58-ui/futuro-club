/**
 * VITAS · useVideoSpace
 *
 * Dimensiones NATIVAS (videoWidth×videoHeight) de un <video> como ESTADO React.
 *
 * Por qué estado y no leer el elemento al vuelo: el overlay del Lab dibuja con el
 * letterbox de `object-fit: contain` (coordSpace.containTransform), que depende de
 * esas dimensiones, y estas llegan ASÍNCRONAS (loadedmetadata). Si el dibujo las lee
 * al vuelo pero nada lo re-ejecuta cuando llegan, los puntos de calibración se quedan
 * pintados como si el vídeo llenara el contenedor mientras el hit-test del ratón ya
 * aplica el letterbox → no se pueden agarrar. Con estado:
 *   · el overlay se redibuja cuando el vídeo conoce (o cambia) su tamaño, y
 *   · dibujo y hit-test usan el MISMO valor → siempre coinciden.
 *
 * Se re-engancha solo si cambia el elemento (montado, desmontado o sustituido). Un
 * cambio de `src` sobre el mismo elemento se cubre con `emptied` (→ null) y
 * `loadedmetadata`/`resize` (→ nuevas dimensiones).
 */

import { useEffect, useRef, useState } from "react";
import { sameSpace, videoSpaceOf, type PixelSpace } from "@/lib/yolo/coordSpace";

const VIDEO_SPACE_EVENTS = ["loadedmetadata", "resize", "emptied"] as const;

export function useVideoSpace(getVideo: () => HTMLVideoElement | null): PixelSpace | null {
  const [space, setSpace] = useState<PixelSpace | null>(null);
  const getVideoRef = useRef(getVideo);
  getVideoRef.current = getVideo;
  const attachedRef = useRef<HTMLVideoElement | null | undefined>(undefined);
  const detachRef = useRef<(() => void) | null>(null);

  // Tras cada render (comparación barata): si el elemento cambió, re-engancha y sincroniza.
  useEffect(() => {
    const vid = getVideoRef.current();
    if (vid === attachedRef.current) return;
    detachRef.current?.();
    detachRef.current = null;
    attachedRef.current = vid;

    const sync = () => {
      const next = videoSpaceOf(vid);
      setSpace((prev) => (prev === next || (prev && next && sameSpace(prev, next)) ? prev : next));
    };
    sync(); // metadata ya cargada antes de engancharse (o sin vídeo → null)
    if (!vid) return;
    for (const ev of VIDEO_SPACE_EVENTS) vid.addEventListener(ev, sync);
    detachRef.current = () => {
      for (const ev of VIDEO_SPACE_EVENTS) vid.removeEventListener(ev, sync);
    };
  });

  // Desmontaje: suelta los listeners y olvida el elemento (en StrictMode el efecto de
  // arriba vuelve a engancharse al remontar).
  useEffect(() => () => {
    detachRef.current?.();
    detachRef.current = null;
    attachedRef.current = undefined;
  }, []);

  return space;
}
