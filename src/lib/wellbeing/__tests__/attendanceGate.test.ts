/**
 * Tests · attendanceTracker — gate inv#2 (sin datos NO es 100%).
 *
 * Antes: sin sesiones registradas devolvía rate:100 → "asistencia perfecta"
 * inventada, que además hacía que el factor de asistencia del riesgo de abandono
 * puntuara 0 riesgo. Ahora rate=null (bloqueado) y el scorer excluye el factor.
 */
import { describe, it, expect } from "vitest";
import { calculateAttendanceProfile, type AttendanceRecord } from "../attendanceTracker";

const rec = (date: string, status: AttendanceRecord["status"]): AttendanceRecord => ({
  playerId: "p1",
  date,
  status,
  source: "manual",
});

describe("attendanceTracker · gate inv#2 (sin datos ≠ 100%)", () => {
  it("sin registros → rate null (no un 100% inventado)", () => {
    const p = calculateAttendanceProfile("p1", []);
    expect(p.rate).toBeNull();
    expect(p.totalSessions).toBe(0);
  });

  it("registros de otro jugador no cuentan → rate null", () => {
    const p = calculateAttendanceProfile("p1", [rec("2026-01-01", "present")].map((r) => ({ ...r, playerId: "p2" })));
    expect(p.rate).toBeNull();
  });

  it("con registros reales → rate numérico en 0-100", () => {
    const p = calculateAttendanceProfile("p1", [
      rec("2026-01-01", "present"),
      rec("2026-01-08", "present"),
      rec("2026-01-15", "absent"),
      rec("2026-01-22", "present"),
    ]);
    expect(p.rate).not.toBeNull();
    expect(typeof p.rate).toBe("number");
    expect(p.rate as number).toBeGreaterThanOrEqual(0);
    expect(p.rate as number).toBeLessThanOrEqual(100);
    expect(p.totalSessions).toBe(4);
  });
});
