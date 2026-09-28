/**
 * useVideoSpace — dimensiones nativas del <video> como estado React.
 *
 * Regresión que cubre (VitasLab): el overlay pinta los puntos de calibración con el
 * letterbox de object-contain, que depende de videoWidth/videoHeight. Esas dimensiones
 * llegan con `loadedmetadata`; si nada re-dibuja entonces, los puntos quedan pintados
 * como si el vídeo llenara el contenedor mientras el hit-test del ratón ya aplica el
 * letterbox → no se pueden agarrar. Con el hook, el valor cambia en loadedmetadata →
 * el consumidor se re-renderiza (drawOverlay depende de él) y dibujo y hit-test usan
 * el MISMO valor.
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { StrictMode, createElement, type ReactNode } from "react";
import { useVideoSpace } from "@/hooks/useVideoSpace";
import { containTransform, fromDisplay, toDisplay, PERCENT_SPACE } from "@/lib/yolo/coordSpace";

/** <video> de jsdom con videoWidth/videoHeight controlables (en jsdom son siempre 0). */
function makeVideo(w = 0, h = 0) {
  const el = document.createElement("video");
  const dims = { w, h };
  Object.defineProperty(el, "videoWidth", { configurable: true, get: () => dims.w });
  Object.defineProperty(el, "videoHeight", { configurable: true, get: () => dims.h });
  return {
    el,
    /** Simula que el navegador conoce (o cambia) las dimensiones y dispara `event`. */
    set(nw: number, nh: number, event: string) {
      dims.w = nw;
      dims.h = nh;
      act(() => {
        el.dispatchEvent(new Event(event));
      });
    },
  };
}

describe("useVideoSpace", () => {
  it("es null hasta loadedmetadata y entonces expone las dimensiones nativas (re-render)", () => {
    const video = makeVideo();
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useVideoSpace(() => video.el);
    });
    expect(result.current).toBeNull();
    const before = renders;

    video.set(1920, 1080, "loadedmetadata");
    expect(result.current).toEqual({ width: 1920, height: 1080 });
    expect(renders).toBeGreaterThan(before); // el consumidor se re-renderiza → redibuja
  });

  it("toma las dimensiones si la metadata ya estaba cargada al engancharse", () => {
    const video = makeVideo(1280, 720);
    const { result } = renderHook(() => useVideoSpace(() => video.el));
    expect(result.current).toEqual({ width: 1280, height: 720 });
  });

  it("sigue `resize` (cambio de resolución del stream) y `emptied` (cambio de src → null)", () => {
    const video = makeVideo(1280, 720);
    const { result } = renderHook(() => useVideoSpace(() => video.el));
    video.set(1920, 1080, "resize");
    expect(result.current).toEqual({ width: 1920, height: 1080 });
    video.set(0, 0, "emptied");
    expect(result.current).toBeNull();
    video.set(1080, 1920, "loadedmetadata"); // nuevo vídeo vertical en el mismo elemento
    expect(result.current).toEqual({ width: 1080, height: 1920 });
  });

  it("mantiene la MISMA referencia si las dimensiones no cambian (no invalida drawOverlay)", () => {
    const video = makeVideo(1920, 1080);
    const { result } = renderHook(() => useVideoSpace(() => video.el));
    const first = result.current;
    video.set(1920, 1080, "resize");
    video.set(1920, 1080, "loadedmetadata");
    expect(result.current).toBe(first);
  });

  it("se re-engancha cuando cambia el elemento y suelta el anterior", () => {
    const a = makeVideo(1280, 720);
    const b = makeVideo();
    let current: HTMLVideoElement | null = a.el;
    const { result, rerender } = renderHook(() => useVideoSpace(() => current));
    expect(result.current).toEqual({ width: 1280, height: 720 });

    current = b.el; // p. ej. el <video> se remonta con otra URL
    rerender();
    expect(result.current).toBeNull();
    b.set(1920, 1080, "loadedmetadata");
    expect(result.current).toEqual({ width: 1920, height: 1080 });

    // El elemento anterior ya no afecta al estado.
    a.set(640, 480, "loadedmetadata");
    expect(result.current).toEqual({ width: 1920, height: 1080 });

    current = null; // vídeo desmontado (imagen del campo)
    rerender();
    expect(result.current).toBeNull();
  });

  it("suelta los listeners al desmontar", () => {
    const video = makeVideo();
    const remove = vi.spyOn(video.el, "removeEventListener");
    const { unmount } = renderHook(() => useVideoSpace(() => video.el));
    unmount();
    const removed = remove.mock.calls.map((c) => c[0]);
    expect(removed).toEqual(expect.arrayContaining(["loadedmetadata", "resize", "emptied"]));
  });

  it("funciona bajo StrictMode (doble montaje de efectos en desarrollo)", () => {
    const video = makeVideo();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);
    const { result } = renderHook(() => useVideoSpace(() => video.el), { wrapper });
    video.set(1920, 1080, "loadedmetadata");
    expect(result.current).toEqual({ width: 1920, height: 1080 });
  });

  it("caso del review: 16:9 en un contenedor 800×600 — tras loadedmetadata, dibujo y hit-test de P3 coinciden", () => {
    const container = { width: 800, height: 600 };
    const P3 = { x: 80, y: 92 };
    const video = makeVideo();
    const { result } = renderHook(() => useVideoSpace(() => video.el));

    // Antes de la metadata el overlay pinta P3 llenando el contenedor (y = 552 px)…
    const drawnBefore = toDisplay(containTransform(PERCENT_SPACE, result.current, container), P3.x, P3.y);
    expect(drawnBefore.y).toBeCloseTo(552, 6);

    // …y en cuanto el vídeo conoce su tamaño, el valor compartido cambia → se redibuja
    // con el letterbox (alto mostrado 450 px, banda de 75 px): y = 75 + 0.92·450 = 489.
    video.set(1920, 1080, "loadedmetadata");
    const tr = containTransform(PERCENT_SPACE, result.current, container);
    const drawn = toDisplay(tr, P3.x, P3.y);
    expect(drawn.y).toBeCloseTo(489, 6);

    // El hit-test (mismo valor, mismo transform) devuelve P3 exacto → se puede agarrar.
    const hit = fromDisplay(containTransform(PERCENT_SPACE, result.current, container), drawn.x, drawn.y);
    expect(hit.x).toBeCloseTo(P3.x, 6);
    expect(hit.y).toBeCloseTo(P3.y, 6);

    // Contraste: pintar en 552 y hacer hit-test con letterbox daba ~106 % → inalcanzable.
    const stale = fromDisplay(tr, drawnBefore.x, drawnBefore.y);
    expect(stale.y).toBeGreaterThan(100);
  });
});
