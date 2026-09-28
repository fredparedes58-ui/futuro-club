/**
 * PlayerIdentityOverlay — las cajas (píxeles NATIVOS del vídeo) se pintan donde el
 * <video object-contain> muestra al jugador: centrado con bandas (letterbox), no con un
 * escalado contenedor/vídeo por eje que deforma y desplaza las cajas.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import PlayerIdentityOverlay from "@/components/PlayerIdentityOverlay";
import type { Track } from "@/lib/yolo/types";
import type { PlayerIdentity } from "@/lib/yolo/playerIdentityManager";

type Rect = [number, number, number, number];
let strokeRects: Rect[] = [];

function fakeCtx(): CanvasRenderingContext2D {
  const noop = () => {};
  return {
    clearRect: noop,
    setLineDash: noop,
    strokeRect: (x: number, y: number, w: number, h: number) => { strokeRects.push([x, y, w, h]); },
    measureText: () => ({ width: 20 }),
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    closePath: noop,
    fill: noop,
    fillText: noop,
    arc: noop,
  } as unknown as CanvasRenderingContext2D;
}

function track(bbox: Rect): Track {
  return {
    id: 7, bbox, keypoints: [], age: 0, positions: [], lastFieldPos: null, lastTimestampMs: 0,
    speedMs: 0, smoothSpeedMs: 0, accelMs2: 0, distanceM: 0, sprintCount: 0,
  };
}

describe("PlayerIdentityOverlay — nativo → pantalla con letterbox", () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    strokeRects = [];
    spy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation((() => fakeCtx()) as unknown as HTMLCanvasElement["getContext"]);
  });
  afterEach(() => spy.mockRestore());

  it("vídeo 16:9 en contenedor 4:3: la caja se desplaza bajo la banda y conserva su aspecto", () => {
    const identities = new Map<number, PlayerIdentity>();
    render(
      <PlayerIdentityOverlay
        width={800}
        height={600}
        tracks={[track([940, 480, 40, 120])]}
        identities={identities}
        focusTrackId={null}
        videoWidth={1920}
        videoHeight={1080}
      />,
    );
    // escala uniforme 800/1920; banda superior (600 − 450)/2 = 75 px
    const k = 800 / 1920;
    const [x, y, w, h] = strokeRects[0];
    expect(x).toBeCloseTo(940 * k, 6);
    expect(y).toBeCloseTo(480 * k + 75, 6);
    expect(w).toBeCloseTo(40 * k, 6);
    expect(h).toBeCloseTo(120 * k, 6); // mismo factor en x e y (sin deformar)
  });

  it("si contenedor y vídeo tienen el mismo aspecto, es un escalado simple (sin bandas)", () => {
    render(
      <PlayerIdentityOverlay
        width={960}
        height={540}
        tracks={[track([100, 200, 40, 120])]}
        identities={new Map()}
        focusTrackId={null}
        videoWidth={1920}
        videoHeight={1080}
      />,
    );
    const [x, y, w, h] = strokeRects[0];
    expect([x, y, w, h]).toEqual([50, 100, 20, 60]);
  });
});
