import { describe, it, expect, beforeEach } from "vitest";
import {
  VideoMetricsExtractor,
  _resetJitter,
  type VideoObservationPacket,
  type VideoEvent,
} from "@/services/real/videoMetricsExtractor";

function makePacket(overrides: Partial<VideoObservationPacket> = {}): VideoObservationPacket {
  const defaultEvents: VideoEvent[] = [
    { tSec: 10, type: "pass", result: "success", fromZone: "mid-center", toZone: "att-center" },
    { tSec: 25, type: "dribble", result: "success", fromZone: "att-right", toZone: "att-center" },
    { tSec: 40, type: "shot", result: "success", fromZone: "att-center" },
    { tSec: 55, type: "tackle", result: "success", fromZone: "def-center" },
    { tSec: 70, type: "pass", result: "fail", fromZone: "mid-right", toZone: "mid-center" },
  ];
  return {
    durationSec: 5400,
    minutesPlayed: 90,
    events: defaultEvents,
    ...overrides,
  };
}

describe("VideoMetricsExtractor", () => {
  beforeEach(() => _resetJitter());

  describe("extract()", () => {
    it("genera vaepInput con acciones SPADL desde eventos de video", () => {
      const packet = makePacket();
      const { vaepInput } = VideoMetricsExtractor.extract(packet);

      expect(vaepInput.actions.length).toBeGreaterThan(0);
      expect(vaepInput.minutesPlayed).toBe(90);
      expect(vaepInput.actions[0]).toHaveProperty("type");
      expect(vaepInput.actions[0]).toHaveProperty("startX");
      expect(vaepInput.actions[0]).toHaveProperty("startY");
    });

    it("mapea tipos de evento a SPADL correctamente", () => {
      const packet = makePacket();
      const { vaepInput } = VideoMetricsExtractor.extract(packet);

      const types = vaepInput.actions.map(a => a.type);
      expect(types).toContain("pass");
      expect(types).toContain("dribble");
      expect(types).toContain("shot");
      expect(types).toContain("tackle");
    });

    it("descarta eventos no-SPADL (reception, run)", () => {
      const packet = makePacket({
        events: [
          { tSec: 1, type: "reception", result: "success", fromZone: "mid-center" },
          { tSec: 2, type: "run", result: "success", fromZone: "mid-center" },
          { tSec: 3, type: "pass", result: "success", fromZone: "mid-center" },
        ],
      });
      const { vaepInput } = VideoMetricsExtractor.extract(packet);
      expect(vaepInput.actions.length).toBe(1);
      expect(vaepInput.actions[0].type).toBe("pass");
    });

    it("cabezazo (header) se mapea a pass en SPADL", () => {
      const packet = makePacket({
        events: [{ tSec: 5, type: "header", result: "success", fromZone: "att-center" }],
      });
      const { vaepInput } = VideoMetricsExtractor.extract(packet);
      expect(vaepInput.actions[0].type).toBe("pass");
    });

    it("tiro exitoso tiene scoreProbAfter > scoreProbBefore", () => {
      const packet = makePacket({
        events: [{ tSec: 5, type: "shot", result: "success", fromZone: "att-center" }],
      });
      const { vaepInput } = VideoMetricsExtractor.extract(packet);
      const action = vaepInput.actions[0];
      expect(action.scoreProbAfter).toBeGreaterThan(action.scoreProbBefore ?? 0);
    });

    it("tiro fallido tiene scoreDelta negativo", () => {
      const packet = makePacket({
        events: [{ tSec: 5, type: "shot", result: "fail", fromZone: "att-center" }],
      });
      const { vaepInput } = VideoMetricsExtractor.extract(packet);
      const action = vaepInput.actions[0];
      expect(action.scoreProbAfter).toBeLessThan(action.scoreProbBefore ?? 0.5);
    });

    it("tackle exitoso reduce concedeProb", () => {
      const packet = makePacket({
        events: [{ tSec: 5, type: "tackle", result: "success", fromZone: "def-center" }],
      });
      const { vaepInput } = VideoMetricsExtractor.extract(packet);
      const action = vaepInput.actions[0];
      expect(action.concedeProbAfter).toBeLessThan(action.concedeProbBefore ?? 0.5);
    });

    it("genera trackingInput con positions desde eventos", () => {
      const packet = makePacket();
      const { trackingInput } = VideoMetricsExtractor.extract(packet);
      expect(trackingInput.positions.length).toBeGreaterThan(0);
      expect(trackingInput.minutesPlayed).toBe(90);
    });

    it("sin positioning devuelve positions solo desde eventos", () => {
      const packet = makePacket();
      const { trackingInput } = VideoMetricsExtractor.extract(packet);
      expect(trackingInput.positions.length).toBe(packet.events.length);
    });

    it("con zoneDistribution añade muestras sintéticas adicionales", () => {
      const packet = makePacket({
        positioning: {
          dominantZone: "mid-center",
          zoneDistribution: {
            "mid-center": 0.5,
            "att-center": 0.3,
            "def-center": 0.2,
          },
        },
      });
      const { trackingInput } = VideoMetricsExtractor.extract(packet);
      expect(trackingInput.positions.length).toBeGreaterThan(packet.events.length);
    });

    it("positions están ordenadas por timestamp", () => {
      const packet = makePacket({
        positioning: {
          zoneDistribution: { "mid-center": 1.0 },
        },
      });
      const { trackingInput } = VideoMetricsExtractor.extract(packet);
      for (let i = 1; i < trackingInput.positions.length; i++) {
        expect(trackingInput.positions[i].timestampMs).toBeGreaterThanOrEqual(
          trackingInput.positions[i - 1].timestampMs
        );
      }
    });

    it("sin datos biomecánicos devuelve null", () => {
      const packet = makePacket();
      const { biomechanicsInput } = VideoMetricsExtractor.extract(packet);
      expect(biomechanicsInput).toBeNull();
    });

    it("con datos biomecánicos extrae bilateralAsymmetry", () => {
      const packet = makePacket({
        biomechanics: {
          bilateralAsymmetryObserved: 15,
          movementEfficiency: 0.75,
        },
      });
      const { biomechanicsInput } = VideoMetricsExtractor.extract(packet);
      expect(biomechanicsInput).not.toBeNull();
      expect(biomechanicsInput?.bilateralAsymmetry).toBe(15);
    });

    it("coordenadas de zona están dentro del campo (105x68)", () => {
      const packet = makePacket();
      const { vaepInput } = VideoMetricsExtractor.extract(packet);
      for (const a of vaepInput.actions) {
        expect(a.startX).toBeGreaterThanOrEqual(0);
        expect(a.startX).toBeLessThanOrEqual(105);
        expect(a.startY).toBeGreaterThanOrEqual(0);
        expect(a.startY).toBeLessThanOrEqual(68);
      }
    });

    it("impact amplifica el delta de score", () => {
      const packetLow = makePacket({
        events: [{ tSec: 1, type: "shot", result: "success", fromZone: "att-center", impact: 0 }],
      });
      const packetHigh = makePacket({
        events: [{ tSec: 1, type: "shot", result: "success", fromZone: "att-center", impact: 1 }],
      });
      const low = VideoMetricsExtractor.extract(packetLow).vaepInput.actions[0];
      const high = VideoMetricsExtractor.extract(packetHigh).vaepInput.actions[0];
      expect(high.scoreProbAfter).toBeGreaterThan(low.scoreProbAfter ?? 0);
    });
  });

  describe("parseRawPacket()", () => {
    it("parsea un packet válido", () => {
      const raw = {
        durationSec: 5400,
        minutesPlayed: 90,
        events: [
          { tSec: 10, type: "pass", result: "success", fromZone: "mid-center" },
        ],
      };
      const parsed = VideoMetricsExtractor.parseRawPacket(raw);
      expect(parsed).not.toBeNull();
      expect(parsed?.events.length).toBe(1);
    });

    it("retorna null si no hay eventos", () => {
      const parsed = VideoMetricsExtractor.parseRawPacket({ events: [] });
      expect(parsed).toBeNull();
    });

    it("retorna null si input es inválido", () => {
      expect(VideoMetricsExtractor.parseRawPacket(null)).toBeNull();
      expect(VideoMetricsExtractor.parseRawPacket("string")).toBeNull();
      expect(VideoMetricsExtractor.parseRawPacket(42)).toBeNull();
    });

    it("filtra eventos con tipo inválido", () => {
      const parsed = VideoMetricsExtractor.parseRawPacket({
        events: [
          { tSec: 1, type: "pass", result: "success" },
          { tSec: 2, type: "invalid_type", result: "success" },
          { tSec: 3, type: "shot", result: "success" },
        ],
      });
      expect(parsed?.events.length).toBe(2);
    });

    it("default result a 'success' si no es válido", () => {
      const parsed = VideoMetricsExtractor.parseRawPacket({
        events: [{ tSec: 1, type: "pass", result: "unknown" }],
      });
      expect(parsed?.events[0].result).toBe("success");
    });

    it("acepta 't' como alternativa a 'tSec'", () => {
      const parsed = VideoMetricsExtractor.parseRawPacket({
        events: [{ t: 42, type: "pass", result: "success" }],
      });
      expect(parsed?.events[0].tSec).toBe(42);
    });

    it("infiere minutesPlayed desde durationSec si no viene", () => {
      const parsed = VideoMetricsExtractor.parseRawPacket({
        durationSec: 5400,
        events: [{ tSec: 1, type: "pass", result: "success" }],
      });
      expect(parsed?.minutesPlayed).toBe(90);
    });
  });
});
