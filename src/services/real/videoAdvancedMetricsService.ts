/**
 * VITAS · Video-based Advanced Metrics Service
 *
 * Orquesta el pipeline completo:
 *   1. Recibe VideoObservationPacket (generado por agente de video)
 *   2. Extrae SPADL / Tracking / Biomechanics inputs
 *   3. Calcula métricas avanzadas usando advancedMetricsService
 *   4. Devuelve resultado listo para UI
 *
 * Este servicio REEMPLAZA la necesidad de GPS físico (Catapult, StatSports)
 * en el MVP — el video analizado aporta datos suficientes para calcular
 * VAEP, SPADL y una aproximación de biomecánica.
 */
import type { Player } from "./playerService";
import type { AdvancedPlayerMetrics } from "./advancedMetricsService";
import { calculateAdvancedMetrics } from "./advancedMetricsService";
import type { VideoObservationPacket } from "./videoMetricsExtractor";
import { VideoMetricsExtractor } from "./videoMetricsExtractor";

export interface VideoAdvancedMetricsOptions {
  /** Datos de nacimiento para RAE (opcional) */
  birthMonth?: number;
  birthYear?: number;
}

export const VideoAdvancedMetricsService = {
  /**
   * Calcula métricas avanzadas combinando:
   *   - Datos del jugador (para RAE, UBI, TruthFilter, DominantFeatures)
   *   - Análisis de video (para VAEP, SPADL, Tracking, Biomechanics)
   */
  calculate(
    player: Player,
    packet: VideoObservationPacket,
    options: VideoAdvancedMetricsOptions = {}
  ): AdvancedPlayerMetrics {
    const { vaepInput, trackingInput, biomechanicsInput } =
      VideoMetricsExtractor.extract(packet);

    return calculateAdvancedMetrics(player, {
      birthMonth: options.birthMonth,
      birthYear: options.birthYear,
      vaepInput,
      trackingInput,
      biomechanicsInput: biomechanicsInput ?? undefined,
    });
  },

  /**
   * Parsea un packet crudo (JSON string o objeto) y calcula métricas.
   * Lanza error si el packet es inválido.
   */
  calculateFromRaw(
    player: Player,
    rawPacket: unknown,
    options: VideoAdvancedMetricsOptions = {}
  ): AdvancedPlayerMetrics {
    const packet = typeof rawPacket === "string"
      ? VideoMetricsExtractor.parseRawPacket(JSON.parse(rawPacket))
      : VideoMetricsExtractor.parseRawPacket(rawPacket);

    if (!packet) {
      throw new Error("Packet de análisis de video inválido o vacío");
    }

    return this.calculate(player, packet, options);
  },

  /**
   * Evalúa qué tan confiable es el packet para calcular métricas.
   * Returns 0-1: 0 = insuficiente, 1 = excelente.
   */
  assessPacketQuality(packet: VideoObservationPacket): {
    score: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let score = 1.0;

    if (packet.events.length < 10) {
      issues.push(`Pocos eventos detectados (${packet.events.length}). Recomendado: >15.`);
      score -= 0.3;
    }

    if (packet.minutesPlayed < 20) {
      issues.push(`Muestra corta (${packet.minutesPlayed} min). Recomendado: >45 min.`);
      score -= 0.2;
    }

    const eventsWithZone = packet.events.filter(e => e.fromZone || e.toZone).length;
    const zonesCoverage = eventsWithZone / Math.max(1, packet.events.length);
    if (zonesCoverage < 0.5) {
      issues.push("Menos del 50% de eventos tienen zona de campo asignada.");
      score -= 0.15;
    }

    if (!packet.positioning) {
      issues.push("Sin datos de posicionamiento — tracking coverage limitado.");
      score -= 0.1;
    }

    if (!packet.biomechanics) {
      issues.push("Sin observaciones biomecánicas — DrillScore no disponible.");
      score -= 0.1;
    }

    return {
      score: Math.max(0, Math.round(score * 100) / 100),
      issues,
    };
  },
};
